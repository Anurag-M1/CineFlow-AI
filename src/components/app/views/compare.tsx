"use client";

// CineFlow AI — Incident comparison view (#/compare/{idA}/{idB}).
// Side-by-side analysis of two production incidents: a signal-overlap strip,
// identity cards, an attribute comparison table, event-kind distributions and
// timeline previews. Deepens the "the platform recognizes recurring incident
// patterns" story — the canonical pair is INC-1042 (current) vs INC-1039
// (same-signature historical render incident). Without both ids in the hash
// (#/compare or #/compare/{id}) the view renders an incident picker instead.

import { useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowLeftRight, ArrowRight, ArrowUpRight, Columns2, Gauge } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { navigate } from "@/components/app/router";
import { useApi } from "@/hooks/use-api";
import { api, type IncidentDetailDTO } from "@/lib/client/api";
import { fmtDateTime } from "@/lib/format";
import { DemoTag, IncidentStatusBadge, SeverityBadge } from "@/components/app/shared/badges";
import { ConfidenceMeter, EmptyState, ErrorState, PageHeader } from "@/components/app/shared/ui";
import { cn } from "@/lib/utils";
import type { IncidentDTO } from "@/lib/types";

const PAGE_TITLE = "Incident comparison";
const PAGE_DESC =
  "Side-by-side analysis of two production incidents — spot recurring patterns and compare outcomes.";

// ---------------------------------------------------------------------------
// Shared visual maps
// ---------------------------------------------------------------------------

/** Event-kind bar/dot colors (mirrors the audit-view kind palette). */
const EVENT_KIND_COLORS: Record<string, string> = {
  ANOMALY: "#F04438",
  AGENT: "#0BA5EC",
  EVIDENCE: "#98A2B3",
  ROOT_CAUSE: "#2563EB",
  RECOMMENDATION: "#F79009",
  HUMAN: "#7A5AF8",
  ACTION: "#F79009",
  VERIFICATION: "#12B76A",
  NOTE: "#667085",
};
const UNKNOWN_KIND_COLOR = "#667085";

const REC_STATUS_CHIPS: Record<string, { label: string; cls: string }> = {
  VERIFIED: { label: "Verified", cls: "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]" },
  EXECUTED: { label: "Executed", cls: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]" },
  APPROVED: { label: "Approved", cls: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]" },
  PENDING: { label: "Pending", cls: "border-border bg-secondary text-muted-foreground" },
  REJECTED: { label: "Rejected", cls: "border-[#FEE4E2] bg-[#FEF3F2] text-[#B42318]" },
};

const RUN_STATUS_CHIPS: Record<string, { label: string; cls: string }> = {
  RUNNING: { label: "Running", cls: "border-[#B2DDFF] bg-[#EFF8FF] text-[#175CD3]" },
  AWAITING_APPROVAL: { label: "Awaiting approval", cls: "border-[#E9D7FE] bg-[#F9F5FF] text-[#6941C6]" },
  EXECUTING: { label: "Executing", cls: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]" },
  COMPLETED: { label: "Completed", cls: "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]" },
  REJECTED: { label: "Rejected", cls: "border-[#FEE4E2] bg-[#FEF3F2] text-[#B42318]" },
  FAILED: { label: "Failed", cls: "border-[#FEE4E2] bg-[#FEF3F2] text-[#B42318]" },
};

const SEVERITY_TEXT_CLS: Record<string, string> = {
  HIGH: "text-[#B42318]",
  MEDIUM: "text-[#B54708]",
  LOW: "text-[#175CD3]",
};

// ---------------------------------------------------------------------------
// Signal helpers (token overlap mirrors the pattern-match scorer in
// incident-detail.tsx, which keeps its own list module-private)
// ---------------------------------------------------------------------------

/** English glue words — tokens that carry no incident signal. */
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

function tokenizeSignals(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !SIGNAL_STOPWORDS.has(t));
}

