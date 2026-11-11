import { Client } from "pg";
import * as dotenv from "dotenv";
dotenv.config();

// This is the buggy SQL the AI gave you
const aiSql = `
ALTER TABLE users ADD COLUMN first_name VARCHAR;
ALTER TABLE users ADD COLUMN last_name VARCHAR;
UPDATE users SET first_name = SPLIT_PART(full_name, ' ', 1), last_name = SPLIT_PART(full_name, ' ', 2);
ALTER TABLE users ALTER COLUMN first_nameTYPE VARCHAR USING first_name::VARCHAR;
ALTER TABLE users ALTER COLUMN first_nameSET NOT NULL;
ALTER TABLE users ALTER COLUMN last_name TYPE VARCHAR USING last_name::VARCHAR;
ALTER TABLE users ALTER COLUMN last_name SET NOT NULL;
ALTER TABLE users DROP COLUMN full_name;
`;

async function testOnShadowDb() {
  const client = new Client({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
  });

  try {
    await client.connect();
    console.log("🛡️ Connected to Shadow DB. Testing AI SQL...");

    // Start a transaction (this is our shadow environment)
    await client.query("BEGIN");

    // Run the AI's SQL
    await client.query(aiSql);

    // If it succeeds, we would normally COMMIT to the real DB.
    // But since it's a test, we ROLLBACK to undo it.
    await client.query("ROLLBACK");
    console.log("✅ SQL executed successfully on Shadow DB! (Rolled back)");

  } catch (error: any) {
    // 🚨 THIS IS WHERE WE CATCH THE AI TYPO
    console.log("❌ SHADOW DB CAUGHT AN ERROR IN THE AI SQL:");
    console.log(error.message);
    
    // Undo any partial changes
    await client.query("ROLLBACK");
  } finally {
    await client.end();
  }
}

testOnShadowDb();