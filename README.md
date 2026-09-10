<p align="center">
  <img src="public/logo.svg" alt="CineFlow AI Logo" width="320" />
</p>

<h1 align="center">CineFlow AI</h1>

<p align="center">
  <strong>Autonomous Production Operations Assistant for Film & Media Studios</strong><br />
  <em>Built for <strong>Agentic Cinema: The Blockbuster Hackathon</strong></em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Hackathon-Agentic%20Cinema%202026-blue?style=for-the-badge&logo=google" alt="Hackathon" />
  <img src="https://img.shields.io/badge/AI%20Model-Google%20Gemini%202.0%20Flash-4285F4?style=for-the-badge&logo=google-gemini&logoColor=white" alt="Gemini" />
  <img src="https://img.shields.io/badge/Framework-Next.js%2016%20(Turbopack)-black?style=for-the-badge&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/Runtime-Bun%20%2F%20Node.js-FBF0DF?style=for-the-badge&logo=bun&logoColor=black" alt="Bun" />
  <img src="https://img.shields.io/badge/Styling-Tailwind%20CSS%204-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind" />
  <img src="https://img.shields.io/badge/Database-Prisma%20%2B%20SQLite-2D3748?style=for-the-badge&logo=prisma" alt="Prisma" />
</p>

---

## 🎬 Project Overview

Modern film and virtual production pipelines operate under high-stakes deadlines. Ingest nodes, transcoders, 4K/8K VFX render fleets, color grading clusters, and master distribution pipelines process millions of assets daily. When an anomaly occurs, operators typically waste critical hours switching between telemetry dashboards, correlating deployments, and manually tracing root causes across disjointed tools.

**CineFlow AI** is an agentic, evidence-grounded production operations assistant engineered specifically for media studios. It provides an autonomous yet tightly governed incident lifecycle:

1. **Detects** telemetry anomalies across 24 production workflows in real time.
2. **Diagnoses** issues by executing structured diagnostic tools against logs, infrastructure metrics, and deployment history.
3. **Formulates Evidence-Grounded Root Causes** with calculated confidence scores.
4. **Applies Policy Guardrails** (LOW, MEDIUM, HIGH) to enforce strict safety constraints.
5. **Human-in-the-Loop Authorization Gate**: Halts execution for risky operations (such as compute scaling or service restarts) until human authorization is granted.
6. **Autonomous Remediation & Self-Verification**: Executes approved actions and continuously verifies recovery thresholds before marking incidents resolved.

---

## 🏆 Built for the Hackathon

> **Agentic Cinema: The Blockbuster Hackathon**  
> *Category: AI Agents in Production & Pipeline Engineering*

### Key Hackathon Requirements Addressed
- **Real Agentic Autonomy**: Operates through an 11-phase state machine (`UNDERSTAND` → `COLLECT` → `ANALYZE` → `ROOT_CAUSE` → `CONFIDENCE` → `RISK` → `RECOMMEND` → `APPROVAL` → `ACTION` → `VERIFY` → `RESOLVE`).
- **Google Gemini Integration**: Native REST adapter to **Google Gemini 2.0 Flash** (`generativelanguage.googleapis.com`) with deterministic fallback to ensure complete reproducibility during evaluation.
- **Enterprise Safety & Guardrails**: Multi-tier risk policy engine where destructive actions are strictly blocked and operations impacting cost/capacity require explicit human approval.
- **Zero Hallucination Standard**: The agent never fabricates facts or metric values; every diagnostic claim is directly tied to a verifiable tool execution output.

---

## 🏛️ Comprehensive Architecture & Flow Diagrams

### 1. High-Level System Architecture