/** Meaningful root-cause tokens present in both texts (order from `a`). */
function sharedRootCauseTokens(a: string, b: string): string[] {
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

/** Compact duration ("45m" / "2.1h" / "3.2d") for detected→resolved spans. */
function fmtDurationShort(ms: number): string {
  const minutes = ms / 60_000;
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))}m`;
  const hours = minutes / 60;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function kindColor(kind: string): string {
  return EVENT_KIND_COLORS[kind] ?? UNKNOWN_KIND_COLOR;
}

// ---------------------------------------------------------------------------
// Small UI atoms
// ---------------------------------------------------------------------------

function SideChip({ letter, className }: { letter: "A" | "B"; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-md border border-[#E4E7EC] bg-[#F9FAFB] font-mono text-[11px] font-medium text-[#475467]",
        className
      )}
    >
      {letter}
    </span>
  );
}

/** A/B tag shown only on mobile, where the attribute rows stack vertically.
 *  Announced by screen readers so stacked values stay attributable. */
function MobileSideTag({ letter }: { letter: "A" | "B" }) {
  return (
    <span
      className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border border-[#E4E7EC] bg-[#F9FAFB] font-mono text-[11px] font-medium text-[#667085] sm:hidden"
    >
      {letter}
    </span>
  );
}

function MutedCell({ children }: { children: ReactNode }) {
  return <span className="text-[13px] text-[#667085]">{children}</span>;
}

/** Compact comparison chip (same styling as the pattern-match why-chips). */
function CompareChip({ label, accent }: { label: string; accent?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-md border px-2 py-0.5 text-[11px]",
        accent
          ? "border-[#B2DDFF] bg-[#EFF8FF] text-[#175CD3]"
          : "border-[#E4E7EC] bg-[#F9FAFB] text-[#475467]"
      )}
    >
      {label}
    </span>
  );
}

/** Chip that links to the workflow drill-down (#/workflows?wf={key}). */
function WorkflowChip({ workflowKey, prefix }: { workflowKey: string; prefix?: string }) {
  return (
    <button
      type="button"
      onClick={() => navigate(`/workflows?wf=${encodeURIComponent(workflowKey)}`)}
      aria-label={`Open workflow ${workflowKey} drill-down`}
      title="Open workflow drill-down"
      className="group/wf inline-flex items-center gap-1 rounded-md border border-[#B2DDFF] bg-[#EFF8FF] px-2 py-0.5 text-[11px] text-[#175CD3] transition-colors hover:border-[#B2DDFF] hover:bg-[#EFF8FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      {prefix ? <span className="font-sans">{prefix} · </span> : null}
      <span className="font-mono">{workflowKey}</span>
      <ArrowUpRight className="size-3 transition-transform group-hover/wf:translate-x-0.5 group-hover/wf:-translate-y-0.5" aria-hidden />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Per-incident "Open metrics" deep links (#/infra?metric={key})
// ---------------------------------------------------------------------------

/** workflowKey → the infrastructure metric most relevant to that pipeline.
 *  Keys are the ones actually served by /api/metrics (seeded METRICS):
 *  renderWorkers, gpuUtil, queueDepth, processingLatency, apiErrors,
 *  storageUsed, workflowFailures, availability, renderThroughput. */
const WORKFLOW_METRIC_KEYS: Record<string, string> = {
  rendering: "queueDepth",
  "vfx-compositing": "gpuUtil",
  "asset-processing": "processingLatency",
  "subtitle-pipeline": "workflowFailures",
  "content-delivery": "apiErrors",
  "archive-storage": "storageUsed",
};

const FALLBACK_METRIC_KEY = "availability";

/** Fixed, honest mapping (no per-incident guessing): every workflow links to a
 *  metric that actually exists; unknown or workflow-less incidents fall back
 *  to the platform-wide availability metric. */
function metricKeyForWorkflow(workflowKey: string | null): string {
  const mapped: string | undefined =
    workflowKey != null ? WORKFLOW_METRIC_KEYS[workflowKey] : undefined;
  return mapped ?? FALLBACK_METRIC_KEY;
}

/** Chip that links to the infra metric drill-down (#/infra?metric={key}). */
function OpenMetricsChip({ incidentId, metricKey }: { incidentId: string; metricKey: string }) {
  return (
    <button
      type="button"
      onClick={() => navigate(`/infra?metric=${encodeURIComponent(metricKey)}`)}
      aria-label={`Open infrastructure metrics for ${incidentId}`}
      title={`Infrastructure metric: ${metricKey}`}
      className="group/om inline-flex items-center gap-1 rounded-md border border-[#B2DDFF] bg-[#EFF8FF] px-2 py-0.5 text-[11px] text-[#175CD3] transition-colors hover:border-[#B2DDFF] hover:bg-[#EFF8FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      <Gauge className="size-3 shrink-0" aria-hidden />
      Open metrics
      <ArrowUpRight className="size-3 transition-transform group-hover/om:translate-x-0.5 group-hover/om:-translate-y-0.5" aria-hidden />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Signal overlap
// ---------------------------------------------------------------------------

interface OverlapChip {
  label: string;
  accent: boolean;
  /** Present on the workflow chip — renders it as a drill-down link. */
  workflowKey?: string;
}

interface OverlapResult {
  chips: OverlapChip[];
  shared: number;
  total: number;
}

/**
 * Match summary across four signal dimensions (workflow, service, severity,
 * root-cause tokens) plus a neutral "days apart" context chip. Accent chips
 * mark a match, neutral chips a non-match or pending state.
 */
function computeOverlap(a: IncidentDetailDTO, b: IncidentDetailDTO): OverlapResult {
  const chips: OverlapChip[] = [];
  let shared = 0;
  const total = 4;

  const sameWorkflow = a.workflowKey != null && a.workflowKey === b.workflowKey;
  chips.push(
    sameWorkflow
      ? { label: `Same workflow · ${a.workflowKey}`, accent: true, workflowKey: a.workflowKey! }
      : { label: "Different workflow", accent: false }
  );
  if (sameWorkflow) shared += 1;

  const sameService = a.service === b.service;
  chips.push(
    sameService
      ? { label: `Same service · ${a.service}`, accent: true }
      : { label: "Different services", accent: false }
  );
  if (sameService) shared += 1;

  const sameSeverity = a.severity === b.severity;
  chips.push(
    sameSeverity
      ? { label: `Same severity · ${a.severity}`, accent: true }
      : { label: "Different severity", accent: false }
  );
  if (sameSeverity) shared += 1;

  if (a.rootCause != null && b.rootCause != null) {
    const tokens = sharedRootCauseTokens(a.rootCause, b.rootCause);
    if (tokens.length > 0) {
      const shown = tokens.slice(0, 4);
      const extra = tokens.length - shown.length;
      chips.push({
        label: `Shared root cause · ${shown.join(", ")}${extra > 0 ? ` +${extra}` : ""}`,
        accent: true,
      });
      shared += 1;
    } else {
      chips.push({ label: "No shared root-cause signals", accent: false });
    }
  } else {
    chips.push({ label: "Root cause pending", accent: false });
  }

  const dayDiff = Math.round(
    Math.abs(new Date(a.detectedAt).getTime() - new Date(b.detectedAt).getTime()) / 86_400_000
  );
  chips.push({ label: dayDiff <= 0 ? "Detected same day" : `${dayDiff} days apart`, accent: false });

  return { chips, shared, total };
}

// ---------------------------------------------------------------------------
// Picker mode
// ---------------------------------------------------------------------------

function IncidentSelect({
  slot, value, incidents, onChange,
}: {
  slot: "A" | "B";
  value: string;
  incidents: IncidentDTO[];
  onChange: (slot: "A" | "B", id: string) => void;
}) {
  return (
    <div className="min-w-0">
      <p className="cine-label mb-2 flex items-center gap-1.5">
        <span
          aria-hidden
          className="flex size-5 items-center justify-center rounded border border-[#E4E7EC] bg-[#F9FAFB] font-mono text-[11px] font-medium text-[#667085]"
        >
          {slot}
        </span>
        Incident {slot}
      </p>
      <Select value={value || undefined} onValueChange={(v) => onChange(slot, v)}>
        <SelectTrigger className="w-full" aria-label={`Select incident ${slot}`}>
          <SelectValue placeholder={`Select incident ${slot}`} />
        </SelectTrigger>
        <SelectContent>
          {incidents.map((inc) => (
            <SelectItem key={inc.id} value={inc.id}>
              <span className="flex w-full min-w-0 items-center gap-2">
                <span className="shrink-0 font-mono text-xs">{inc.id}</span>
                <span className="min-w-0 flex-1 truncate">{inc.title}</span>
                <span
                  className={cn(
                    "shrink-0 text-[11px] font-semibold",
                    SEVERITY_TEXT_CLS[inc.severity] ?? "text-muted-foreground"
                  )}
                >
                  {inc.severity}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ComparePicker() {
  const { data, loading, error, refetch } = useApi(() => api.incidents(), { intervalMs: 15000 });
  const [pickA, setPickA] = useState("");
  const [pickB, setPickB] = useState("");

  const incidents = useMemo(() => data ?? [], [data]);
  const has = (id: string) => incidents.some((i) => i.id === id);

  // Derived defaults (never setState during render): the canonical demo pair
  // pre-selects A/B until the user actively chooses an incident in a slot.
  const a = pickA || (has("INC-1042") ? "INC-1042" : "");
  const b = pickB || (has("INC-1039") ? "INC-1039" : "");
  const same = a !== "" && a === b;

  const selectIncident = (slot: "A" | "B", id: string) => {
    if (slot === "A") setPickA(id);
    else setPickB(id);
  };

  return (
    <div className="space-y-4">
      <PageHeader title={PAGE_TITLE} description={PAGE_DESC} badge={<DemoTag />} />

      {loading && !data ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading incidents">
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-9 w-44 rounded-md" />
        </div>
      ) : error && !data ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : incidents.length === 0 ? (
        <EmptyState
          icon={Columns2}
          title="No incidents available"
          description="The demo environment currently has no incidents to compare."
        />
      ) : (
        <Card className="min-w-0 border-[#E4E7EC] bg-card shadow-none rounded-lg">
          <CardContent className="p-4 sm:p-5">
            <p className="text-base font-semibold tracking-tight text-[#111827]">Choose two incidents</p>
            <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-[#667085]">
              The demo pair — INC-1042 vs INC-1039 — is a recurring render-queue pattern the
              agent recognized; pick any two incidents to compare them side by side.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <IncidentSelect slot="A" value={a} incidents={incidents} onChange={selectIncident} />
              <IncidentSelect slot="B" value={b} incidents={incidents} onChange={selectIncident} />
            </div>

            {same ? (
              <p role="status" className="mt-3 text-xs text-[#B54708]">
                Pick two different incidents.
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <Button
                className="gap-1.5 bg-[#2563EB] font-medium text-white hover:bg-[#1D4ED8]"
                disabled={!a || !b || same}
                onClick={() => navigate(`/compare/${a}/${b}`)}
              >
                <Columns2 className="size-4" aria-hidden />
                Compare incidents
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Identity cards
// ---------------------------------------------------------------------------

function IncidentIdentityCard({ inc, letter }: { inc: IncidentDetailDTO; letter: "A" | "B" }) {
  return (
    <Card className="min-w-0 border-[#E4E7EC] bg-card shadow-none rounded-lg">
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <SideChip letter={letter} />
          <span className="rounded-md border border-[#E4E7EC] bg-[#F9FAFB] px-2 py-0.5 font-mono text-xs text-[#475467]">
            {inc.id}
          </span>
          <SeverityBadge severity={inc.severity} />
          <IncidentStatusBadge status={inc.status} />
        </div>
        <h2 className="mt-3 break-words text-base font-semibold leading-snug tracking-tight text-[#111827]">
          {inc.title}
        </h2>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="rounded-md border border-[#E4E7EC] bg-[#F9FAFB] px-2 py-0.5 text-[11px] text-[#667085]">
            {inc.service}
          </span>
          {inc.workflowKey != null ? (
            <WorkflowChip workflowKey={inc.workflowKey} />
          ) : (
            <span className="rounded-md border border-[#E4E7EC] bg-[#F9FAFB] px-2 py-0.5 font-mono text-[11px] text-[#667085]">
              no workflow
            </span>
          )}
          <OpenMetricsChip incidentId={inc.id} metricKey={metricKeyForWorkflow(inc.workflowKey)} />
        </div>
        <p className="mt-2.5 line-clamp-2 break-words text-[13px] leading-relaxed text-[#667085]">
          {inc.description}
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Attribute comparison table
// ---------------------------------------------------------------------------

function DateCell({ iso }: { iso: string }) {
  return <span className="font-mono text-[13px] tabular-nums text-[#344054]">{fmtDateTime(iso)}</span>;
}

function ClampedText({ text, lines }: { text: string; lines: 2 | 3 }) {
  return (
    <p
      title={text}
      className={cn(
        "break-words text-[13px] leading-relaxed text-[#344054]",
        lines === 3 ? "line-clamp-3" : "line-clamp-2"
      )}
    >
      {text}
    </p>
  );
}

function CountCell({ count, noun }: { count: number; noun: string }) {
  if (count === 0) return <MutedCell>No {noun}</MutedCell>;
  return <span className="font-mono text-[13px] tabular-nums text-[#344054]">{count} {noun}</span>;
}

function resolveDurationCell(inc: IncidentDetailDTO): ReactNode {
  if (!inc.resolvedAt) return <MutedCell>Open — not resolved yet</MutedCell>;
  const ms = Math.max(0, new Date(inc.resolvedAt).getTime() - new Date(inc.detectedAt).getTime());
  return <span className="font-mono text-[13px] tabular-nums text-[#344054]">{fmtDurationShort(ms)}</span>;
}

function RecommendationsCell({ recs }: { recs: IncidentDetailDTO["recommendations"] }) {
  if (recs.length === 0) return <MutedCell>None</MutedCell>;
  const shown = recs.slice(0, 4);
  const extra = recs.length - shown.length;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="font-mono text-[13px] tabular-nums text-[#344054]">{recs.length}</span>
      {shown.map((rec) => {
        const chip =
          REC_STATUS_CHIPS[rec.status] ??
          { label: rec.status, cls: "border-border bg-secondary text-muted-foreground" };
        return (
          <Badge
            key={rec.id}
            variant="outline"
            className={cn("px-1.5 text-[11px] font-medium", chip.cls)}
          >
            {chip.label}
          </Badge>
        );
      })}
      {extra > 0 ? <MutedCell>+{extra} more</MutedCell> : null}
    </div>
  );
}

function RunsCell({ runs }: { runs: IncidentDetailDTO["runs"] }) {
  if (runs.length === 0) return <MutedCell>No agent runs</MutedCell>;
  const latest = runs[0]; // API returns runs newest-first
  const chip =
    RUN_STATUS_CHIPS[latest.status] ??
    { label: latest.status, cls: "border-border bg-secondary text-muted-foreground" };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="font-mono text-[13px] tabular-nums text-[#344054]">{runs.length}</span>
      <Badge variant="outline" className={cn("px-1.5 text-[11px] font-medium", chip.cls)}>
        {chip.label}
      </Badge>
    </div>
  );
}

function CompareRow({ label, a, b }: { label: string; a: ReactNode; b: ReactNode }) {
  // Desktop: label | A | B columns. Mobile: rows stack as label / A / B with
  // tiny A/B tags so the stacked values stay attributable.
  return (
    <div className="grid grid-cols-1 gap-1.5 border-b border-[#E4E7EC] py-3 last:border-b-0 sm:grid-cols-[140px_1fr_1fr] sm:gap-3">
      <p className="cine-label pt-1">{label}</p>
      <div className="flex min-w-0 items-start gap-2">
        <MobileSideTag letter="A" />
        <div className="min-w-0 flex-1">{a}</div>
      </div>
      <div className="flex min-w-0 items-start gap-2">
        <MobileSideTag letter="B" />
        <div className="min-w-0 flex-1">{b}</div>
      </div>
    </div>
  );
}

function AttributeComparisonCard({
  incA, incB,
}: {
  incA: IncidentDetailDTO;
  incB: IncidentDetailDTO;
}) {
  const rows: { label: string; a: ReactNode; b: ReactNode }[] = [
    {
      label: "Status",
      a: <IncidentStatusBadge status={incA.status} />,
      b: <IncidentStatusBadge status={incB.status} />,
    },
    {
      label: "Severity",
      a: <SeverityBadge severity={incA.severity} />,
      b: <SeverityBadge severity={incB.severity} />,
    },
    {
      label: "Detected",
      a: <DateCell iso={incA.detectedAt} />,
      b: <DateCell iso={incB.detectedAt} />,
    },
    {
      label: "Resolved",
      a: incA.resolvedAt ? <DateCell iso={incA.resolvedAt} /> : <MutedCell>—</MutedCell>,
      b: incB.resolvedAt ? <DateCell iso={incB.resolvedAt} /> : <MutedCell>—</MutedCell>,
    },
    {
      label: "Time to resolve",
      a: resolveDurationCell(incA),
      b: resolveDurationCell(incB),
    },
    {
      label: "Agent confidence",
      a: incA.agentConfidence != null ? <ConfidenceMeter value={incA.agentConfidence} /> : <MutedCell>Not analyzed</MutedCell>,
      b: incB.agentConfidence != null ? <ConfidenceMeter value={incB.agentConfidence} /> : <MutedCell>Not analyzed</MutedCell>,
    },
    {
      label: "Root cause",
      a: incA.rootCause ? <ClampedText text={incA.rootCause} lines={3} /> : <MutedCell>Pending investigation</MutedCell>,
      b: incB.rootCause ? <ClampedText text={incB.rootCause} lines={3} /> : <MutedCell>Pending investigation</MutedCell>,
    },
    {
      label: "Resolution",
      a: incA.resolutionNote ? <ClampedText text={incA.resolutionNote} lines={2} /> : <MutedCell>—</MutedCell>,
      b: incB.resolutionNote ? <ClampedText text={incB.resolutionNote} lines={2} /> : <MutedCell>—</MutedCell>,
    },
    {
      label: "Events",
      a: <CountCell count={incA.events.length} noun="events" />,
      b: <CountCell count={incB.events.length} noun="events" />,
    },
    {
      label: "Recommendations",
      a: <RecommendationsCell recs={incA.recommendations} />,
      b: <RecommendationsCell recs={incB.recommendations} />,
    },
    {
      label: "Agent runs",
      a: <RunsCell runs={incA.runs} />,
      b: <RunsCell runs={incB.runs} />,
    },
  ];

  return (
    <Card className="min-w-0 border-[#E4E7EC] bg-card shadow-none rounded-lg">
      <CardContent className="p-4 sm:p-5">
        <h2 className="text-base font-semibold tracking-tight text-[#111827]">Attribute comparison</h2>
        <p className="mt-0.5 text-[13px] text-[#667085]">Key fields, side by side</p>

        {/* Column headers (sm+) */}
        <div className="mt-4 hidden grid-cols-[140px_1fr_1fr] gap-3 border-b border-[#E4E7EC] pb-2.5 sm:grid">
          <span className="cine-label pt-0.5">Attribute</span>
          <span className="min-w-0 truncate font-mono text-[11px] text-[#175CD3]">{incA.id}</span>
          <span className="min-w-0 truncate font-mono text-[11px] text-[#175CD3]">{incB.id}</span>
        </div>

        <div>
          {rows.map((row) => (
            <CompareRow key={row.label} label={row.label} a={row.a} b={row.b} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Event-kind distribution
// ---------------------------------------------------------------------------

function EventKindPanel({
  inc, letter, className,
}: {
  inc: IncidentDetailDTO;
  letter: "A" | "B";
  className?: string;
}) {
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const ev of inc.events) map.set(ev.kind, (map.get(ev.kind) ?? 0) + 1);
    return [...map.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
  }, [inc.events]);

  const shown = counts.slice(0, 6);
  const other = counts.length - shown.length;
  const max = shown[0]?.[1] ?? 1;

  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-center gap-2">
        <SideChip letter={letter} />
        <span className="min-w-0 truncate font-mono text-xs text-[#475467]">{inc.id}</span>
        <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-[#667085]">
          {inc.events.length} events
        </span>
      </div>
      {shown.length === 0 ? (
        <p className="mt-3 text-[13px] text-[#667085]">No events recorded yet.</p>
      ) : (
        <ul className="mt-3.5 space-y-2.5">
          {shown.map(([kind, count]) => (
            <li key={kind} className="flex items-center gap-2.5">
              <span
                className="w-[112px] shrink-0 truncate font-mono text-[11px] text-muted-foreground"
                title={kind}
              >
                {kind}
              </span>
              <div
                className="h-1.5 min-w-0 flex-1 overflow-hidden rounded bg-[#F2F4F7]"
                role="img"
                aria-label={`${kind}: ${count} of ${inc.events.length} events`}
              >
                <div
                  className="h-full rounded"
                  style={{
                    width: `${Math.max(3, Math.round((count / max) * 100))}%`,
                    backgroundColor: kindColor(kind),
                  }}
                />
              </div>
              <span className="w-7 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                {count}
              </span>
            </li>
          ))}
        </ul>
      )}
      {other > 0 ? (
        <p className="mt-2 font-mono text-[11px] text-[#667085]">+{other} other</p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline preview (last 3 events, newest first)
// ---------------------------------------------------------------------------

function TimelinePanel({
  inc, letter, className,
}: {
  inc: IncidentDetailDTO;
  letter: "A" | "B";
  className?: string;
}) {
  const latest = useMemo(
    () =>
      [...inc.events]
        .sort((x, y) => new Date(y.ts).getTime() - new Date(x.ts).getTime())
        .slice(0, 3),
    [inc.events]
  );

  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-center gap-2">
        <SideChip letter={letter} />
        <span className="min-w-0 truncate font-mono text-xs text-[#475467]">{inc.id}</span>
      </div>
      {latest.length === 0 ? (
        <p className="mt-3 text-[13px] text-[#667085]">No events recorded yet.</p>
      ) : (
        <ul className="mt-3.5 space-y-2.5">
          {latest.map((ev) => (
            <li key={ev.id} className="flex items-start gap-2.5">
              <span
                className="mt-1.5 size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: kindColor(ev.kind) }}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="font-mono text-[11px] tabular-nums text-[#667085]">
                  {fmtDateTime(ev.ts)}
                </p>
                <p className="truncate text-[13px] font-medium text-[#111827]">{ev.label}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => navigate(`/incidents/${inc.id}`)}
        className="mt-3.5 flex items-center gap-1 text-xs text-[#175CD3] transition-colors hover:underline"
        aria-label={`Open incident ${inc.id} detail`}
      >
        Open {inc.id} detail
        <ArrowRight className="size-3" aria-hidden />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comparison content
// ---------------------------------------------------------------------------

function CompareContent({ idA, idB }: { idA: string; idB: string }) {
  // Both incidents polled lightly (15s) so a live demo scenario updates the
  // comparison in near-real time. Hooks always run before any early return.
  const a = useApi(() => api.incident(idA), { intervalMs: 15000 });
  const b = useApi(() => api.incident(idB), { intervalMs: 15000 });

  const failedA = a.error != null && a.data == null;
  const failedB = b.error != null && b.data == null;
  const initialLoading = (a.loading && a.data == null) || (b.loading && b.data == null);

  const headerActions = (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => navigate(`/compare/${idB}/${idA}`)}
        aria-label="Swap the two compared incidents"
      >
        <ArrowLeftRight className="size-3.5" aria-hidden />
        Swap
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => navigate("/incidents")}
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Back to incidents
      </Button>
    </div>
  );

  // An id that 404s (or a failed fetch with no data) can't be compared —
  // offer retry plus a picker reset.
  if (failedA || failedB) {
    const problems: string[] = [];
    if (failedA) problems.push(`Incident ${idA} — ${a.error}`);
    if (failedB) problems.push(`Incident ${idB} — ${b.error}`);
    return (
      <div className="space-y-4">
        <PageHeader title={PAGE_TITLE} description={PAGE_DESC} badge={<DemoTag />} />
        <ErrorState
          message={problems.join("  ·  ")}
          onRetry={() => {
            a.refetch();
            b.refetch();
          }}
        />
        <div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => navigate("/compare")}
          >
            <Columns2 className="size-3.5" aria-hidden />
            Choose incidents
          </Button>
        </div>
      </div>
    );
  }

  if (initialLoading || a.data == null || b.data == null) {
    return (
      <div className="space-y-4">
        <PageHeader title={PAGE_TITLE} description={PAGE_DESC} badge={<DemoTag />} actions={headerActions} />
        <div className="space-y-4" aria-busy="true" aria-label="Loading comparison">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Skeleton className="h-40 w-full rounded-lg" />
            <Skeleton className="h-40 w-full rounded-lg" />
          </div>
          <Skeleton className="h-72 w-full rounded-lg" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Skeleton className="h-44 w-full rounded-lg" />
            <Skeleton className="h-44 w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  const incA = a.data;
  const incB = b.data;

  // Cheap pure computation (token intersection only) — no memo needed, and
  // keeping it after the guards avoids conditional hook order.
  const overlap = computeOverlap(incA, incB);

  return (
    <div className="space-y-4">
      <PageHeader title={PAGE_TITLE} description={PAGE_DESC} badge={<DemoTag />} actions={headerActions} />

      {/* Signal overlap strip */}
      <Card className="min-w-0 border-[#E4E7EC] bg-card shadow-none rounded-lg">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight text-[#111827]">Signal overlap</h2>
              <p className="mt-0.5 text-[13px] text-[#667085]">What these two incidents share</p>
            </div>
            <span className="shrink-0 rounded-md border border-[#B2DDFF] bg-[#EFF8FF] px-2 py-0.5 font-mono text-[11px] font-medium text-[#175CD3]">
              {overlap.shared} of {overlap.total} signals shared
            </span>
          </div>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {overlap.chips.map((chip) => (
              <li key={chip.label}>
                {chip.workflowKey != null ? (
                  <WorkflowChip workflowKey={chip.workflowKey} prefix="Same workflow" />
                ) : (
                  <CompareChip label={chip.label} accent={chip.accent} />
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Identity cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <IncidentIdentityCard inc={incA} letter="A" />
        <IncidentIdentityCard inc={incB} letter="B" />
      </div>

      {/* Attribute comparison table */}
      <AttributeComparisonCard incA={incA} incB={incB} />

      {/* Event-kind distribution */}
      <Card className="min-w-0 border-[#E4E7EC] bg-card shadow-none rounded-lg">
        <CardContent className="p-4 sm:p-5">
          <h2 className="text-base font-semibold tracking-tight text-[#111827]">Event mix by kind</h2>
          <p className="mt-0.5 text-[13px] text-[#667085]">
            Event kinds recorded per incident · top 6 kinds
          </p>
          <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6">
            <EventKindPanel inc={incA} letter="A" />
            <EventKindPanel inc={incB} letter="B" className="sm:border-l sm:border-[#E4E7EC] sm:pl-6" />
          </div>
        </CardContent>
      </Card>

      {/* Timeline preview */}
      <Card className="min-w-0 border-[#E4E7EC] bg-card shadow-none rounded-lg">
        <CardContent className="p-4 sm:p-5">
          <h2 className="text-base font-semibold tracking-tight text-[#111827]">Latest events</h2>
          <p className="mt-0.5 text-[13px] text-[#667085]">Newest first · last 3 events per incident</p>
          <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6">
            <TimelinePanel inc={incA} letter="A" />
            <TimelinePanel inc={incB} letter="B" className="sm:border-l sm:border-[#E4E7EC] sm:pl-6" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// View entry
// ---------------------------------------------------------------------------

export function CompareView({ idA, idB }: { idA: string; idB: string }) {
  // Missing ids → picker. Same id twice → degenerate guard.
  if (!idA || !idB) {
    return <ComparePicker />;
  }
  if (idA === idB) {
    return (
      <div className="space-y-4">
        <PageHeader title={PAGE_TITLE} description={PAGE_DESC} badge={<DemoTag />} />
        <EmptyState
          icon={Columns2}
          title="Pick two different incidents"
          description="Comparing an incident with itself won't surface a recurring pattern — choose a second incident to see the signals they share."
          action={
            <Button variant="outline" size="sm" onClick={() => navigate("/compare")}>
              Choose incidents
            </Button>
          }
        />
      </div>
    );
  }
  // Keyed so navigating between comparison pairs resets polling cleanly.
  return <CompareContent key={`${idA}:${idB}`} idA={idA} idB={idB} />;
}

export default CompareView;
