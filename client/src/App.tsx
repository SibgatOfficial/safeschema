/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from "react";
import axios from "axios";
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

  const refreshAll = () => {
    fetchSchema();
    fetchTableData();
  };

  useEffect(() => { refreshAll(); }, []);

  const startWorkflow = async (overridePrompt?: string) => {
    const activePrompt = overridePrompt || prompt;
    if (!activePrompt.trim()) return;
    
    setLoading(true);
    setError("");
    setResult("");
    setSql("");
    setShadowResult(null);
    setTrace(["Initializing SafeSchema Agent...", "Connecting to database..."]);
    
    try {
      const res = await axios.post(`${API_URL}/start`, { prompt: activePrompt });
      
      if (res.data.trace) setTrace(res.data.trace);

      if (res.data.interrupt) {
        setSql(res.data.interrupt.proposed_sql);
        setRisk(res.data.interrupt.risk);
        setShadowResult(res.data.interrupt.shadow_result);
      } else if (res.data.result) {
        setResult(res.data.result);
        refreshAll();
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
      refreshAll();
    } catch (err) {
      setError("Failed to resume workflow.");
    }
    setLoading(false);
  };

  const resetApp = () => {
    setPrompt("");
    setSql("");
    setRisk("");
    setResult("");
    setError("");
    setShadowResult(null);
    setTrace([]);
    refreshAll();
  };

  const examplePrompts = [
    "Split the full_name into first_name and last_name",
    "Delete all users from the database",
    "Add a column called is_active to users"
  ];

  return (
    <div className="app-container">
      {/* SIDEBAR */}
      <div className="sidebar">
        <div className="sidebar-header">Database Explorer</div>
        
        <div className="panel">
          <div className="panel-title">Live Schema</div>
          <table className="data-table">
            <thead><tr><th>Table</th><th>Column</th><th>Type</th></tr></thead>
            <tbody>
              {schema.map((col, idx) => (
                <tr key={idx}>
                  <td style={{ fontWeight: 600 }}>{col.table_name}</td>
                  <td>{col.column_name}</td>
                  <td style={{ color: "var(--text-muted)" }}>{col.data_type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <div className="panel-title">Users Data Preview</div>
          {tableData.length === 0 ? (
            <p style={{ fontSize: "13px", color: "var(--text-muted)", fontStyle: "italic" }}>No users found in database.</p>
          ) : (
            <table className="data-table">
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

      {/* MAIN CONTENT */}
      <div className="main-content">
        
        <div className="workspace">
          <div className="header">
            <h1>SafeSchema Agent</h1>
            <p>AI-powered database migrations with human-in-the-loop validation.</p>
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          {/* WELCOME SCREEN (When no action is happening) */}
          {!sql && !result && !loading && (
            <div className="welcome-card">
              <h2>How it works</h2>
              <p>Type a natural language command below. The AI will generate SQL, test it on a Shadow Database, and pause for your approval before touching production.</p>
              
              <div className="prompt-suggestions">
                <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "8px" }}>Try an example:</p>
                {examplePrompts.map((p, i) => (
                  <button key={i} className="prompt-chip" onClick={() => { setPrompt(p); startWorkflow(p); }}>
                    "{p}"
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="input-group" style={{ marginTop: "20px" }}>
            <input
              type="text" className="input-field" value={prompt}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPrompt(e.target.value)}
              placeholder="e.g., Split full_name into first_name and last_name"
              disabled={loading || !!sql}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && startWorkflow()}
            />
            <button className="btn btn-primary" onClick={() => startWorkflow()} disabled={loading || !!sql}>
              {loading ? "Agent Working..." : "Run Agent"}
            </button>
          </div>

          {/* APPROVAL SCREEN */}
          {sql && (
            <div className={`card ${risk === "RISKY" ? "risk-high" : "risk-low"}`}>
              <h2 style={{ fontSize: "18px", display: "flex", alignItems: "center" }}>
                Human Approval Required
                <span className={`badge ${risk === "RISKY" ? "badge-high" : "badge-low"}`}>{risk} RISK</span>
              </h2>
              
              <div className="panel-title" style={{ marginTop: "24px" }}>Proposed SQL Migration</div>
              <pre className="code-block"><code>{sql}</code></pre>

              {shadowResult && shadowResult.status === "PASSED" && (
                <div style={{ marginTop: "24px", background: "rgba(35, 134, 54, 0.1)", padding: "16px", borderRadius: "6px", border: "1px solid var(--success)" }}>
                  <div className="panel-title" style={{ color: "var(--success)", marginBottom: "8px" }}>
                    Shadow DB Validation Passed
                  </div>
                  <p style={{ fontSize: "13px", color: "var(--text)", marginBottom: "12px" }}>
                    <strong>Blast Radius:</strong> {shadowResult.rowCount} rows affected.
                  </p>
                  
                  {shadowResult.rows && shadowResult.rows.length > 0 && (
                    <div style={{ maxHeight: "150px", overflowY: "auto", background: "var(--bg)", borderRadius: "4px" }}>
                      <table className="data-table">
                        <thead><tr>{shadowResult.fields.map((f: string) => <th key={f}>{f}</th>)}</tr></thead>
                        <tbody>{shadowResult.rows.map((row: any, i: number) => (
                          <tr key={i}>{shadowResult.fields.map((f: string) => <td key={f}>{row[f]?.toString()}</td>)}</tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              <div className="action-bar">
                <button className="btn btn-danger" onClick={() => resumeWorkflow(false)} disabled={loading}>Reject</button>
                <button className={`btn ${risk === "RISKY" ? "btn-danger" : "btn-success"}`} onClick={() => resumeWorkflow(true)} disabled={loading}>
                  {risk === "RISKY" ? "Force Execute" : "Approve & Execute"}
                </button>
              </div>
            </div>
          )}

          {/* RESULT SCREEN */}
          {result && (
            <div className={`card ${(result.includes("Blocked") || result.includes("Error") || result.includes("rejected")) ? "risk-high" : ""}`} style={{ borderColor: (result.includes("Blocked") || result.includes("Error") || result.includes("rejected")) ? "var(--danger)" : "var(--success)" }}>
              <h2 style={{ color: (result.includes("Blocked") || result.includes("Error") || result.includes("rejected")) ? "var(--danger)" : "var(--success)" }}>
                {(result.includes("Blocked") || result.includes("Error") || result.includes("rejected")) ? "Execution Blocked" : "Execution Successful"}
              </h2>
              <p style={{ fontSize: "14px", color: "var(--text)" }}>{result}</p>
              <button className="btn btn-primary" onClick={resetApp} style={{ marginTop: "16px" }}>Start New Migration</button>
            </div>
          )}
        </div>

        {/* AGENT TRACE PANEL */}
        <div className="trace-panel">
          <div className="panel-title" style={{ padding: "20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
            <span>Agent Execution Trace</span>
            {loading && <span className="spinner" style={{ width: "14px", height: "14px", borderWidth: "2px" }}></span>}
          </div>
          <div style={{ padding: "20px", fontFamily: "monospace", fontSize: "13px", color: "var(--text-muted)", lineHeight: "1.6" }}>
            {trace.length === 0 ? (
              <div style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
                Waiting for task...<br/><br/>
                The LangGraph state machine will appear here as it executes nodes.
              </div>
            ) : (
              trace.map((step, idx) => (
                <div key={idx} style={{ marginBottom: "8px", display: "flex", gap: "8px" }}>
                  <span style={{ color: step.includes("Error") ? "var(--danger)" : "var(--success)" }}>
                    {step.includes("Error") ? "✗" : "✓"}
                  </span> 
                  <span>{step}</span>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

export default App;