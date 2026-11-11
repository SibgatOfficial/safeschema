console.log("1. Starting server script...");

import express from "express";
import cors from "cors";
import * as dotenv from "dotenv";
import { Client } from "pg";
import { Command } from "@langchain/langgraph";

console.log("2. Base libraries imported successfully.");

import { workflow } from "./agent-graph"; 
console.log("3. Agent graph imported successfully.");

dotenv.config();
console.log("4. Environment variables loaded.");

const app = express();
app.use(cors());
app.use(express.json());
console.log("5. Express configured.");

const threadConfig = { configurable: { thread_id: "user-1" } };

const getClient = () => {
  if (process.env.DATABASE_URL) {
    return new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  }
  return new Client({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
  });
};

// (Routes are the same as before, keeping it short)
app.get("/schema", async (req, res) => {
  const client = getClient();
  try {
    await client.connect();
    const result = await client.query(`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position;
    `);
    res.json({ schema: result.rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  } finally {
    await client.end();
  }
});

app.post("/start", async (req, res) => {
  try {
    const stream = await workflow.streamEvents({ prompt: req.body.prompt }, { ...threadConfig, version: "v3" });
    let interruptPayload = null;
    let finalResult = null;
    for await (const chunk of stream.values) {
      if ((chunk as any).__interrupt__) interruptPayload = (chunk as any).__interrupt__[0].value;
      else if (typeof chunk === 'string') finalResult = chunk;
    }
    if (!interruptPayload && finalResult) return res.json({ result: finalResult });
    res.json({ interrupt: interruptPayload });
  } catch (error: any) {
    res.status(500).json({ error: "Workflow failed", details: error.message });
  }
});

app.post("/resume", async (req, res) => {
  try {
    const stream = await workflow.streamEvents(
      new Command({ resume: { approved: req.body.approved } }),
      { ...threadConfig, version: "v3" }
    );
    let finalResult = null;
    for await (const chunk of stream.values) finalResult = chunk;
    res.json({ result: finalResult });
  } catch (error: any) {
    res.status(500).json({ error: "Workflow failed", details: error.message });
  }
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`[Server] Running on port ${PORT}`));

// Catch port errors
server.on('error', (e: any) => {
  console.error("Server Error:", e);
});