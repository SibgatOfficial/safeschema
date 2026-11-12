/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from "react";
import axios from "axios";
import { Database, ShieldAlert, Cpu, Terminal, Play, CheckCircle, XCircle, ChevronRight } from "lucide-react";
import "./App.css";

const API_URL = "https://safeschema.onrender.com"; // Ensure this is your Render URL

function App() {
  const [prompt, setPrompt] = useState<string>("");
  const [sql, setSql] = useState<string>("");
  const [risk, setRisk] = useState<string>("");
  const [result, setResult] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  
  const [schema, setSchema] = useState<any[]>([]);
  const [tableData, setTableData] = useState<any[]>([]);
  const [tableColumns, setTableColumns] = useState<string[]>([]);
  const [shadowResult, setShadowResult] = useState<any>(null);
  const [trace, setTrace] = useState<string[]>([]);

  const fetchSchema = async () => {
    try {
      const res = await axios.get(`${API_URL}/schema`);
      setSchema(res.data.schema);
    } catch (err) { console.error(err); }
  };

  const fetchTableData = async () => {
    try {
      const res = await axios.get(`${API_URL}/data/users`);
      setTableData(res.data.data);
      setTableColumns(res.data.columns);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { fetchSchema(); fetchTableData(); }, []);

  const startWorkflow = async (overridePrompt?: string) => {
    const activePrompt = overridePrompt || prompt;
    if (!activePrompt.trim()) return;
    
    setLoading(true);
    setError("");
    setResult("");
    setSql("");
    setShadowResult(null);
    setTrace(["Initializing LangGraph State Machine...", "Connecting to Neon PostgreSQL..."]);
    
    try {
      const res = await axios.post(`${API_URL}/start`, { prompt: activePrompt });
      
      if (res.data.trace) setTrace(res.data.trace);

      if (res.data.interrupt) {
        setSql(res.data.interrupt.proposed_sql);
        setRisk(res.data.interrupt.risk);
        setShadowResult(res.data.interrupt.shadow_result);
      } else if (res.data.result) {
        setResult(res.data.result);
        fetchSchema(); fetchTableData();
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.details || err.message;
      setError(`Backend Error: ${errorMsg}`);
      setTrace(prev => [...prev, `❌ Error: ${errorMsg}`]);
    }
    setLoading(false);
  };

  const resumeWorkflow = async (approved: boolean) => {
    setLoading(true);
    setError("");
    setTrace(prev => [...prev, `Human Decision: ${approved ? 'APPROVED' : 'REJECTED'}`]);
    try {
      const res = await axios.post(`${API_URL}/resume`, { approved });
      setResult(res.data.result);
      setSql("");
      setRisk("");
      setShadowResult(null);
      fetchSchema(); fetchTableData();
    } catch (err) {
      setError("Failed to resume workflow.");
    }
    setLoading(false);
  };

  const resetApp = () => {
    setPrompt(""); setSql(""); setRisk(""); setResult(""); setError(""); setShadowResult(null); setTrace([]);
    fetchSchema(); fetchTableData();
  };

  const examplePrompts = [
    "Split the full_name into first_name and last_name",
    "Delete all users from the database",
    "Add a column called phone_number to users"
  ];

  return (
    <div className="dashboard-layout">
      
      {/* LEFT SIDEBAR - SCHEMA */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <Database size={18} className="icon-accent" />
          <span>Database Explorer</span>
        </div>
        
        <div className="sidebar-section">
          <h3 className="section-title">Live Schema</h3>
          <div className="table-container">
            <table>
              <thead><tr><th>Table</th><th>Column</th><th>Type</th></tr></thead>
              <tbody>
                {schema.map((col, idx) => (
                  <tr key={idx}>
                    <td className="text-accent">{col.table_name}</td>
                    <td>{col.column_name}</td>
                    <td className="text-muted">{col.data_type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="sidebar-section">
          <h3 className="section-title">Users Preview</h3>
          <div className="table-container">
            {tableData.length === 0 ? (
              <p className="text-muted" style={{ padding: "10px" }}>No users found.</p>
            ) : (
              <table>
                <thead><tr>{tableColumns.map(col => <th key={col}>{col}</th>)}</tr></thead>
                <tbody>
                  {tableData.map((row, idx) => (
                    <tr key={idx}>{tableColumns.map(col => <td key={col}>{row[col]?.toString() || "NULL"}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </aside>

      {/* CENTER - MAIN WORKSPACE */}
      <main className="main-workspace">
        <header className="workspace-header">
          <div className="logo">
            <ShieldAlert size={32} className="icon-accent" />
            <div>
              <h1>SafeSchema Agent</h1>
              <p>Agentic AI for safe database migrations.</p>
            </div>
          </div>
        </header>

        {!sql && !result && !loading && (
          <div className="welcome-container">
            <div className="feature-grid">
              <div className="feature-card problem-card">
                <h3><XCircle size={18} /> The Problem</h3>
                <p>LLMs hallucinate. If a developer blindly runs an AI-generated <code>DELETE</code> query, it can destroy production data.</p>
              </div>
              <div className="feature-card solution-card">
                <h3><CheckCircle size={18} /> The Solution</h3>
                <p>LangGraph pauses execution. AI SQL is tested in a <strong>Shadow PostgreSQL DB</strong> to preview the blast radius before committing.</p>
              </div>
            </div>

            <div className="tech-stack">
              <span className="tech-tag">React</span>
              <span className="tech-tag">Node.js</span>
              <span className="tech-tag">LangGraph.js</span>
              <span className="tech-tag">PostgreSQL</span>
              <span className="tech-tag">PGVector</span>
              <span className="tech-tag">Groq AI</span>
            </div>

            <div className="prompt-area">
              <p className="section-title">Try a demo prompt:</p>
              <div className="chip-grid">
                {examplePrompts.map((p, i) => (
                  <button key={i} className="prompt-chip" onClick={() => { setPrompt(p); startWorkflow(p); }}>
                    <ChevronRight size={14} /> "{p}"
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* INPUT BAR */}
        <div className={`input-wrapper ${loading || sql ? 'disabled' : ''}`}>
          <input
            type="text" 
            className="main-input" 
            value={prompt}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPrompt(e.target.value)}
            placeholder="Ask the AI to modify the database..."
            disabled={loading || !!sql}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && startWorkflow()}
          />
          <button className="btn-run" onClick={() => startWorkflow()} disabled={loading || !!sql}>
            <Play size={18} fill="currentColor" /> {loading ? "Running..." : "Run Agent"}
          </button>
        </div>

        {error && <div className="alert-error">{error}</div>}

        {/* APPROVAL CARD */}
        {sql && (
          <div className={`approval-card ${risk === "RISKY" ? "risk-high" : "risk-low"}`}>
            <div className="approval-header">
              <h2>Human Approval Required</h2>
              <span className={`risk-badge ${risk === "RISKY" ? "badge-high" : "badge-low"}`}>{risk} RISK</span>
            </div>
            
            <h3 className="section-title" style={{ marginTop: "20px" }}>Proposed SQL</h3>
            <pre className="code-window"><code>{sql}</code></pre>

            {shadowResult && shadowResult.status === "PASSED" && (
              <div className="shadow-result-box">
                <div className="shadow-header">
                  <CheckCircle size={16} /> Shadow DB Validation Passed
                </div>
                <p className="blast-radius">Blast Radius: <strong>{shadowResult.rowCount} rows affected</strong></p>
                
                {shadowResult.rows && shadowResult.rows.length > 0 && (
                  <div className="table-container" style={{ maxHeight: "150px" }}>
                    <table>
                      <thead><tr>{shadowResult.fields.map((f: string) => <th key={f}>{f}</th>)}</tr></thead>
                      <tbody>{shadowResult.rows.map((row: any, i: number) => (
                        <tr key={i}>{shadowResult.fields.map((f: string) => <td key={f}>{row[f]?.toString()}</td>)}</tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <div className="approval-actions">
              <button className="btn-reject" onClick={() => resumeWorkflow(false)} disabled={loading}>Reject Migration</button>
              <button className={`btn-approve ${risk === "RISKY" ? "bg-danger" : ""}`} onClick={() => resumeWorkflow(true)} disabled={loading}>
                {risk === "RISKY" ? "Force Execute" : "Approve & Execute"}
              </button>
            </div>
          </div>
        )}

        {/* RESULT CARD */}
        {result && (
          <div className={`result-card ${(result.includes("Blocked") || result.includes("Error") || result.includes("rejected")) ? "result-error" : "result-success"}`}>
            <h2>{(result.includes("Blocked") || result.includes("Error") || result.includes("rejected")) ? "Execution Blocked" : "Execution Successful"}</h2>
            <p>{result}</p>
            <button className="btn-reset" onClick={resetApp}>Start New Migration</button>
          </div>
        )}
      </main>

      {/* RIGHT SIDEBAR - TRACE TERMINAL */}
      <aside className="trace-panel">
        <div className="trace-header">
          <Terminal size={18} />
          <span>Agent Execution Trace</span>
          {loading && <span className="pulse-dot"></span>}
        </div>
        <div className="terminal-window">
          {trace.length === 0 ? (
            <div className="text-muted italic">Waiting for task...<br/><br/>LangGraph nodes will appear here.</div>
          ) : (
            trace.map((step, idx) => (
              <div key={idx} className="trace-step">
                <span className="trace-cursor">{'>'}</span> 
                <span className={step.includes("Error") ? "text-danger" : "text-success"}>{step}</span>
              </div>
            ))
          )}
        </div>
      </aside>

    </div>
  );
}

export default App;