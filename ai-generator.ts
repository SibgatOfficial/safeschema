import * as dotenv from "dotenv";
dotenv.config();

const prompt = `
You are an expert PostgreSQL database engineer.
I need to apply the following schema changes to my 'users' table:
1. Add column 'first_name' (VARCHAR, NOT NULL)
2. Add column 'last_name' (VARCHAR, NOT NULL)
3. Drop column 'full_name' (VARCHAR)

IMPORTANT: Because I am dropping 'full_name', you MUST write SQL that copies the data from 'full_name' into 'first_name' and 'last_name' before dropping it. You can use the SPLIT_PART function.
Return ONLY the raw SQL statements. Do not include markdown formatting or explanations. Just the SQL.
`;

async function generateSQL() {
  console.log("🧠 Asking Groq AI to generate SQL...");

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        // We changed the model to a very stable, fast free one
model: "qwen/qwen3.8-27b", 
        messages: [{ role: "user", content: prompt }]
      }),
    });

    const data = await response.json();

    // 🚨 NEW CODE: Let's check if the API sent an error
    if (data.error) {
      console.log("\n❌ GROQ API ERROR:");
      console.log(data.error.message);
      return; // Stop the code here
    }

    // If there is no error, print the SQL
    const sqlOutput = data.choices[0].message.content;
    console.log("\n✅ AI Generated SQL:\n");
    console.log(sqlOutput);

  } catch (error) {
    console.error("❌ Error connecting to AI:", error);
  }
}

generateSQL();