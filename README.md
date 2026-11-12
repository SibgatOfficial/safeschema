
# 🛡️ SafeSchema Agent

![Status](https://img.shields.io/badge/Status-Production%20Ready-success)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=flat&logo=node.js&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=flat&logo=postgresql&logoColor=white)

**SafeSchema** is an Agentic AI guardrail for database migrations. It leverages **LangGraph.js** and **LLMs** to translate natural language into SQL, validates the query in a **Shadow PostgreSQL Database**, and enforces a **Human-in-the-Loop (HITL)** approval gate before touching production data.

---

## 🚨 The Problem
Large Language Models (LLMs) are incredible at generating SQL, but they are highly prone to hallucinations. If a developer asks an AI to *"delete a test user"*, the AI might accidentally generate `DELETE FROM users;` (missing the `WHERE` clause). 

If a developer blindly executes this AI-generated query in production, it results in **catastrophic data loss**.

## 💡 The Solution
SafeSchema treats the LLM as a fallible component, not an autonomous agent. It wraps the AI in a deterministic, stateful safety layer:

1. **Dynamic Schema Context:** The agent reads the live `information_schema` to ensure the LLM understands the exact database structure.
2. **Shadow DB Execution:** Before the user sees the SQL, it is executed inside a `BEGIN` transaction on the actual database. The system captures the "Blast Radius" (e.g., `Affected Rows: 50,000`) and immediately triggers a `ROLLBACK`.
3. **Risk Engine:** Static analysis scans the SQL for destructive keywords (`DROP`, `DELETE`, `TRUNCATE`) and flags the migration as `RISKY`.
4. **Human-in-the-Loop (HITL):** LangGraph’s `interrupt()` function pauses the state machine. The agent *cannot* commit to production until a human clicks "Approve".
5. **RAG Memory:** Successful migrations are saved to **PGVector**. Future prompts retrieve this history to provide context to the LLM.

---

## 🏗️ Architecture Flow

```mermaid
graph TD
    A[User Prompt] --> B{React Frontend}
    B -->|POST /start| C[Express API]
    C --> D[LangGraph State Machine]
    D --> E[Node 1: Generate SQL via Groq LLM]
    E --> F[Node 2: Shadow DB Test - BEGIN/ROLLBACK]
    F -->|Syntax Error| G[Block Execution]
    F -->|Passed| H[Node 3: Human Approval Gate - Interrupt]
    H -->|User Approves| I[Node 4: COMMIT to Production]
    H -->|User Rejects| J[Abort Migration]
    I --> K[Save to PGVector RAG Memory]
```

---

## 🛠️ Tech Stack

**Frontend:**
*   React (Vite) + TypeScript
*   Custom CSS (Dark-mode Developer Dashboard)
*   Axios

**Backend & AI:**
*   Node.js + Express + TypeScript
*   **LangGraph.js** (State Machine, Interrupts, MemorySaver)
*   **Groq API** (Ultra-fast Llama 3 inference)
*   **PGVector** (RAG memory for past migrations)

**Infrastructure:**
*   **PostgreSQL (Neon)** Serverless Database
*   **Render** (Backend Hosting)
*   **Vercel** (Frontend Hosting)

---

## 🚀 Local Setup

### 1. Clone & Install
```bash
git clone https://github.com/SibgatOfficial/safeschema.git
cd safeschema
npm install
cd client && npm install && cd ..
```

### 2. Environment Variables
Create a `.env` file in the root directory:
```env
# For Local Docker
DB_USER=postgres
DB_PASSWORD=dev
DB_HOST=localhost
DB_PORT=5432
DB_NAME=postgres

# For Production (Neon)
DATABASE_URL="postgresql://user:password@ep-xxx-pooler.aws.neon.tech/neondb?sslmode=require"

# AI Provider
GROQ_API_KEY="gsk_your_groq_api_key"
```

### 3. Start the Database (Docker)
```bash
docker run --name safeschema-db -e POSTGRES_PASSWORD=dev -p 5432:5432 -d pgvector/pgvector:pg16
```

### 4. Run the App
**Backend:**
```bash
npx tsx server.ts
```
**Frontend:**
```bash
cd client && npm run dev
```

---

## 🧪 Evaluation Harness

Building the agent is only half the battle; testing it is the other half. This project includes an automated Golden Dataset evaluation script to verify the safety guardrails.

Run the evaluation:
```bash
npx tsx eval.ts
```

**Test Cases Evaluated:**
1.  `Safe Schema Migration` (Adds column, expects Shadow DB Pass)
2.  `Destructive Data Action` (Drops table, expects Risk Engine Flag)
3.  `Syntax Hallucination` (Invalid SQL, expects Shadow DB Block)

---

## 👨‍💻 Author
**Sibgat Ullah**
*   [GitHub](https://github.com/SibgatOfficial)
*   [LinkedIn](https://linkedin.com/in/sibgat-ullah)
```