```mermaid
flowchart TB
    Operator([Production Operator / Judge])

    subgraph ClientLayer["Frontend Client Application (SPA)"]
        Landing["Landing Page (#/)"]
        Dashboard["Operations Dashboard (#/dashboard)"]
        AgentConsole["AI Agent Console (#/agent)"]
        IncidentViews["Incidents & Details (#/incidents, #/incidents/:id)"]
        WorkflowViews["Workflows & Infrastructure (#/workflows, #/system-health)"]
        AuditLog["Audit Log & Exporters (#/audit, #/reports)"]
        CompareView["Incident Diff / Compare (#/compare/:idA/:idB)"]
        Palette["Global Command Palette (⌘K / Ctrl+K)"]
        Store["Zustand Client Store & Polling Hooks"]
    end

    subgraph APILayer["Next.js 16 API Controller Layer (App Router)"]
        RouteAgentQuery["POST /api/agent/query"]
        RouteAgentDemo["POST /api/agent/demo"]
        RouteAgentRuns["GET /api/agent/runs, /api/agent/runs/:id"]
        RouteApprove["POST /api/recommendations/:id/approve"]
        RouteReject["POST /api/recommendations/:id/reject"]
        RouteTelemetry["GET /api/workflows, /api/metrics, /api/incidents"]
        RouteHealth["GET /api/health, /api/settings, /api/demo/reset"]
    end

    subgraph EngineLayer["Agent Engine & Orchestrator (src/lib/agent)"]
        StateMachine["11-Phase Step Machine (engine.ts)"]
        GuardrailsEngine["Guardrail Risk Classifier (guardrails.ts)"]
        ActionsExecutor["Action & Recovery Engine (actions.ts)"]
    end

    subgraph ToolRegistry["9-Tool Operational Registry (src/lib/agent/tools.ts)"]
        T1["get_workflow_status"]
        T2["get_system_health"]
        T3["get_recent_events"]
        T4["search_incident_history"]
        T5["analyze_logs"]
        T6["get_metrics"]
        T7["list_incidents"]
        T8["recommend_action"]
        T9["verify_recovery"]
    end

    subgraph ReasoningLayer["AI Provider Layer (src/lib/ai/providers.ts)"]
        GeminiAdapter["Google Gemini 2.0 Flash (REST API)"]
        DemoAdapter["Deterministic Scripted Reasoning"]
    end

    subgraph DataStore["Data Layer (Prisma ORM + SQLite)"]
        DB[(Local SQLite DB: db/custom.db)]
        SeedData["Deterministic Studio Seed Data (src/lib/seed.ts)"]
    end

    Operator <--> ClientLayer
    ClientLayer <--> APILayer
    APILayer --> EngineLayer
    EngineLayer --> ToolRegistry
    EngineLayer --> GuardrailsEngine
    EngineLayer --> ReasoningLayer
    ReasoningLayer -.->|API Call when configured| GeminiExt([Google Cloud Gemini API])
    ToolRegistry <--> DataStore
    ActionsExecutor <--> DataStore
```

---

### 2. Autonomous Incident Triage & Resolution Flow (End-to-End)

```mermaid
sequenceDiagram
    autonumber
    actor Operator as Studio Ops Manager
    participant UI as CineFlow Agent Console
    participant Engine as Agent Orchestration Engine
    participant Registry as Tool Registry (9 Tools)
    participant DB as Studio Telemetry Store
    participant Guard as Guardrails Policy
    participant AI as Gemini 2.0 Flash / LLM

    Operator->>UI: Triggers query: "Why is the post-production render pipeline delayed?"
    UI->>Engine: POST /api/agent/query (intent: render_delay)
    Engine->>UI: Initializes run (status: RUNNING, phase: UNDERSTAND)

    rect rgb(240, 249, 255)
        Note over Engine,DB: Phase: Evidence Collection & Telemetry Mining
        Engine->>Registry: Call get_workflow_status("post-production-render")
        Registry->>DB: Query workflow status
        DB-->>Registry: Health: CRITICAL, Queue: 187, Latency: 4200ms
        Engine->>Registry: Call get_system_health()
        Registry->>DB: Query node metrics
        DB-->>Registry: 4 render nodes, worker-02 memory ceiling breached
        Engine->>Registry: Call get_recent_events(limit: 5)
        Registry->>DB: Query deployment events
        DB-->>Registry: Deploy: render-worker v2.4.1 committed 20m ago
        Engine->>Registry: Call search_incident_history("render queue saturation")
        Registry->>DB: Query past incidents
        DB-->>Registry: Match found: INC-1039 (resolved via worker pool expansion)
    end

    rect rgb(254, 242, 242)
        Note over Engine,Guard: Phase: Root Cause Formulation & Safety Assessment
        Engine->>Registry: Call analyze_logs(service: "render-worker")
        Engine->>AI: Synthesize evidence, correlate deployment v2.4.1 with memory leak
        AI-->>Engine: Root cause: Worker pool capacity saturated post-deployment, 4 workers insufficient for 4K EXR passes
        Engine->>Engine: Confidence score calculated: 87%
        Engine->>Guard: Evaluate action: SCALE_RENDER_WORKERS (4 -> 6)
        Guard-->>Engine: Policy check: MEDIUM RISK -> Requires Human Approval
    end

    rect rgb(255, 251, 235)
        Note over Engine,Operator: Phase: Human-in-the-Loop Gate
        Engine->>UI: Status -> AWAITING_APPROVAL (Halts pipeline, presents recommendation & evidence)
        Operator->>UI: Reviews evidence metrics, past INC-1039, and proposed action
        Operator->>UI: Clicks "Approve Recommendation"
        UI->>Engine: POST /api/recommendations/:id/approve
    end

    rect rgb(240, 253, 244)
        Note over Engine,DB: Phase: Execution & Recovery Verification
        Engine->>Engine: Status -> EXECUTING (Action: Scale render workers 4 -> 6)
        Engine->>DB: Mutates render pool capacity & triggers queue flush
        Engine->>Registry: Call verify_recovery(thresholds)
        Registry->>DB: Query live post-action telemetry
        DB-->>Registry: Queue: 54 (target under 120), Latency: 1180ms (target under 2500ms), Availability: 99.9%
        Registry-->>Engine: All recovery gates PASSED
        Engine->>DB: Mark INC-1042 status -> RESOLVED
        Engine->>UI: Run COMPLETED with verification audit trail
        UI-->>Operator: Live success notification & complete postmortem ready for export
    end
```

