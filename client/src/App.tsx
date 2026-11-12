/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from "react";
import axios from "axios";
import Editor from "@monaco-editor/react";
import "./App.css";

const API_URL = "https://safeschema.onrender.com"; // Use localhost for local testing

function App() {
  const [activeTab, setActiveTab] = useState<"migrations" | "evaluation">("migrations");
  
  const [prompt, setPrompt] = useState<string>("");
  const [sql, setSql] = useState<string>("");
  const [risk, setRisk] = useState<string>("");
  const [result, setResult] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  
  const [schema, setSchema] = useState<any[]>([]);
  const [shadowResult, setShadowResult] = useState<any>(null);
  const [trace, setTrace] = useState<string[]>([]);

  const [evalLoading, setEvalLoading] = useState(false);
  const [evalResults, setEvalResults] = useState<any>(null);

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
    
    setLoading(true); setError(""); setResult(""); setSql(""); setShadowResult(null);
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
      // 👈 Send the edited SQL back to the server
      const res = await axios.post(`${API_URL}/resume`, { approved, editedSql: sql });
      setResult(res.data.result); setSql(""); setRisk(""); setShadowResult(null);
      fetchSchema(); fetchTableData();
    } catch (err) { setError("Failed to resume."); }
    setLoading(false);
  };

  const runEvaluation = async () => {
    setEvalLoading(true);
    try {
      const res = await axios.get(`${API_URL}/eval`);
      setEvalResults(res.data);
    } catch (err) { console.error(err); }
    setEvalLoading(false);
  };

  const examplePrompts = [
    "Split the full_name into first_name and last_name",
    "Delete all users from the database",
    "Add a column called phone_number to users"
  ];

  return (
    <div className="dashboard-layout">
      <aside className="sidebar">
        <div className="sidebar-header">Database Explorer</div>
        <div className="sidebar-section">
          <h3 className="section-title">Live Schema</h3>
          <table><thead><tr><th>Table</th><th>Column</th></tr></thead>
            <tbody>{schema.map((c, i) => (<tr key={i}><td className="text-accent">{c.table_name}</td><td>{c.column_name}</td></tr>))}</tbody>
          </table>
        </div>
      </aside>

      <main className="main-workspace">
        <header className="workspace-header">
          <div className="logo">
            <div className="logo-icon">S</div>
            <div>
              <h1>SafeSchema Agent</h1>
              <p>Agentic DB migrations with Human-in-the-loop.</p>
            </div>
          </div>
          
          <div className="tabs">
            <button className={`tab ${activeTab === 'migrations' ? 'active' : ''}`} onClick={() => setActiveTab('migrations')}>Migrations</button>
            <button className={`tab ${activeTab === 'evaluation' ? 'active' : ''}`} onClick={() => setActiveTab('evaluation')}>Evaluation Suite</button>
          </div>
        </header>

        {activeTab === 'migrations' && (
          <>
            {!sql && !result && !loading && (
              <div className="welcome-container">
                <div className="hero-title">Prevent AI Database Disasters</div>
                <div className="hero-subtitle">LangGraph pauses execution. SQL is tested in a Shadow DB before committing to production.</div>
                <div className="chip-grid">
                  {examplePrompts.map((p, i) => (
                    <button key={i} className="prompt-chip" onClick={() => { setPrompt(p); startWorkflow(p); }}>"{p}"</button>
                  ))}
                </div>
              </div>
            )}

            <div className="input-wrapper">
              <input type="text" className="main-input" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ask the AI to modify the database..." disabled={loading || !!sql} />
              <button className="btn-run" onClick={() => startWorkflow()} disabled={loading || !!sql}>{loading ? "Running..." : "Run Agent"}</button>
            </div>

            {error && <div className="alert-error">{error}</div>}

            {sql && (
              <div className={`approval-card ${risk === "RISKY" ? "risk-high" : "risk-low"}`}>
                <div className="approval-header">
                  <h2>Human Approval Required</h2>
                  <span className={`risk-badge ${risk === "RISKY" ? "badge-high" : "badge-low"}`}>{risk}</span>
                </div>
                
                {/* REAL MONACO EDITOR */}
                <div className="editor-window">
                  <div className="editor-header">
                    <span className="dot dot-red"></span>
                    <span className="dot dot-yellow"></span>
                    <span className="dot dot-green"></span>
                    <span className="editor-title">migration.sql (Editable)</span>
                  </div>
                  <Editor
                    height="200px"
                    defaultLanguage="sql"
                    value={sql}
                    theme="vs-dark"
                    onChange={(value) => setSql(value || "")} // 👈 Update state when user edits
                    options={{
                      minimap: { enabled: false },
                      fontSize: 14,
                      padding: { top: 16 },
                      scrollBeyondLastLine: false,
                    }}
                  />
                </div>

                {shadowResult && (
                  <div className="shadow-result-box">
                    <div className="shadow-header">✓ Shadow DB Validation Passed</div>
                    <p>Blast Radius: <strong>{shadowResult.rowCount} rows affected</strong></p>
                  </div>
                )}
                <div className="approval-actions">
                  <button className="btn-reject" onClick={() => resumeWorkflow(false)}>Reject</button>
                  <button className={`btn-approve ${risk === "RISKY" ? "bg-danger" : ""}`} onClick={() => resumeWorkflow(true)}>Approve & Execute</button>
                </div>
              </div>
            )}

            {result && (
              <div className={`result-card ${result.includes("Error") || result.includes("Blocked") ? "result-error" : "result-success"}`}>
                <h2>{result.includes("Error") || result.includes("Blocked") ? "Execution Blocked" : "Execution Successful"}</h2>
                <p>{result}</p>
                <button className="btn-reset" onClick={() => { setResult(""); setPrompt(""); }}>New Migration</button>
              </div>
            )}
          </>
        )}

        {activeTab === 'evaluation' && (
          <div className="eval-container">
            <div className="eval-header">
              <div>
                <h2>Agent Evaluation Harness</h2>
                <p>Automated Golden Dataset testing for the Risk Engine and Shadow DB.</p>
              </div>
              <button className="btn-run" onClick={runEvaluation} disabled={evalLoading}>
                {evalLoading ? "Running Tests..." : "Run Evaluation"}
              </button>
            </div>

            {evalResults && (
              <div className="eval-results">
                <div className="eval-score-card">
                  <h3>Test Score</h3>
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
  );
}

export default App;