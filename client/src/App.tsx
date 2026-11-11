import { useState, useEffect } from "react";
import axios from "axios";

function App() {
  const [prompt, setPrompt] = useState("");
  const [sql, setSql] = useState("");
  const [risk, setRisk] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  // Schema & Data states
  const [schema, setSchema] = useState<any[]>([]);
  const [tableData, setTableData] = useState<any[]>([]);
  const [tableColumns, setTableColumns] = useState<string[]>([]);
  
  // Shadow DB state
  const [shadowResult, setShadowResult] = useState<any>(null);

  const fetchSchema = async () => {
    try {
      const res = await axios.get("http://localhost:3000/schema");
      setSchema(res.data.schema);
    } catch (err) {
      console.error("Failed to load schema", err);
    }
  };

  const fetchTableData = async () => {
    try {
      const res = await axios.get("http://localhost:3000/data/users");
      setTableData(res.data.data);
      setTableColumns(res.data.columns);
    } catch (err) {
      console.error("Failed to load data", err);
    }
  };

  const refreshAll = () => {
    fetchSchema();
    fetchTableData();
  };

  useEffect(() => {
    refreshAll();
  }, []);

  const startWorkflow = async () => {
    if (!prompt.trim()) {
      setError("Please enter a migration prompt first.");
      return;
    }
    setLoading(true);
    setError("");
    setResult("");
    setSql("");
    setShadowResult(null);
    
    try {
      const res = await axios.post("http://localhost:3000/start", { prompt });
      
      if (res.data.interrupt) {
        setSql(res.data.interrupt.proposed_sql);
        setRisk(res.data.interrupt.risk);
        setShadowResult(res.data.interrupt.shadow_result); // Save Shadow DB data
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
      const res = await axios.post("http://localhost:3000/resume", { approved });
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
    <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif", maxWidth: "1200px", margin: "0 auto" }}>
      <h1 style={{ textAlign: "center", marginBottom: "2rem" }}>🛡️ SafeSchema Dashboard</h1>

      {error && (
        <div style={{ background: "#ffcccc", color: "#cc0000", padding: "1rem", borderRadius: "5px", marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: "2rem", alignItems: "flex-start" }}>
        
        {/* LEFT PANEL: SCHEMA & DATA */}
        <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "1rem" }}>
          
          <div style={{ background: "#f8f9fa", padding: "1.5rem", borderRadius: "8px", border: "1px solid #dee2e6" }}>
            <h2 style={{ marginTop: 0, fontSize: "1.2rem", borderBottom: "2px solid #ccc", paddingBottom: "0.5rem" }}>
              🗄️ Live Schema
            </h2>
            {schema.length === 0 ? (
              <p>No tables found.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                    <th style={{ padding: "8px 0" }}>Table</th>
                    <th style={{ padding: "8px 0" }}>Column</th>
                    <th style={{ padding: "8px 0" }}>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {schema.map((col) => (
                    <tr key={`${col.table_name}-${col.column_name}`} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: "8px 0", fontWeight: "bold" }}>{col.table_name}</td>
                      <td style={{ padding: "8px 0" }}>{col.column_name}</td>
                      <td style={{ padding: "8px 0", color: "#666" }}>{col.data_type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ background: "#f8f9fa", padding: "1.5rem", borderRadius: "8px", border: "1px solid #dee2e6" }}>
            <h2 style={{ marginTop: 0, fontSize: "1.2rem", borderBottom: "2px solid #ccc", paddingBottom: "0.5rem" }}>
              📊 Users Table Data (Top 10)
            </h2>
            {tableData.length === 0 ? (
              <p>No data inside users table.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem", textAlign: "left" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #ccc", background: "#eee" }}>
                      {tableColumns.map(col => <th key={col} style={{ padding: "8px" }}>{col}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.map((row, idx) => (
                      <tr key={idx} style={{ borderBottom: "1px solid #eee" }}>
                        {tableColumns.map(col => <td key={col} style={{ padding: "8px" }}>{row[col]?.toString() || "NULL"}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL: AI WORKFLOW */}
        <div style={{ flex: "2" }}>
          {/* PHASE 1: Input Screen */}
          {!sql && !result && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <label style={{ fontWeight: "bold" }}>What do you want to change in the database?</label>
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g., Add a column called age to the users table"
                style={{ padding: "12px", fontSize: "16px", borderRadius: "5px", border: "1px solid #ccc" }}
                disabled={loading}
              />
              <button
                onClick={startWorkflow}
                disabled={loading}
                style={{ padding: "12px", fontSize: "16px", background: "#007bff", color: "white", border: "none", borderRadius: "5px", cursor: "pointer" }}
              >
                {loading ? "⏳ Agent is working..." : "Start Migration"}
              </button>
            </div>
          )}

          {/* PHASE 2: Approval Screen */}
          {sql && (
            <div style={{ 
              border: risk === "RISKY" ? "3px solid #dc3545" : "2px solid #ffc107", 
              padding: "1.5rem", 
              borderRadius: "8px", 
              background: risk === "RISKY" ? "#fff5f5" : "#fffdf5"
            }}>
              <h2 style={{ color: risk === "RISKY" ? "#dc3545" : "black", marginTop: 0 }}>
                {risk === "RISKY" ? "🚨 DANGEROUS MIGRATION" : "⏸️ Approval Required"}
              </h2>
              
              <p><strong>Risk:</strong> <span style={{ color: risk === "RISKY" ? "red" : "green", fontWeight: "bold" }}>{risk}</span></p>
              
              <p><strong>Proposed SQL:</strong></p>
              <pre style={{ background: "#1e1e1e", color: "#d4d4d4", padding: "1rem", borderRadius: "5px", overflowX: "auto" }}>
                {sql}
              </pre>

              {/* SHADOW DB RESULT TABLE */}
              {shadowResult && shadowResult.status === "PASSED" && (
                <div style={{ marginTop: "1rem", background: "#eef", padding: "1rem", borderRadius: "5px", border: "1px solid #ccd" }}>
                  <h4 style={{ margin: "0 0 10px 0" }}>🛡️ Shadow DB Test Result: PASSED</h4>
                  <p style={{ margin: "0 0 10px 0", fontSize: "0.9rem" }}>Affected Rows: {shadowResult.rowCount}</p>
                  
                  {shadowResult.rows && shadowResult.rows.length > 0 ? (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", background: "white" }}>
                        <thead>
                          <tr style={{ background: "#dde" }}>
                            {shadowResult.fields.map((f: string) => <th key={f} style={{ padding: "5px", border: "1px solid #ccc", textAlign: "left" }}>{f}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {shadowResult.rows.map((row: any, i: number) => (
                            <tr key={i}>
                              {shadowResult.fields.map((f: string) => <td key={f} style={{ padding: "5px", border: "1px solid #ccc" }}>{row[f]?.toString()}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p style={{ fontSize: "0.9rem", color: "#555", fontStyle: "italic" }}>(No rows returned by this query, e.g., ALTER/INSERT)</p>
                  )}
                </div>
              )}

              <div style={{ display: "flex", gap: "1rem", marginTop: "1.5rem" }}>
                <button
                  onClick={() => resumeWorkflow(true)}
                  disabled={loading}
                  style={{ padding: "10px 20px", background: risk === "RISKY" ? "#dc3545" : "#28a745", color: "white", border: "none", borderRadius: "5px", cursor: "pointer" }}
                >
                  {risk === "RISKY" ? "⚠️ Execute Anyway" : "✅ Approve & Execute"}
                </button>
                <button
                  onClick={() => resumeWorkflow(false)}
                  disabled={loading}
                  style={{ padding: "10px 20px", background: "#6c757d", color: "white", border: "none", borderRadius: "5px", cursor: "pointer" }}
                >
                  ❌ Reject
                </button>
              </div>
            </div>
          )}

          {/* PHASE 3: Result Screen */}
          {result && (
            <div style={{ 
              padding: "1.5rem", 
              border: result.includes("❌") ? "2px solid #dc3545" : "2px solid #28a745", 
              borderRadius: "8px", 
              background: result.includes("❌") ? "#fff5f5" : "#f4fff4" 
            }}>
              <h2 style={{ color: result.includes("❌") ? "#dc3545" : "#28a745", marginTop: 0 }}>
                {result.includes("❌") ? "🚨 Blocked / Failed" : "✅ Workflow Complete"}
              </h2>
              <p style={{ fontSize: "1.1rem", fontWeight: "bold" }}>{result}</p>
              
              <button
                onClick={resetApp}
                style={{ padding: "10px 20px", background: "#007bff", color: "white", border: "none", borderRadius: "5px", cursor: "pointer", marginTop: "1rem" }}
              >
                Start a New Migration
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;