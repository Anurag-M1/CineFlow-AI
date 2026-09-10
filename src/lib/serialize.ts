// CineFlow AI — DB row → DTO serializers (server-side).

import { db } from "@/lib/db";
import { TOOL_REGISTRY } from "@/lib/agent/tools";
import type {
  AgentRunDTO, AgentRunStepDTO, IncidentDTO, IncidentEventDTO, MetricDTO,
  RecommendationDTO, ToolInfoDTO, WorkflowDTO,
} from "@/lib/types";
import type {
  AgentRun, AgentRunStep, Incident, IncidentEvent, Metric,
  Recommendation, Workflow,
} from "@prisma/client";

export function workflowDTO(w: Workflow): WorkflowDTO {
  return {
    key: w.key, name: w.name, phase: w.phase, description: w.description,
    health: w.health as WorkflowDTO["health"], stage: w.stage, activeJobs: w.activeJobs,
    latencyMs: w.latencyMs, failureRate: w.failureRate, queueDepth: w.queueDepth,
    throughputPerMin: w.throughputPerMin, lastUpdate: w.lastUpdate.toISOString(),
  };
}

export function metricDTO(m: Metric): MetricDTO {
  return {
    key: m.key, name: m.name, category: m.category, description: m.description,
    value: m.value, unit: m.unit, status: m.status as MetricDTO["status"],
    warnAbove: m.warnAbove, critAbove: m.critAbove, targetValue: m.targetValue,
    badDirection: m.badDirection, history: m.history ? JSON.parse(m.history) : [],
    updatedAt: m.updatedAt.toISOString(),
  };
}

export function incidentDTO(i: Incident): IncidentDTO {
  return {
    id: i.id, title: i.title, description: i.description,
    severity: i.severity as IncidentDTO["severity"], service: i.service,
    workflowKey: i.workflowKey, status: i.status as IncidentDTO["status"],
    detectedAt: i.detectedAt.toISOString(), resolvedAt: i.resolvedAt?.toISOString() ?? null,
    agentConfidence: i.agentConfidence, rootCause: i.rootCause, resolutionNote: i.resolutionNote,
  };
}

export function incidentEventDTO(e: IncidentEvent): IncidentEventDTO {
  return { id: e.id, ts: e.ts.toISOString(), kind: e.kind, label: e.label, detail: e.detail };
}

export function recommendationDTO(r: Recommendation): RecommendationDTO {
  let evidence: RecommendationDTO["evidence"] = [];
  let actionParams: Record<string, unknown> = {};
  let verification: RecommendationDTO["verification"] = null;
  try { evidence = r.evidence ? JSON.parse(r.evidence) : []; } catch { /* noop */ }
  try { actionParams = r.actionParams ? JSON.parse(r.actionParams) : {}; } catch { /* noop */ }
  try { verification = r.verification ? JSON.parse(r.verification) : null; } catch { /* noop */ }
  return {
    id: r.id, incidentId: r.incidentId, agentRunId: r.agentRunId,
    title: r.title, problem: r.problem, evidence, analysis: r.analysis, rootCause: r.rootCause,
    actionType: r.actionType, actionLabel: r.actionLabel, actionParams,
    confidence: r.confidence, risk: r.risk as RecommendationDTO["risk"],
    status: r.status as RecommendationDTO["status"],
    createdAt: r.createdAt.toISOString(), decidedAt: r.decidedAt?.toISOString() ?? null,
    executedAt: r.executedAt?.toISOString() ?? null, verifiedAt: r.verifiedAt?.toISOString() ?? null,
    verification,
  };
}

export function agentRunStepDTO(s: AgentRunStep): AgentRunStepDTO {
  let evidence: Record<string, unknown> | null = null;
  try { evidence = s.evidence ? JSON.parse(s.evidence) : null; } catch { /* noop */ }
  return {
    id: s.id, seq: s.seq, phase: s.phase as AgentRunStepDTO["phase"], title: s.title,
    detail: s.detail, tool: s.tool, toolStatus: s.toolStatus as AgentRunStepDTO["toolStatus"],
    evidence, status: s.status as AgentRunStepDTO["status"],
    executeAt: s.executeAt?.toISOString() ?? null, completedAt: s.completedAt?.toISOString() ?? null,
  };
}

export function agentRunDTO(r: AgentRun): AgentRunDTO {
  return {
    id: r.id, query: r.query, intent: r.intent, status: r.status as AgentRunDTO["status"],
    mode: r.mode as AgentRunDTO["mode"], incidentId: r.incidentId,
    recommendationId: r.recommendationId, confidence: r.confidence, summary: r.summary,
    createdAt: r.createdAt.toISOString(), completedAt: r.completedAt?.toISOString() ?? null,
  };
}

export function toolsStatusDTO(steps: AgentRunStep[]): ToolInfoDTO[] {
  return TOOL_REGISTRY.map((tool) => {
    const used = steps.filter((s) => s.tool === tool.name);
    const last = used[used.length - 1];
    let status: ToolInfoDTO["status"] = "idle";
    if (last) {
      if (last.status === "RUNNING" && last.toolStatus === "RUNNING") status = "running";
      else if (last.toolStatus === "FAILED") status = "failed";
      else if (last.status === "COMPLETED") status = "completed";
      else status = "idle";
    }
    return {
      name: tool.name,
      description: tool.description,
      status,
      lastUsedAt: last?.completedAt?.toISOString() ?? null,
    };
  });
}

export async function incidentDetailDTO(incident: Incident) {
  const [events, recommendations, runs] = await Promise.all([
    db.incidentEvent.findMany({ where: { incidentId: incident.id }, orderBy: { ts: "asc" } }),
    db.recommendation.findMany({ where: { incidentId: incident.id }, orderBy: { createdAt: "desc" } }),
    db.agentRun.findMany({ where: { incidentId: incident.id }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  return {
    ...incidentDTO(incident),
    events: events.map(incidentEventDTO),
    recommendations: recommendations.map(recommendationDTO),
    runs: runs.map(agentRunDTO),
  };
}
