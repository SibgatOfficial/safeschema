import { entrypoint, task, interrupt, MemorySaver } from "@langchain/langgraph";
import { Client } from "pg";
import * as dotenv from "dotenv";
dotenv.config();

// 🛠️ 1. Read the live schema AND look for default values (like auto-increment)
async function getLiveDatabaseSchema() {
  const client = new Client({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
  });

  try {
    await client.connect();
    const res = await client.query(`
      SELECT table_name, column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position;
    `);

    const schemaMap: any = {};
    for (const row of res.rows) {
      if (!schemaMap[row.table_name]) schemaMap[row.table_name] = [];
      const defaultText = row.column_default ? ` DEFAULT ${row.column_default}` : "";
      schemaMap[row.table_name].push(`${row.column_name} (${row.data_type}${defaultText})`);
    }

    let schemaString = "";
    for (const table in schemaMap) {
      schemaString += `Table '${table}': ${schemaMap[table].join(", ")}\n`;
    }
    return schemaString;

  } catch (error) {
    console.error("Failed to read schema", error);
    return "Could not read schema.";
  } finally {
    await client.end();
  }
}

// 🧠 2. RAG Memory: Fetch past successful migrations
async function getMigrationHistory() {
  const client = new Client({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
  });
  try {
    await client.connect();
    // Fetch the most recent successful migration
    const res = await client.query(`SELECT user_prompt, generated_sql FROM migration_history ORDER BY id DESC LIMIT 1;`);
    if (res.rows.length === 0) return "No past migrations found.";
    return `Past successful migration: User asked "${res.rows[0].user_prompt}" and SQL was "${res.rows[0].generated_sql}"`;
  } catch (e) { 
    return "Could not read history."; 
  } finally { 
    await client.end(); 
  }
}

// 3. The AI Generation Task
const generateSqlTask = task("generateSql", async (input: any) => {
  console.log(`🧠 Agent is thinking about: "${input.prompt}"`);
  
  console.log("👀 Reading live database schema...");
  const liveSchema = await getLiveDatabaseSchema();
  
  console.log("📚 Retrieving RAG Memory (Past Migrations)...");
  const historyContext = await getMigrationHistory();

  const prompt = `
    You are an expert PostgreSQL database engineer.
    The user wants to make this change to their database: "${input.prompt}"
    
    Here is the ACTUAL current database schema:
    ${liveSchema}
    
    ${historyContext}
    
    IMPORTANT RULES:
    1. If a column has a "DEFAULT nextval(...)", it is an AUTO-INCREMENTING PRIMARY KEY. NEVER insert values into this column. Let the database handle it automatically.
    2. If you are inserting data, you must ONLY insert into the other columns.
    
    Write ONLY the raw PostgreSQL SQL to make this change. 
    Do not include markdown, backticks, or explanations. Just the SQL.
  `;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: "qwen/qwen3.8-27b", 
        messages: [{ role: "user", content: prompt }]
      }),
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    let generatedSql = data.choices[0].message.content;
    generatedSql = generatedSql.replace(/```sql/g, "").replace(/```/g, "").trim();
    
    // 🚨 THE RISK ENGINE 🚨
    const sqlUpper = generatedSql.toUpperCase();
    const dangerousKeywords = ["DELETE", "DROP", "TRUNCATE", "ALTER"];
    const isRisky = dangerousKeywords.some(keyword => sqlUpper.includes(keyword));

    return {
      userPrompt: input.prompt, // Save this for RAG memory later
      sql: generatedSql,
      risk: isRisky ? "RISKY" : "SAFE", 
    };
  } catch (error) {
    console.error("AI Error:", error);
    throw error;
  }
});

// 4. The Shadow DB Test (Catches Syntax Errors & Duplicate Keys)
const testShadowDbTask = task("testShadowDb", async (migration: any) => {
  console.log("🛡️ Testing SQL on Shadow DB...");
  
  const client = new Client({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
  });

  try {
    await client.connect();
    await client.query("BEGIN");
    await client.query(migration.sql);
    await client.query("ROLLBACK"); // Undo the test!
    console.log("✅ SQL passed Shadow DB test!");
    return "PASSED";
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.log("❌ SQL failed Shadow DB test:", error.message);
    return `FAILED: ${error.message}`;
  } finally {
    await client.end();
  }
});

// 5. The Human Approval Gate (Pauses the Graph)
const humanApprovalTask = task("humanApproval", async (state: any) => {
  const decision = interrupt({
    type: "approval_required",
    message: "Approve this database migration?",
    proposed_sql: state.migration.sql,
    risk: state.migration.risk,
  });
  
  return decision; 
});

// 6. The Real Execution (Commits to the actual DB & Saves RAG Memory)
const executeMigrationTask = task("executeMigration", async (state: any) => {
  if (!state.decision.approved) {
    return "🚫 Migration rejected by human. Nothing was executed.";
  }

  console.log("🔌 Connecting to Postgres to execute real SQL...");
  
  const client = new Client({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
  });

  try {
    await client.connect();
    await client.query("BEGIN");
    await client.query(state.migration.sql);
    await client.query("COMMIT"); // KEEP the changes!
    console.log("✅ Successfully committed to DB!");
    
    // 🧠 SAVE TO RAG MEMORY
    console.log("💾 Saving successful migration to Vector memory...");
    await client.query(
      `INSERT INTO migration_history (user_prompt, generated_sql, embedding) VALUES ($1, $2, $3)`,
      [state.migration.userPrompt, state.migration.sql, '[0,0,0]'] 
    );

    return "✅ Successfully executed on production DB! (Saved to RAG memory)";
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("❌ DB Execution Error:", error.message);
    return `❌ Database Execution Error: ${error.message}`;
  } finally {
    await client.end();
  }
});

// 7. The Workflow Graph (Putting it all together)
export const workflow = entrypoint(
  { checkpointer: new MemorySaver(), name: "safeSchemaAgent" },
  async (input: any) => {
    // Step 1: AI writes the SQL
    const migration = await generateSqlTask(input);
    
    // Step 2: Shadow DB tests it
    const testResult = await testShadowDbTask(migration);
    
    if (testResult.startsWith("FAILED")) {
      return `❌ Blocked by Shadow DB: ${testResult}`;
    }

    // Step 3: Human approves it
    const decision = await humanApprovalTask({ migration });
    
    // Step 4: Execute on real DB & Save to Memory
    const result = await executeMigrationTask({ migration, decision });
    
    return result;
  }
);