/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from "react";
import axios from "axios";
import { Database, ShieldAlert, Terminal, Play, CheckCircle, XCircle, ChevronRight, Activity } from "lucide-react";
import "./App.css";

const API_URL = "https://safeschema.onrender.com"; 

function App() {
  const [activeTab, setActiveTab] = useState<"migrations" | "evaluation">("migrations");
  
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

  // Eval State
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
      const res = await axios.post(`${API_URL}/resume`, { approved });
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
    } catch (err) {
      console.error(err);
    }
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
        <div className="sidebar-header"><Database size={18} className="icon-accent" /><span>Database</span></div>
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
            <ShieldAlert size={32} className="icon-accent" />
            <div>
              <h1>SafeSchema Agent</h1>
              <p>AI database migrations with human-in-the-loop validation.</p>
            </div>
          </div>
          
          {/* TABS */}
          <div className="tabs">
            <button className={`tab ${activeTab === 'migrations' ? 'active' : ''}`} onClick={() => setActiveTab('migrations')}>
              <Terminal size={16} /> Migrations
            </button>
            <button className={`tab ${activeTab === 'evaluation' ? 'active' : ''}`} onClick={() => setActiveTab('evaluation')}>
              <Activity size={16} /> Evaluation Suite
            </button>
          </div>
        </header>

        {activeTab === 'migrations' && (
          <>
            {!sql && !result && !loading && (
              <div className="welcome-container">
                <div className="feature-grid">
                  <div className="feature-card problem-card">
                    <h3><XCircle size={18} /> The Problem</h3>
                    <p>LLMs hallucinate. A blind <code>DELETE</code> query can destroy production data.</p>
                  </div>
                  <div className="feature-card solution-card">
                    <h3><CheckCircle size={18} /> The Solution</h3>
                    <p>LangGraph pauses execution. SQL is tested in a Shadow DB before committing.</p>
                  </div>
                </div>
                <div className="chip-grid">
                  {examplePrompts.map((p, i) => (
                    <button key={i} className="prompt-chip" onClick={() => { setPrompt(p); startWorkflow(p); }}>
                      <ChevronRight size={14} /> "{p}"
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="input-wrapper">
              <input type="text" className="main-input" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ask the AI to modify the database..." disabled={loading || !!sql} />
              <button className="btn-run" onClick={() => startWorkflow()} disabled={loading || !!sql}><Play size={18} /> Run</button>
            </div>

            {error && <div className="alert-error">{error}</div>}

            {sql && (
              <div className={`approval-card ${risk === "RISKY" ? "risk-high" : "risk-low"}`}>
                <div className="approval-header">
                  <h2>Human Approval Required</h2>
                  <span className={`risk-badge ${risk === "RISKY" ? "badge-high" : "badge-low"}`}>{risk}</span>
                </div>
                <pre className="code-window"><code>{sql}</code></pre>
                {shadowResult && (
                  <div className="shadow-result-box">
                    <div className="shadow-header"><CheckCircle size={16} /> Shadow DB Passed</div>
                    <p>Blast Radius: <strong>{shadowResult.rowCount} rows</strong></p>
                  </div>
                )}
                <div className="approval-actions">
                  <button className="btn-reject" onClick={() => resumeWorkflow(false)}>Reject</button>
                  <button className={`btn-approve ${risk === "RISKY" ? "bg-danger" : ""}`} onClick={() => resumeWorkflow(true)}>Approve</button>
                </div>
              </div>
            )}

            {result && (
              <div className={`result-card ${result.includes("Error") || result.includes("Blocked") ? "result-error" : "result-success"}`}>
                <h2>{result.includes("Error") || result.includes("Blocked") ? "Blocked" : "Success"}</h2>
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
                <Play size={18} /> {evalLoading ? "Running Tests..." : "Run Evaluation"}
              </button>
            </div>

            {evalResults && (
              <div className="eval-results">
                <div className="eval-score-card">
                  <h3>Score</h3>
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
        <div className="trace-header"><Terminal size={18} /><span>Trace</span></div>
        <div className="terminal-window">
          {trace.map((t, i) => (<div key={i} className="trace-step"><span className="trace-cursor">{'>'}</span> {t}</div>))}
        </div>
      </aside>
    </div>
  );
}

export default App;