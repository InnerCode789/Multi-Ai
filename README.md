# 🚀 Multi-AI | Autonomous Multi-Model Software Engineering System

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Architecture](https://img.shields.io/badge/Multi--Agent-Adversarial%20Engine-purple.svg)](#architecture)

> An autonomous team of independent AI models that plan, implement, critically review, debate, test, and verify real software projects until completion criteria are backed by direct evidence.

---

## 🏗️ How Multi-AI Works

Unlike chatbots that simulate multi-agent behavior with sequential prompts, **Multi-AI** operates as a state-driven autonomous software engineering team operating on real project files in an isolated workspace:

```text
               USER GOAL DIRECTIVE
                        │
                        ▼
               🧠 LEAD PLANNER (Gemini)
         • Technical Architecture & Stack Choice
         • Task Decomposition & Dependency Graph
         • Unambiguous Acceptance Criteria
                        │
                        ▼
           ┌────────────────────────────┐
           │      PROJECT STATE         │
           │  Tasks • Messages • Schema │
           └────────────┬───────────────┘
                        │
      ┌─────────────────┴─────────────────┐
      ▼                                   ▼
👨‍💻 LEAD ENGINEER (Groq / DeepSeek-R1)   🔍 CRITICAL REVIEWER (GitHub Models / GPT-4o)
  • Inspects codebase with tools           • Independently audits generated files
  • Writes & modifies production code      • Identifies vulnerabilities & edge cases
  • Executes sandboxed build commands      • Challenges weak architectural assumptions
      │                                   │
      └─────────────────┬─────────────────┘
                        │
                        ▼
            💬 ADVERSARIAL DEBATE & REBUTTAL
         • Engineer accepts valid findings & revises code
         • Engineer defends technical choices with evidence
         • Records structured decisions in shared state
                        │
                        ▼
            🧪 QA & VERIFICATION (Gemini)
         • Runs automated test suites & syntax checks
         • Inspects generated files against Acceptance Criteria
         • Gathers concrete proof for every requirement
                        │
                        ▼
         ┌───────────────────────────────┐
         │ All Acceptance Criteria Met?  │
         └───────┬───────────────┬───────┘
                 │ NO            │ YES
                 ▼               ▼
         🔄 REPLAN & REMEDIATE   🎉 GOAL VERIFIED & COMPLETED
```

---

## 🤖 Real Multi-Model Agent Roster

| Role | Default Model | Responsibility |
| :--- | :--- | :--- |
| **🧠 System Planner** | **Google Gemini 2.5 Flash** | Goal analysis, architecture design, task graph, acceptance criteria |
| **👨‍💻 Lead Engineer** | **Groq (`deepseek-r1-distill-llama-70b`)** | Real code generation, file creation, sandbox commands, refactoring |
| **🔍 Critical Reviewer**| **GitHub Models (`gpt-4o-mini`)** | Adversarial review, security analysis, defect detection, challenger |
| **🧪 QA Specialist** | **Google Gemini 2.5 Flash** | Test execution, syntax validation, evidence gathering, verification |

---

## 🛡️ Sandbox & Security Isolation

- **Workspace Sandboxing**: All file operations (`read_file`, `write_file`, `list_directory`, `search_files`) are strictly locked to `./workspaces/goal_<id>/`. Path traversal (`..`) attempts are rejected.
- **Command Allowlist**: Terminal tools only permit safe commands (`node`, `npm`, `npx`, `git`, `dir`, `cat`, etc.) with strict execution timeouts and output buffer limits.
- **Persistent Storage**: Persistent SQLite / WAL journaled database records all goals, tasks, agent messages, decisions, reviews, and criteria evidence.

---

## ⚡ Quick Start

### 1. Installation

```bash
git clone https://github.com/InnerCode789/Multi-Ai.git
cd Multi-Ai
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and provide your API keys:

```bash
cp .env.example .env
```

```env
# Free API Keys:
GROQ_API_KEY=gsk_...
GITHUB_MODELS_TOKEN=ghp_...
GEMINI_API_KEY=AIza...
```

### 3. Launch Development Server

```bash
npm run dev
```

Open your browser at **`http://localhost:3000`** to access the **Multi-AI Observability Dashboard**.

---

## 📡 API Reference

### `POST /api/goal/stream`
Initiates an autonomous engineering loop and streams real-time Server-Sent Events (`text/event-stream`).

**Request Body:**
```json
{
  "goal": "Build a modern ChatGPT-style web frontend with a sidebar, conversation list, message streaming, markdown rendering, responsive mobile layout and dark mode.",
  "maxIterations": 10
}
```

**SSE Events Streamed:**
- `init`: Goal run metadata
- `agent_event`: Real-time agent event (`plan_created`, `task_stage`, `tool_call`, `debate_started`, `review_completed`, `qa_verifying`, `criterion_updated`)
- `goal_complete`: Final verification report with workspace path and criteria evidence
- `error`: Error details if aborted or failed

### `GET /api/status`
Returns active model providers, agent-to-model routing, and registered tools.

### `GET /api/goals`
Lists all historical goal runs and completion statuses.

---

## 🧪 Testing

Run the full automated test suite:

```bash
# Run all unit and integration tests
npm test
```

---

## 📄 License

MIT © [InnerCode789](https://github.com/InnerCode789)