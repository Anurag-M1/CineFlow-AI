// CineFlow AI — typed client API (browser → /api routes only, relative paths).

import type {
  AgentRunDetailDTO, IncidentDTO, RecommendationDTO, SettingsDTO, SummaryDTO,
  SystemHealthDTO,
} from "@/lib/types";

export interface IncidentDetailDTO extends IncidentDTO {
  events: { id: string; ts: string; kind: string; label: string; detail: string | null }[];
  recommendations: RecommendationDTO[];
  runs: AgentRunDetailDTO["run"][];
}

export interface WorkflowsResponse {
  total: number;
  degraded: number;
  phases: { phase: string; label: string; workflows: import("@/lib/types").WorkflowDTO[] }[];
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Request failed (${res.status})${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => fetch("/api/health").then(json<{ status: string; activeProvider: { id: string; name: string }; geminiConfigured: boolean }>),

  summary: () => fetch("/api/summary").then(json<SummaryDTO>),

  incidents: (params?: { status?: string; severity?: string }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.severity) q.set("severity", params.severity);
    const qs = q.toString();
    return fetch(`/api/incidents${qs ? `?${qs}` : ""}`).then(json<IncidentDTO[]>);
  },

  incident: (id: string) => fetch(`/api/incidents/${id}`).then(json<IncidentDetailDTO>),

  workflows: () => fetch("/api/workflows").then(json<WorkflowsResponse>),

  systemHealth: () => fetch("/api/system-health").then(json<SystemHealthDTO>),

  recommendations: () => fetch("/api/recommendations").then(json<RecommendationDTO[]>),

  approveRecommendation: (id: string) =>
    fetch(`/api/recommendations/${id}/approve`, { method: "POST" }).then(json<{ ok: boolean; message?: string }>),

  rejectRecommendation: (id: string) =>
    fetch(`/api/recommendations/${id}/reject`, { method: "POST" }).then(json<{ ok: boolean; message?: string }>),

  agentQuery: (query: string) =>
    fetch("/api/agent/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    }).then(json<{ ok: boolean; runId: string }>),

  agentDemo: () =>
    fetch("/api/agent/demo", { method: "POST" }).then(json<{ ok: boolean; runId: string; query: string }>),

  agentRun: (id: string) => fetch(`/api/agent/runs/${id}`).then(json<AgentRunDetailDTO>),

  agentRuns: () => fetch("/api/agent/runs").then(json<AgentRunDetailDTO["run"][]>),

  runVerification: (incidentId: string) =>
    fetch("/api/verification/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ incidentId }),
    }).then(json<{ ok: boolean; verification: import("@/lib/types").VerificationResult }>),

  resetDemo: () => fetch("/api/demo/reset", { method: "POST" }).then(json<{ ok: boolean; message: string }>),

  settings: () => fetch("/api/settings").then(json<SettingsDTO>),
};
