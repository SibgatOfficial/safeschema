/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from "react";
import axios from "axios";
import Editor from "@monaco-editor/react";
import "./App.css";

const API_URL = "https://safeschema.onrender.com"; 

function App() {
  const [activeTab, setActiveTab] = useState<"migrations" | "evaluation">("migrations");
  
  const [prompt, setPrompt] = useState<string>("");
  const [sql, setSql] = useState<string>("");
  const [risk, setRisk] = useState<string>("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  
  const [schema, setSchema] = useState<any[]>([]);
  const [tableData, setTableData] = useState<any[]>([]);
  const [tableColumns, setTableColumns] = useState<string[]>([]);
  const [shadowResult, setShadowResult] = useState<any>(null);
  const [trace, setTrace] = useState<string[]>([]);

  const [evalLoading, setEvalLoading] = useState(false);
  const [evalResults, setEvalResults] = useState<any>(null);
  const [evalTrace, setEvalTrace] = useState<string[]>([]);

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
    
    setLoading(true); setError(""); setResult(null); setSql(""); setShadowResult(null);
    setTrace(["Initializing LangGraph...", "Connecting to Database..."]);
    
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
      setError(`Backend Error: ${err.response?.data?.details || err.message}`);
    }
    setLoading(false);
  };

  const resumeWorkflow = async (approved: boolean) => {
    setLoading(true); setTrace(prev => [...prev, `Decision: ${approved ? 'APPROVED' : 'REJECTED'}`]);
    try {
      const res = await axios.post(`${API_URL}/resume`, { approved, editedSql: sql });
      setResult(res.data.result); setSql(""); setRisk(""); setShadowResult(null);
      fetchSchema(); fetchTableData();
    } catch (err) { setError("Failed to resume."); }
    setLoading(false);
  };

  const runEvaluation = async () => {
    setEvalLoading(true); setEvalResults(null);
    setEvalTrace(["Starting Agentic Evaluation Suite..."]);

    try {
      const response = await fetch(`${API_URL}/eval`);
      if (!response.body) throw new Error("No response body");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split("\n").filter(Boolean);
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.type === "log") setEvalTrace(prev => [...prev, parsed.message]);
            else if (parsed.type === "result") setEvalResults({ score: parsed.score, results: parsed.results });
          } catch (e) {}
        }
      }
    } catch (err) { setEvalTrace(prev => [...prev, "❌ Failed to connect."]); }
    setEvalLoading(false);
  };

  return (
    <div className="app-layout">
      <nav className="top-nav">
        <div className="nav-brand">
          <div className="nav-logo">S</div>
          <span className="nav-title">SafeSchema AI</span>
        </div>
        <div className="nav-links">
          <span className="nav-badge">v1.0.0</span>
          <a href="https://github.com/SibgatOfficial/safeschema" target="_blank" rel="noreferrer" className="nav-link">GitHub Repo</a>
        </div>
      </nav>

      <div className="dashboard-layout">
        <aside className="sidebar">
          <div className="sidebar-header">Database Explorer</div>
          <div className="sidebar-section">
            <h3 className="section-title">Live Schema</h3>
            <div className="table-wrapper">
              <table><thead><tr><th>Table</th><th>Column</th></tr></thead>
                <tbody>{schema.map((c, i) => (<tr key={i}><td className="text-accent">{c.table_name}</td><td>{c.column_name}</td></tr>))}</tbody>
              </table>
            </div>
          </div>
          <div className="sidebar-section">
            <h3 className="section-title">Users Preview</h3>
            <div className="table-wrapper">
              {tableData.length === 0 ? <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>No data</p> : (
                <table>
                  <thead><tr>{tableColumns.map(col => <th key={col}>{col}</th>)}</tr></thead>
                  <tbody>{tableData.map((row, idx) => (<tr key={idx}>{tableColumns.map(col => <td key={col}>{row[col]?.toString() || "NULL"}</td>)}</tr>))}</tbody>
                </table>
              )}
            </div>
          </div>
        </aside>

        <main className="main-workspace">
          <header className="workspace-header">
            <div className="hero-section">
              <h1>Agentic DB Migrations</h1>
              <p>Prevent AI database disasters with human-in-the-loop validation.</p>
            </div>
            <div className="tabs">
              <button className={`tab ${activeTab === 'migrations' ? 'active' : ''}`} onClick={() => setActiveTab('migrations')}>Migrations</button>
              <button className={`tab ${activeTab === 'evaluation' ? 'active' : ''}`} onClick={() => setActiveTab('evaluation')}>Evaluation Suite</button>
            </div>
          </header>

          {activeTab === 'migrations' && (
            <>
              <div className="input-wrapper">
                <input type="text" className="main-input" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ask the AI to modify the database..." disabled={loading || !!sql} onKeyDown={(e) => e.key === 'Enter' && startWorkflow()} />
                <button className="btn-run" onClick={() => startWorkflow()} disabled={loading || !!sql}>
                  {loading ? <span className="spinner"></span> : "Run Agent"}
                </button>
              </div>

              {error && <div className="alert-error">{error}</div>}

              {sql && (
                <div className={`approval-card ${risk === "RISKY" ? "risk-high" : "risk-low"}`}>
                  <div className="approval-header">
                    <h2>Human Approval Required</h2>
                    <span className={`risk-badge ${risk === "RISKY" ? "badge-high" : "badge-low"}`}>{risk}</span>
                  </div>
                  <div className="agent-message-box">
                    <p><strong>Original Request:</strong> "{prompt}"</p>
                  </div>
                  <div className="editor-window">
                    <div className="editor-header">
                      <span className="dot dot-red"></span><span className="dot dot-yellow"></span><span className="dot dot-green"></span>
                      <span className="editor-title">migration.sql (Editable)</span>
                    </div>
                    <Editor height="200px" defaultLanguage="sql" value={sql} theme="vs-dark" onChange={(value) => setSql(value || "")} options={{ minimap: { enabled: false }, fontSize: 14, padding: { top: 16 }, scrollBeyondLastLine: false }} />
                  </div>
                  {shadowResult && (
                    <div className="shadow-result-box">
                      <div className="shadow-header">✓ Shadow DB Validation Passed</div>
                      <p>Blast Radius: <strong>{shadowResult.rowCount} rows affected</strong></p>
                    </div>
                  )}
                  <div className="approval-actions">
                    <button className="btn-reject" onClick={() => resumeWorkflow(false)} disabled={loading}>Reject</button>
                    <button className={`btn-approve ${risk === "RISKY" ? "bg-danger" : ""}`} onClick={() => resumeWorkflow(true)} disabled={loading}>
                      {loading ? <span className="spinner" style={{ borderTopColor: "white" }}></span> : "Approve & Execute"}
                    </button>
                  </div>
                </div>
              )}

              {result && (
                <div className={`result-card ${result.message?.includes("Error") || result.message?.includes("Blocked") ? "result-error" : "result-success"}`}>
                  <h2>{result.message?.includes("Error") || result.message?.includes("Blocked") ? "Execution Blocked" : "Execution Successful"}</h2>
                  <p>{result.message}</p>
                  
                  {/* THIS RENDERS THE DATA TABLE AFTER APPROVAL */}
                  {result.rows && result.rows.length > 0 && (
                    <div className="table-wrapper" style={{ marginTop: "20px", background: "var(--bg-panel)" }}>
                      <table>
                        <thead><tr>{result.fields.map((f: string) => <th key={f}>{f}</th>)}</tr></thead>
                        <tbody>{result.rows.map((row: any, idx: number) => (<tr key={idx}>{result.fields.map((f: string) => <td key={f}>{row[f]?.toString() || "NULL"}</td>)}</tr>))}</tbody>
                      </table>
                    </div>
                  )}
                  <button className="btn-reset" onClick={() => { setResult(null); setPrompt(""); }}>Start New Migration</button>
                </div>
              )}
            </>
          )}

          {activeTab === 'evaluation' && (
            <div className="eval-container">
              <div className="eval-header">
                <div>
                  <h2>Agent Evaluation Harness</h2>
                  <p>Automated Golden Dataset testing for safety guardrails.</p>
                </div>
                <button className="btn-run" onClick={runEvaluation} disabled={evalLoading}>
                  {evalLoading ? <span className="spinner"></span> : "Run Evaluation"}
                </button>
              </div>

              {evalTrace.length > 0 && (
                <div className="terminal-window" style={{ marginTop: "20px", border: "1px solid var(--border)", borderRadius: "8px", background: "#000", maxHeight: "250px" }}>
                  <div className="panel-title" style={{ padding: "10px 20px", borderBottom: "1px solid var(--border)" }}>Live Test Execution</div>
                  <div style={{ padding: "20px" }}>
                    {evalTrace.map((log, i) => (<div key={i} className="trace-step"><span className="trace-cursor">&gt;</span> {log}</div>))}
                  </div>
                </div>
              )}

              {evalResults && (
                <div className="eval-results">
                  <div className="eval-score-card">
                    <h3>Final Test Score</h3>
                    <div className="score-circle">{evalResults.score}%</div>
                  </div>
                  <div className="eval-table">
                    <table>
                      <thead><tr><th>Test Case</th><th>Status</th><th>Risk Flagged</th><th>Shadow DB</th><th>Time</th></tr></thead>
                      <tbody>
                        {evalResults.results.map((r: any, i: number) => (
                          <tr key={i}>
                            <td>{r.name}</td>
                            <td className={r.status === "PASS" ? "text-success" : "text-danger"}>{r.status}</td>
                            <td>{r.riskDetected ? "Yes" : "No"}</td>
                            <td>{r.shadowDbPassed ? "Passed" : "Blocked"}</td>
                            <td className="text-muted">{r.durationMs}ms</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

        <aside className="trace-panel">
          <div className="trace-header">Agent Execution Trace</div>
          <div className="terminal-window">
            {trace.map((t, i) => (<div key={i} className="trace-step"><span className="trace-cursor">&gt;</span> {t}</div>))}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default App;