---

### 3. Guardrail Risk Classification Matrix

```mermaid
flowchart TD
    Action[Action Recommendation] --> Classify{Risk Classifier}

    Classify -->|Read Status / Metrics / History| LowRisk[LOW RISK Policy]
    Classify -->|Capacity Scaling / Safe Restarts| MedRisk[MEDIUM RISK Policy]
    Classify -->|Data Deletion / Production Overwrite| HighRisk[HIGH RISK Policy]

    LowRisk --> AutoExec[Auto-Executable: Runs immediately with audit logging]
    
    MedRisk --> Gate{Human Approval Gate}
    Gate -->|Approved by Operator| ExecuteAction[Execute & Verify Recovery]
    Gate -->|Rejected by Operator| AbortAction[Abort Action & Record Operator Feedback]

    HighRisk --> StrictBlock[STRICT SAFETY BARRIER: Hard-blocked by policy in demo / requires dual-key authorization]
```

---

### 4. Production Google Cloud Platform Deployment Topology

```mermaid
flowchart LR
    subgraph Users["Studio Production Network"]
        Browser["Studio Operators Web Browser"]
    end

    subgraph GCP["Google Cloud Platform (GCP)"]
        LB["Cloud Load Balancing / Cloud Armor"]
        
        subgraph Compute["Serverless Application Tier"]
            CloudRun["Cloud Run (Next.js 16 Container)"]
        end

        subgraph AIInfrastructure["Vertex AI & Google Gemini"]
            GeminiAPI["Vertex AI Gemini 2.0 Flash Endpoint"]
            AgentBuilder["Vertex AI Agent Builder (Optional Orchestration)"]
        end

        subgraph StudioInfrastructure["Studio Render & Pipeline Fleet"]
            GKE["GKE (Google Kubernetes Engine) / Cloud Batch"]
            CloudStorage["Cloud Storage (Asset Buckets)"]
            CloudOps["Cloud Operations (Cloud Monitoring & Cloud Trace)"]
        end
    end

    Browser -->|HTTPS| LB
    LB --> CloudRun
    CloudRun -->|REST / gRPC| GeminiAPI
    CloudRun -->|Agent Orchestration| AgentBuilder
    CloudRun -->|Metrics / Telemetry| CloudOps
    CloudRun -->|Scale Worker Pool| GKE
```

---

## 🛠️ Tool Registry Breakdown

CineFlow AI contains 9 built-in operational tools that execute real database queries against studio assets:

| Tool Name | Parameters | Safety Level | Operational Behavior |
| :--- | :--- | :--- | :--- |
| `get_workflow_status` | `workflowKey: string` | **LOW** | Retrieves current health, active jobs, queue depth, throughput, and error rates. |
| `get_system_health` | *none* | **LOW** | Returns aggregate cluster CPU, GPU, memory, and availability percentages. |
| `get_recent_events` | `limit: number` | **LOW** | Retrieves chronological deployment logs, config changes, and studio alerts. |
| `search_incident_history`| `query: string` | **LOW** | Searches resolved incidents using keyword and semantic pattern matching. |
| `analyze_logs` | `service: string` | **LOW** | Parses service log files to calculate error spikes and failure patterns. |
| `get_metrics` | `keys?: string[]` | **LOW** | Pulls real-time numerical telemetry metrics (e.g. queue depth, latency). |
| `list_incidents` | `status?: string` | **LOW** | Lists all active, investigating, or resolved studio incidents. |
| `recommend_action` | `incidentId, type, ...`| **MEDIUM** | Formulates an action proposal with calculated confidence and risk tier. |
| `verify_recovery` | `workflowKey, thresholds`| **LOW** | Tests live telemetry against defined thresholds to verify incident recovery. |

