"use client";

// CineFlow AI — Incident detail view (#/incidents/{id}).
// Live view of a single incident: header with status/severity meta, the
// investigation CTA when no agent analysis exists yet, an evidence timeline
// (events stream in while the agent works), a pattern-match card surfacing the
// most similar resolved incident, root cause, the agent's recommendation with
// the human approval gate, executed action + verification checks, resolution
// note and the linked agent runs.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowLeft, ArrowRight, Bot, Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCopy,
  Columns2, Copy, Crosshair, Download, FileSearch, History, Info, Lightbulb, Loader2, Pause, Play, RotateCcw,
  SkipBack, SkipForward, Sparkles, UserCheck, Wrench, X, XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { navigate } from "@/components/app/router";
import { buildRunTranscriptMarkdown } from "@/components/app/shared/markdown-export";
import { useApi } from "@/hooks/use-api";
import { api, type IncidentDetailDTO } from "@/lib/client/api";
import { useCineFlowStore } from "@/lib/client/store";
import { fmtDateTime, fmtTime, timeAgo } from "@/lib/format";
import { DemoTag, IncidentStatusBadge, RiskBadge, SeverityBadge } from "@/components/app/shared/badges";
import { ConfidenceMeter, ErrorState, SectionHeader } from "@/components/app/shared/ui";
import { cn } from "@/lib/utils";
import type { IncidentDTO, RecommendationStatus, RunStatus } from "@/lib/types";

// ---------------------------------------------------------------------------
// Shared visual maps
// ---------------------------------------------------------------------------

const RUN_STATUS_MAP: Record<RunStatus, { label: string; cls: string }> = {
  RUNNING: { label: "Running", cls: "border-[#B2DDFF] bg-[#EFF8FF] text-[#175CD3]" },
  AWAITING_APPROVAL: { label: "Awaiting approval", cls: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]" },
  EXECUTING: { label: "Executing", cls: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]" },
  COMPLETED: { label: "Completed", cls: "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]" },
  REJECTED: { label: "Rejected", cls: "border-[#FEE4E2] bg-[#FEF3F2] text-[#B42318]" },
  FAILED: { label: "Failed", cls: "border-[#FEE4E2] bg-[#FEF3F2] text-[#B42318]" },
};

const REC_STATUS_MAP: Record<RecommendationStatus, { label: string; cls: string }> = {
  PENDING: { label: "Awaiting approval", cls: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]" },
  APPROVED: { label: "Approved", cls: "border-[#B2DDFF] bg-[#EFF8FF] text-[#175CD3]" },
  EXECUTED: { label: "Executed", cls: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]" },
  VERIFIED: { label: "Verified", cls: "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]" },
  REJECTED: { label: "Rejected", cls: "border-[#FEE4E2] bg-[#FEF3F2] text-[#B42318]" },
};

const EVENT_META: Record<string, { icon: LucideIcon; cls: string }> = {
  ANOMALY: { icon: AlertTriangle, cls: "border-[#FEE4E2] bg-[#FEF3F2] text-[#B42318]" },
  AGENT: { icon: Bot, cls: "border-[#B2DDFF] bg-[#EFF8FF] text-[#175CD3]" },
  EVIDENCE: { icon: FileSearch, cls: "border-[#B2DDFF] bg-[#EFF8FF] text-[#175CD3]" },
  ROOT_CAUSE: { icon: Crosshair, cls: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]" },
  RECOMMENDATION: { icon: Lightbulb, cls: "border-[#B2DDFF] bg-[#EFF8FF] text-[#175CD3]" },
  HUMAN: { icon: UserCheck, cls: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]" },
  ACTION: { icon: Wrench, cls: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]" },
  VERIFICATION: { icon: CheckCircle2, cls: "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]" },
  NOTE: { icon: Info, cls: "border-[#E4E7EC] bg-[#F2F4F7] text-[#475467]" },
};

const DEFAULT_EVENT_META: { icon: LucideIcon; cls: string } = {
  icon: Info,
  cls: "border-[#E4E7EC] bg-[#F2F4F7] text-[#475467]",
};

function RunStatusBadge({ status }: { status: RunStatus }) {
  const m = RUN_STATUS_MAP[status] ?? { label: status, cls: "border-[#E4E7EC] bg-[#F2F4F7] text-[#475467]" };
  return <Badge variant="outline" className={cn("font-medium", m.cls)}>{m.label}</Badge>;
}

function RecStatusBadge({ status }: { status: RecommendationStatus }) {
  const m = REC_STATUS_MAP[status] ?? { label: status, cls: "border-[#E4E7EC] bg-[#F2F4F7] text-[#475467]" };
  return <Badge variant="outline" className={cn("font-medium", m.cls)}>{m.label}</Badge>;
}

/** One agent-run row in the incident's Agent Runs card (R13). The main area
 *  deep-links to the console at that exact run (#/agent?run=…); a separate
 *  icon button copies the run's full Markdown transcript — mirroring the
 *  console's per-run export, composed by the same shared builder. Fetches the
 *  run detail + recommendations fresh so the export reflects the CURRENT
 *  state (a mid-investigation copy honestly reads as such). */
