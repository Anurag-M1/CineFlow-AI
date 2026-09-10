"use client";

// CineFlow AI — AI Production Agent console (the product's centerpiece).
//
// Two-column workspace (lg+), stacks on mobile:
//   LEFT  — conversation: user bubbles (#F2F4F7, right-aligned), agent run
//           messages (white bordered cards) with the live typing indicator,
//           the inline human-approval gate, and a compact evidence-grounded
//           final answer. Composer + suggested prompt chips at the bottom.
//   RIGHT — run detail for the active run: investigation checklist (steps),
//           tool checklist, and the structured findings (finding, root cause,
//           confidence, risk, evidence, recommendation, verification) plus
//           recent runs. Every prior feature is preserved: query polling,
//           deep-link restore, auto-query queueing, approval/rejection,
//           transcript/conversation exports, share links.
//
// Markdown export builders live in shared/markdown-export (single source of
// truth shared with the incident view and the command palette).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AlertTriangle, Archive, ArrowRight, Check, CheckCircle2, ChevronDown, ClipboardCopy, Clock,
  Crosshair, Download, FileText, Gauge, History, Lightbulb, Link2, ListChecks,
  Loader2, MessagesSquare, Play, Send, ShieldAlert, Sparkles, UserCheck, Wrench, X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { api } from "@/lib/client/api";
import { useApi } from "@/hooks/use-api";
import { useAgentRun } from "@/hooks/use-agent-run";
import { useCineFlowStore } from "@/lib/client/store";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  AgentRunDetailDTO, AgentRunStepDTO, RecommendationDTO, RecommendationStatus, RunStatus, StepPhase,
  VerificationResult,
} from "@/lib/types";
import { ConfidenceMeter, EmptyState, LoadingRows, PageHeader } from "@/components/app/shared/ui";
import { DemoTag, RiskBadge } from "@/components/app/shared/badges";
import {
  MODE_LABEL,
  PHASE_LABELS,
  buildConversationMarkdown,
  buildRunTranscriptMarkdown,
  downloadTextFile,
} from "@/components/app/shared/markdown-export";

// ---------------------------------------------------------------------------
// Status metadata — labels live in the shared markdown-export module (single
// source of truth for the console UI + every Markdown export).
// ---------------------------------------------------------------------------

const RUN_STATUS_META: Record<RunStatus, { label: string; cls: string; pulse?: boolean }> = {
  RUNNING: { label: "Investigating", cls: "border-[#B2DDFF] bg-[#EFF8FF] text-[#175CD3]", pulse: true },
  AWAITING_APPROVAL: { label: "Awaiting approval", cls: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]", pulse: true },
  EXECUTING: { label: "Executing action", cls: "border-[#B2DDFF] bg-[#EFF8FF] text-[#175CD3]", pulse: true },
  COMPLETED: { label: "Completed", cls: "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]" },
  REJECTED: { label: "Rejected", cls: "border-[#FEE4E2] bg-[#FEF3F2] text-[#B42318]" },
  FAILED: { label: "Failed", cls: "border-[#FEE4E2] bg-[#FEF3F2] text-[#B42318]" },
};

const REC_STATUS_META: Record<RecommendationStatus, { label: string; cls: string }> = {
  PENDING: { label: "Awaiting approval", cls: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]" },
  APPROVED: { label: "Approved", cls: "border-[#B2DDFF] bg-[#EFF8FF] text-[#175CD3]" },
  EXECUTED: { label: "Executed", cls: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]" },
  VERIFIED: { label: "Verified", cls: "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]" },
  REJECTED: { label: "Rejected", cls: "border-[#FEE4E2] bg-[#FEF3F2] text-[#B42318]" },
};

const SUGGESTED = [
  "Why is the post-production render pipeline delayed?",
  "Summarize current production status",
  "Are any workflows degraded right now?",
];

const TERMINAL: RunStatus[] = ["COMPLETED", "REJECTED", "FAILED"];

// 32px square icon buttons (transcript / share / export / clear) — white
// surface, #E4E7EC border, #667085 icon, border deepens on hover.
const ICON_BTN =
  "flex size-8 shrink-0 items-center justify-center rounded-md border border-[#E4E7EC] bg-white text-[#667085] transition-colors hover:border-[#98A2B3] hover:text-[#344054] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-40";

// Destructive variant of the icon button (clear conversation).
const ICON_BTN_DANGER =
  "flex size-8 shrink-0 items-center justify-center rounded-md border border-[#E4E7EC] bg-white text-[#667085] transition-colors hover:border-[#FEE4E2] hover:bg-[#FEF3F2] hover:text-[#B42318] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60";

// ---------------------------------------------------------------------------
// Evidence parsing helpers (steps store JSON evidence)
// ---------------------------------------------------------------------------

interface RenderDelayAnswer {
  observation: string;
  evidenceItems: { label: string; value: string; source: string }[] | null;
  analysis: string | null;
  rootCause: string | null;
  confidence: number | null;
  risk: string | null;
  requiresApproval: boolean | null;
  actionLabel: string | null;
  verification: VerificationResult | null;
}

function stepEvidence(step: AgentRunStepDTO | undefined): Record<string, unknown> | null {
  return step?.evidence ?? null;
}

