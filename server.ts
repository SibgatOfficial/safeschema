console.log("1. Starting server script...");

import express from "express";
import cors from "cors";
import * as dotenv from "dotenv";
import { Client } from "pg";
import { Command } from "@langchain/langgraph";
import { workflow } from "./agent-graph"; 

console.log("2. Libraries imported.");

dotenv.config();
console.log("3. Environment variables loaded.");

const app = express();
app.use(cors());
app.use(express.json());

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

// 1. Get Schema Endpoint
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

// 2. Get Table Data Endpoint (THIS WAS MISSING!)
app.get("/data/:tableName", async (req, res) => {
  const { tableName } = req.params;
  if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
    return res.status(400).json({ error: "Invalid table name" });
  }
  const client = getClient();
  try {
    await client.connect();
    const result = await client.query(`SELECT * FROM ${tableName} LIMIT 10;`);
    res.json({ data: result.rows, columns: result.fields.map(f => f.name) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  } finally {
    await client.end();
  }
});

// 3. Start Workflow Endpoint
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

// 4. Resume Workflow Endpoint
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
app.listen(PORT, () => console.log(`[Server] Running on port ${PORT}`));