function AgentRunRow({ run }: { run: IncidentDetailDTO["runs"][number] }) {
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyTranscript = async () => {
    if (copying) return;
    setCopying(true);
    try {
      const detail = await api.agentRun(run.id);
      const recs = await api.recommendations();
      const rec = recs.find((r) => r.agentRunId === run.id) ?? null;
      const md = buildRunTranscriptMarkdown(detail, rec);
      await navigator.clipboard.writeText(md);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
      toast.success("Run transcript copied as Markdown", {
        description: `${md.length.toLocaleString()} characters · steps, tools, recommendation & verification included.`,
      });
    } catch (e) {
      const expired = e instanceof Error && /404|not found/i.test(e.message);
      toast.error(
        expired ? "Run no longer stored — the demo data was reset" : "Could not copy the transcript",
        { description: expired ? undefined : e instanceof Error ? e.message : undefined },
      );
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="group flex items-stretch gap-0 rounded-md border border-[#E4E7EC] bg-white transition-colors hover:bg-[#F9FAFB] focus-within:border-[#98A2B3]">
      <button
        onClick={() => navigate(`/agent?run=${run.id}`)}
        aria-label={`Open this exact run in the agent console: ${run.query}`}
        className="min-w-0 flex-1 rounded-l-md px-3 py-2.5 text-left focus-visible:outline-none"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[13px] font-medium text-[#111827]">{run.query}</p>
          <span className="flex shrink-0 items-center gap-1 font-mono text-[11px] tabular-nums text-[#667085]">
            {timeAgo(run.createdAt)}
            <ChevronRight className="size-3 text-[#175CD3] opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100 group-focus-within:opacity-100" aria-hidden />
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <RunStatusBadge status={run.status} />
          {run.confidence != null ? (
            <span className="font-mono text-[11px] text-[#667085]">
              {run.confidence}% confidence
            </span>
          ) : null}
        </div>
      </button>
      <button
        onClick={() => void copyTranscript()}
        disabled={copying}
        className={cn(
          "flex w-9 shrink-0 items-center justify-center rounded-r-md border-l border-[#E4E7EC] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/60 disabled:opacity-50",
          copied
            ? "text-[#12B76A]"
            : "text-[#667085] hover:bg-[#F2F4F7] hover:text-[#175CD3]",
        )}
        aria-label={copying ? "Copying transcript…" : copied ? "Transcript copied" : `Copy this run's full transcript as Markdown: ${run.query}`}
        title="Copy transcript as Markdown (steps, tools, recommendation, verification)"
      >
        {copying ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : copied ? (
          <Check className="size-3.5" aria-hidden />
        ) : (
          <ClipboardCopy className="size-3.5" aria-hidden />
        )}
      </button>
    </div>
  );
}

/** Breadcrumb back to the incidents list — “Incidents / {id}”. Replaces the
 *  old bare back-button so the detail page reads as a nested route. */
function DetailBreadcrumb({ incidentId }: { incidentId?: string }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex items-center gap-1.5 text-[13px]">
        <li>
          <button
            type="button"
            onClick={() => navigate("/incidents")}
            className="flex items-center gap-1.5 rounded-sm text-[#667085] transition-colors hover:text-[#111827]"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Incidents
          </button>
        </li>
        {incidentId ? (
          <>
            <li className="text-[#D0D5DD]" aria-hidden>
              <ChevronRight className="size-3.5" aria-hidden />
            </li>
            <li aria-current="page" className="font-mono font-medium text-[#175CD3]">
              {incidentId}
            </li>
          </>
        ) : null}
      </ol>
    </nav>
  );
}

function MetaItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="cine-label mb-1.5">{label}</p>
      <p className={cn("truncate text-sm text-[#111827]", mono && "font-mono text-[13px] text-[#475467]")}>{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Postmortem export — build a shareable Markdown document from the incident,
// its event timeline, recommendation and verification results. Pure function:
// everything it renders is real data already shown on this page.
// ---------------------------------------------------------------------------

function fmtMdDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

function mdEscape(text: string): string {
  // Keep inline markdown-safe: collapse newlines to spaces and escape pipes
  // so timeline details don't break table rows.
  return text.replace(/\r?\n+/g, " ").replace(/\|/g, "\\|").trim();
}

// Exported for the command palette's "copy postmortem" action (the palette
// composes the same honest document from the same API data).
export function buildPostmortemMarkdown(
  incident: IncidentDetailDTO,
  events: IncidentDetailDTO["events"],
): string {
  const lines: string[] = [];
  const rec = incident.recommendations[0] ?? null;
  const resolved = incident.status === "RESOLVED";

  lines.push(`# ${incident.id} — ${mdEscape(incident.title)}`);
  lines.push("");
  lines.push(
    `> Postmortem generated by **CineFlow AI** (demo environment) · ${fmtMdDateTime(new Date().toISOString())}`,
  );
  if (!resolved) {
    lines.push(">");
    lines.push(
      `> ⚠️ **Draft postmortem** — incident status is **${incident.status}**. Pending sections below are marked *(pending)* and will be filled as the agent works and the incident closes.`,
    );
  }
  lines.push("");

  // Meta block
  lines.push(`- **Status:** ${incident.status}`);
  lines.push(`- **Severity:** ${incident.severity}`);
  lines.push(`- **Service:** ${mdEscape(incident.service)}`);
  lines.push(`- **Workflow:** ${incident.workflowKey ?? "—"}`);
  lines.push(`- **Detected:** ${fmtMdDateTime(incident.detectedAt)}`);
  if (incident.resolvedAt) lines.push(`- **Resolved:** ${fmtMdDateTime(incident.resolvedAt)}`);
  if (incident.agentConfidence != null) lines.push(`- **Agent confidence:** ${incident.agentConfidence}%`);
  lines.push("");

  // Summary
  lines.push("## Summary");
  lines.push("");
  lines.push(mdEscape(incident.description));
  lines.push("");

  // Root cause & analysis
  lines.push("## Root cause");
  lines.push("");
  lines.push(incident.rootCause ? mdEscape(incident.rootCause) : "_Pending investigation — no root cause recorded yet._");
  lines.push("");
  if (rec?.analysis) {
    lines.push("**Agent analysis:** " + mdEscape(rec.analysis));
    lines.push("");
  }

  // Recommendation
  if (rec) {
    lines.push("## Agent recommendation");
    lines.push("");
    lines.push(`**${mdEscape(rec.title)}** — ${mdEscape(rec.actionLabel)} (risk: ${rec.risk}, status: ${rec.status}, confidence: ${rec.confidence}%)`);
    lines.push("");
    if (rec.problem) {
      lines.push(mdEscape(rec.problem));
      lines.push("");
    }
    if (rec.evidence.length > 0) {
      lines.push("**Evidence:**");
      lines.push("");
      for (const e of rec.evidence) {
        lines.push(`- ${mdEscape(e.label)}: ${mdEscape(e.value)} _(${mdEscape(e.source)})_`);
      }
      lines.push("");
    }
    if (rec.decidedAt) lines.push(`- Decided (human gate): ${fmtMdDateTime(rec.decidedAt)}`);
    if (rec.executedAt) lines.push(`- Executed: ${fmtMdDateTime(rec.executedAt)}`);
    if (rec.verifiedAt) lines.push(`- Verified: ${fmtMdDateTime(rec.verifiedAt)}`);
    lines.push("");
  }

  // Verification checks
  if (rec?.verification) {
    lines.push("## Verification");
    lines.push("");
    lines.push(rec.verification.summary ? mdEscape(rec.verification.summary) : "");
    lines.push("");
    lines.push("| Check | Before | After | Threshold | Pass |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const c of rec.verification.checks) {
      lines.push(
        `| ${mdEscape(c.label)} | ${mdEscape(c.before)} | ${mdEscape(c.after)} | ${mdEscape(c.threshold)} | ${c.passed ? "✅ pass" : "❌ fail"} |`,
      );
    }
    lines.push("");
  }

  // Resolution
  if (resolved) {
    lines.push("## Resolution");
    lines.push("");
    lines.push(incident.resolutionNote ? mdEscape(incident.resolutionNote) : "_Resolved without a resolution note._");
    lines.push("");
  } else {
    lines.push("## Resolution *(pending)*");
    lines.push("");
    lines.push(
      "_Incident not yet resolved — the resolution note will appear here once remediation is verified and the incident closes._",
    );
    lines.push("");
  }

  // Pending items checklist (draft postmortems only — each item only listed
  // when genuinely missing, so the checklist reflects real progress).
  if (!resolved) {
    const pending: string[] = [];
    if (!incident.rootCause && !rec?.rootCause) pending.push("Root cause — not yet established");
    if (!rec) pending.push("Agent recommendation — no investigation has produced one yet");
    else if (rec.status === "PENDING") pending.push("Human approval — recommendation awaits a decision");
    else if (!rec.executedAt) pending.push("Remediation execution — approved but not executed");
    if (!rec?.verification) pending.push("Verification — recovery not yet verified");
    pending.push("Resolution — incident is still open");
    lines.push("## Pending items");
    lines.push("");
    for (const p of pending) lines.push(`- [ ] ${p}`);
    lines.push("");
  }

  // Timeline
  lines.push(`## Timeline (${events.length} events)`);
  lines.push("");
  if (events.length > 0) {
    lines.push("| Time | Event | Detail |");
    lines.push("| --- | --- | --- |");
    for (const ev of events) {
      lines.push(
        `| ${fmtMdDateTime(ev.ts)} | ${ev.kind === "NOTE" ? "" : "**"}${mdEscape(ev.label)}${ev.kind === "NOTE" ? "" : "**"} | ${ev.detail ? mdEscape(ev.detail) : "—"} |`,
      );
    }
  } else {
    lines.push("_No events recorded._");
  }
  lines.push("");

  // Linked agent runs
  if (incident.runs.length > 0) {
    lines.push("## Agent runs");
    lines.push("");
    for (const run of incident.runs) {
      const conf = run.confidence != null ? ` · ${run.confidence}% confidence` : "";
      lines.push(`- ${fmtMdDateTime(run.createdAt)} · **${run.status}**${conf} — "${mdEscape(run.query)}"`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push(
    "_Deterministic demo data — CineFlow AI, Agentic Cinema hackathon. Generated by the incident postmortem exporter._",
  );
  return lines.join("\n");
}

function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Pattern match — similar resolved incident (client-side similarity scoring)
// ---------------------------------------------------------------------------

/** Minimum normalized score for the pattern-match card to appear. */
const PATTERN_MATCH_MIN_SCORE = 55;

/**
 * Generic English glue words — tokens that carry no incident signal. Root-cause
 * text is tokenized (lowercased, punctuation stripped, numbers/short tokens
 * dropped); the surviving "meaningful" tokens drive the shared-signal score.
 */
const SIGNAL_STOPWORDS = new Set([
  "about", "above", "across", "after", "against", "all", "also", "and", "any",
  "are", "been", "before", "below", "between", "both", "but", "due", "during",
  "each", "for", "from", "had", "has", "have", "into", "just", "latest",
  "more", "most", "not", "onto", "only", "other", "over", "own", "per", "same",
  "some", "such", "than", "the", "their", "them", "then", "there", "these",
  "this", "those", "through", "under", "until", "upon", "via", "very", "was",
  "were", "when", "where", "which", "while", "with", "within", "without",
  "following",
]);

interface PatternMatch {
  /** The matched (RESOLVED) incident from the pool. */
  incident: IncidentDTO;
  /** Normalized similarity score, 0–99. */
  score: number;
  /** Meaningful root-cause tokens shared with the current incident. */
  sharedTokens: string[];
  sameWorkflow: boolean;
  sameService: boolean;
  sameSeverity: boolean;
}

function tokenizeSignals(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !SIGNAL_STOPWORDS.has(t));
}

/** Meaningful tokens present in both texts (order preserved from `a`). */
function sharedSignals(a: string, b: string): string[] {
  const bTokens = new Set(tokenizeSignals(b));
  const seen = new Set<string>();
  const shared: string[] = [];
  for (const token of tokenizeSignals(a)) {
    if (bTokens.has(token) && !seen.has(token)) {
      seen.add(token);
      shared.push(token);
    }
  }
  return shared;
}

/**
 * Find the most similar RESOLVED incident (different from `current`) in the
 * pool. Score: same workflow +40 · same service +20 · shared root-cause
 * signals +5 each (capped at +30) · same severity +5. Normalized to 0–99;
 * ties prefer the more recent incident. Returns null below the threshold —
 * the caller then renders nothing.
 */
function findPatternMatch(current: IncidentDTO, pool: IncidentDTO[]): PatternMatch | null {
  let best: PatternMatch | null = null;
  for (const candidate of pool) {
    if (candidate.id === current.id || candidate.status !== "RESOLVED") continue;
    const sameWorkflow =
      current.workflowKey != null && candidate.workflowKey === current.workflowKey;
    const sameService = candidate.service === current.service;
    const sameSeverity = candidate.severity === current.severity;
    const sharedTokens =
      current.rootCause != null && candidate.rootCause != null
        ? sharedSignals(current.rootCause, candidate.rootCause)
        : [];

    let score = 0;
    if (sameWorkflow) score += 40;
    if (sameService) score += 20;
    score += Math.min(30, sharedTokens.length * 5);
    if (sameSeverity) score += 5;
    const normalized = Math.min(99, score);
    if (normalized < PATTERN_MATCH_MIN_SCORE) continue;

    if (
      best == null ||
      normalized > best.score ||
      (normalized === best.score &&
        new Date(candidate.detectedAt).getTime() > new Date(best.incident.detectedAt).getTime())
    ) {
      best = {
        incident: candidate, score: normalized, sharedTokens,
        sameWorkflow, sameService, sameSeverity,
      };
    }
  }
  return best;
}

/** Compact duration ("42m" / "3.5h") for detected→resolved spans. */
function fmtResolvedDuration(ms: number): string {
  const minutes = ms / 60_000;
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))}m`;
  return `${(minutes / 60).toFixed(1)}h`;
}

// ---------------------------------------------------------------------------
// Agentic loop progress strip — where this incident sits right now in the
// understand → collect → analyze → root-cause → recommend → approval-gated
// action → verify → resolve loop. Every stage is derived live from the event
// timeline / incident / recommendation fields already rendered on this page
// (no guesses): the strip updates as the agent works.
// ---------------------------------------------------------------------------

const LOOP_STEPS: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "detected", label: "Detected", icon: AlertTriangle },
  { key: "triaged", label: "Triaged", icon: Info },
  { key: "investigating", label: "Investigating", icon: Bot },
  { key: "rootCause", label: "Root cause", icon: Crosshair },
  { key: "recommended", label: "Recommended", icon: Lightbulb },
  { key: "approved", label: "Human-approved", icon: UserCheck },
  { key: "acted", label: "Remediated", icon: Wrench },
  { key: "verified", label: "Verified", icon: CheckCircle2 },
  { key: "resolved", label: "Resolved", icon: Check },
];

/** Event kind that evidences each loop stage — powers click-to-jump. */
const STAGE_EVENT_KIND: Record<string, string> = {
  detected: "ANOMALY",
  triaged: "NOTE",
  investigating: "AGENT",
  rootCause: "ROOT_CAUSE",
  recommended: "RECOMMENDATION",
  acted: "ACTION",
  verified: "VERIFICATION",
};

/** Index (0-based) of the timeline event evidencing a loop stage, or -1. */
function findStageEventIndex(events: IncidentDetailDTO["events"], stage: string): number {
  if (stage === "approved") {
    return events.findIndex((e) => e.kind === "HUMAN" && /granted|approved/i.test(e.label));
  }
  if (stage === "resolved") {
    // The closing VERIFICATION event ("Incident resolved") — else the last event.
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].kind === "VERIFICATION") return i;
    }
    return events.length - 1;
  }
  const kind = STAGE_EVENT_KIND[stage];
  return kind ? events.findIndex((e) => e.kind === kind) : -1;
}

function deriveLoopState(
  incident: IncidentDetailDTO,
  events: IncidentDetailDTO["events"],
): Record<string, boolean> {
  const rec = incident.recommendations[0] ?? null;
  const has = (kind: string) => events.some((e) => e.kind === kind);
  const humanApproved =
    events.some((e) => e.kind === "HUMAN" && /granted|approved/i.test(e.label)) ||
    (rec != null && ["APPROVED", "EXECUTED", "VERIFIED"].includes(rec.status));
  return {
    detected: has("ANOMALY") || events.length > 0,
    triaged: has("NOTE") || has("AGENT"),
    investigating: has("AGENT") || incident.runs.length > 0,
    rootCause: has("ROOT_CAUSE") || incident.rootCause != null || rec?.rootCause != null,
    recommended: has("RECOMMENDATION") || rec != null,
    approved: humanApproved,
    acted: has("ACTION") || rec?.executedAt != null,
    verified: has("VERIFICATION") || rec?.verifiedAt != null,
    resolved: incident.status === "RESOLVED",
  };
}

function LoopProgressCard({
  incident,
  events,
  onJump,
}: {
  incident: IncidentDetailDTO;
  events: IncidentDetailDTO["events"];
  onJump: (stage: string) => void;
}) {
  const state = deriveLoopState(incident, events);
  const doneCount = LOOP_STEPS.filter((s) => state[s.key]).length;
  // While the incident is open, the first not-yet-done stage is the current one.
  const activeKey = incident.status === "RESOLVED"
    ? null
    : LOOP_STEPS.find((s) => !state[s.key])?.key ?? null;

  // R13: motion cue on live stage transitions. A ref snapshots the last-seen
  // loop state; a deferred-macrotask effect (the established pattern for the
  // set-state-in-effect lint rule) diffs it against the current state and
  // accumulates pop sets. The animation classes PERSIST on the pill for its
  // lifetime (removing a class mid-animation would cut it off) — each stage
  // transitions to done / current at most once, so each class is applied at
  // most once per element and plays exactly once. Snapshots start null → no
  // animation on mount for already-historical incidents.
  const lastLoopRef = useRef<{ done: Record<string, boolean>; active: string | null; resolved: boolean } | null>(null);
  const [donePopKeys, setDonePopKeys] = useState<string[]>([]);
  const [currentPopKey, setCurrentPopKey] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const last = lastLoopRef.current;
      const resolved = incident.status === "RESOLVED";
      if (last && !last.resolved) {
        // Stages that flipped to done since the last snapshot (live only).
        const newDone = LOOP_STEPS
          .filter((s) => state[s.key] && !last.done[s.key])
          .map((s) => s.key);
        if (newDone.length > 0) setDonePopKeys((p) => [...p, ...newDone]);
        // The stage that just became current (moved forward, still not done).
        if (activeKey !== null && activeKey !== last.active) setCurrentPopKey(activeKey);
      }
      lastLoopRef.current = { done: state, active: activeKey, resolved };
    }, 0);
    return () => clearTimeout(t);
  }, [state, activeKey, incident.status]);

  return (
    <Card className="rounded-lg border-[#E4E7EC] bg-card shadow-none">
      {/* Announced when the strip completes live (polite; silent on mount) */}
      <p className="sr-only" aria-live="polite">
        {incident.status === "RESOLVED" ?
          `All ${LOOP_STEPS.length} agentic loop stages complete — incident resolved.` : ""}
      </p>
      <CardContent className="p-4 sm:p-5">
        <SectionHeader
          title="Agentic loop progress"
          subtitle="Understand → analyze → recommend → approve → act → verify → resolve."
          actions={
            <span
              className="rounded-md border border-[#E4E7EC] bg-[#F9FAFB] px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums text-[#667085]"
              aria-label={`${doneCount} of ${LOOP_STEPS.length} loop stages complete`}
            >
              {doneCount}/{LOOP_STEPS.length} stages
            </span>
          }
          className="border-b border-[#E4E7EC] pb-3"
        />
        <ol
          className="mt-4 flex flex-wrap items-center gap-1.5"
          aria-label="Incident progress through the agentic loop"
        >
          {LOOP_STEPS.map((s) => {
            const done = state[s.key];
            const active = activeKey === s.key;
            const Icon = s.icon;
            // Completed stages jump to their evidencing timeline event (replay
            // mode). Stages derived only from incident/recommendation fields
            // (no matching event) stay non-interactive — honest, never a dead
            // button.
            const jumpIdx = done ? findStageEventIndex(events, s.key) : -1;
            const jumpable = jumpIdx >= 0;
            const label = (
              <>
                {done ? (
                  <Check className="size-3 shrink-0" aria-hidden />
                ) : active ? (
                  <span className="cine-pulse size-1.5 shrink-0 rounded-full bg-current" aria-hidden />
                ) : (
                  <Icon className="size-3 shrink-0" aria-hidden />
                )}
                {s.label}
                <span className="sr-only">{done ? "(done)" : active ? "(current stage)" : "(pending)"}</span>
              </>
            );
            const pillCls = cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
              done
                ? "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]"
                : active
                  ? "border-[#B2DDFF] bg-[#EFF8FF] text-[#175CD3]"
                  : "border-[#E4E7EC] bg-[#F2F4F7] text-[#667085]",
              jumpable && "cursor-pointer hover:border-[#ABEFC6] hover:bg-[#ECFDF3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/60",
              // Live-transition motion cues (R13) — classes persist so the
              // one-shot animation plays to completion (see comment above).
              donePopKeys.includes(s.key) && done && "cine-stage-pop",
              currentPopKey === s.key && active && "cine-stage-current",
            );
            return (
              <li key={s.key}>
                {jumpable ? (
                  <button
                    type="button"
                    onClick={() => onJump(s.key)}
                    className={pillCls}
                    title={`${s.label} — done. Jump to event ${jumpIdx + 1} of ${events.length} in the timeline`}
                    aria-label={`${s.label} stage done — jump to its timeline event`}
                  >
                    {label}
                  </button>
                ) : (
                  <span
                    className={pillCls}
                    title={
                      done
                        ? `${s.label} — done (derived from incident data; no matching timeline event)`
                        : active ? `${s.label} — current stage` : `${s.label} — pending`
                    }
                  >
                    {label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        <p className="mt-3.5 text-[13px] leading-relaxed text-[#667085]">
          {incident.status === "RESOLVED"
            ? "Incident closed — every loop stage completed, including the human approval gate and verified recovery. Click a stage to jump to its timeline event."
            : "Stages fill in live as the agent investigates, pauses for approval, acts and verifies. Click a completed stage to jump to its event."}
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Pattern-match card
// ---------------------------------------------------------------------------

function PatternMatchCard({ match, currentId }: { match: PatternMatch; currentId: string }) {
  const inc = match.incident;
  const open = () => navigate(`/incidents/${inc.id}`);
  const resolvedMs = inc.resolvedAt
    ? Math.max(0, new Date(inc.resolvedAt).getTime() - new Date(inc.detectedAt).getTime())
    : null;

  const signals = match.sharedTokens.slice(0, 4);
  const extraSignals = match.sharedTokens.length - signals.length;
  const whyChips: { label: string; accent: boolean }[] = [];
  if (match.sameWorkflow && inc.workflowKey) {
    whyChips.push({ label: `Same workflow · ${inc.workflowKey}`, accent: true });
  }
  if (match.sameService) whyChips.push({ label: `Same service · ${inc.service}`, accent: false });
  if (signals.length > 0) {
    whyChips.push({
      label: `Shared signals · ${signals.join(", ")}${extraSignals > 0 ? ` +${extraSignals}` : ""}`,
      accent: false,
    });
  }
  if (match.sameSeverity) whyChips.push({ label: `Same severity · ${inc.severity}`, accent: false });

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter") open();
      }}
      aria-label={`Open similar incident ${inc.id}: ${inc.title} — ${match.score}% match`}
      className="cine-card-hover cursor-pointer rounded-lg border-[#E4E7EC] bg-card shadow-none focus-visible:border-[#B2DDFF] focus-visible:outline-none"
    >
      <CardContent className="p-4 sm:p-5">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-[#B2DDFF] bg-[#EFF8FF]">
              <History className="size-4 text-[#2563EB]" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight text-[#111827]">Pattern match</h2>
              <p className="mt-0.5 text-[13px] text-[#667085]">Similar resolved incident</p>
            </div>
          </div>
          <span className="shrink-0 rounded-md border border-[#B2DDFF] bg-[#EFF8FF] px-2 py-0.5 font-mono text-[11px] font-medium text-[#175CD3]">
            {match.score}% match
          </span>
        </div>

        {/* Matched incident */}
        <div className="mt-3.5 min-w-0 rounded-lg border border-[#E4E7EC] bg-[#F9FAFB] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-[#E4E7EC] bg-white px-2 py-0.5 font-mono text-[12px] text-[#667085]">
              {inc.id}
            </span>
            <SeverityBadge severity={inc.severity} />
            <IncidentStatusBadge status={inc.status} />
          </div>
          <p className="mt-2 break-words text-sm font-medium leading-snug text-[#111827]">{inc.title}</p>
          <p className="mt-1.5 text-[13px] text-[#667085]">
            Detected {timeAgo(inc.detectedAt)}
            {resolvedMs != null ? ` · Resolved in ${fmtResolvedDuration(resolvedMs)}` : null}
          </p>
          {inc.rootCause ? (
            <p className="mt-2.5 line-clamp-3 break-words text-[13px] leading-relaxed text-[#667085]">
              {inc.rootCause}
            </p>
          ) : null}
          {inc.resolutionNote ? (
            <div className="mt-2.5 min-w-0">
              <p className="cine-label mb-1">Last resolution</p>
              <p className="truncate text-[13px] text-[#667085]">{inc.resolutionNote}</p>
            </div>
          ) : null}
        </div>

        {/* Why matched */}
        {whyChips.length > 0 ? (
          <div className="mt-3.5">
            <p className="cine-label mb-2">Why matched</p>
            <ul className="flex flex-wrap gap-1.5">
              {whyChips.map((chip) => (
                <li
                  key={chip.label}
                  className={cn(
                    "rounded-md border px-2 py-0.5 text-[11px]",
                    chip.accent
                      ? "border-[#B2DDFF] bg-[#EFF8FF] text-[#175CD3]"
                      : "border-[#E4E7EC] bg-[#F2F4F7] text-[#475467]"
                  )}
                >
                  {chip.label}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Click affordances — Compare navigates to the side-by-side view;
            stopPropagation keeps the whole-card click target out of the way. */}
        <div className="mt-3 flex items-center justify-end gap-3 text-[13px] text-[#175CD3]">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/compare/${currentId}/${inc.id}`);
            }}
            onKeyDown={(e) => {
              // Keep Enter/Space from also triggering the card's own handler.
              if (e.key === "Enter" || e.key === " ") e.stopPropagation();
            }}
            className="flex items-center gap-1 hover:underline"
            aria-label={`Compare ${currentId} with ${inc.id}`}
          >
            <Columns2 className="size-3" aria-hidden />
            Compare
          </button>
          <span className="flex items-center gap-1">
            View incident
            <ArrowRight className="size-3" aria-hidden />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// View entry — remounts per incident id so polling state resets cleanly
