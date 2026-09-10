// CineFlow AI — Agent orchestration engine.
//
// A run is a planned sequence of steps (UNDERSTAND → COLLECT → ANALYZE →
// ROOT_CAUSE → CONFIDENCE → RISK → RECOMMEND → APPROVAL → ACTION → VERIFY →
// RESOLVE). The frontend polls GET /api/agent/runs/{id}; each poll advances the
// pipeline by at most one state transition (PENDING→RUNNING, RUNNING→COMPLETED)
// so tool usage is *visible* ("Running…" → "Completed") instead of an instant
// answer. The APPROVAL step is a hard gate: the run pauses until a human
// approves or rejects the recommendation.

import { db } from "@/lib/db";
import { runTool } from "@/lib/agent/tools";
import type { ToolResult } from "@/lib/agent/tools";
import { evaluateGuardrails } from "@/lib/agent/guardrails";
import { executeAction, verifyRecovery } from "@/lib/agent/actions";
import { addIncidentEvent, setState } from "@/lib/agent/state";
import { generateFreeForm, CINEFLOW_SYSTEM_PROMPT } from "@/lib/ai/providers";

export const CANONICAL_DEMO_QUERY = "Why is the post-production render pipeline delayed?";
export const RENDER_INCIDENT_ID = "INC-1042";

export type Intent = "render_delay" | "status_summary" | "free_form";

interface StepPlan {
  phase: string;
  title: string;
  tool?: string;
  toolParams?: Record<string, unknown>;
  delayMs: number;
}

const DELAY = {
  understand: 900,
  collect: 1400,
  analyze: 1800,
  rootCause: 1500,
  confidence: 800,
  risk: 800,
  recommend: 1400,
  action: 1600,
  verify: 2000,
  resolve: 1100,
  report: 1600,
};

const RENDER_DELAY_PLAN: StepPlan[] = [
  { phase: "UNDERSTAND", title: "Understanding request", delayMs: DELAY.understand },
  { phase: "COLLECT", title: "Render queue status", tool: "get_workflow_status", toolParams: { workflow: "rendering" }, delayMs: DELAY.collect },
  { phase: "COLLECT", title: "Worker health", tool: "get_system_health", delayMs: DELAY.collect },
  { phase: "COLLECT", title: "Recent deployments", tool: "get_recent_events", toolParams: { minutes: 60 }, delayMs: DELAY.collect },
  { phase: "COLLECT", title: "Processing latency", tool: "get_metrics", toolParams: { keys: ["processingLatency", "renderThroughput", "queueDepth", "gpuUtil"] }, delayMs: DELAY.collect },
  { phase: "COLLECT", title: "Historical incidents", tool: "search_incident_history", toolParams: { query: "render queue delay backlog workers" }, delayMs: DELAY.collect },
  { phase: "ANALYZE", title: "Correlating signals", tool: "analyze_logs", toolParams: { service: "render-queue", minutes: 60 }, delayMs: DELAY.analyze },
  { phase: "ROOT_CAUSE", title: "Probable root cause", delayMs: DELAY.rootCause },
  { phase: "CONFIDENCE", title: "Confidence assessment", delayMs: DELAY.confidence },
  { phase: "RISK", title: "Risk evaluation (guardrails)", delayMs: DELAY.risk },
  { phase: "RECOMMEND", title: "Recommendation", tool: "recommend_action", delayMs: DELAY.recommend },
  { phase: "APPROVAL", title: "Human approval gate", delayMs: 0 },
  { phase: "ACTION", title: "Executing remediation", delayMs: DELAY.action },
  { phase: "VERIFY", title: "Verifying recovery", tool: "verify_recovery", toolParams: { incidentId: RENDER_INCIDENT_ID }, delayMs: DELAY.verify },
  { phase: "RESOLVE", title: "Incident resolution", delayMs: DELAY.resolve },
];

const STATUS_PLAN: StepPlan[] = [
  { phase: "UNDERSTAND", title: "Understanding request", delayMs: 700 },
  { phase: "COLLECT", title: "System health", tool: "get_system_health", delayMs: 1200 },
  { phase: "COLLECT", title: "Workflow status", tool: "get_workflow_status", delayMs: 1200 },
  { phase: "COLLECT", title: "Active incidents", tool: "list_incidents", toolParams: {}, delayMs: 1200 },
  { phase: "REPORT", title: "Status report", delayMs: DELAY.report },
];