---

## 💻 Tech Stack & Engineering Highlights

- **Next.js 16 (App Router with Turbopack)**: Hybrid server-side API execution and client-side single-page architecture.
- **Google Gemini 2.0 Flash**: High-speed, high-context AI model reasoning via direct server-side REST calls.
- **Prisma ORM & SQLite**: Deterministic local database providing instant seeding, relational integrity, and rapid resets.
- **Tailwind CSS 4**: Modern styling with rich contrast, responsive layouts, and smooth animations.
- **Zustand Store**: Lightweight client-side state machine handling polling loops, command palette state, and view hydration.
- **Lucide Icons & Sonner**: Crisp iconography and interactive toast feedback for approvals and exports.

---

## 🚀 Quick Start & Local Setup

### Prerequisites
- [Bun](https://bun.sh) (v1.1+ recommended) or [Node.js](https://nodejs.org) (v20+ / v22+)

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/your-username/cineflow-ai.git
cd "CineFlow AI"

# Install dependencies
bun install
# or: npm install
```

### 2. Configure Environment Variables (Optional)
CineFlow AI runs fully in deterministic demo mode without external API keys. To enable live Gemini reasoning, set:
```bash
cp .env.example .env
```
Inside `.env`:
```env
DATABASE_URL="file:../db/custom.db"
GEMINI_API_KEY="your-gemini-api-key-here"     # Optional: enables live Gemini reasoning
GEMINI_MODEL="gemini-2.0-flash"               # Optional: defaults to gemini-2.0-flash
```

### 3. Generate Database Client & Start Dev Server
```bash
# Generate Prisma Client
bunx prisma generate

# Launch Development Server
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🎯 The 2-Minute Judging Walkthrough

To review the primary scenario judged during the hackathon:

1. **Access the Dashboard**: Open [http://localhost:3000/#/dashboard](http://localhost:3000/#/dashboard). Note the 24 studio workflows and active incidents (especially **INC-1042: 4K VFX Render Farm Saturation**).
2. **Launch the Autonomous Agent**: Click **Run Demo Scenario** in the top navigation bar.
3. **Inspect the Reasoning Loop**:
   - Watch the agent execute `get_workflow_status`, `get_system_health`, and `analyze_logs`.
   - Review how the agent correlates the queue spike (+42%) with the recent `render-worker v2.4.1` deploy.
   - Note the root cause explanation and calculated **87% Confidence Score**.
4. **Experience the Approval Gate**:
   - The agent pauses at `AWAITING_APPROVAL` because `SCALE_RENDER_WORKERS` is classified as **MEDIUM RISK**.
   - Inspect the recommendation details and click **Approve Recommendation**.
5. **Observe Self-Verification**:
   - The action executes (scaling workers from 4 to 6).
   - The agent automatically calls `verify_recovery` and re-tests the SLA thresholds.
   - Queue drops from 187 to 54; latency drops from 4,200ms to 1,180ms.
   - Incident **INC-1042** transitions to **RESOLVED**.
6. **Export Audit & Postmortem**:
   - Navigate to **Reports** or **Incident Details** to copy or download the complete Markdown postmortem.

---

## ⌨️ Global Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `?` | Open Keyboard Shortcuts Help Modal |
| `⌘K` or `Ctrl+K` | Open Global Command Palette |
| `D` | Navigate to Operations Dashboard |
| `A` | Navigate to AI Agent Console |
| `I` | Navigate to Incidents List |
| `W` | Navigate to Workflows View |
| `H` | Navigate to System Health / Infrastructure |
| `R` | Trigger Run Demo Scenario |

---

## 🔒 Security & Privacy

- **Zero Client-Side Keys**: API keys (`GEMINI_API_KEY`) are kept strictly server-side in Next.js route handlers.
- **Fail-Safe Risk Defaults**: Any unrecognized or ambiguous action type automatically defaults to **HIGH RISK** and will never auto-execute.
- **Sanitized Exports**: Generated Markdown transcripts and CSV audit trails sanitize runtime tokens and internal credentials.
- **Contained Demo Environment**: Demo actions mutate only the isolated local SQLite store and are clearly labeled in the interface.

---

<p align="center">
  <strong>CineFlow AI</strong> · Agentic Cinema: The Blockbuster Hackathon
</p>
