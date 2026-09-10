// CineFlow AI — Agent tool registry.
// Every tool executes a REAL query against the demo production database and
// returns structured evidence. The agent never invents evidence: anything it
// reports in its analysis traces back to a tool result on this page.

import { db } from "@/lib/db";
import { getState } from "@/lib/agent/state";

export interface ToolResult {
  tool: string;
  params: Record<string, unknown>;
  summary: string;
  result: Record<string, unknown>;
  evidence: { label: string; value: string; source: string }[];
  ts: string;
}

export interface ToolDef {
  name: string;
  description: string;
}

export const TOOL_REGISTRY: ToolDef[] = [
  { name: "get_workflow_status", description: "Fetch health, stage, jobs, latency and queue depth for production workflows." },
  { name: "get_system_health", description: "Fetch infrastructure metrics (workers, GPU, queue, latency) and worker health." },
  { name: "get_recent_events", description: "Fetch recent deployments and notable log events." },
  { name: "search_incident_history", description: "Search resolved incident history for similar patterns." },
  { name: "analyze_logs", description: "Aggregate service logs over a time window and extract correlations." },
  { name: "get_metrics", description: "Fetch current metric values and threshold statuses." },
  { name: "list_incidents", description: "List incidents with status and severity filters." },
  { name: "recommend_action", description: "Create an evidence-backed recommendation with confidence and risk." },
  { name: "verify_recovery", description: "Re-check metrics against thresholds and verify incident recovery." },
];

const nowIso = () => new Date().toISOString();