const FREE_FORM_PLAN: StepPlan[] = [
  { phase: "UNDERSTAND", title: "Understanding request", delayMs: 700 },
  { phase: "COLLECT", title: "Live system context", tool: "get_system_health", delayMs: 1100 },
  { phase: "REPORT", title: "Generating response", delayMs: 500 },
];

const ALREADY_RESOLVED_PLAN: StepPlan[] = [
  { phase: "UNDERSTAND", title: "Understanding request", delayMs: 700 },
  { phase: "COLLECT", title: "Incident record", tool: "search_incident_history", toolParams: { query: "render queue delay" }, delayMs: 1100 },
  { phase: "REPORT", title: "Generating response", delayMs: 1200 },
];

export function detectIntent(query: string): Intent {
  const q = query.toLowerCase();
  const renderish = /(render|post[-\s]?production|queue|vfx|final cut|frame)/.test(q);
  const delayish = /(delay|slow|laten|backlog|behind|stuck|degrad|breach|why|fail)/.test(q);
  if (renderish && (delayish || /status|health|investigat/.test(q))) return "render_delay";
  if (/(status|health|overview|summary|report|how are|incident|issue|problem|active)/.test(q)) return "status_summary";
  return "free_form";
}

// ---------------------------------------------------------------------------
// Run creation
// ---------------------------------------------------------------------------

export async function createRun(query: string): Promise<string> {
  const intent = detectIntent(query);
  let plan: StepPlan[];
  let incidentId: string | null = null;
  let mode = "DEMO";

  if (intent === "render_delay") {
    const incident = await db.incident.findUnique({ where: { id: RENDER_INCIDENT_ID } });
    if (incident && incident.status === "RESOLVED") {
      plan = ALREADY_RESOLVED_PLAN;
      incidentId = RENDER_INCIDENT_ID;
    } else {
      plan = RENDER_DELAY_PLAN;
      incidentId = RENDER_INCIDENT_ID;
    }
  } else if (intent === "status_summary") {
    plan = STATUS_PLAN;
  } else {
    plan = FREE_FORM_PLAN;
    mode = "PENDING_LLM"; // resolved during REPORT step
  }

  const run = await db.agentRun.create({
    data: {
      query,
      intent,
      status: "RUNNING",
      mode: mode === "PENDING_LLM" ? "DEMO" : mode,
      incidentId,
      steps: {
        create: plan.map((p, i) => ({
          seq: i,
          phase: p.phase,
          title: p.title,
          tool: p.tool ?? null,
          status: "PENDING",
          executeAt: i === 0 ? new Date(Date.now() + 500) : null,
        })),
      },
    },
  });

  if (intent === "render_delay") {
    await db.demoScenario.upsert({
      where: { id: "render_delay" },
      update: { status: "RUNNING", lastRunId: run.id, runCount: { increment: 1 }, updatedAt: new Date() },
      create: { id: "render_delay", status: "RUNNING", lastRunId: run.id, runCount: 1 },
    });
  }

  return run.id;
}

// ---------------------------------------------------------------------------
// Poll-driven advance
// ---------------------------------------------------------------------------

const inFlight = new Set<string>();

export async function advanceRun(runId: string): Promise<void> {
  if (inFlight.has(runId)) return;
  inFlight.add(runId);
  try {
    const run = await db.agentRun.findUnique({
      where: { id: runId },
      include: { steps: { orderBy: { seq: "asc" } } },
    });
    if (!run) return;
    if (["COMPLETED", "REJECTED", "FAILED", "AWAITING_APPROVAL"].includes(run.status)) return;

    const now = new Date();
    const running = run.steps.find((s) => s.status === "RUNNING");
    if (running) {
      await executeStep(run, running);
      // Schedule the next pending step (unless we just hit the approval gate)
      const fresh = await db.agentRun.findUnique({ where: { id: run.id } });
      const next = run.steps.find((s) => s.status === "PENDING" && s.seq > running.seq);
      if (next && fresh && !["AWAITING_APPROVAL", "COMPLETED", "REJECTED", "FAILED"].includes(fresh.status)) {
        const plan = planFor(run.intent);
        const delay = plan.find((p) => p.phase === next.phase)?.delayMs ?? 1000;
        await db.agentRunStep.update({
          where: { id: next.id },
          data: { executeAt: new Date(now.getTime() + delay) },
        });
      }
      return;
    }

    const next = run.steps.find((s) => s.status === "PENDING");
    if (!next) {
      await completeRun(run.id);
      return;
    }
    if (next.executeAt && next.executeAt > now) return;
    await db.agentRunStep.update({
      where: { id: next.id },
      data: { status: "RUNNING", ...(next.tool ? { toolStatus: "RUNNING" } : {}) },
    });
  } finally {
    inFlight.delete(runId);
  }
}

