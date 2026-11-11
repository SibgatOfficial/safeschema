import express from "express";
import cors from "cors";
import * as dotenv from "dotenv";
import { Client } from "pg"; // 👈 Added pg Client import
import { workflow } from "./agent-graph";
import { Command } from "@langchain/langgraph";

dotenv.config();

// 1. Initialize Express
const app = express();

// 2. Middleware
app.use(cors());
app.use(express.json());

const threadConfig = { configurable: { thread_id: "user-1" } };

// 3. NEW: Endpoint to get the live schema
app.get("/schema", async (req, res) => {
  const client = new Client({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
  });

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
    console.error("❌ Schema Fetch Error:", error.message);
    res.status(500).json({ error: error.message });
  } finally {
    await client.end();
  }
});

// 4. Start Workflow Endpoint
app.post("/start", async (req, res) => {
  try {
    const prompt = req.body.prompt;
    console.log(`📥 Received prompt: "${prompt}"`);

    const stream = await workflow.streamEvents({ prompt }, { ...threadConfig, version: "v3" });
    let interruptPayload = null;
    let finalResult = null;

    for await (const chunk of stream.values) {
      // If the workflow pauses for Human Approval
      if ((chunk as any).__interrupt__) {
        interruptPayload = (chunk as any).__interrupt__[0].value;
      } 
      // If the workflow finishes early (e.g., Shadow DB blocks it)
      else if (typeof chunk === 'string') {
        finalResult = chunk;
      }
    }

    // If it didn't pause, it means it failed early (Shadow DB block)
    if (!interruptPayload && finalResult) {
      return res.json({ result: finalResult });
    }

    // Otherwise, send the pause payload
    res.json({ interrupt: interruptPayload });
  } catch (error: any) {
    console.error("❌ Start Error:", error);
    res.status(500).json({ error: "Workflow failed to start", details: error.message });
  }
});

// 5. Resume Workflow Endpoint
app.post("/resume", async (req, res) => {
  try {
    const approved = req.body.approved;
    console.log(`📥 Received decision: ${approved ? "APPROVED" : "REJECTED"}`);

    const stream = await workflow.streamEvents(
      new Command({ resume: { approved } }),
      { ...threadConfig, version: "v3" }
    );
    
    let finalResult = null;
    for await (const chunk of stream.values) {
      finalResult = chunk;
    }

    res.json({ result: finalResult });
  } catch (error: any) {
    console.error("❌ Resume Error:", error);
    res.status(500).json({ error: "Workflow failed to resume", details: error.message });
  }
});

// 6. Start the Server
app.listen(3000, () => console.log("🚀 Server running on http://localhost:3000"));