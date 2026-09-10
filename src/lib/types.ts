// CineFlow AI — shared DTO types (server ⇄ client contract).
// Client-safe: no server-only imports.

export type Health = "HEALTHY" | "WARNING" | "CRITICAL";
export type Severity = "HIGH" | "MEDIUM" | "LOW";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type IncidentStatus =
  | "INVESTIGATING"
  | "AWAITING_APPROVAL"
  | "REMEDIATING"
  | "MONITORING"
  | "RESOLVED";
export type RunStatus =
  | "RUNNING"
  | "AWAITING_APPROVAL"
  | "EXECUTING"
  | "COMPLETED"
  | "REJECTED"
  | "FAILED";
export type StepStatus = "PENDING" | "RUNNING" | "COMPLETED" | "SKIPPED";
export type ToolStatus = "RUNNING" | "COMPLETED" | "FAILED";
export type AgentMode = "DEMO" | "GEMINI";
export type RecommendationStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "EXECUTED"
  | "VERIFIED";
export type StepPhase =
  | "UNDERSTAND"
  | "COLLECT"
  | "ANALYZE"
  | "ROOT_CAUSE"
  | "CONFIDENCE"
  | "RISK"
  | "RECOMMEND"
  | "APPROVAL"
  | "ACTION"
  | "VERIFY"
  | "RESOLVE"
  | "REPORT";

export interface WorkflowDTO {
  key: string;
  name: string;
  phase: string;
  description: string;
  health: Health;
  stage: string;
  activeJobs: number;
  latencyMs: number;
  failureRate: number;
  queueDepth: number;
  throughputPerMin: number;
  lastUpdate: string;
}

export interface MetricDTO {
  key: string;
  name: string;
  category: string;
  description: string;
  value: number;
  unit: string;
  status: Health;
  warnAbove: number | null;
  critAbove: number | null;
  targetValue: number | null;
  badDirection: string;
  history: number[];
  updatedAt: string;
}

export interface IncidentDTO {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  service: string;
  workflowKey: string | null;
  status: IncidentStatus;
  detectedAt: string;
  resolvedAt: string | null;
  agentConfidence: number | null;
  rootCause: string | null;
  resolutionNote: string | null;
}

export interface IncidentEventDTO {
  id: string;
  ts: string;
  kind: string;
  label: string;
  detail: string | null;
}

export interface EvidenceItem {
  label: string;
  value: string;
  source: string;
}

export interface VerificationResult {
  passed: boolean;
  checks: { label: string; before: string; after: string; threshold: string; passed: boolean }[];
  summary: string;
  verifiedAt: string;
}

export interface RecommendationDTO {
  id: string;
  incidentId: string | null;
  agentRunId: string | null;
  title: string;
  problem: string;
  evidence: EvidenceItem[];
  analysis: string;
  rootCause: string;
  actionType: string;
  actionLabel: string;
  actionParams: Record<string, unknown>;
  confidence: number;
  risk: RiskLevel;
  status: RecommendationStatus;
  createdAt: string;
  decidedAt: string | null;
  executedAt: string | null;
  verifiedAt: string | null;
  verification: VerificationResult | null;
}

export interface AgentRunStepDTO {
  id: string;
  seq: number;
  phase: StepPhase;
  title: string;
  detail: string | null;
  tool: string | null;
  toolStatus: ToolStatus | null;
  evidence: Record<string, unknown> | null;
  status: StepStatus;
  executeAt: string | null;
  completedAt: string | null;
}

export interface AgentRunDTO {
  id: string;
  query: string;
  intent: string;
  status: RunStatus;
  mode: AgentMode;
  incidentId: string | null;
  recommendationId: string | null;
  confidence: number | null;
  summary: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface AgentRunDetailDTO {
  run: AgentRunDTO;
  steps: AgentRunStepDTO[];
  tools: ToolInfoDTO[];
}

export interface ToolInfoDTO {
  name: string;
  description: string;
  status: "idle" | "running" | "completed" | "failed";
  lastUsedAt: string | null;
}

export interface RecentRunDTO {
  id: string;
  query: string;
  intent: string;
  status: RunStatus;
  mode: AgentMode;
  confidence: number | null;
  summary: string | null;
  createdAt: string;
}

export interface SummaryDTO {
  productionHealth: number;
  activeIncidents: number;
  criticalIncidents: number;
  aiWorkflows: number;
  systemHealth: number;
  activeRecommendations: number;
  queueDepth: number;
  renderLatencyMs: number;
  renderWorkers: number;
  queueDepthHistory: number[];
  latencyHistory: number[];
  recentIncidents: IncidentDTO[];
  agentActivity: RecentRunDTO[];
  scenario: { id: string; status: string; runCount: number; lastRunId: string | null };
  generatedAt: string;
}

export interface SystemHealthDTO {
  overall: { status: Health; availability: number; healthy: number; warning: number; critical: number };
  metrics: MetricDTO[];
  renderWorkers: { total: number; healthy: number; degraded: number };
}

export interface ProviderStatusDTO {
  id: string;
  name: string;
  configured: boolean;
  envVar: string;
  note: string;
}

export interface GuardrailPolicyDTO {
  actionType: string;
  actionLabel: string;
  risk: RiskLevel;
  requiresApproval: boolean;
  autoExecutable: boolean;
  note: string;
}

export interface SettingsDTO {
  activeProvider: string;
  providers: ProviderStatusDTO[];
  googleCloud: { projectConfigured: boolean; locationConfigured: boolean; note: string };
  integrations: { id: string; name: string; status: "CONFIGURED" | "DEMO_MODE" | "READY"; note: string }[];
  guardrails: GuardrailPolicyDTO[];
  scenario: { id: string; status: string; runCount: number; lastRunId: string | null };
}