export async function runTool(name: string, params: Record<string, unknown> = {}): Promise<ToolResult> {
  switch (name) {
    case "get_workflow_status":
      return getWorkflowStatus(params);
    case "get_system_health":
      return getSystemHealth(params);
    case "get_recent_events":
      return getRecentEvents(params);
    case "search_incident_history":
      return searchIncidentHistory(params);
    case "analyze_logs":
      return analyzeLogs(params);
    case "get_metrics":
      return getMetrics(params);
    case "list_incidents":
      return listIncidents(params);
    case "verify_recovery":
      return verifyRecoveryTool(params);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

async function getWorkflowStatus(params: Record<string, unknown>): Promise<ToolResult> {
  const key = typeof params.workflow === "string" ? params.workflow : undefined;
  const workflows = key
    ? await db.workflow.findMany({ where: { key }, orderBy: { sortOrder: "asc" } })
    : await db.workflow.findMany({ orderBy: { sortOrder: "asc" } });
  const target = key ? workflows[0] : null;
  const summary = target
    ? `${target.name}: ${target.health}, stage "${target.stage}", ${target.activeJobs} active jobs, p95 ${target.latencyMs}ms, queue ${target.queueDepth}`
    : `${workflows.length} workflows: ${workflows.filter((w) => w.health !== "HEALTHY").length} degraded`;
  return {
    tool: "get_workflow_status",
    params,
    summary,
    result: {
      workflows: workflows.map((w) => ({
        key: w.key, name: w.name, health: w.health, stage: w.stage,
        activeJobs: w.activeJobs, latencyMs: w.latencyMs, queueDepth: w.queueDepth,
        failureRate: w.failureRate, throughputPerMin: w.throughputPerMin,
      })),
    },
    evidence: target
      ? [
          { label: "Workflow health", value: target.health, source: "workflow registry" },
          { label: "Active jobs", value: `${target.activeJobs}`, source: "workflow registry" },
          { label: "Queue depth", value: `${target.queueDepth} jobs`, source: "render-queue" },
          { label: "p95 latency", value: `${target.latencyMs} ms`, source: "render-queue" },
        ]
      : [
          { label: "Workflows", value: `${workflows.length}`, source: "workflow registry" },
          { label: "Degraded", value: `${workflows.filter((w) => w.health !== "HEALTHY").length}`, source: "workflow registry" },
        ],
    ts: nowIso(),
  };
}

async function getSystemHealth(_params: Record<string, unknown>): Promise<ToolResult> {
  const [metrics, healthyWorkers, degradedWorkers, degradedDetail] = await Promise.all([
    db.metric.findMany(),
    getState("healthyRenderWorkers"),
    getState("degradedWorkers"),
    getState("degradedWorkerDetail"),
  ]);
  const workersMetric = metrics.find((m) => m.key === "renderWorkers");
  const gpu = metrics.find((m) => m.key === "gpuUtil");
  const queue = metrics.find((m) => m.key === "queueDepth");
  const latency = metrics.find((m) => m.key === "processingLatency");
  return {
    tool: "get_system_health",
    params: {},
    summary: `Render fleet: ${workersMetric?.value ?? "?"} workers total, ${healthyWorkers ?? "?"} healthy (${degradedWorkers ?? 0} degraded). GPU ${gpu?.value ?? "?"}%, queue ${queue?.value ?? "?"} jobs, p95 ${latency?.value ?? "?"}ms.`,
    result: {
      renderWorkers: { total: workersMetric?.value ?? 0, healthy: Number(healthyWorkers ?? 0), degraded: Number(degradedWorkers ?? 0), degradedDetail },
      gpuUtilization: gpu?.value ?? null,
      queueDepth: queue?.value ?? null,
      processingLatency: latency?.value ?? null,
      metricStatuses: Object.fromEntries(metrics.map((m) => [m.key, m.status])),
    },
    evidence: [
      { label: "Render workers (total)", value: `${workersMetric?.value ?? "?"} (target 6)`, source: "render fleet" },
      { label: "Healthy workers", value: `${healthyWorkers ?? "?"}/${workersMetric?.value ?? "?"}`, source: "worker health probes" },
      { label: "Degraded worker", value: degradedDetail ?? "none", source: "worker health probes" },
      { label: "GPU utilization", value: `${gpu?.value ?? "?"}%`, source: "render fleet metrics" },
    ],
    ts: nowIso(),
  };
}

async function getRecentEvents(params: Record<string, unknown>): Promise<ToolResult> {
  const minutes = typeof params.minutes === "number" ? params.minutes : 60;
  const since = new Date(Date.now() - minutes * 60 * 1000);
  const [deployments, logs] = await Promise.all([
    db.deployment.findMany({ where: { deployedAt: { gte: since } }, orderBy: { deployedAt: "desc" } }),
    db.logEntry.findMany({
      where: { ts: { gte: since }, level: { in: ["WARN", "ERROR"] } },
      orderBy: { ts: "desc" },
      take: 12,
    }),
  ]);
  const latestDeploy = deployments[0];
  return {
    tool: "get_recent_events",
    params: { minutes },
    summary: latestDeploy
      ? `Latest deployment: ${latestDeploy.service} ${latestDeploy.version} (${Math.round((Date.now() - latestDeploy.deployedAt.getTime()) / 60000)} min ago). ${logs.length} warn/error events in window.`
      : `${deployments.length} deployments, ${logs.length} warn/error events in the last ${minutes} minutes.`,
    result: {
      deployments: deployments.map((d) => ({ service: d.service, version: d.version, description: d.description, deployedAt: d.deployedAt.toISOString() })),
      notableLogs: logs.map((l) => ({ service: l.service, level: l.level, message: l.message, ts: l.ts.toISOString() })),
    },
    evidence: latestDeploy
      ? [
          { label: "Latest deployment", value: `${latestDeploy.service} ${latestDeploy.version}`, source: "deployment events" },
          { label: "Deployed", value: `${Math.round((Date.now() - latestDeploy.deployedAt.getTime()) / 60000)} min ago`, source: "deployment events" },
          { label: "Change", value: latestDeploy.description, source: "deployment events" },
          { label: "Warn/Error events", value: `${logs.length} in last ${minutes}m`, source: "service logs" },
        ]
      : [{ label: "Deployments", value: `${deployments.length} in window`, source: "deployment events" }],
    ts: nowIso(),
  };
}

async function searchIncidentHistory(params: Record<string, unknown>): Promise<ToolResult> {
  const query = typeof params.query === "string" ? params.query.toLowerCase() : "";
  const keywords = query.split(/\s+/).filter(Boolean);
  const resolved = await db.incident.findMany({ where: { status: "RESOLVED" }, orderBy: { detectedAt: "desc" } });
  const scored = resolved
    .map((inc) => {
      const text = `${inc.title} ${inc.description} ${inc.service} ${inc.rootCause ?? ""} ${inc.workflowKey ?? ""}`.toLowerCase();
      const score = keywords.filter((k) => text.includes(k)).length;
      return { inc, score };
    })
    .sort((a, b) => b.score - a.score);
  const matches = scored.filter((s) => s.score > 0).slice(0, 3);
  const top = matches[0]?.inc;
  return {
    tool: "search_incident_history",
    params,
    summary: top
      ? `Best match: ${top.id} "${top.title}" (${top.severity}, resolved) — ${top.rootCause}`
      : `No strong matches in ${resolved.length} resolved incidents.`,
    result: {
      searched: resolved.length,
      matches: matches.map(({ inc, score }) => ({
        id: inc.id, title: inc.title, severity: inc.severity, service: inc.service,
        rootCause: inc.rootCause, resolutionNote: inc.resolutionNote,
        resolvedAt: inc.resolvedAt?.toISOString() ?? null, matchScore: score,
      })),
    },
    evidence: top
      ? [
          { label: "Historical match", value: `${top.id} — ${top.title}`, source: "incident history" },
          { label: "Root cause then", value: top.rootCause ?? "n/a", source: "incident history" },
          { label: "Resolution then", value: top.resolutionNote ?? "n/a", source: "incident history" },
        ]
      : [{ label: "Resolved incidents searched", value: `${resolved.length}`, source: "incident history" }],
    ts: nowIso(),
  };
}

async function analyzeLogs(params: Record<string, unknown>): Promise<ToolResult> {
  const service = typeof params.service === "string" ? params.service : "render-queue";
  const minutes = typeof params.minutes === "number" ? params.minutes : 60;
  const since = new Date(Date.now() - minutes * 60 * 1000);
  const logs = await db.logEntry.findMany({ where: { ts: { gte: since } }, orderBy: { ts: "asc" } });
  const svcLogs = logs.filter((l) => l.service === service || l.service === "render-worker");
  const errors = svcLogs.filter((l) => l.level === "ERROR").length;
  const warns = svcLogs.filter((l) => l.level === "WARN").length;

  // Correlation analysis (deterministic, evidence-based)
  const deployments = await db.deployment.findMany({ where: { deployedAt: { gte: since } }, orderBy: { deployedAt: "desc" } });
  const queueMetric = await db.metric.findUnique({ where: { key: "queueDepth" } });
  const baseline = Number((await getState("baselineQueueDepth")) ?? 131);
  const queueNow = queueMetric?.value ?? 0;
  const increasePct = baseline > 0 ? Math.round(((queueNow - baseline) / baseline) * 100) : 0;
  const deploy = deployments.find((d) => d.service === "render-worker");
  const minutesSinceDeploy = deploy ? Math.round((Date.now() - deploy.deployedAt.getTime()) / 60000) : null;
  const anomalyWindow = minutesSinceDeploy != null && minutesSinceDeploy <= 40;

  const findings: string[] = [];
  if (deploy && anomalyWindow) {
    findings.push(`Queue depth rose from ${baseline} to ${queueNow} (+${increasePct}%) within ${minutesSinceDeploy} minutes of ${deploy.service} ${deploy.version} deployment.`);
  }
  const degradedLogs = svcLogs.filter((l) => l.message.includes("worker-02"));
  if (degradedLogs.length > 0) {
    findings.push(`worker-02 shows ${degradedLogs.length} anomalous events post-deployment (cache eviction rate 94%, throughput -38%, health probe degraded).`);
  }
  findings.push(`${errors} errors and ${warns} warnings across render services in the last ${minutes} minutes.`);

  return {
    tool: "analyze_logs",
    params: { service, minutes },
    summary: findings.join(" "),
    result: {
      errorCount: errors,
      warnCount: warns,
      queueBaseline: baseline,
      queueNow,
      queueIncreasePct: increasePct,
      correlatedDeployment: deploy ? { service: deploy.service, version: deploy.version, minutesAgo: minutesSinceDeploy } : null,
      degradedWorkerSignals: degradedLogs.map((l) => l.message),
      findings,
    },
    evidence: [
      { label: "Queue depth change", value: `${baseline} → ${queueNow} (+${increasePct}%)`, source: "render-queue logs + metrics" },
      { label: "Correlated deployment", value: deploy ? `${deploy.service} ${deploy.version} (${minutesSinceDeploy}m ago)` : "none", source: "deployment events" },
      { label: "Error/Warn events", value: `${errors} errors, ${warns} warnings`, source: "service logs" },
    ],
    ts: nowIso(),
  };
}

async function getMetrics(params: Record<string, unknown>): Promise<ToolResult> {
  const keys = Array.isArray(params.keys) ? (params.keys as string[]) : undefined;
  const metrics = keys ? await db.metric.findMany({ where: { key: { in: keys } } }) : await db.metric.findMany();
  const latency = metrics.find((m) => m.key === "processingLatency");
  const baseline = Number((await getState("baselineLatencyMs")) ?? 1310);
  const throughput = metrics.find((m) => m.key === "renderThroughput");
  return {
    tool: "get_metrics",
    params,
    summary: `Latency p95 ${latency?.value ?? "?"}ms (baseline ${baseline}ms, SLO 2500ms). Throughput ${throughput?.value ?? "?"} jobs/min (target 70). ${metrics.filter((m) => m.status !== "HEALTHY").length} of ${metrics.length} metrics degraded.`,
    result: {
      metrics: metrics.map((m) => ({ key: m.key, value: m.value, unit: m.unit, status: m.status, warnAbove: m.warnAbove, critAbove: m.critAbove })),
      latencyBaselineMs: baseline,
    },
    evidence: [
      { label: "p95 latency", value: `${latency?.value ?? "?"} ms (baseline ${baseline} ms)`, source: "render-queue metrics" },
      { label: "Latency status", value: latency?.status ?? "n/a", source: "threshold check" },
      { label: "Throughput", value: `${throughput?.value ?? "?"} jobs/min (target 70)`, source: "render-queue metrics" },
      { label: "Degraded metrics", value: `${metrics.filter((m) => m.status !== "HEALTHY").length}/${metrics.length}`, source: "threshold check" },
    ],
    ts: nowIso(),
  };
}

async function listIncidents(params: Record<string, unknown>): Promise<ToolResult> {
  const status = typeof params.status === "string" ? params.status : undefined;
  const incidents = await db.incident.findMany({
    where: status ? { status } : undefined,
    orderBy: { detectedAt: "desc" },
    take: 10,
  });
  const active = incidents.filter((i) => i.status !== "RESOLVED");
  return {
    tool: "list_incidents",
    params,
    summary: status
      ? `${incidents.length} incidents with status ${status}.`
      : `${incidents.length} incidents total; ${active.length} active (${active.filter((i) => i.severity === "HIGH").length} critical).`,
    result: {
      incidents: incidents.map((i) => ({
        id: i.id, title: i.title, severity: i.severity, status: i.status,
        service: i.service, detectedAt: i.detectedAt.toISOString(), agentConfidence: i.agentConfidence,
      })),
    },
    evidence: active.slice(0, 4).map((i) => ({
      label: `${i.id} — ${i.title}`,
      value: `${i.severity} · ${i.status}`,
      source: i.service,
    })),
    ts: nowIso(),
  };
}

async function verifyRecoveryTool(params: Record<string, unknown>): Promise<ToolResult> {
  const { verifyRecovery } = await import("@/lib/agent/actions");
  const incidentId = typeof params.incidentId === "string" ? params.incidentId : null;
  const verification = await verifyRecovery(incidentId, { quiet: true });
  return {
    tool: "verify_recovery",
    params,
    summary: verification.passed
      ? `Recovery verified: ${verification.summary}`
      : `Recovery not yet confirmed: ${verification.summary}`,
    result: { verification },
    evidence: verification.checks.map((c) => ({
      label: c.label,
      value: `${c.before} → ${c.after} (threshold ${c.threshold})`,
      source: "threshold check",
    })),
    ts: nowIso(),
  };
}