function buildRenderDelayAnswer(run: AgentRunDetailDTO, rec: RecommendationDTO | null): RenderDelayAnswer {
  const byPhase = (phase: StepPhase) => run.steps.find((s) => s.phase === phase);
  const recommendEv = stepEvidence(byPhase("RECOMMEND"));
  const riskEv = stepEvidence(byPhase("RISK"));
  const verifyEv = stepEvidence(byPhase("VERIFY"));

  const evidenceItems =
    rec?.evidence?.length
      ? rec.evidence
      : ((recommendEv?.evidenceItems as RenderDelayAnswer["evidenceItems"]) ?? null);
  const verification = rec?.verification ?? ((verifyEv?.verification as RenderDelayAnswer["verification"]) ?? null);

  return {
    observation: `Investigated: ${run.run.query}`,
    evidenceItems,
    analysis: rec?.analysis ?? byPhase("ANALYZE")?.detail ?? null,
    rootCause: rec?.rootCause ?? byPhase("ROOT_CAUSE")?.detail?.replace(/^Probable cause:\s*/i, "") ?? null,
    confidence: rec?.confidence ?? run.run.confidence,
    risk: rec?.risk ?? ((riskEv?.risk as string) ?? null),
    requiresApproval: riskEv ? (riskEv.requiresApproval as boolean) : true,
    actionLabel: rec?.actionLabel ?? byPhase("RECOMMEND")?.detail ?? null,
    verification,
  };
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function RunStatusBadge({ status }: { status: RunStatus }) {
  const meta = RUN_STATUS_META[status] ?? { label: status, cls: "border-[#E4E7EC] bg-[#F2F4F7] text-[#475467]" };
  return (
    <Badge variant="outline" className={cn("gap-1.5 text-[11px] font-medium", meta.cls)}>
      {meta.pulse ? <span className="cine-pulse inline-block size-1.5 rounded-full bg-current" aria-hidden /> : null}
      {meta.label}
    </Badge>
  );
}

function RecStatusBadge({ status }: { status: RecommendationStatus }) {
  const meta = REC_STATUS_META[status] ?? { label: status, cls: "border-[#E4E7EC] bg-[#F2F4F7] text-[#475467]" };
  return (
    <Badge variant="outline" className={cn("gap-1.5 text-[11px] font-medium", meta.cls)}>
      {meta.label}
    </Badge>
  );
}

// Header status chip: "Ready" when idle, live run state otherwise.
function AgentStatusChip({ status }: { status: RunStatus | null }) {
  if (!status || TERMINAL.includes(status)) {
    return (
      <Badge variant="outline" className="gap-1.5 border-[#ABEFC6] bg-[#ECFDF3] font-medium text-[#067647]">
        <span className="size-1.5 rounded-full bg-[#17B268]" aria-hidden />
        Ready
      </Badge>
    );
  }
  const live =
    status === "RUNNING"
      ? { cls: "border-[#B2DDFF] bg-[#EFF8FF] text-[#175CD3]", label: "Investigating" }
      : status === "AWAITING_APPROVAL"
        ? { cls: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]", label: "Awaiting approval" }
        : { cls: "border-[#B2DDFF] bg-[#EFF8FF] text-[#175CD3]", label: "Executing action" };
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-medium", live.cls)}>
      <span className="cine-pulse inline-block size-1.5 rounded-full bg-current" aria-hidden />
      {live.label}
    </Badge>
  );
}

function ModeBadge({ mode }: { mode: string }) {
  const isDemo = mode === "DEMO";
  return (
    <Badge variant="outline" className={cn(
      "text-[11px] font-normal",
      isDemo ? "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]" : "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]"
    )}>
      {MODE_LABEL[mode] ?? mode}
    </Badge>
  );
}

/** 11px mono uppercase section label with a small leading icon. */
function SectionLabel({ icon: Icon, children }: { icon: typeof Check; children: string }) {
  return (
    <p className="cine-label mb-1.5 flex items-center gap-1.5">
      <Icon className="size-3" aria-hidden />
      {children}
    </p>
  );
}

