// CineFlow AI — Guardrail layer.
// Every agent action is risk-classified BEFORE execution. High-risk actions can
// never auto-execute; medium-risk actions require explicit human approval.

import type { GuardrailPolicyDTO, RiskLevel } from "@/lib/types";

export interface RiskPolicy {
  actionType: string;
  actionLabel: string;
  risk: RiskLevel;
  requiresApproval: boolean;
  autoExecutable: boolean; // true only for read-only / non-destructive actions
  note: string;
}

export const RISK_POLICIES: RiskPolicy[] = [
  {
    actionType: "READ_STATUS",
    actionLabel: "Read workflow/system status",
    risk: "LOW",
    requiresApproval: false,
    autoExecutable: true,
    note: "Read-only. No state change.",
  },
  {
    actionType: "FETCH_METRICS",
    actionLabel: "Fetch infrastructure metrics",
    risk: "LOW",
    requiresApproval: false,
    autoExecutable: true,
    note: "Read-only. No state change.",
  },
  {
    actionType: "SEARCH_INCIDENTS",
    actionLabel: "Search incident history",
    risk: "LOW",
    requiresApproval: false,
    autoExecutable: true,
    note: "Read-only. No state change.",
  },
  {
    actionType: "SCALE_RENDER_WORKERS",
    actionLabel: "Scale render workers",
    risk: "MEDIUM",
    requiresApproval: true,
    autoExecutable: false,
    note: "Changes compute allocation and cost. Bounded: max delta ±4 workers in demo policy.",
  },
  {
    actionType: "RESTART_CACHE_WARMER",
    actionLabel: "Restart non-critical demo service",
    risk: "MEDIUM",
    requiresApproval: true,
    autoExecutable: false,
    note: "Service restart; bounded blast radius on a non-critical demo service.",
  },
  {
    actionType: "DELETE_RESOURCES",
    actionLabel: "Delete resources",
    risk: "HIGH",
    requiresApproval: true,
    autoExecutable: false,
    note: "Destructive. NEVER auto-executes. Requires human approval and is simulated only in demo mode.",
  },
  {
    actionType: "PRODUCTION_DEPLOYMENT",
    actionLabel: "Production deployment",
    risk: "HIGH",
    requiresApproval: true,
    autoExecutable: false,
    note: "Destructive blast radius. NEVER auto-executes. Requires human approval; simulated only in demo mode.",
  },
  {
    actionType: "DATA_DELETION",
    actionLabel: "Data deletion",
    risk: "HIGH",
    requiresApproval: true,
    autoExecutable: false,
    note: "Irreversible. NEVER auto-executes. Blocked by policy in the demo environment.",
  },
];

export function classifyAction(actionType: string): RiskPolicy {
  const policy = RISK_POLICIES.find((p) => p.actionType === actionType);
  if (policy) return policy;
  // Unknown action types are treated as high risk (fail-safe default)
  return {
    actionType,
    actionLabel: actionType,
    risk: "HIGH",
    requiresApproval: true,
    autoExecutable: false,
    note: "Unknown action type — fail-safe high risk. Requires human approval.",
  };
}

export interface GuardrailEvaluation {
  risk: RiskLevel;
  requiresApproval: boolean;
  autoExecAllowed: boolean;
  reason: string;
  policy: RiskPolicy;
}

export function evaluateGuardrails(actionType: string): GuardrailEvaluation {
  const policy = classifyAction(actionType);
  return {
    risk: policy.risk,
    requiresApproval: policy.requiresApproval,
    autoExecAllowed: policy.autoExecutable,
    reason: policy.risk === "LOW"
      ? "Read-only action — safe to execute autonomously."
      : policy.risk === "MEDIUM"
        ? `Medium risk (${policy.actionLabel.toLowerCase()}) — human approval required before execution.`
        : `High risk — NEVER auto-executes. Human approval mandatory; destructive actions are policy-blocked in the demo environment.`,
    policy,
  };
}

export function guardrailPoliciesDTO(): GuardrailPolicyDTO[] {
  return RISK_POLICIES.map((p) => ({
    actionType: p.actionType,
    actionLabel: p.actionLabel,
    risk: p.risk,
    requiresApproval: p.requiresApproval,
    autoExecutable: p.autoExecutable,
    note: p.note,
  }));
}
