import express from "express";
import cors from "cors";
import * as dotenv from "dotenv";
import { Command } from "@langchain/langgraph";
import { workflow } from "./src/agent";
import { getClient } from "./src/db";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const threadConfig = { configurable: { thread_id: "user-1" } };

app.get("/schema", async (req, res) => {
  try {
    const result = await getClient().query(`SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position;`);
    res.json({ schema: result.rows });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

app.get("/data/:tableName", async (req, res) => {
  const { tableName } = req.params;
  if (!/^[a-zA-Z0-9_]+$/.test(tableName)) return res.status(400).json({ error: "Invalid table name" });
  try {
    const result = await getClient().query(`SELECT * FROM ${tableName} LIMIT 10;`);
    res.json({ data: result.rows, columns: result.fields.map(f => f.name) });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});
app.post("/start", async (req, res) => {
  try {
    const stream = await workflow.streamEvents({ prompt: req.body.prompt }, { ...threadConfig, version: "v3" });
    let interruptPayload = null;
    let finalResult = null;
    const trace: string[] = []; // 👈 Capture the agent steps

    for await (const chunk of stream.values) {
      // Capture the node names
      if ((chunk as any).event === 'on_chain_start' && (chunk as any).name) {
        trace.push((chunk as any).name);
      }

      if ((chunk as any).__interrupt__) {
        interruptPayload = (chunk as any).__interrupt__[0].value;
      } else if (typeof chunk === 'string') {
        finalResult = chunk;
      }
    }

    if (!interruptPayload && finalResult) return res.json({ result: finalResult, trace });
    
    // Send the trace along with the interrupt!
    res.json({ interrupt: interruptPayload, trace });
  } catch (error: any) {
    res.status(500).json({ error: "Workflow failed", details: error.message });
  }
});

app.post("/resume", async (req, res) => {
  try {
    const stream = await workflow.streamEvents(new Command({ resume: { approved: req.body.approved } }), { ...threadConfig, version: "v3" });
    let finalResult = null;
    for await (const chunk of stream.values) finalResult = chunk;
    res.json({ result: finalResult });
  } catch (error: any) { res.status(500).json({ error: "Workflow failed", details: error.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 SERVER RUNNING ON PORT ${PORT}`));