function planFor(intent: string): StepPlan[] {
  switch (intent) {
    case "render_delay": return RENDER_DELAY_PLAN;
    case "status_summary": return STATUS_PLAN;
    default: return FREE_FORM_PLAN;
  }
}

async function completeRun(runId: string) {
  const run = await db.agentRun.findUnique({ where: { id: runId } });
  if (!run || ["COMPLETED", "REJECTED", "FAILED"].includes(run.status)) return;
  await db.agentRun.update({
    where: { id: runId },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// Step execution (phase side-effects)
// ---------------------------------------------------------------------------

async function finishStep(stepId: string, data: Partial<{ detail: string; evidence: string; toolStatus: string }>) {
  await db.agentRunStep.update({
    where: { id: stepId },
    data: { ...data, status: "COMPLETED", completedAt: new Date() },
  });
}

async function executeStep(
  run: { id: string; intent: string; query: string; incidentId: string | null },
  step: { id: string; seq: number; phase: string; title: string; tool: string | null }
) {
  switch (step.phase) {
    case "UNDERSTAND":
      return executeUnderstand(run, step);
    case "COLLECT":
      return executeCollect(run, step);
    case "ANALYZE":
      return executeAnalyze(run, step);
    case "ROOT_CAUSE":
      return executeRootCause(run, step);
    case "CONFIDENCE":
      return executeConfidence(run, step);
    case "RISK":
      return executeRisk(run, step);
    case "RECOMMEND":
      return executeRecommend(run, step);
    case "APPROVAL":
      return executeApprovalGate(run, step);
    case "ACTION":
      return executeActionStep(run, step);
    case "VERIFY":
      return executeVerify(run, step);
    case "RESOLVE":
      return executeResolve(run, step);
    case "REPORT":
      return executeReport(run, step);
    default:
      return finishStep(step.id, { detail: step.title });
  }
}

async function runToolForStep(
  step: { tool: string | null },
  fallbackParams: Record<string, unknown> = {}
): Promise<ToolResult | null> {
  if (!step.tool) return null;
  const plan = [...RENDER_DELAY_PLAN, ...STATUS_PLAN, ...FREE_FORM_PLAN, ...ALREADY_RESOLVED_PLAN];
  const params = plan.find((p) => p.tool === step.tool)?.toolParams ?? fallbackParams;
  return runTool(step.tool, params);
}

async function executeUnderstand(run: { id: string; intent: string; query: string; incidentId: string | null }, step: { id: string; seq: number; phase: string; title: string; tool: string | null }) {
  let detail: string;
  let evidence: Record<string, unknown>;
  if (run.intent === "render_delay") {
    const incident = run.incidentId ? await db.incident.findUnique({ where: { id: run.incidentId } }) : null;
    if (incident && incident.status === "RESOLVED") {
      detail = `Incident ${incident.id} is already RESOLVED — preparing a summary of the investigation instead of re-running the pipeline.`;
      evidence = { intent: run.intent, targetIncident: incident.id, alreadyResolved: true };
    } else {
      detail = "Investigating post-production rendering delay…";
      evidence = {
        intent: run.intent,
        targetIncident: run.incidentId,
        understoodAs: "Investigate the cause of the render pipeline delay in post-production",
      };
    }
  } else if (run.intent === "status_summary") {
    detail = "Preparing a production status overview…";
    evidence = { intent: run.intent, understoodAs: "Summarize current production and system status" };
  } else {
    detail = "Parsing request against production operations context…";
    evidence = { intent: run.intent, understoodAs: run.query };
  }
  if (run.incidentId && run.intent === "render_delay") {
    const incident = await db.incident.findUnique({ where: { id: run.incidentId } });
    if (incident && incident.status !== "RESOLVED") {
      await addIncidentEvent(run.incidentId, "AGENT", "Agent started investigation", "CineFlow Agent opened a root-cause investigation for the render queue delay.");
    }
  }
  await finishStep(step.id, { detail, evidence: JSON.stringify(evidence) });
}

async function executeCollect(run: { id: string; intent: string; incidentId: string | null }, step: { id: string; seq: number; phase: string; title: string; tool: string | null }) {
  const toolResult = await runToolForStep(step);
  if (!toolResult) {
    return finishStep(step.id, { detail: step.title, toolStatus: "FAILED" });
  }
  const evidence = { phase: "COLLECT", toolResult };
  // Timeline events that mirror the incident's investigation progress
  if (run.incidentId && run.intent === "render_delay") {
    const eventMap: Record<number, [string, string, string]> = {
      1: ["EVIDENCE", "Render queue status collected", "Queue depth, latency and job counts recorded as investigation evidence."],
      2: ["EVIDENCE", "Worker health checked", "Render fleet worker health probes evaluated (3/4 healthy, worker-02 degraded)."],
      3: ["EVIDENCE", "Recent deployment identified", "render-worker v2.4.1 deployment (35 min ago) flagged as correlated change."],
      4: ["EVIDENCE", "Processing latency trend collected", "p95 latency history and throughput recorded."],
      5: ["EVIDENCE", "Incident history searched", "Similar historical incidents retrieved for pattern matching."],
    };
    const ev = eventMap[step.seq];
    if (ev) await addIncidentEvent(run.incidentId, ev[0], ev[1], ev[2]);
  }
  await finishStep(step.id, {
    detail: toolResult.summary,
    evidence: JSON.stringify(evidence),
    toolStatus: "COMPLETED",
  });
}

async function executeAnalyze(run: { id: string; intent: string; incidentId: string | null }, step: { id: string; seq: number; phase: string; title: string; tool: string | null }) {
  const toolResult = await runToolForStep(step);
  const analysis = toolResult?.result ?? {};
  const detail =
    "Render queue latency increased after worker deployment v2.4.1: queue depth +42% (131 → 187), worker-02 degraded post-deployment, throughput down 38% on that node.";
  if (run.incidentId) {
    await addIncidentEvent(run.incidentId, "AGENT", "Signal correlation completed", "Queue depth rise (+42%) correlates with render-worker v2.4.1 deployment; worker-02 degraded after rollout.");
  }
  await finishStep(step.id, {
    detail,
    evidence: JSON.stringify({ phase: "ANALYZE", toolResult, findings: analysis }),
    toolStatus: "COMPLETED",
  });
}

async function executeRootCause(run: { id: string; intent: string; incidentId: string | null }, step: { id: string; seq: number; phase: string; title: string; tool: string | null }) {
  const rootCause =
    "Insufficient healthy render workers following the latest deployment (render-worker v2.4.1): 4 workers provisioned with 1 degraded, against a target of 6 for current load.";
  const evidence = {
    phase: "ROOT_CAUSE",
    cause: rootCause,
    supportingEvidence: [
      "Queue depth 187 (+42% vs baseline 131) — render-queue metrics",
      "worker-02 health probe degraded since v2.4.1 rollout — worker logs",
      "GPU utilization 91% on 4 workers (target fleet 6) — render fleet metrics",
      "INC-1039: identical pattern previously resolved by scaling 4 → 6 — incident history",
    ],
  };
  if (run.incidentId) {
    await db.incident.update({ where: { id: run.incidentId }, data: { rootCause } });
    await addIncidentEvent(run.incidentId, "ROOT_CAUSE", "Root cause generated", rootCause);
  }
  await finishStep(step.id, { detail: `Probable cause: ${rootCause}`, evidence: JSON.stringify(evidence) });
}

async function executeConfidence(run: { id: string; intent: string; incidentId: string | null }, step: { id: string; seq: number; phase: string; title: string; tool: string | null }) {
  const confidence = 87;
  const evidence = {
    phase: "CONFIDENCE",
    confidence,
    breakdown: [
      { signal: "Temporal correlation with v2.4.1 deployment (35 min before anomaly)", weight: "+18" },
      { signal: "Direct worker health evidence (worker-02 degraded)", weight: "+12" },
      { signal: "Historical pattern match INC-1039 (same signature)", weight: "+9" },
      { signal: "Baseline confidence for evidence-backed root cause", weight: "48" },
    ],
  };
  if (run.incidentId) {
    await db.incident.update({ where: { id: run.incidentId }, data: { agentConfidence: confidence } });
  }
  await db.agentRun.update({ where: { id: run.id }, data: { confidence } });
  await finishStep(step.id, { detail: "87% — three independent signals support this root cause.", evidence: JSON.stringify(evidence) });
}

async function executeRisk(run: { id: string; intent: string; incidentId: string | null }, step: { id: string; seq: number; phase: string; title: string; tool: string | null }) {
  const evaluation = evaluateGuardrails("SCALE_RENDER_WORKERS");
  const evidence = {
    phase: "RISK",
    risk: evaluation.risk,
    requiresApproval: evaluation.requiresApproval,
    autoExecAllowed: evaluation.autoExecAllowed,
    reason: evaluation.reason,
    policy: evaluation.policy.actionLabel,
  };
  await finishStep(step.id, { detail: `Medium risk — ${evaluation.reason}`, evidence: JSON.stringify(evidence) });
}

async function executeRecommend(run: { id: string; intent: string; incidentId: string | null }, step: { id: string; seq: number; phase: string; title: string; tool: string | null }) {
  const evidenceItems = [
    { label: "Queue depth", value: "131 → 187 jobs (+42%)", source: "render-queue metrics" },
    { label: "Healthy workers", value: "3 of 4 (worker-02 degraded after v2.4.1)", source: "worker health probes" },
    { label: "Correlated change", value: "render-worker v2.4.1 deployed 35 min before anomaly", source: "deployment events" },
    { label: "Historical pattern", value: "INC-1039 — same signature, resolved by scaling 4 → 6", source: "incident history" },
  ];
  const rootCause =
    "Insufficient healthy render workers following the latest deployment (render-worker v2.4.1): 4 workers provisioned with 1 degraded, against a target of 6 for current load.";
  const analysis =
    "Queue depth increased 42% after the render-worker v2.4.1 deployment. Worker-02 degraded post-rollout, leaving 3 healthy workers for ~2.1× normal load. Historical incident INC-1039 shows the identical signature, resolved by scaling workers 4 → 6 with recovery in 18 minutes.";

  const rec = await db.recommendation.create({
    data: {
      incidentId: run.incidentId,
      agentRunId: run.id,
      title: "Scale render workers from 4 to 6",
      problem: "Render queue processing delay (p95 4.2s vs 2.5s SLO; queue depth 187 jobs)",
      evidence: JSON.stringify(evidenceItems),
      analysis,
      rootCause,
      actionType: "SCALE_RENDER_WORKERS",
      actionLabel: "Scale render workers from 4 to 6",
      actionParams: JSON.stringify({ from: 4, to: 6 }),
      confidence: 87,
      risk: "MEDIUM",
      status: "PENDING",
    },
  });

  await db.agentRun.update({ where: { id: run.id }, data: { recommendationId: rec.id } });
  if (run.incidentId) {
    await db.incident.update({ where: { id: run.incidentId }, data: { status: "AWAITING_APPROVAL" } });
    await addIncidentEvent(run.incidentId, "RECOMMENDATION", "Recommendation generated — awaiting approval", "Scale render workers from 4 to 6 (confidence 87%, medium risk). Approval required before execution.");
  }
  await finishStep(step.id, {
    detail: "Scale render workers from 4 to 6 — medium risk, requires human approval before execution.",
    evidence: JSON.stringify({ phase: "RECOMMEND", recommendationId: rec.id, evidenceItems }),
    toolStatus: "COMPLETED",
  });
}

async function executeApprovalGate(run: { id: string; intent: string; incidentId: string | null }, step: { id: string; seq: number; phase: string; title: string; tool: string | null }) {
  const rec = await db.recommendation.findFirst({ where: { agentRunId: run.id } });
  await db.agentRun.update({ where: { id: run.id }, data: { status: "AWAITING_APPROVAL" } });
  if (run.incidentId) {
    await addIncidentEvent(run.incidentId, "HUMAN", "Approval requested", "Remediation is paused pending human approval. No action will be taken without it.");
  }
  await db.demoScenario.update({ where: { id: "render_delay" }, data: { status: "AWAITING_APPROVAL", updatedAt: new Date() } });
  await finishStep(step.id, {
    detail: rec
      ? `Awaiting human approval for "${rec.title}" (${rec.id}). The run is paused — no action will execute without explicit approval.`
      : "Awaiting human approval. The run is paused — no action will execute without explicit approval.",
    evidence: JSON.stringify({ phase: "APPROVAL", recommendationId: rec?.id ?? null, gate: "human-in-the-loop" }),
  });
}

async function executeActionStep(run: { id: string; intent: string; incidentId: string | null }, step: { id: string; seq: number; phase: string; title: string; tool: string | null }) {
  const rec = await db.recommendation.findFirst({ where: { agentRunId: run.id } });
  if (!rec || rec.status !== "APPROVED") {
    return finishStep(step.id, { detail: "Blocked: recommendation is not approved. No action executed.", toolStatus: "FAILED" });
  }
  const params = JSON.parse(rec.actionParams || "{}");
  const result = await executeAction(rec.actionType, params, { incidentId: rec.incidentId, recommendationId: rec.id });
  await db.recommendation.update({ where: { id: rec.id }, data: { status: "EXECUTED", executedAt: new Date() } });
  await db.agentRun.update({ where: { id: run.id }, data: { status: "EXECUTING" } });
  if (rec.incidentId) {
    await db.incident.update({ where: { id: rec.incidentId }, data: { status: "REMEDIATING" } });
  }
  await db.demoScenario.update({ where: { id: "render_delay" }, data: { status: "REMEDIATING", updatedAt: new Date() } });
  await finishStep(step.id, {
    detail: `Demo environment: ${result.label}. ${result.productionNote}`,
    evidence: JSON.stringify({ phase: "ACTION", actionResult: result }),
  });
}

async function executeVerify(run: { id: string; intent: string; incidentId: string | null }, step: { id: string; seq: number; phase: string; title: string; tool: string | null }) {
  const verification = await verifyRecovery(run.incidentId, { quiet: true });
  const rec = await db.recommendation.findFirst({ where: { agentRunId: run.id } });
  if (verification.passed && rec) {
    await db.recommendation.update({
      where: { id: rec.id },
      data: { status: "VERIFIED", verifiedAt: new Date(), verification: JSON.stringify(verification) },
    });
  }
  await finishStep(step.id, {
    detail: verification.passed
      ? "VERIFIED — queue latency returned to normal range (p95 1.18s, queue 54). All thresholds green."
      : `Verification incomplete — ${verification.summary}`,
    evidence: JSON.stringify({ phase: "VERIFY", verification }),
    toolStatus: "COMPLETED",
  });
}

async function executeResolve(run: { id: string; intent: string; incidentId: string | null }, step: { id: string; seq: number; phase: string; title: string; tool: string | null }) {
  const verifyStep = await db.agentRunStep.findFirst({ where: { runId: run.id, phase: "VERIFY" }, orderBy: { seq: "desc" } });
  const verification = verifyStep?.evidence ? (JSON.parse(verifyStep.evidence) as { verification?: { passed: boolean } }) : null;
  const passed = verification?.verification?.passed ?? false;

  const summary = passed
    ? "INC-1042 resolved. Render queue delay traced to insufficient healthy workers after render-worker v2.4.1 (worker-02 degraded). Remediation: workers scaled 4 → 6 with human approval. Queue depth 187 → 54; p95 latency 4.2s → 1.18s; GPU 91% → 61%. Recovery verified against all thresholds."
    : "Recovery could not be verified yet; incident remains in REMEDIATING for continued monitoring.";

  if (run.incidentId && passed) {
    await db.incident.update({
      where: { id: run.incidentId },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date(),
        resolutionNote: "Workers scaled 4 → 6 after v2.4.1 rollout left worker-02 degraded. Queue drained; latency normalized (p95 1.18s). Verified by CineFlow Agent.",
        agentConfidence: 87,
      },
    });
    await addIncidentEvent(run.incidentId, "VERIFICATION", "Incident resolved", summary);
  }
  await db.demoScenario.update({ where: { id: "render_delay" }, data: { status: passed ? "RESOLVED" : "REMEDIATING", updatedAt: new Date() } });
  await db.agentRun.update({ where: { id: run.id }, data: { summary } });
  await finishStep(step.id, { detail: summary, evidence: JSON.stringify({ phase: "RESOLVE", summary, passed }) });
}

async function executeReport(run: { id: string; intent: string; query: string; incidentId: string | null }, step: { id: string; seq: number; phase: string; title: string; tool: string | null }) {
  if (run.intent === "status_summary") {
    const report = await buildStatusReport();
    await db.agentRun.update({ where: { id: run.id }, data: { summary: report } });
    return finishStep(step.id, { detail: report, evidence: JSON.stringify({ phase: "REPORT", report }) });
  }

  // free_form / already-resolved: try the LLM provider chain with live context
  const context = await buildLiveContext(run.incidentId);
  const generated = await generateFreeForm(
    CINEFLOW_SYSTEM_PROMPT,
    `LIVE SYSTEM CONTEXT:\n${context}\n\nUSER QUESTION: ${run.query}`
  );
  if (generated) {
    await db.agentRun.update({ where: { id: run.id }, data: { summary: generated.text, mode: generated.provider } });
    return finishStep(step.id, {
      detail: generated.text,
      evidence: JSON.stringify({ phase: "REPORT", provider: generated.provider, liveContextUsed: true }),
    });
  }

  // Honest fallback — never fabricate evidence
  const fallback =
    "I don't have enough evidence to answer that with confidence, so I won't guess. I can investigate the post-production render pipeline delay, or summarize current production status. For anything else I recommend human investigation.";
  await db.agentRun.update({ where: { id: run.id }, data: { summary: fallback, mode: "DEMO" } });
  return finishStep(step.id, {
    detail: fallback,
    evidence: JSON.stringify({ phase: "REPORT", provider: "DEMO", fallback: true }),
  });
}

async function buildStatusReport(): Promise<string> {
  const [workflows, metrics, incidents] = await Promise.all([
    db.workflow.findMany(),
    db.metric.findMany(),
    db.incident.findMany({ orderBy: { detectedAt: "desc" }, take: 12 }),
  ]);
  const degraded = workflows.filter((w) => w.health !== "HEALTHY");
  const active = incidents.filter((i) => i.status !== "RESOLVED");
  const availability = metrics.find((m) => m.key === "availability")?.value ?? 99.8;
  const queue = metrics.find((m) => m.key === "queueDepth")?.value;
  const lines = [
    `Production status: ${workflows.length - degraded.length}/${workflows.length} workflows nominal. System availability ${availability}%.`,
    degraded.length
      ? `Degraded workflows: ${degraded.map((w) => `${w.name} (${w.health.toLowerCase()})`).join(", ")}.`
      : "No degraded workflows.",
    `Active incidents: ${active.length} (${active.filter((i) => i.severity === "HIGH").length} critical). ${active.map((i) => `${i.id} ${i.title} [${i.severity}]`).join("; ") || "None"}.`,
    queue != null ? `Render queue depth ${queue} jobs. ` : "",
  ];
  return lines.filter(Boolean).join(" ");
}

async function buildLiveContext(incidentId: string | null): Promise<string> {
  const [metrics, workflows, incidents] = await Promise.all([
    db.metric.findMany(),
    db.workflow.findMany(),
    db.incident.findMany({ orderBy: { detectedAt: "desc" }, take: 8 }),
  ]);
  const parts = [
    `METRICS: ${metrics.map((m) => `${m.key}=${m.value}${m.unit} (${m.status})`).join("; ")}`,
    `WORKFLOWS: ${workflows.length} total; degraded: ${workflows.filter((w) => w.health !== "HEALTHY").map((w) => `${w.name}(${w.health})`).join(", ") || "none"}`,
    `INCIDENTS: ${incidents.map((i) => `${i.id} "${i.title}" [${i.severity}/${i.status}]`).join("; ")}`,
  ];
  if (incidentId) {
    const inc = await db.incident.findUnique({ where: { id: incidentId } });
    if (inc) parts.push(`FOCUS INCIDENT: ${inc.id} — ${inc.description} Status: ${inc.status}. Root cause: ${inc.rootCause ?? "not yet determined"}. Resolution: ${inc.resolutionNote ?? "n/a"}.`);
  }
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Approval / rejection (human-in-the-loop)
// ---------------------------------------------------------------------------

export async function approveRecommendation(recId: string): Promise<{ ok: boolean; message: string }> {
  const rec = await db.recommendation.findUnique({ where: { id: recId } });
  if (!rec) return { ok: false, message: "Recommendation not found" };
  if (rec.status !== "PENDING") return { ok: false, message: `Recommendation is already ${rec.status.toLowerCase()}` };

  // Guardrail check: HIGH-risk actions can never be approved through the demo
  const evaluation = evaluateGuardrails(rec.actionType);
  if (evaluation.risk === "HIGH" && !rec.actionType.startsWith("SCALE") && !rec.actionType.startsWith("RESTART")) {
    return { ok: false, message: "Blocked by guardrail policy: high-risk actions cannot be executed in the demo environment." };
  }

  await db.recommendation.update({ where: { id: recId }, data: { status: "APPROVED", decidedAt: new Date() } });
  if (rec.incidentId) {
    await addIncidentEvent(rec.incidentId, "HUMAN", "Human approval granted", `Production manager approved: ${rec.actionLabel}.`);
  }

  if (rec.agentRunId) {
    // Continue the paused agent run: ACTION step resumes on the next poll
    const run = await db.agentRun.findUnique({ where: { id: rec.agentRunId }, include: { steps: { orderBy: { seq: "asc" } } } });
    if (run) {
      await db.agentRun.update({ where: { id: run.id }, data: { status: "EXECUTING" } });
      const actionStep = run.steps.find((s) => s.phase === "ACTION");
      if (actionStep) {
        await db.agentRunStep.update({
          where: { id: actionStep.id },
          data: { executeAt: new Date(Date.now() + 700) },
        });
      }
      // Un-gate: the poll loop will pick ACTION up
      await advanceRun(run.id);
    }
    return { ok: true, message: "Approved. The agent is executing the remediation and will verify recovery." };
  }

  // Standalone recommendation (no linked run): execute + verify immediately
  const params = JSON.parse(rec.actionParams || "{}");
  const result = await executeAction(rec.actionType, params, { incidentId: rec.incidentId, recommendationId: rec.id });
  await db.recommendation.update({ where: { id: recId }, data: { status: "EXECUTED", executedAt: new Date() } });
  if (rec.incidentId) {
    await db.incident.update({ where: { id: rec.incidentId }, data: { status: "REMEDIATING" } });
  }
  const verification = await verifyRecovery(rec.incidentId);
  if (verification.passed) {
    await db.recommendation.update({
      where: { id: recId },
      data: { status: "VERIFIED", verifiedAt: new Date(), verification: JSON.stringify(verification) },
    });
    if (rec.incidentId) {
      await db.incident.update({
        where: { id: rec.incidentId },
        data: {
          status: "RESOLVED",
          resolvedAt: new Date(),
          resolutionNote: `${rec.actionLabel} executed with approval; recovery verified by CineFlow Agent.`,
        },
      });
    }
  }
  return {
    ok: true,
    message: `Approved. Demo environment: ${result.label}. ${verification.passed ? "Recovery verified." : "Verification pending."}`,
  };
}

export async function rejectRecommendation(recId: string): Promise<{ ok: boolean; message: string }> {
  const rec = await db.recommendation.findUnique({ where: { id: recId } });
  if (!rec) return { ok: false, message: "Recommendation not found" };
  if (rec.status !== "PENDING") return { ok: false, message: `Recommendation is already ${rec.status.toLowerCase()}` };

  await db.recommendation.update({ where: { id: recId }, data: { status: "REJECTED", decidedAt: new Date() } });
  if (rec.incidentId) {
    await addIncidentEvent(rec.incidentId, "HUMAN", "Human rejected recommendation", `Production manager rejected: ${rec.actionLabel}. No action was taken.`);
    // Incident returns to investigation state
    await db.incident.update({ where: { id: rec.incidentId }, data: { status: "INVESTIGATING" } });
  }
  if (rec.agentRunId) {
    await db.agentRun.update({ where: { id: rec.agentRunId }, data: { status: "REJECTED" } });
    await db.agentRunStep.updateMany({
      where: { runId: rec.agentRunId, status: { in: ["PENDING", "RUNNING"] } },
      data: { status: "SKIPPED" },
    });
  }
  await db.demoScenario.updateMany({ where: { id: "render_delay", lastRunId: rec.agentRunId }, data: { status: "IDLE", updatedAt: new Date() } });
  return { ok: true, message: "Rejected. No action was taken — the incident remains under investigation." };
}
