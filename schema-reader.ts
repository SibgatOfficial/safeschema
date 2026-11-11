import { Client } from "pg";
import * as dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

// 1. Setup the connection
const client = new Client({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
});

// 2. Define the function to read the database
async function readSchema() {
  try {
    await client.connect();
    console.log("✅ Connected to Postgres!");

    // Let's create a dummy table so we have something to read
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE
      );
    `);

    // 3. The actual query to read the schema
    const res = await client.query(`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position;
    `);

    // 4. Print the output as JSON
    console.log("📊 Database Schema:");
    console.log(JSON.stringify(res.rows, null, 2));

  } catch (err) {
    console.error("❌ Database connection error:", err);
  } finally {
    // Always close the connection when done
    await client.end();
  }
}

// Run the function
readSchema();