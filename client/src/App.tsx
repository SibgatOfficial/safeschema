/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from "react";
import axios from "axios";
import "./App.css";

interface SchemaColumn {
  table_name: string;
  column_name: string;
  data_type: string;
}

interface ShadowResult {
  status: string;
  rows: any[];
  rowCount: number;
  fields: string[];
}

function App() {
  const [prompt, setPrompt] = useState<string>("");
  const [sql, setSql] = useState<string>("");
  const [risk, setRisk] = useState<string>("");
  const [result, setResult] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  
  const [schema, setSchema] = useState<SchemaColumn[]>([]);
  const [tableData, setTableData] = useState<any[]>([]);
  const [tableColumns, setTableColumns] = useState<string[]>([]);
  const [shadowResult, setShadowResult] = useState<ShadowResult | null>(null);

  const fetchSchema = async () => {
    try {
      const res = await axios.get("https://safeschema.onrender.com/schema");
      setSchema(res.data.schema);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchTableData = async () => {
    try {
      const res = await axios.get("https://safeschema.onrender.com/data/users");
      setTableData(res.data.data);
      setTableColumns(res.data.columns);
    } catch (err) {
      console.error(err);
    }
  };

  const refreshAll = () => {
    fetchSchema();
    fetchTableData();
  };

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startWorkflow = async () => {
    if (!prompt.trim()) {
      setError("Please enter a migration prompt.");
      return;
    }
    setLoading(true);
    setError("");
    setResult("");
    setSql("");
    setShadowResult(null);
    
    try {
      const res = await axios.post("https://safeschema.onrender.com/start", { prompt });
      
      if (res.data.interrupt) {
        setSql(res.data.interrupt.proposed_sql);
        setRisk(res.data.interrupt.risk);
        setShadowResult(res.data.interrupt.shadow_result);
      } else if (res.data.result) {
        setResult(res.data.result);
        refreshAll();
      }
    } catch (err) {
      setError("Failed to connect to backend.");
    }
    setLoading(false);
  };

  const resumeWorkflow = async (approved: boolean) => {
    setLoading(true);
    setError("");
    try {
      const res = await axios.post("https://safeschema.onrender.com/resume", { approved });
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
    refreshAll();
  };

  return (
    <div className="app-container">
      {/* SIDEBAR */}
      <div className="sidebar">
        <div className="sidebar-header">
          Database Explorer
        </div>
        
        <div className="panel">
          <div className="panel-title">Schema</div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Table</th>
                <th>Column</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {schema.map((col, idx) => (
                <tr key={`${col.table_name}-${col.column_name}-${idx}`}>
                  <td style={{ fontWeight: 600 }}>{col.table_name}</td>
                  <td>{col.column_name}</td>
                  <td style={{ color: "var(--text-muted)" }}>{col.data_type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <div className="panel-title">Users Table Preview</div>
          {tableData.length === 0 ? (
            <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>No data</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  {tableColumns.map(col => <th key={col}>{col}</th>)}
                </tr>
              </thead>
              <tbody>
                {tableData.map((row, idx) => (
                  <tr key={idx}>
                    {tableColumns.map(col => <td key={col}>{row[col]?.toString() || "NULL"}</td>)}
                  </tr>
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

          {/* INPUT SCREEN */}
          {!sql && !result && (
            <div className="input-group">
              <input
                type="text"
                className="input-field"
                value={prompt}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPrompt(e.target.value)}
                placeholder="e.g., Split full_name into first_name and last_name"
                disabled={loading}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && startWorkflow()}
              />
              <button className="btn btn-primary" onClick={startWorkflow} disabled={loading}>
                {loading ? "Thinking..." : "Run Agent"}
              </button>
            </div>
          )}

          {loading && !sql && <div className="spinner" style={{ marginTop: "40px" }}></div>}

          {/* APPROVAL SCREEN */}
          {sql && (
            <div className={`card ${risk === "RISKY" ? "risk-high" : "risk-low"}`}>
              <h2 style={{ fontSize: "18px", margin: "0 0 16px 0", display: "flex", alignItems: "center" }}>
                Human Approval Required
                <span className={`badge ${risk === "RISKY" ? "badge-high" : "badge-low"}`}>
                  {risk} RISK
                </span>
              </h2>
              
              <div className="panel-title" style={{ marginTop: "24px" }}>Proposed SQL</div>
              
              {/* PURE CSS CODE BLOCK */}
              <pre className="code-block">
                <code>{sql}</code>
              </pre>

              {shadowResult && shadowResult.status === "PASSED" && (
                <div style={{ marginTop: "24px" }}>
                  <div className="panel-title" style={{ color: "var(--success)" }}>
                    Shadow DB Preview (Passed)
                  </div>
                  <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "12px" }}>
                    Affected Rows: {shadowResult.rowCount}
                  </p>
                  
                  {shadowResult.rows && shadowResult.rows.length > 0 ? (
                    <div style={{ maxHeight: "200px", overflowY: "auto" }}>
                      <table className="data-table">
                        <thead>
                          <tr>
                            {shadowResult.fields.map((f: string) => <th key={f}>{f}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {shadowResult.rows.map((row: any, i: number) => (
                            <tr key={i}>
                              {shadowResult.fields.map((f: string) => <td key={f}>{row[f]?.toString()}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p style={{ fontSize: "13px", color: "var(--text-muted)", fontStyle: "italic" }}>
                      No rows returned (e.g., ALTER/INSERT).
                    </p>
                  )}
                </div>
              )}

              <div className="action-bar">
                <button className="btn btn-danger" onClick={() => resumeWorkflow(false)} disabled={loading}>
                  Reject
                </button>
                <button className={`btn ${risk === "RISKY" ? "btn-danger" : "btn-success"}`} onClick={() => resumeWorkflow(true)} disabled={loading}>
                  {risk === "RISKY" ? "Force Execute" : "Approve & Execute"}
                </button>
              </div>
            </div>
          )}

          {/* RESULT SCREEN */}
          {result && (
            <div className={`card ${result.includes("Blocked") || result.includes("Error") || result.includes("rejected") ? "risk-high" : ""}`} style={{ borderColor: result.includes("Blocked") || result.includes("Error") || result.includes("rejected") ? "var(--danger)" : "var(--success)" }}>
              <h2 style={{ fontSize: "18px", margin: "0 0 16px 0", color: result.includes("Blocked") || result.includes("Error") || result.includes("rejected") ? "var(--danger)" : "var(--success)" }}>
                {result.includes("Blocked") || result.includes("Error") || result.includes("rejected") ? "Execution Blocked" : "Execution Successful"}
              </h2>
              <p style={{ fontSize: "14px", color: "var(--text)" }}>{result}</p>
              
              <div className="action-bar" style={{ justifyContent: "flex-start", marginTop: "16px" }}>
                <button className="btn btn-primary" onClick={resetApp}>
                  New Migration
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

export default App;