/** Three pulsing dots — the agent "typing" indicator while a run is live. */
function TypingDots() {
  return (
    <span className="flex shrink-0 items-center gap-1" aria-hidden>
      <span className="cine-dot size-1.5 rounded-full bg-[#175CD3]" />
      <span className="cine-dot size-1.5 rounded-full bg-[#175CD3]" />
      <span className="cine-dot size-1.5 rounded-full bg-[#175CD3]" />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Approval card (inline human-in-the-loop gate) — white card with a success
// border, RECOMMENDATION label, prominent primary "Approve Action" and a
// destructive outline "Reject", side by side.
// Exported for the /demo judge page (shared inline human-approval gate).
// ---------------------------------------------------------------------------

export function ApprovalCard({ rec, onDecided }: { rec: RecommendationDTO; onDecided: () => void }) {
  const [deciding, setDeciding] = useState<"approve" | "reject" | null>(null);

  const decide = async (kind: "approve" | "reject") => {
    setDeciding(kind);
    try {
      const res = kind === "approve"
        ? await api.approveRecommendation(rec.id)
        : await api.rejectRecommendation(rec.id);
      if (res.ok) {
        toast.success(res.message ?? (kind === "approve" ? "Approved" : "Rejected"));
      } else {
        toast.error(res.message ?? "Decision failed");
      }
      onDecided();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Decision failed");
    } finally {
      setDeciding(null);
    }
  };

  return (
    <div className="rounded-lg border border-[#ABEFC6] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="cine-label">Recommendation</p>
        <Badge variant="outline" className="gap-1.5 border-[#FEDF89] bg-[#FFFAEB] font-medium text-[#B54708]">
          <span className="cine-pulse inline-block size-1.5 rounded-full bg-current" aria-hidden />
          Awaiting approval
        </Badge>
      </div>
      <p className="mt-2.5 text-sm font-medium leading-relaxed text-[#111827]">{rec.actionLabel}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-[#667085]">{rec.problem}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2.5">
        <RiskBadge risk={rec.risk} />
        <ConfidenceMeter value={rec.confidence} />
      </div>
      <p className="mt-3 text-[13px] text-[#667085]">
        {rec.risk.toLowerCase()}-risk action — the agent is paused and will not execute anything until you decide.
      </p>
      <div className="mt-4 flex gap-2">
        <Button
          onClick={() => void decide("approve")}
          disabled={deciding !== null}
          className="h-10 flex-1 gap-1.5 bg-[#2563EB] font-medium text-white hover:bg-[#1D4ED8]"
        >
          {deciding === "approve" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CheckCircle2 className="size-4" aria-hidden />}
          Approve Action
        </Button>
        <Button
          variant="outline"
          onClick={() => void decide("reject")}
          disabled={deciding !== null}
          className="h-10 flex-1 gap-1.5 border-[#FEE4E2] bg-white font-medium text-[#B42318] hover:bg-[#FEF3F2] hover:text-[#B42318]"
        >
          {deciding === "reject" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <X className="size-4" aria-hidden />}
          Reject
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent run message (left column transcript entry) — conversational card:
// live progress + typing dots, the approval gate, and a compact final answer.
// The full structured findings live in the right-hand run-detail panel.
// ---------------------------------------------------------------------------

function RunMessage({
  runId, rec, active, onRecsChanged,
}: {
  runId: string;
  rec: RecommendationDTO | null;
  active: boolean;
  onRecsChanged: () => void;
}) {
  const { run, error } = useAgentRun(runId, 700);

  if (error && !run) {
    // Persisted transcript entries can outlive their runs (demo data reset).
    // Distinguish a hard failure from an expired run so reloaded transcripts
    // look intentional instead of broken.
    const expired = /404|not found/i.test(error);
    return expired ? (
      <div className="flex items-start gap-3 rounded-lg border border-[#E4E7EC] bg-white px-4 py-3">
        <Archive className="mt-0.5 size-4 shrink-0 text-[#667085]" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#111827]">Run expired</p>
          <p className="mt-0.5 text-xs text-[#667085]">
            This transcript entry references an agent run that is no longer stored — the demo
            data was reset. Run a new query to start a fresh investigation.
          </p>
          <p className="mt-1 font-mono text-[11px] text-[#98A2B3]">{runId}</p>
        </div>
      </div>
    ) : (
      <div className="flex items-start gap-3 rounded-lg border border-[#FEE4E2] bg-white px-4 py-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#F04438]" aria-hidden />
        <div>
          <p className="text-sm font-medium text-[#B42318]">Run request failed</p>
          <p className="mt-0.5 text-xs text-[#667085]">{error}</p>
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-[#E4E7EC] bg-white px-4 py-3">
        <TypingDots />
        <span className="text-sm text-[#667085]">Starting agent run…</span>
      </div>
    );
  }

  const status = run.run.status;
  const completedSteps = run.steps.filter((s) => s.status === "COMPLETED").length;
  const total = run.steps.length;
  const progress = total ? Math.round((completedSteps / total) * 100) : 0;
  const currentStep = run.steps.find((s) => s.status === "RUNNING");
  const lastDetail = [...run.steps].reverse().find((s) => s.status === "COMPLETED" && s.detail)?.detail;
  const isRenderDelay = run.run.intent === "render_delay";
  const answer = isRenderDelay ? buildRenderDelayAnswer(run, rec) : null;
  const passed = answer?.verification?.passed ?? rec?.status === "VERIFIED";

  const copyTranscript = async () => {
    const md = buildRunTranscriptMarkdown(run, rec);
    try {
      await navigator.clipboard.writeText(md);
      toast.success("Run transcript copied as Markdown", {
        description: `${md.length.toLocaleString()} characters · steps, tools, recommendation & verification included.`,
      });
    } catch {
      toast.error("Could not copy — clipboard unavailable in this context");
    }
  };

  const downloadTranscript = () => {
    const filename = `cineflow-run-${run.run.id.slice(0, 8)}.md`;
    downloadTextFile(filename, buildRunTranscriptMarkdown(run, rec));
    toast.success("Run transcript downloaded", { description: filename });
  };

  // Selecting a run focuses the right-hand detail panel on its findings
  // (on mobile the panel stacks below the conversation, so it is scrolled
  // into view once selected).
  const selectRun = () => {
    useCineFlowStore.getState().setActiveRunId(runId);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      document.getElementById("agent-run-detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <article className="rounded-lg border border-[#E4E7EC] bg-white">
      {/* Agent header */}
      <header className="flex flex-wrap items-center gap-2.5 border-b border-[#E4E7EC] px-4 py-3">
        <span className="flex size-7 items-center justify-center rounded-md border border-[#E4E7EC] bg-[#F9FAFB]">
          <Sparkles className="size-3.5 text-[#2563EB]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#111827]">
            CineFlow Agent
            <ModeBadge mode={run.run.mode} />
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-[#667085]">
            run {run.run.id.slice(0, 8)} · intent {run.run.intent}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <RunStatusBadge status={status} />
          <button
            onClick={() => void copyTranscript()}
            className={ICON_BTN}
            aria-label="Copy this run's full transcript as Markdown"
            title="Copy transcript as Markdown (steps, tools, recommendation, verification)"
          >
            <ClipboardCopy className="size-4" aria-hidden />
          </button>
          <button
            onClick={downloadTranscript}
            className={ICON_BTN}
            aria-label="Download this run's transcript as a Markdown file"
            title="Download transcript (.md)"
          >
            <Download className="size-4" aria-hidden />
          </button>
        </div>
      </header>

      <div className="space-y-4 p-4">
        {/* Live progress while working */}
        {!TERMINAL.includes(status) ? (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5 text-sm">
              <TypingDots />
              <span className="min-w-0 flex-1 truncate font-medium text-[#475467]">
                {status === "AWAITING_APPROVAL"
                  ? "Paused at human approval gate"
                  : status === "EXECUTING"
                    ? "Executing approved action (demo environment)"
                    : currentStep
                      ? `${PHASE_LABELS[currentStep.phase]?.label ?? currentStep.phase}: ${currentStep.title}`
                      : "Working…"}
              </span>
              <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-[#667085]">
                {completedSteps}/{total} steps
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-[#E4E7EC]" aria-hidden>
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  status === "AWAITING_APPROVAL" ? "bg-[#F79009]" : "bg-[#2563EB]"
                )}
                style={{ width: `${Math.max(progress, 4)}%` }}
              />
            </div>
            {lastDetail && status !== "AWAITING_APPROVAL" ? (
              <p className="rounded-md border border-[#E4E7EC] bg-[#F9FAFB] px-3 py-2 text-xs leading-relaxed text-[#667085]">
                {lastDetail}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Approval gate */}
        {status === "AWAITING_APPROVAL" && rec && rec.status === "PENDING" ? (
          <ApprovalCard rec={rec} onDecided={onRecsChanged} />
        ) : null}
        {status === "AWAITING_APPROVAL" && (!rec || rec.status === "PENDING") ? (
          <p className="text-xs text-[#667085]">
            Guardrail: medium-risk remediation requires human approval. No action is taken without it.
          </p>
        ) : null}

        {/* Compact final answer (render-delay scenario) — the full evidence,
            recommendation and verification detail renders in the run panel. */}
        {answer && status === "COMPLETED" ? (
          <div className="space-y-3">
            <SectionLabel icon={FileText}>Final answer</SectionLabel>
            {run.run.summary ? (
              <p className="text-sm leading-relaxed text-[#111827]">{run.run.summary}</p>
            ) : null}
            <div className="grid gap-3 rounded-md border border-[#E4E7EC] bg-[#F9FAFB] p-3.5 sm:grid-cols-2">
              {answer.rootCause ? (
                <div>
                  <p className="cine-label mb-1">Root cause</p>
                  <p className="text-[13px] leading-relaxed text-[#344054]">{answer.rootCause}</p>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                {answer.confidence != null ? (
                  <div>
                    <p className="cine-label mb-1">Confidence</p>
                    <ConfidenceMeter value={answer.confidence} />
                  </div>
                ) : null}
                {answer.risk ? (
                  <div>
                    <p className="cine-label mb-1">Risk</p>
                    <RiskBadge risk={answer.risk} />
                  </div>
                ) : null}
              </div>
            </div>
            {answer.verification || rec ? (
              <div className="flex flex-wrap items-center gap-2.5">
                {answer.verification ? (
                  <Badge variant="outline" className={cn(
                    "gap-1.5 text-[11px] font-medium",
                    passed ? "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]" : "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]"
                  )}>
                    {passed ? <Check className="size-3" aria-hidden /> : <AlertTriangle className="size-3" aria-hidden />}
                    {passed ? "Recovery verified" : "Not yet recovered"}
                  </Badge>
                ) : null}
                {rec ? (
                  <span className="flex items-center gap-1.5 text-xs text-[#667085]">
                    <UserCheck className="size-3.5 shrink-0" aria-hidden />
                    {rec.status === "PENDING" ? "Awaiting human approval — nothing executes without it." :
                      rec.status === "REJECTED" ? "Rejected by human — no action was taken." :
                        rec.status === "APPROVED" ? "Approved — execution in progress." :
                          rec.status === "EXECUTED" ? "Executed with human approval (demo environment)." :
                            "Executed and verified with human approval (demo environment)."}
                  </span>
                ) : null}
              </div>
            ) : null}
            {active ? (
              <p className="text-xs text-[#667085]">
                Evidence, recommendation &amp; verification detail is shown in the run panel.
              </p>
            ) : (
              <button
                onClick={selectRun}
                className="inline-flex items-center gap-1 text-[13px] font-medium text-[#175CD3] transition-colors hover:text-[#1D4ED8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                aria-label={`Show the full investigation detail for this run: ${run.run.query}`}
              >
                View full investigation
                <ArrowRight className="size-3.5" aria-hidden />
              </button>
            )}
          </div>
        ) : null}

        {/* Plain summary (status / free-form / rejected runs) */}
        {!answer && status === "COMPLETED" && run.run.summary ? (
          <div className="space-y-2">
            <SectionLabel icon={FileText}>Response</SectionLabel>
            <p className="text-sm leading-relaxed text-[#344054]">{run.run.summary}</p>
          </div>
        ) : null}
        {!answer && status === "COMPLETED" && !run.run.summary ? (
          <p className="text-sm text-[#667085]">Run completed.</p>
        ) : null}

        {status === "REJECTED" ? (
          <div className="rounded-lg border border-[#FEE4E2] bg-white p-3.5 text-sm leading-relaxed text-[#667085]">
            <span className="font-medium text-[#B42318]">Recommendation rejected.</span>{" "}
            No action was taken — the incident remains under investigation.
          </div>
        ) : null}
        {status === "FAILED" ? (
          <div className="rounded-lg border border-[#FEE4E2] bg-white p-3.5 text-sm leading-relaxed text-[#667085]">
            <span className="font-medium text-[#B42318]">Run failed.</span>{" "}
            The agent never guesses without evidence — try re-running the investigation.
          </div>
        ) : null}

        {/* Rejection path for a decided-but-run-continued state */}
        {answer && status === "REJECTED" && rec?.status === "REJECTED" ? (
          <p className="text-xs text-[#667085]">Rejected action: {rec.actionLabel}</p>
        ) : null}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Tool checklist (run panel) — completed tools get a #12B76A check + 14px
// mono names, the running tool spins with info-blue accents.
// ---------------------------------------------------------------------------

type ToolInfoLike = { name: string; description: string; status: string };

function ToolPanel({ tools }: { tools: ToolInfoLike[] }) {
  return (
    <ul className="space-y-1.5">
      {tools.map((t) => {
        const running = t.status === "running";
        const completed = t.status === "completed";
        const failed = t.status === "failed";
        return (
          <li
            key={t.name}
            className={cn(
              "flex items-start gap-2.5 rounded-md border px-3 py-2",
              running
                ? "border-[#B2DDFF] bg-[#EFF8FF]"
                : completed
                  ? "border-[#E4E7EC] bg-white"
                  : failed
                    ? "border-[#FEE4E2] bg-[#FEF3F2]"
                    : "border-[#E4E7EC] bg-[#F9FAFB]"
            )}
          >
            <span className="mt-0.5 shrink-0">
              {running ? (
                <Loader2 className="size-4 animate-spin text-[#175CD3]" aria-hidden />
              ) : completed ? (
                <Check className="size-4 text-[#12B76A]" aria-hidden />
              ) : failed ? (
                <AlertTriangle className="size-4 text-[#F04438]" aria-hidden />
              ) : (
                <Wrench className="size-4 text-[#667085]" aria-hidden />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2 font-mono text-sm">
                <span className={running ? "text-[#175CD3]" : "text-[#111827]"}>{t.name}</span>
                {running ? <span className="text-[11px] text-[#175CD3]">Running…</span> : null}
                {completed ? <span className="text-[11px] text-[#067647]">Completed</span> : null}
                {failed ? <span className="text-[11px] text-[#F04438]">Failed</span> : null}
              </p>
              <p className="mt-0.5 text-xs leading-snug text-[#667085]">{t.description}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Investigation checklist (run panel) — completed steps get #12B76A check
// icons + 14px text, the running step spins with #175CD3 text, pending stays
// gray. Completed steps keep their detail line and expandable evidence.
// ---------------------------------------------------------------------------

function StepStream({ steps }: { steps: AgentRunStepDTO[] }) {
  return (
    <ol className="space-y-1">
      {steps.map((s) => {
        const phaseLabel = PHASE_LABELS[s.phase]?.label ?? s.phase;
        const running = s.status === "RUNNING";
        const done = s.status === "COMPLETED";
        const skipped = s.status === "SKIPPED";
        return (
          <li key={s.id} className={cn(
            "rounded-md border px-3 py-2",
            running ? "border-[#B2DDFF] bg-[#EFF8FF]" : "border-transparent"
          )}>
            <div className="flex items-center gap-2.5">
              <span className="shrink-0">
                {running ? (
                  <Loader2 className="size-4 animate-spin text-[#175CD3]" aria-hidden />
                ) : done ? (
                  <Check className="size-4 text-[#12B76A]" aria-hidden />
                ) : skipped ? (
                  <X className="size-4 text-[#98A2B3]" aria-hidden />
                ) : (
                  <Clock className="size-4 text-[#98A2B3]" aria-hidden />
                )}
              </span>
              <p className={cn(
                "min-w-0 flex-1 truncate text-sm font-medium",
                running ? "text-[#175CD3]" : done ? "text-[#111827]" : "text-[#667085]",
                skipped && "line-through"
              )}>
                {s.title}
              </p>
              <span className="cine-label shrink-0">{phaseLabel}</span>
              {s.tool ? (
                <Badge variant="outline" className={cn(
                  "h-5 shrink-0 px-1.5 font-mono text-[11px] font-normal",
                  s.toolStatus === "RUNNING" ? "border-[#B2DDFF] bg-[#EFF8FF] text-[#175CD3]"
                    : s.toolStatus === "COMPLETED" ? "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]"
                      : s.toolStatus === "FAILED" ? "border-[#FEE4E2] bg-[#FEF3F2] text-[#B42318]"
                        : "border-[#E4E7EC] bg-white text-[#667085]"
                )}>
                  {s.tool}
                </Badge>
              ) : null}
            </div>
            {done && s.detail ? (
              <p className="mt-1.5 border-l-2 border-[#E4E7EC] pl-2.5 text-[13px] leading-relaxed text-[#667085]">{s.detail}</p>
            ) : null}
            {done && s.evidence ? (
              <details className="group mt-1.5">
                <summary className="inline-flex cursor-pointer select-none items-center gap-1 text-[11px] font-medium text-[#667085] transition-colors hover:text-[#344054]">
                  <ChevronDown className="size-3 transition-transform group-open:rotate-180" aria-hidden />
                  Evidence
                </summary>
                <pre className="cine-scroll mt-1 max-h-40 overflow-auto rounded-md border border-[#E4E7EC] bg-[#F9FAFB] p-2 font-mono text-[11px] leading-relaxed text-[#475467]">
                  {JSON.stringify(s.evidence, null, 2)}
                </pre>
              </details>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Run detail panel (right column) — investigation checklist, tools and the
// structured findings for the active run, separated by hairlines.
// ---------------------------------------------------------------------------

function RunDetailPanel({
  runId, detail, runError, rec, onShare,
}: {
  runId: string | null;
  detail: AgentRunDetailDTO | null;
  runError: string | null;
  rec: RecommendationDTO | null;
  onShare: () => void;
}) {
  const run = detail?.run ?? null;
  const isRenderDelay = run?.intent === "render_delay";
  const answer = detail && isRenderDelay ? buildRenderDelayAnswer(detail, rec) : null;
  const passed = answer?.verification?.passed ?? rec?.status === "VERIFIED";
  const confidence = answer?.confidence ?? run?.confidence ?? null;
  const completedSteps = detail?.steps.filter((s) => s.status === "COMPLETED").length ?? 0;

  // A runId whose detail never arrives (e.g. the run expired behind a demo
  // data reset while the console stayed open) would otherwise sit on skeletons
  // forever — after a short grace period the panel says so honestly.
  // Deferred macrotask: no synchronous setState inside the effect body.
  const [slowFor, setSlowFor] = useState<string | null>(null);
  useEffect(() => {
    if (detail) return;
    const id = runId;
    const t = setTimeout(() => setSlowFor(id), 3000);
    return () => clearTimeout(t);
  }, [runId, detail]);
  const slow = !detail && !runError && runId !== null && slowFor === runId;

  return (
    <Card className="gap-0 rounded-lg border-[#E4E7EC] py-0 shadow-none">
      {/* Panel header */}
      <div className="flex items-center gap-2 border-b border-[#E4E7EC] px-4 py-3.5">
        <div className="min-w-0 flex-1">
          <CardTitle className="text-sm font-semibold text-[#111827]">Run detail</CardTitle>
          {run ? (
            <p className="mt-0.5 truncate font-mono text-[11px] text-[#667085]">
              run {run.id.slice(0, 8)} · {MODE_LABEL[run.mode] ?? run.mode}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-[#667085]">Steps, tools &amp; findings for the selected run</p>
          )}
        </div>
        {run ? <RunStatusBadge status={run.status} /> : null}
        {runId ? (
          <button
            onClick={onShare}
            className={ICON_BTN}
            aria-label="Copy share link that reopens this conversation at this run"
            title="Copy share link (opens this conversation at this run)"
          >
            <Link2 className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>

      {/* Panel body */}
      <div className="px-4 py-4">
        {!runId ? (
          <p className="py-8 text-center text-[13px] text-[#667085]">
            No run selected — ask a question in the conversation or pick a recent run below.
          </p>
        ) : runError && !detail ? (
          <div className="flex items-start gap-2.5 rounded-md border border-[#FEE4E2] bg-white px-3 py-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#F04438]" aria-hidden />
            <p className="text-[13px] text-[#667085]">
              Run detail unavailable — the run may have expired after a demo data reset.
            </p>
          </div>
        ) : !detail ? (
          slow ? (
            <div className="flex items-start gap-2.5 rounded-md border border-[#FEE4E2] bg-white px-3 py-2.5">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#F04438]" aria-hidden />
              <p className="text-[13px] text-[#667085]">
                Run detail unavailable — the run may have expired after a demo data reset.
              </p>
            </div>
          ) : (
            <LoadingRows rows={3} />
          )
        ) : (
          <div className="space-y-5">
            {/* Investigation checklist */}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <p className="cine-label">Investigation</p>
                <span className="font-mono text-[11px] tabular-nums text-[#667085]">
                  {completedSteps}/{detail.steps.length} steps
                </span>
              </div>
              <StepStream steps={detail.steps} />
            </section>

            {/* Tool checklist */}
            <section className="border-t border-[#E4E7EC] pt-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="cine-label">Tools</p>
                <span className="font-mono text-[11px] tabular-nums text-[#667085]">
                  {detail.tools.filter((t) => t.status === "completed").length}/{detail.tools.length} used
                </span>
              </div>
              <ToolPanel tools={detail.tools} />
            </section>

            {/* Structured findings (render as the run progresses) */}
            {answer || confidence != null || run?.summary ? (
              <section className="space-y-4 border-t border-[#E4E7EC] pt-4">
                <p className="cine-label">Findings</p>

                {answer?.analysis ? (
                  <div>
                    <SectionLabel icon={Activity}>Finding</SectionLabel>
                    <p className="text-sm leading-relaxed text-[#344054]">{answer.analysis}</p>
                  </div>
                ) : null}

                {answer?.rootCause ? (
                  <div>
                    <SectionLabel icon={Crosshair}>Root cause</SectionLabel>
                    <p className="text-sm leading-relaxed text-[#111827]">{answer.rootCause}</p>
                  </div>
                ) : null}

                {confidence != null || answer?.risk ? (
                  <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
                    {confidence != null ? (
                      <div>
                        <SectionLabel icon={Gauge}>Confidence</SectionLabel>
                        <ConfidenceMeter value={confidence} />
                      </div>
                    ) : null}
                    {answer?.risk ? (
                      <div>
                        <SectionLabel icon={ShieldAlert}>Risk</SectionLabel>
                        <div className="flex flex-wrap items-center gap-2">
                          <RiskBadge risk={answer.risk} />
                          {answer.requiresApproval ? (
                            <span className="text-[11px] text-[#667085]">human approval required</span>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {answer?.evidenceItems?.length ? (
                  <div>
                    <SectionLabel icon={ListChecks}>Evidence</SectionLabel>
                    <dl className="divide-y divide-[#E4E7EC] overflow-hidden rounded-md border border-[#E4E7EC] bg-white">
                      {answer.evidenceItems.map((ev, i) => (
                        <div key={i} className="grid grid-cols-1 gap-x-3 gap-y-0.5 px-3 py-2 sm:grid-cols-[118px_1fr]">
                          <dt className="text-[13px] font-medium text-[#344054]">{ev.label}</dt>
                          <dd className="min-w-0">
                            <span className="font-mono text-[13px] text-[#111827]">{ev.value}</span>
                            <span className="ml-2 font-mono text-[11px] text-[#667085]">{ev.source}</span>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ) : null}

                {rec || answer?.actionLabel ? (
                  <div className="rounded-lg border border-[#ABEFC6] bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="cine-label">Recommendation</p>
                      {rec ? <RecStatusBadge status={rec.status} /> : null}
                    </div>
                    <p className="mt-2 text-sm font-medium leading-relaxed text-[#111827]">
                      {rec?.actionLabel ?? answer?.actionLabel}
                    </p>
                    {rec?.problem ? (
                      <p className="mt-1 text-[13px] leading-relaxed text-[#667085]">{rec.problem}</p>
                    ) : null}
                    {rec ? (
                      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2.5">
                        <RiskBadge risk={rec.risk} />
                        <ConfidenceMeter value={rec.confidence} />
                      </div>
                    ) : null}
                    {rec?.status === "PENDING" ? (
                      <p className="mt-3 text-xs text-[#667085]">
                        The agent is paused — approve or reject this action in the conversation.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {answer?.verification ? (
                  <div className={cn(
                    "rounded-lg border bg-white p-4",
                    passed ? "border-[#ABEFC6]" : "border-[#FEDF89]"
                  )}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="cine-label">Verification</p>
                      <Badge variant="outline" className={cn(
                        "gap-1.5 text-[11px] font-medium",
                        passed ? "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]" : "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]"
                      )}>
                        {passed ? <Check className="size-3" aria-hidden /> : <AlertTriangle className="size-3" aria-hidden />}
                        {passed ? "Recovery verified" : "Not yet recovered"}
                      </Badge>
                    </div>
                    <div className="mt-3 overflow-hidden rounded-md border border-[#E4E7EC]">
                      <table className="w-full text-[13px]">
                        <tbody>
                          {answer.verification.checks.map((c, i) => (
                            <tr key={i} className="border-b border-[#E4E7EC] last:border-0">
                              <td className="px-3 py-1.5 font-medium text-[#111827]">{c.label}</td>
                              <td className="px-3 py-1.5 font-mono text-[#475467]">
                                {c.before} → <span className="text-[#111827]">{c.after}</span>
                              </td>
                              <td className="hidden px-3 py-1.5 font-mono text-[11px] text-[#667085] sm:table-cell">
                                target {c.threshold}
                              </td>
                              <td className="px-3 py-1.5 text-right">
                                {c.passed ? <Check className="inline size-3.5 text-[#12B76A]" aria-label="pass" /> : <AlertTriangle className="inline size-3.5 text-[#F79009]" aria-label="fail" />}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {answer.verification.summary ? (
                      <p className="mt-2 text-xs text-[#667085]">{answer.verification.summary}</p>
                    ) : null}
                  </div>
                ) : null}

                {/* Plain summary (status / free-form runs) */}
                {!answer && run?.summary ? (
                  <div>
                    <SectionLabel icon={FileText}>Response</SectionLabel>
                    <p className="text-sm leading-relaxed text-[#344054]">{run.summary}</p>
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Recent runs (right column)
// ---------------------------------------------------------------------------

// Copy a deep link that reopens the conversation at a given run
// (#/agent?run=… — restores the transcript even in a fresh browser).
async function copyRunShareLink(runId: string) {
  const url = `${window.location.origin}/#/agent?run=${runId}`;
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Share link copied", {
      description: "Opening it restores this conversation at that run.",
    });
  } catch {
    toast.error("Could not copy — clipboard unavailable in this context");
  }
}

function RecentRuns({ activeRunId, onSelect }: { activeRunId: string | null; onSelect: (id: string) => void }) {
  const { data: runs } = useApi(() => api.agentRuns(), { intervalMs: 6000 });
  if (!runs?.length) return <p className="px-1 py-2 text-xs text-[#667085]">No runs yet in this session.</p>;
  return (
    <div className="space-y-1.5">
      {runs.slice(0, 6).map((r) => (
        <div
          key={r.id}
          className={cn(
            "flex items-center gap-1 rounded-md border pr-1.5 transition-colors",
            r.id === activeRunId ? "border-[#B2DDFF] bg-[#EFF8FF]" : "border-[#E4E7EC] bg-white hover:border-[#98A2B3]"
          )}
        >
          <button
            onClick={() => onSelect(r.id)}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md py-2 pl-3 pr-1 text-left"
            aria-label={`Open run: ${r.query}`}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-[#111827]">{r.query}</p>
              <p className="mt-0.5 font-mono text-[11px] text-[#667085]">
                {MODE_LABEL[r.mode] ?? r.mode} · {timeAgo(r.createdAt)}
              </p>
            </div>
            <RunStatusBadge status={r.status} />
          </button>
          <button
            onClick={() => void copyRunShareLink(r.id)}
            className={ICON_BTN}
            aria-label={`Copy share link for run: ${r.query}`}
            title="Copy share link (opens this conversation at this run)"
          >
            <Link2 className="size-4" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function AgentView({ focusRunId }: { focusRunId?: string }) {
  const {
    chatEntries, autoQueryToken, consumeAutoQuery, addUserEntry, addRunEntry,
    setActiveRunId, activeRunId, clearChat,
  } = useCineFlowStore();
  const [input, setInput] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Live detail for the right-hand run-detail panel
  const { run: activeDetail, error: activeRunError } = useAgentRun(activeRunId, 900);
  const activeAwaiting = activeDetail?.run.status === "AWAITING_APPROVAL";

  // One recommendations poll serves the approval gate, the conversation
  // outcome notes and the run-detail findings (statuses stay fresh after
  // every human decision; tightened to 3s while an approval is pending).
  const { data: recs, refetch: refetchRecs } = useApi(() => api.recommendations(), {
    intervalMs: activeAwaiting ? 3000 : 10000,
  });
  const recByRun = useMemo(() => {
    const map = new Map<string, RecommendationDTO>();
    for (const r of recs ?? []) {
      if (r.agentRunId) map.set(r.agentRunId, r);
    }
    return map;
  }, [recs]);
  const activeRec = useMemo(
    () => (activeRunId ? recByRun.get(activeRunId) ?? null : null),
    [recByRun, activeRunId]
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);

  const submitQuery = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) return;
      addUserEntry(trimmed);
      try {
        const { runId } = await api.agentQuery(trimmed);
        addRunEntry(runId);
        setActiveRunId(runId);
        setSubmitError(null);
      } catch (e) {
        setSubmitError(e instanceof Error ? e.message : "Failed to start agent run");
        toast.error("Could not start the agent run");
      }
    },
    [addUserEntry, addRunEntry, setActiveRunId]
  );

  // Consume queries queued by other views (dashboard hero, shell Run Demo button).
  // Deferred to a macrotask so no state updates happen synchronously in the effect.
  useEffect(() => {
    const q = consumeAutoQuery();
    if (!q) return;
    const t = setTimeout(() => void submitQuery(q), 0);
    return () => clearTimeout(t);
  }, [autoQueryToken, consumeAutoQuery, submitQuery]);

  // Deep link: #/agent?run={id} opens that run's transcript + activity panels.
  // Reads the store imperatively inside the macrotask so the effect only depends
  // on focusRunId (no re-runs as the transcript grows).
  useEffect(() => {
    if (!focusRunId) return;
    const t = setTimeout(() => {
      const { chatEntries, addRunEntry, setActiveRunId } = useCineFlowStore.getState();
      const last = chatEntries[chatEntries.length - 1];
      if (!last || last.kind !== "run" || last.runId !== focusRunId) {
        addRunEntry(focusRunId);
      }
      setActiveRunId(focusRunId);
    }, 0);
    return () => clearTimeout(t);
  }, [focusRunId]);

  // Copy a deep link that reopens this conversation at the active run
  // (#/agent?run=… — restores the transcript even in a fresh browser).
  const shareActiveRun = async () => {
    if (activeRunId) await copyRunShareLink(activeRunId);
  };

  // Copy the WHOLE conversation as one Markdown document: every user query
  // plus the full run transcript (steps, tools, recommendation, verification)
  // for each run entry. The builder lives in shared/markdown-export (R13) so
  // the command palette composes the exact same document.
  const exportConversation = async () => {
    if (chatEntries.length === 0 || exporting) return;
    setExporting(true);
    try {
      const md = await buildConversationMarkdown(chatEntries);
      await navigator.clipboard.writeText(md);
      toast.success("Conversation copied as Markdown", {
        description: `${md.length.toLocaleString()} characters · ${chatEntries.filter((e) => e.kind === "run").length} run transcripts included.`,
      });
    } catch {
      toast.error("Could not copy — clipboard unavailable in this context");
    } finally {
      setExporting(false);
    }
  };

  // Auto-scroll the transcript as messages stream in
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const count = chatEntries.length;
    const lastRun = activeDetail?.run.status ?? "";
    if (count !== lastCountRef.current || lastRun) {
      el.scrollTo({ top: el.scrollHeight, behavior: count > lastCountRef.current ? "smooth" : "auto" });
      lastCountRef.current = count;
    }
  }, [chatEntries.length, activeDetail?.run.status]);

  const onSend = () => {
    if (!input.trim()) return;
    const q = input;
    setInput("");
    void submitQuery(q);
  };

  const selectRecentRun = (id: string) => {
    const last = chatEntries[chatEntries.length - 1];
    if (!last || last.kind !== "run" || last.runId !== id) {
      addRunEntry(id);
    }
    setActiveRunId(id);
  };

  // Header chip: live status while a run is in flight, "Ready" otherwise
  // (a just-submitted run reads as Investigating before the first poll).
  const headerStatus = activeDetail?.run.status ?? (activeRunId ? "RUNNING" : null);
  const runCount = chatEntries.filter((e) => e.kind === "run").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Production Agent"
        description="Ask about production health or incidents. The agent investigates with real tools, shows its reasoning, and pauses for human approval before any risky action."
        badge={<DemoTag label="Demo Environment" />}
        actions={<AgentStatusChip status={headerStatus} />}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* LEFT — conversation */}
        <Card className="flex min-h-[560px] flex-col gap-0 rounded-lg border-[#E4E7EC] py-0 shadow-none">
          <div className="flex flex-wrap items-center gap-2 border-b border-[#E4E7EC] px-4 py-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[#111827]">
              <Sparkles className="size-4 text-[#2563EB]" aria-hidden />
              Conversation
            </CardTitle>
            <span className="font-mono text-[11px] font-normal text-[#667085]">
              {runCount} {runCount === 1 ? "run" : "runs"}
            </span>
            {chatEntries.length > 0 ? (
              <span
                className="hidden items-center gap-1 rounded border border-[#E4E7EC] bg-[#F9FAFB] px-1.5 py-0.5 text-[11px] font-normal text-[#667085] sm:inline-flex"
                title="Transcript is saved in this browser and restored after reload"
              >
                <Archive className="size-3" aria-hidden />
                saved
              </span>
            ) : null}
            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={() => void exportConversation()}
                disabled={chatEntries.length === 0 || exporting}
                className={ICON_BTN}
                aria-label="Copy the whole conversation (every query and run transcript) as Markdown"
                title="Copy the whole conversation — every query plus each run's full transcript — as one Markdown document"
              >
                {exporting ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <MessagesSquare className="size-4" aria-hidden />
                )}
              </button>
              <button
                onClick={() => void shareActiveRun()}
                disabled={!activeRunId}
                className={ICON_BTN}
                aria-label="Copy a share link that reopens this conversation"
                title="Copy share link for the active run"
              >
                <Link2 className="size-4" aria-hidden />
              </button>
              <button
                onClick={clearChat}
                className={ICON_BTN_DANGER}
                aria-label="Clear conversation"
                title="Clear this conversation"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          </div>

          <CardContent className="flex flex-1 flex-col gap-4 p-4">
            {/* Transcript */}
            <div
              ref={scrollRef}
              className="cine-scroll min-h-[300px] flex-1 space-y-4 overflow-y-auto pr-1 lg:max-h-[calc(100vh-340px)]"
              role="log"
              aria-label="Agent conversation"
              aria-live="polite"
            >
              {chatEntries.length === 0 ? (
                <EmptyState
                  icon={MessagesSquare}
                  title="Ask the agent anything about production"
                  description="Try the canonical demo question below — the agent will investigate the render queue delay end-to-end."
                  action={
                    <div className="flex flex-wrap justify-center gap-2">
                      {SUGGESTED.slice(0, 1).map((q) => (
                        <Button
                          key={q}
                          size="sm"
                          onClick={() => void submitQuery(q)}
                          className="gap-1.5 bg-[#2563EB] font-medium text-white hover:bg-[#1D4ED8]"
                        >
                          <Play className="size-3.5" aria-hidden />
                          Run demo question
                        </Button>
                      ))}
                    </div>
                  }
                />
              ) : (
                chatEntries.map((entry, i) =>
                  entry.kind === "user" ? (
                    <div key={`u-${i}`} className="flex justify-end">
                      <div className="max-w-[85%] rounded-lg rounded-br-sm border border-[#E4E7EC] bg-[#F2F4F7] px-4 py-2.5">
                        <p className="text-sm leading-relaxed text-[#111827]">{entry.text}</p>
                        <p className="mt-1 text-right font-mono text-[11px] text-[#667085]">
                          You · {new Date(entry.at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <RunMessage
                      key={`r-${entry.runId}-${i}`}
                      runId={entry.runId ?? ""}
                      rec={recByRun.get(entry.runId ?? "") ?? null}
                      active={entry.runId === activeRunId}
                      onRecsChanged={refetchRecs}
                    />
                  )
                )
              )}
            </div>

            {/* Composer */}
            <div className="space-y-2.5 border-t border-[#E4E7EC] pt-4">
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED.map((q) => (
                  <button
                    key={q}
                    onClick={() => void submitQuery(q)}
                    className="rounded-full border border-[#E4E7EC] bg-white px-3 py-1.5 text-[13px] text-[#475467] transition-colors hover:border-[#98A2B3] hover:bg-[#F9FAFB] hover:text-[#344054] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                  >
                    {q.length > 46 ? `${q.slice(0, 46)}…` : q}
                  </button>
                ))}
              </div>
              <div className="flex items-end gap-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      onSend();
                    }
                  }}
                  placeholder="Why is the post-production render pipeline delayed?"
                  aria-label="Ask the agent"
                  rows={2}
                  className="min-h-[56px] min-w-0 flex-1 resize-none border-[#E4E7EC] bg-white text-sm"
                />
                <Button
                  onClick={onSend}
                  disabled={!input.trim()}
                  className="h-10 gap-1.5 bg-[#2563EB] font-medium text-white hover:bg-[#1D4ED8] disabled:bg-[#E4E7EC] disabled:text-[#98A2B3] disabled:hover:bg-[#E4E7EC]"
                  aria-label="Send message"
                >
                  <Send className="size-4" aria-hidden />
                  Send
                </Button>
              </div>
              {submitError ? (
                <p className="text-xs text-[#B42318]" role="alert">{submitError}</p>
              ) : (
                <p className="text-xs text-[#667085]">
                  Evidence-grounded answers only — the agent refuses to guess without data. Risky actions always require your approval.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* RIGHT — run detail + recent runs */}
        <div className="space-y-6" id="agent-run-detail">
          <RunDetailPanel
            runId={activeRunId}
            detail={activeDetail}
            runError={activeRunError}
            rec={activeRec}
            onShare={() => void shareActiveRun()}
          />

          <Card className="gap-0 rounded-lg border-[#E4E7EC] py-0 shadow-none">
            <div className="flex items-center gap-2 border-b border-[#E4E7EC] px-4 py-3.5">
              <History className="size-4 text-[#2563EB]" aria-hidden />
              <CardTitle className="text-sm font-semibold text-[#111827]">Recent runs</CardTitle>
            </div>
            <div className="cine-scroll max-h-80 overflow-y-auto p-3">
              <RecentRuns activeRunId={activeRunId} onSelect={selectRecentRun} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