// ---------------------------------------------------------------------------

export interface IncidentDetailViewProps {
  incidentId: string;
}

export function IncidentDetailView({ incidentId }: IncidentDetailViewProps) {
  if (!incidentId) {
    return (
      <div className="space-y-4">
        <DetailBreadcrumb />
        <ErrorState message="No incident ID provided in the URL. Open an incident from the incidents list." />
      </div>
    );
  }
  return <IncidentDetailContent key={incidentId} incidentId={incidentId} />;
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

function Timeline({
  events,
  live,
  jumpTarget,
}: {
  events: IncidentDetailDTO["events"];
  live: boolean;
  jumpTarget: { stage: string; nonce: number } | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCount = useRef(0);
  // Replay/scrubber state — step through the incident story event by event.
  const [replay, setReplay] = useState(false);
  const [pos, setPos] = useState(1); // 1-based count of visible events
  const [playing, setPlaying] = useState(false);

  const total = events.length;
  const visible = replay ? events.slice(0, Math.min(pos, total)) : events;
  const activeId = replay && visible.length > 0 ? visible[visible.length - 1].id : undefined;

  // Loop-strip click-to-jump: enter replay mode positioned at the event that
  // evidences the clicked stage. The nonce re-fires for repeat clicks of the
  // same stage; the replay-pos effect below scrolls the event into view.
  // State changes are deferred to a macrotask (no setState directly in the
  // effect body — the codebase's established pattern).
  useEffect(() => {
    if (!jumpTarget) return;
    const idx = findStageEventIndex(events, jumpTarget.stage);
    if (idx < 0) return;
    const t = setTimeout(() => {
      // Reveal the timeline card if it sits below the fold (page-level scroll,
      // "nearest" = no-op when already visible); the internal replay-pos
      // effect then brings the jumped-to event into view inside the card.
      scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      setReplay(true);
      setPos(idx + 1);
      setPlaying(false);
    }, 0);
    return () => clearTimeout(t);
  }, [jumpTarget]);

  // Keep the newest events in view as the agent streams them in (live mode only).
  useEffect(() => {
    if (replay) return;
    const count = events.length;
    if (prevCount.current > 0 && count > prevCount.current && scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
    prevCount.current = count;
  }, [events.length, replay]);

  // Replay autoplay: advance one event per tick; the interval is re-armed each
  // step so pausing (or reaching the end) stops cleanly.
  useEffect(() => {
    if (!replay || !playing) return;
    if (pos >= total) return;
    const t = setInterval(() => setPos((p) => Math.min(p + 1, total)), 1400);
    return () => clearInterval(t);
  }, [replay, playing, pos, total]);

  // Stop autoplay once the end is reached (deferred macrotask — no sync setState in effects).
  useEffect(() => {
    if (!replay || !playing || pos < total) return;
    const t = setTimeout(() => setPlaying(false), 0);
    return () => clearTimeout(t);
  }, [replay, playing, pos, total]);

  // In replay mode keep the newest visible event in view as the scrubber moves.
  useEffect(() => {
    if (!replay || !scrollRef.current) return;
    scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [replay, pos]);

  const toggleReplay = () => {
    setReplay((r) => {
      const next = !r;
      if (next) {
        setPos(1);
        setPlaying(false);
      }
      return next;
    });
  };

  const scrub = (value: number) => {
    setPos(value);
    setPlaying(false);
  };

  const step = (delta: number) => {
    setPos((p) => Math.min(total, Math.max(1, p + delta)));
    setPlaying(false);
  };

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (pos >= total) setPos(1); // replaying from the end restarts the story
    setPlaying(true);
  };

  // Keyboard scrubbing while replay mode is active: ←/→ step one event,
  // Home/End jump to the first/last event. Ignored while typing in fields
  // (the native slider arrows keep working when the slider itself is focused).
  useEffect(() => {
    if (!replay) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        step(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        step(1);
      } else if (e.key === "Home") {
        e.preventDefault();
        scrub(1);
      } else if (e.key === "End") {
        e.preventDefault();
        scrub(total);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // step/scrub only call setters (functional updates) — no stale closure risk.
  }, [replay, total]);

  if (events.length === 0) {
    return (
      <SectionHeader
        title="Timeline"
        subtitle="No events recorded for this incident yet."
        className="border-b border-[#E4E7EC] pb-3"
      />
    );
  }

  return (
    <div>
      {/* Header */}
      <SectionHeader
        title="Timeline"
        subtitle={
          replay
            ? `Replay · event ${Math.min(pos, total)} of ${total}`
            : `${events.length} events · oldest first`
        }
        actions={
          <div className="flex items-center gap-2.5">
            {events.length >= 2 ? (
              <button
                type="button"
                onClick={toggleReplay}
                aria-pressed={replay}
                aria-label={replay ? "Exit timeline replay mode" : "Replay the incident timeline step by step"}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-md border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/60",
                  replay
                    ? "border-[#B2DDFF] bg-[#EFF8FF] text-[#175CD3]"
                    : "border-[#E4E7EC] bg-white text-[#667085] hover:border-[#B2DDFF] hover:text-[#111827]"
                )}
              >
                <RotateCcw className="size-3.5" aria-hidden />
                Replay
              </button>
            ) : null}
            {live && !replay ? (
              <span className="flex items-center gap-1.5 text-[12px] font-medium text-[#667085]">
                <span className="cine-pulse size-1.5 rounded-full bg-[#12B76A]" aria-hidden />
                Live
              </span>
            ) : null}
          </div>
        }
        className="border-b border-[#E4E7EC] pb-3"
      />

      {/* Scrubber row (replay mode only) */}
      {replay ? (
        <div className="mt-4 rounded-lg border border-[#E4E7EC] bg-[#F9FAFB] px-3 py-2.5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => scrub(1)}
              aria-label="Jump to first event"
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-[#667085] transition-colors hover:bg-[#F2F4F7] hover:text-[#111827] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/60"
            >
              <SkipBack className="size-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => step(-1)}
              disabled={pos <= 1}
              aria-label="Previous event"
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-[#667085] transition-colors hover:bg-[#F2F4F7] hover:text-[#111827] disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/60"
            >
              <ChevronLeft className="size-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? "Pause replay" : "Play replay"}
              className="flex size-8 shrink-0 items-center justify-center rounded-md border border-[#2563EB] bg-[#2563EB] text-white transition-colors hover:bg-[#1D4ED8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/60"
            >
              {playing ? <Pause className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              disabled={pos >= total}
              aria-label="Next event"
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-[#667085] transition-colors hover:bg-[#F2F4F7] hover:text-[#111827] disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/60"
            >
              <ChevronRight className="size-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => scrub(total)}
              aria-label="Jump to latest event"
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-[#667085] transition-colors hover:bg-[#F2F4F7] hover:text-[#111827] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/60"
            >
              <SkipForward className="size-3.5" aria-hidden />
            </button>
            <span className="ml-auto shrink-0 font-mono text-xs tabular-nums text-[#667085]">
              {Math.min(pos, total)}/{total}
            </span>
          </div>
          <input
            type="range"
            className="cine-range mt-1.5"
            min={1}
            max={total}
            value={Math.min(pos, total)}
            onChange={(e) => scrub(Number(e.target.value))}
            aria-label="Timeline replay position"
            aria-valuetext={
              visible.length > 0
                ? `Event ${Math.min(pos, total)} of ${total}: ${visible[visible.length - 1].label}`
                : undefined
            }
          />
          <p className="mt-1.5 hidden text-right text-[11px] text-[#667085] sm:block">
            ←/→ step · Home/End jump
          </p>
        </div>
      ) : null}

      {/* Event list */}
      <div ref={scrollRef} className="cine-scroll mt-4 max-h-[420px] overflow-y-auto pr-1">
        <ol className="cine-timeline relative space-y-5">
          {visible.map((ev) => {
            const meta = EVENT_META[ev.kind] ?? DEFAULT_EVENT_META;
            const Icon = meta.icon;
            const isActive = ev.id === activeId;
            return (
              <li
                key={ev.id}
                className={cn(
                  "relative rounded-md py-1 pl-10 pr-2 transition-colors",
                  isActive && "bg-[#EFF8FF]"
                )}
              >
                <span
                  className={cn(
                    "absolute left-0 top-1 flex size-7 items-center justify-center rounded-full border bg-white transition-shadow",
                    meta.cls,
                    isActive && "ring-2 ring-[#B2DDFF]"
                  )}
                >
                  <Icon className="size-3.5" aria-hidden />
                </span>
                <div className="flex flex-wrap items-baseline gap-x-2.5">
                  <span className="font-mono text-xs tabular-nums text-[#667085]">
                    {fmtTime(ev.ts)}
                  </span>
                  <span
                    className={cn(
                      "text-sm font-semibold text-[#111827]",
                      isActive && "text-[#175CD3]"
                    )}
                  >
                    {ev.label}
                  </span>
                  {isActive ? (
                    <span className="ml-auto shrink-0 rounded border border-[#B2DDFF] bg-[#EFF8FF] px-1.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wide text-[#175CD3]">
                      now
                    </span>
                  ) : null}
                </div>
                {ev.detail ? (
                  <p className="mt-0.5 break-words text-[13px] leading-relaxed text-[#667085]">
                    {ev.detail}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

function IncidentDetailContent({ incidentId }: { incidentId: string }) {
  const { data: incident, loading, error, refetch } = useApi(
    () => api.incident(incidentId),
    { intervalMs: 4000 }
  );
  const [decision, setDecision] = useState<"approving" | "rejecting" | null>(null);
  // Loop-strip → timeline jump channel: a nonce-tagged stage key so repeat
  // clicks of the same stage re-fire the Timeline's jump effect.
  const [jumpTarget, setJumpTarget] = useState<{ stage: string; nonce: number } | null>(null);

  const events = useMemo(
    () =>
      incident
        ? [...incident.events].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
        : [],
    [incident]
  );

  // While an agent run is actively working this incident, poll it so the
  // poll-advancing engine keeps stepping (the timeline then refreshes via the
  // 4s incident poll). The agent console does the same when it is open.
  const activeRunId = incident && incident.status !== "RESOLVED"
    ? incident.runs.find((r) => r.status === "RUNNING" || r.status === "EXECUTING")?.id ?? null
    : null;
  useApi(() => api.agentRun(activeRunId ?? ""), { intervalMs: 3000, enabled: activeRunId != null });

  // Slow-changing pool for the client-side pattern match (most similar
  // resolved incident). Optional enrichment: when the fetch fails `data` stays
  // null and the card simply doesn't render — never an error state for it.
  const { data: incidentPool } = useApi(() => api.incidents(), { intervalMs: 30000 });

  const patternMatch = useMemo(
    () => (incident && incidentPool ? findPatternMatch(incident, incidentPool) : null),
    [incident, incidentPool]
  );

  const latestRec = incident?.recommendations[0] ?? null;
  const actionedRec =
    incident?.recommendations.find((r) => r.executedAt != null || r.verification != null) ?? null;
  const showCta = incident != null && incident.status !== "RESOLVED" && incident.rootCause == null;

  const investigate = () => {
    const query =
      incident?.workflowKey === "rendering"
        ? "Why is the post-production render pipeline delayed?"
        : "Summarize current production status";
    useCineFlowStore.getState().queueAutoQuery(query);
    navigate("/agent");
  };

  const decide = async (action: "approve" | "reject") => {
    if (!latestRec || decision) return;
    setDecision(action === "approve" ? "approving" : "rejecting");
    try {
      const res = action === "approve"
        ? await api.approveRecommendation(latestRec.id)
        : await api.rejectRecommendation(latestRec.id);
      toast.success(res.message ?? (action === "approve" ? "Recommendation approved" : "Recommendation rejected"));
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed");
    } finally {
      setDecision(null);
    }
  };

  if (error && !incident) {
    return (
      <div className="space-y-4">
        <DetailBreadcrumb />
        <ErrorState message={error} onRetry={refetch} />
      </div>
    );
  }

  if (loading || !incident) {
    return (
      <div className="space-y-4">
        <DetailBreadcrumb />
        <div className="space-y-4" aria-busy="true" aria-label="Loading incident">
          <Skeleton className="h-52 w-full rounded-lg" />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1.2fr]">
            <Skeleton className="h-[480px] rounded-lg" />
            <div className="space-y-4">
              <Skeleton className="h-36 rounded-lg" />
              <Skeleton className="h-72 rounded-lg" />
              <Skeleton className="h-40 rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DetailBreadcrumb incidentId={incidentId} />

      {/* Header — overview, impact and export actions */}
      <Card className="rounded-lg border-[#E4E7EC] bg-card shadow-none">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-[#E4E7EC] bg-[#F9FAFB] px-2 py-0.5 font-mono text-[13px] font-medium text-[#175CD3]">
              {incident.id}
            </span>
            <SeverityBadge severity={incident.severity} />
            <IncidentStatusBadge status={incident.status} />
            <DemoTag />
            {/* Postmortem export — copy or download the full incident story as Markdown.
                While the incident is open the document is an honest DRAFT (pending
                sections marked) — the buttons say so up front. */}
            <span className="ml-auto flex items-center gap-1.5">
              {incident.status !== "RESOLVED" ? (
                <span
                  className="hidden items-center gap-1 rounded-full border border-[#FEDF89] bg-[#FFFAEB] px-2 py-0.5 text-[11px] font-medium text-[#B54708] md:inline-flex"
                  title="The incident is still open — the exported postmortem is a draft with pending sections"
                >
                  draft
                </span>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 border-[#E4E7EC] bg-white px-3 text-[13px] text-[#667085] shadow-none hover:border-[#98A2B3] hover:bg-white hover:text-[#111827]"
                onClick={() => {
                  const md = buildPostmortemMarkdown(incident, events);
                  void navigator.clipboard
                    .writeText(md)
                    .then(() => {
                      toast.success(
                        incident.status === "RESOLVED" ? "Postmortem copied as Markdown" : "Draft postmortem copied as Markdown",
                        {
                          description: `${incident.id} · ${events.length} events · ${incident.status.toLowerCase()}`,
                        },
                      );
                    })
                    .catch(() => {
                      toast.error("Copy failed", {
                        description: "Clipboard access was blocked — use Download instead.",
                      });
                    });
                }}
                aria-label={`Copy the ${incident.id} postmortem as Markdown${incident.status === "RESOLVED" ? "" : " (draft — incident in progress)"}`}
                title={incident.status === "RESOLVED" ? undefined : "Exports a draft — pending sections are marked"}
              >
                <Copy className="size-3.5" aria-hidden />
                Copy postmortem
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 border-[#E4E7EC] bg-white px-3 text-[13px] text-[#667085] shadow-none hover:border-[#98A2B3] hover:bg-white hover:text-[#111827]"
                onClick={() => {
                  const filename = `cineflow-postmortem-${incident.id}.md`;
                  downloadTextFile(filename, buildPostmortemMarkdown(incident, events));
                  toast.success(
                    incident.status === "RESOLVED" ? "Postmortem downloaded" : "Draft postmortem downloaded",
                    { description: filename },
                  );
                }}
                aria-label={`Download the ${incident.id} postmortem as a Markdown file${incident.status === "RESOLVED" ? "" : " (draft — incident in progress)"}`}
                title={incident.status === "RESOLVED" ? undefined : "Exports a draft — pending sections are marked"}
              >
                <Download className="size-3.5" aria-hidden />
                <span className="hidden sm:inline">Download</span>
              </Button>
            </span>
          </div>
          <h1 className="mt-3.5 text-[28px] leading-9 font-bold tracking-tight text-[#111827]">{incident.title}</h1>

          {/* Overview */}
          <div className="mt-3 max-w-3xl">
            <p className="cine-label mb-1.5">Overview</p>
            <p className="text-sm leading-relaxed text-[#475467]">
              {incident.description}
            </p>
          </div>

          {/* Impact — scope, timing and the agent's assessment */}
          <div className="mt-5 border-t border-[#E4E7EC] pt-4">
            <p className="cine-label mb-3">Impact</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 xl:grid-cols-5">
              <MetaItem label="Detected" value={fmtDateTime(incident.detectedAt)} />
              <MetaItem label="Resolved" value={incident.resolvedAt ? fmtDateTime(incident.resolvedAt) : "—"} />
              <MetaItem label="Service" value={incident.service} />
              <MetaItem label="Workflow" value={incident.workflowKey ?? "—"} mono />
              <div className="min-w-0">
                <p className="cine-label mb-1.5">Agent confidence</p>
                {incident.agentConfidence != null ? (
                  <ConfidenceMeter value={incident.agentConfidence} />
                ) : (
                  <p className="text-sm text-[#667085]">—</p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Agentic loop progress — where this incident sits in the loop right now */}
      <LoopProgressCard
        incident={incident}
        events={events}
        onJump={(stage) =>
          setJumpTarget((t) => ({ stage, nonce: (t?.nonce ?? 0) + 1 }))
        }
      />

      {/* Investigate CTA — no agent analysis yet */}
      {showCta ? (
        <Card className="rounded-lg border-[#B2DDFF] bg-card shadow-none">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
            <div className="flex min-w-0 items-start gap-3.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-[#B2DDFF] bg-[#EFF8FF]">
                <Sparkles className="size-4 text-[#2563EB]" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold tracking-tight text-[#111827]">No agent analysis yet</p>
                <p className="mt-0.5 max-w-xl text-[13px] leading-relaxed text-[#667085]">
                  Ask the CineFlow Agent to investigate — it will collect evidence with real tool
                  calls, identify the root cause and recommend a remediation gated on your approval.
                </p>
              </div>
            </div>
            <Button
              className="gap-2 bg-[#2563EB] text-white shadow-none hover:bg-[#1D4ED8]"
              onClick={investigate}
            >
              <Sparkles className="size-4" aria-hidden />
              Ask CineFlow Agent to investigate
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1.2fr]">
        {/* LEFT — timeline (with optional replay scrubber) */}
        <Card className="rounded-lg border-[#E4E7EC] bg-card shadow-none">
          <CardContent className="p-4 sm:p-5">
            <Timeline
              events={events}
              live={incident.status !== "RESOLVED"}
              jumpTarget={jumpTarget}
            />
          </CardContent>
        </Card>

        {/* RIGHT — analysis, recommendation, action, resolution, runs */}
        <div className="space-y-4">
          {/* Pattern match — most similar resolved incident */}
          {patternMatch ? <PatternMatchCard match={patternMatch} currentId={incidentId} /> : null}

          {/* Root cause */}
          <Card className="rounded-lg border-[#E4E7EC] bg-card shadow-none">
            <CardContent className="p-4 sm:p-5">
              <SectionHeader
                title="Root cause"
                subtitle="Established from collected evidence and agent analysis"
                className="border-b border-[#E4E7EC] pb-3"
              />
              {incident.rootCause ? (
                <>
                  <p className="mt-4 text-sm leading-relaxed text-[#111827]">{incident.rootCause}</p>
                  <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
                    <span className="cine-label">Agent confidence</span>
                    {incident.agentConfidence != null ? (
                      <ConfidenceMeter value={incident.agentConfidence} />
                    ) : (
                      <span className="text-[13px] text-[#667085]">—</span>
                    )}
                  </div>
                  {latestRec?.analysis ? (
                    <div className="mt-4 border-t border-[#E4E7EC] pt-3.5">
                      <p className="cine-label mb-1.5">Agent analysis</p>
                      <p className="text-[13px] leading-relaxed text-[#667085]">
                        {latestRec.analysis}
                      </p>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="mt-4 text-sm text-[#667085]">Pending investigation.</p>
              )}
            </CardContent>
          </Card>

          {/* Agent recommendation */}
          {latestRec ? (
            <Card className="rounded-lg border-[#ABEFC6] bg-card shadow-none">
              <CardContent className="p-4 sm:p-5">
                <SectionHeader
                  title="Agent recommendation"
                  subtitle="Proposed remediation — gated on human approval before execution"
                  actions={<RecStatusBadge status={latestRec.status} />}
                  className="border-b border-[#E4E7EC] pb-3"
                />

                <p className="mt-4 text-sm font-semibold leading-snug text-[#111827]">{latestRec.title}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-[#667085]">
                  {latestRec.problem}
                </p>

                {latestRec.evidence.length > 0 ? (
                  <div className="mt-4">
                    <p className="cine-label mb-2">Evidence ({latestRec.evidence.length})</p>
                    <ul className="space-y-1.5">
                      {latestRec.evidence.map((e, i) => (
                        <li
                          key={i}
                          className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-md border border-[#E4E7EC] bg-[#F9FAFB] px-2.5 py-1.5"
                        >
                          <span className="text-[13px] font-medium text-[#111827]">{e.label}</span>
                          <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-[#475467]">
                            {e.value}
                          </span>
                          <span className="ml-auto shrink-0 rounded border border-[#E4E7EC] bg-white px-1.5 py-0.5 font-mono text-[11px] text-[#667085]">
                            {e.source}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {latestRec.analysis ? (
                  <div className="mt-4">
                    <p className="cine-label mb-1.5">Agent analysis</p>
                    <p className="text-[13px] leading-relaxed text-[#667085]">
                      {latestRec.analysis}
                    </p>
                  </div>
                ) : null}

                <Separator className="my-4" />

                {/* Proposed action + approval gate */}
                <div className="rounded-lg border border-[#E4E7EC] bg-[#F9FAFB] px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Wrench className="size-4 shrink-0 text-[#2563EB]" aria-hidden />
                      <p className="truncate text-sm font-medium text-[#111827]">{latestRec.actionLabel}</p>
                    </div>
                    <RiskBadge risk={latestRec.risk} />
                  </div>

                  {latestRec.status === "PENDING" ? (
                    <>
                      <p className="mt-2.5 text-[13px] leading-relaxed text-[#667085]">
                        This is a {latestRec.risk.toLowerCase()}-risk change. Nothing executes until
                        a production operator approves it; reject to dismiss with no action taken.
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          className="h-8 gap-1.5 bg-[#2563EB] text-white shadow-none hover:bg-[#1D4ED8]"
                          disabled={decision !== null}
                          onClick={() => decide("approve")}
                        >
                          <Check className="size-3.5" aria-hidden />
                          {decision === "approving" ? "Approving…" : "Approve"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1.5 border-[#FEE4E2] bg-white text-[#B42318] shadow-none hover:bg-[#FEF3F2] hover:text-[#B42318]"
                          disabled={decision !== null}
                          onClick={() => decide("reject")}
                        >
                          <X className="size-3.5" aria-hidden />
                          {decision === "rejecting" ? "Rejecting…" : "Reject"}
                        </Button>
                        <span className="ml-1 flex items-center gap-2.5">
                          <span className="cine-label">Confidence</span>
                          <ConfidenceMeter value={latestRec.confidence} />
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="mt-2.5 flex flex-wrap items-center gap-2.5 border-t border-[#E4E7EC] pt-2.5">
                      <span className="cine-label">Confidence</span>
                      <ConfidenceMeter value={latestRec.confidence} />
                      {latestRec.decidedAt ? (
                        <span className="ml-auto text-[12px] text-[#667085]">
                          Decided {fmtDateTime(latestRec.decidedAt)}
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* Action & verification */}
          <Card className="rounded-lg border-[#E4E7EC] bg-card shadow-none">
            <CardContent className="p-4 sm:p-5">
              <SectionHeader
                title="Actions & verification"
                subtitle="Executed remediation and threshold recovery checks"
                actions={
                  actionedRec?.verification ? (
                    <button
                      onClick={() => navigate("/infra?metric=queueDepth")}
                      className="flex items-center gap-1 text-[13px] font-medium text-[#175CD3] transition-colors hover:text-[#1D4ED8] hover:underline"
                      aria-label="Open infrastructure metrics for the verified checks"
                    >
                      Open metrics
                      <ArrowRight className="size-3.5" aria-hidden />
                    </button>
                  ) : null
                }
                className="border-b border-[#E4E7EC] pb-3"
              />
              {actionedRec ? (
                <>
                  <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
                    {actionedRec.verification?.passed ? (
                      <span className="flex items-center gap-1.5 text-sm font-medium text-[#067647]">
                        <CheckCircle2 className="size-4" aria-hidden />
                        Recovery verified
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-sm font-medium text-[#B54708]">
                        <AlertTriangle className="size-4" aria-hidden />
                        {actionedRec.verification ? "Recovery not yet verified" : "Verification pending"}
                      </span>
                    )}
                    {actionedRec.executedAt ? (
                      <span className="text-[13px] text-[#667085]">
                        Executed {fmtDateTime(actionedRec.executedAt)}
                      </span>
                    ) : null}
                  </div>
                  {actionedRec.verification ? (
                    <>
                      {actionedRec.verification.summary ? (
                        <p className="mt-2.5 text-[13px] leading-relaxed text-[#667085]">
                          {actionedRec.verification.summary}
                        </p>
                      ) : null}
                      <div className="mt-3 overflow-hidden rounded-lg border border-[#E4E7EC]">
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent">
                              <TableHead className="h-9 bg-[#F9FAFB] px-3 text-[13px] font-semibold text-[#667085]">Check</TableHead>
                              <TableHead className="h-9 bg-[#F9FAFB] px-3 text-[13px] font-semibold text-[#667085]">Before → After</TableHead>
                              <TableHead className="h-9 bg-[#F9FAFB] px-3 text-[13px] font-semibold text-[#667085]">Threshold</TableHead>
                              <TableHead className="h-9 bg-[#F9FAFB] px-3 text-right text-[13px] font-semibold text-[#667085]">Pass</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {actionedRec.verification.checks.map((c, i) => (
                              <TableRow key={i} className="border-[#E4E7EC]">
                                <TableCell className="px-3 py-2.5 text-[13px] font-medium text-[#111827]">{c.label}</TableCell>
                                <TableCell className="px-3 py-2.5 font-mono text-[13px] text-[#667085]">
                                  {c.before}
                                  <ArrowRight className="mx-1 inline size-3 align-[-2px]" aria-hidden />
                                  <span className="text-[#111827]">{c.after}</span>
                                </TableCell>
                                <TableCell className="px-3 py-2.5 font-mono text-[13px] text-[#667085]">
                                  {c.threshold}
                                </TableCell>
                                <TableCell className="px-3 py-2.5 text-right">
                                  {c.passed ? (
                                    <CheckCircle2 className="ml-auto size-4 text-[#067647]" role="img" aria-label="Passed" />
                                  ) : (
                                    <XCircle className="ml-auto size-4 text-[#B42318]" role="img" aria-label="Failed" />
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  ) : (
                    <p className="mt-2.5 text-[13px] leading-relaxed text-[#667085]">
                      The action has executed; the agent will re-check thresholds as the run
                      continues.
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-4 text-sm text-[#667085]">No action executed yet.</p>
              )}
            </CardContent>
          </Card>

          {/* Resolution */}
          {incident.status === "RESOLVED" ? (
            <Card className="rounded-lg border-[#ABEFC6] bg-card shadow-none">
              <CardContent className="p-4 sm:p-5">
                <SectionHeader
                  title="Resolution"
                  subtitle="Incident closed — recovery verified"
                  actions={
                    <span className="flex size-6 items-center justify-center rounded-md border border-[#ABEFC6] bg-[#ECFDF3]">
                      <CheckCircle2 className="size-3.5 text-[#12B76A]" aria-hidden />
                    </span>
                  }
                  className="border-b border-[#E4E7EC] pb-3"
                />
                {incident.resolutionNote ? (
                  <p className="mt-4 text-sm leading-relaxed text-[#475467]">
                    {incident.resolutionNote}
                  </p>
                ) : (
                  <p className="mt-4 text-sm text-[#667085]">
                    Resolved without a resolution note.
                  </p>
                )}
                {incident.resolvedAt ? (
                  <p className="mt-2.5 text-[13px] text-[#667085]">
                    Resolved {fmtDateTime(incident.resolvedAt)}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {/* Agent runs */}
          {incident.runs.length > 0 ? (
            <Card className="rounded-lg border-[#E4E7EC] bg-card shadow-none">
              <CardContent className="p-4 sm:p-5">
                <SectionHeader
                  title="Agent runs"
                  subtitle="Investigations linked to this incident"
                  actions={
                    <button
                      onClick={() => navigate("/agent")}
                      className="group flex items-center gap-1 rounded-sm text-[13px] font-medium text-[#175CD3] transition-colors hover:text-[#1D4ED8] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/60"
                      aria-label="Open the full agent console"
                    >
                      Open console
                      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </button>
                  }
                  className="border-b border-[#E4E7EC] pb-3"
                />
                <div className="cine-scroll mt-4 max-h-64 space-y-1.5 overflow-y-auto pr-1">
                  {incident.runs.map((run) => (
                    <AgentRunRow key={run.id} run={run} />
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
