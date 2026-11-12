
import { entrypoint, task, interrupt, MemorySaver } from "@langchain/langgraph";
import { getClient, getLiveDatabaseSchema } from "./db";
import { getMigrationHistory } from "./rag";

const generateSqlTask = task("generateSql", async (input: any) => {
  const liveSchema = await getLiveDatabaseSchema();
  const historyContext = await getMigrationHistory();
  const prompt = `
    You are an expert PostgreSQL database engineer.
    The user wants to make this change to their database: "${input.prompt}"
    Here is the ACTUAL current database schema:
    ${liveSchema}
    ${historyContext}
    IMPORTANT RULES:
    1. If a column has a "DEFAULT nextval(...)", it is an AUTO-INCREMENTING PRIMARY KEY. NEVER insert values into this column.
    2. If you are inserting data, you must ONLY insert into the other columns.
    Write ONLY the raw PostgreSQL SQL to make this change. Do not include markdown or explanations.
  `;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({ model: "qwen/qwen3.8-27b", messages: [{ role: "user", content: prompt }], max_tokens: 500 }),
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);

  let generatedSql = data.choices[0].message.content;
  generatedSql = generatedSql.replace(/```sql/g, "").replace(/```/g, "").trim();
  
  const sqlUpper = generatedSql.toUpperCase();
  const dangerousKeywords = ["DELETE", "DROP", "TRUNCATE"];
  const isRisky = dangerousKeywords.some(keyword => sqlUpper.includes(keyword));

  return { userPrompt: input.prompt, sql: generatedSql, risk: isRisky ? "RISKY" : "SAFE" };
});

const testShadowDbTask = task("testShadowDb", async (migration: any) => {
  const client = getClient();
  try {
    await client.query("BEGIN");
    const result = await client.query(migration.sql);
    await client.query("ROLLBACK");
    return { status: "PASSED", rows: result.rows || [], rowCount: result.rowCount || 0, fields: result.fields?.map((f: any) => f.name) || [] };
  } catch (error: any) {
    await client.query("ROLLBACK");
    return { status: `FAILED: ${error.message}`, rows: [], rowCount: 0, fields: [] };
  }
});

const humanApprovalTask = task("humanApproval", async (state: any) => {
  return interrupt({ type: "approval_required", proposed_sql: state.migration.sql, risk: state.migration.risk, shadow_result: state.testResult });
});

const executeMigrationTask = task("executeMigration", async (state: any) => {
  if (!state.decision.approved) return "Migration rejected by human.";
  const client = getClient();
  try {
    await client.query("BEGIN");
    await client.query(state.migration.sql);
    await client.query("COMMIT"); 
    await client.query(`INSERT INTO migration_history (user_prompt, generated_sql, embedding) VALUES ($1, $2, $3)`, [state.migration.userPrompt, state.migration.sql, '[0,0,0]'] );
    return "Successfully executed on production DB.";
  } catch (error: any) {
    await client.query("ROLLBACK");
    return `Database Execution Error: ${error.message}`;
  }
});

export const workflow = entrypoint(
  { checkpointer: new MemorySaver(), name: "safeSchemaAgent" },
  async (input: any) => {
    const migration = await generateSqlTask(input);
    const testResult = await testShadowDbTask(migration);
    if (testResult.status.startsWith("FAILED")) return `Blocked by Shadow DB: ${testResult.status}`;
    const decision = await humanApprovalTask({ migration, testResult });
    return await executeMigrationTask({ migration, decision });
  }
);