/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from "react";
import axios from "axios";
import "./App.css";

const API_URL = "http://localhost:3000"; // Change to your Render URL for deployment

function App() {
  const [prompt, setPrompt] = useState<string>("");
  const [sql, setSql] = useState<string>("");
  const [risk, setRisk] = useState<string>("");
  const [result, setResult] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  
  // State for schema and data
  const [schema, setSchema] = useState<any[]>([]);
  const [tableData, setTableData] = useState<any[]>([]);
  const [tableColumns, setTableColumns] = useState<string[]>([]);
  const [shadowResult, setShadowResult] = useState<any>(null);
  
  // State for the Agent Trace
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

  const startWorkflow = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError("");
    setResult("");
    setSql("");
    setShadowResult(null);
    setTrace(["Initializing Agent..."]); // Start trace
    
    try {
      const res = await axios.post(`${API_URL}/start`, { prompt });
      
      if (res.data.trace) setTrace(res.data.trace); // Update trace from backend

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
    }
    setLoading(false);
  };

  const resumeWorkflow = async (approved: boolean) => {
    setLoading(true);
    setError("");
    try {
      const res = await axios.post(`${API_URL}/resume`, { approved });
      setResult(res.data.result);
      setSql("");
      setRisk("");
      setShadowResult(null);
      setTrace([]);
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

  return (
    <div className="app-container">
      {/* SIDEBAR - DATABASE EXPLORER */}
      <div className="sidebar">
        <div className="sidebar-header">Database Explorer</div>
        <div className="panel">
          <div className="panel-title">Schema</div>
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
          <div className="panel-title">Users Preview</div>
          {tableData.length === 0 ? <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>No data</p> : (
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

      {/* MAIN CONTENT - AGENT INTERFACE */}
      <div className="main-content">
        
        {/* Left side of main content (Input/Results) */}
        <div className="workspace">
          <div className="header">
            <h1>SafeSchema Agent</h1>
            <p>AI database migrations with human-in-the-loop validation.</p>
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          {!sql && !result && (
            <div className="input-group">
              <input
                type="text" className="input-field" value={prompt}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPrompt(e.target.value)}
                placeholder="e.g., Delete all users from the database"
                disabled={loading}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && startWorkflow()}
              />
              <button className="btn btn-primary" onClick={startWorkflow} disabled={loading}>
                {loading ? "Agent Running..." : "Run Agent"}
              </button>
            </div>
          )}

          {sql && (
            <div className={`card ${risk === "RISKY" ? "risk-high" : "risk-low"}`}>
              <h2 style={{ fontSize: "18px", display: "flex", alignItems: "center" }}>
                Human Approval Required
                <span className={`badge ${risk === "RISKY" ? "badge-high" : "badge-low"}`}>{risk} RISK</span>
              </h2>
              <div className="panel-title" style={{ marginTop: "24px" }}>Proposed SQL</div>
              <pre className="code-block"><code>{sql}</code></pre>

              {shadowResult && shadowResult.status === "PASSED" && (
                <div style={{ marginTop: "24px" }}>
                  <div className="panel-title" style={{ color: "var(--success)" }}>Shadow DB Test: PASSED (Affected Rows: {shadowResult.rowCount})</div>
                  {shadowResult.rows && shadowResult.rows.length > 0 && (
                    <div style={{ maxHeight: "150px", overflowY: "auto" }}>
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

          {result && (
            <div className={`card ${result.includes("Blocked") || result.includes("rejected") ? "risk-high" : ""}`}>
              <h2 style={{ color: result.includes("Blocked") || result.includes("rejected") ? "var(--danger)" : "var(--success)" }}>
                {result.includes("Blocked") || result.includes("rejected") ? "Execution Blocked" : "Execution Successful"}
              </h2>
              <p style={{ fontSize: "14px" }}>{result}</p>
              <button className="btn btn-primary" onClick={resetApp} style={{ marginTop: "16px" }}>New Migration</button>
            </div>
          )}
        </div>

        {/* Right side of main content (Agent Trace / Logs) */}
        <div className="trace-panel">
          <div className="panel-title" style={{ padding: "20px", borderBottom: "1px solid var(--border)" }}>
            Agent Execution Trace
          </div>
          <div style={{ padding: "20px", fontFamily: "monospace", fontSize: "13px", color: "var(--text-muted)" }}>
            {trace.length === 0 ? (
              <p>Waiting for task...</p>
            ) : (
              trace.map((step, idx) => (
                <div key={idx} style={{ marginBottom: "8px", display: "flex", gap: "8px" }}>
                  <span style={{ color: "var(--success)" }}>✓</span> 
                  <span>Node: {step}</span>
                </div>
              ))
            )}
            {loading && (
              <div style={{ marginTop: "12px", display: "flex", gap: "8px", color: "var(--accent)" }}>
                <span className="spinner" style={{ width: "12px", height: "12px", borderWidth: "2px" }}></span>
                <span>Processing...</span>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

export default App;