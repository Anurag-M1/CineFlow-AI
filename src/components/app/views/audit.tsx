"use client";

// CineFlow AI — Audit Log view (#/audit).
// The accountability surface: one chronological, filterable trail merging every
// incident event (agent reasoning, human decisions, executed actions), every
// recommendation lifecycle step (proposed → decided → executed → verified) and
// every agent run lifecycle event. Newest first, no auto-scroll, drill-down to
// the source incident.

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Bot, CheckCircle2, Crosshair, FileJson, FileSearch, FileSpreadsheet, Info, Lightbulb,
  ScrollText, ShieldCheck, Sparkles, UserCheck, UserX, Wrench, XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { navigate } from "@/components/app/router";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/client/api";
import { fmtDateTime, timeAgo } from "@/lib/format";
import { DemoTag } from "@/components/app/shared/badges";
import { EmptyState, ErrorState, LoadingRows, PageHeader } from "@/components/app/shared/ui";
import { cn } from "@/lib/utils";
import type { Severity } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AuditCategory = "agent" | "human" | "action";
type CategoryFilter = "ALL" | AuditCategory;
type SeverityFilter = "ALL" | Severity;
type RangeFilter = "ALL" | "1h" | "24h" | "7d";

/** Cutoff in hours per range filter (ALL = no cutoff). */
const RANGE_HOURS: Record<Exclude<RangeFilter, "ALL">, number> = {
  "1h": 1,
  "24h": 24,
  "7d": 168,
};

const RANGE_LABEL: Record<RangeFilter, string> = {
  ALL: "All time",
  "1h": "Last hour",
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
};

/** Ordered range keys — position + 1 is the keyboard shortcut (1–4). */
const RANGE_KEYS = Object.keys(RANGE_LABEL) as RangeFilter[];

interface AuditEvent {
  key: string;
  ts: string;
  kind: string;
  label: string;
  detail: string | null;
  category: AuditCategory;
  icon: LucideIcon;
  dotCls: string;
  iconCls: string;
  sourceType: "INCIDENT" | "RECOMMENDATION" | "RUN";
  sourceChip: string;
  incidentId: string | null; // present → row drills down to the incident
  severity: Severity | null;
}

interface AuditFeed {
  events: AuditEvent[];
  stats: {
    total: number;
    approved: number;
    rejected: number;
    executed: number;
    verified: number;
    incidents: number;
    recommendations: number;
    runs: number;
  };
}

// ---------------------------------------------------------------------------
// Visual maps (incident-event kinds → icon + colored dot)
// ---------------------------------------------------------------------------

const KIND_META: Record<string, { icon: LucideIcon; dotCls: string; iconCls: string }> = {
  ANOMALY: { icon: AlertTriangle, dotCls: "bg-[#F04438]", iconCls: "border-[#FEE4E2] bg-[#FEF3F2] text-[#B42318]" },
  AGENT: { icon: Bot, dotCls: "bg-[#0BA5EC]", iconCls: "border-[#B2DDFF] bg-[#EFF8FF] text-[#175CD3]" },
  EVIDENCE: { icon: FileSearch, dotCls: "bg-[#98A2B3]", iconCls: "border-[#E4E7EC] bg-[#F9FAFB] text-[#475467]" },
  ROOT_CAUSE: { icon: Crosshair, dotCls: "bg-[#2563EB]", iconCls: "border-[#B2DDFF] bg-[#EFF8FF] text-[#2563EB]" },
  RECOMMENDATION: { icon: Lightbulb, dotCls: "bg-[#F79009]", iconCls: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]" },
  HUMAN: { icon: UserCheck, dotCls: "bg-[#7A5AF8]", iconCls: "border-[#E9D7FE] bg-[#F9F5FF] text-[#6941C6]" },
  ACTION: { icon: Wrench, dotCls: "bg-[#F79009]", iconCls: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]" },
  VERIFICATION: { icon: CheckCircle2, dotCls: "bg-[#12B76A]", iconCls: "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]" },
  NOTE: { icon: Info, dotCls: "bg-[#98A2B3]", iconCls: "border-[#E4E7EC] bg-[#F9FAFB] text-[#475467]" },
};

const KIND_CATEGORY: Record<string, AuditCategory> = {
  ANOMALY: "agent",
  AGENT: "agent",
  EVIDENCE: "agent",
  ROOT_CAUSE: "agent",
  RECOMMENDATION: "agent",
  HUMAN: "human",
  ACTION: "action",
  VERIFICATION: "action",
  NOTE: "agent",
};

const DEFAULT_META = { icon: Info, dotCls: "bg-[#98A2B3]", iconCls: "border-[#E4E7EC] bg-[#F9FAFB] text-[#475467]" };

const RUN_META = { icon: Sparkles, dotCls: "bg-[#0BA5EC]", iconCls: "border-[#B2DDFF] bg-[#EFF8FF] text-[#175CD3]" };
const HUMAN_VIOLET = { dotCls: "bg-[#7A5AF8]", iconCls: "border-[#E9D7FE] bg-[#F9F5FF] text-[#6941C6]" };
const AMBER_ACTION = { dotCls: "bg-[#F79009]", iconCls: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]" };
const EMERALD_VERIFIED = { dotCls: "bg-[#12B76A]", iconCls: "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]" };

const MODE_LABEL: Record<string, string> = {
  DEMO: "demo script",
  GEMINI: "Gemini",
};

const truncate = (s: string, n = 200): string =>
  s.length > n ? `${s.slice(0, n).trimEnd()}…` : s;

// ---------------------------------------------------------------------------
// Export helpers (pure) — CSV / JSON download of the FILTERED trail.
// Client-side only: the feed is already loaded, no extra API round-trip.
// ---------------------------------------------------------------------------

const CSV_COLUMNS = ["timestamp", "kind", "category", "label", "detail", "severity", "incidentId", "source"] as const;

/** RFC-4180-style cell: always quoted, inner quotes doubled, newlines → " ⏎ ". */
const csvEscape = (value: string | null | undefined): string =>
  `"${(value ?? "").replace(/\r?\n/g, " ⏎ ").replace(/"/g, '""')}"`;

/** CSV body: demo-environment disclaimer line, header row, then one row per event. */
const toCsv = (events: AuditEvent[]): string =>
  [
    "# CineFlow AI audit log export — demo environment (simulated production data)",
    CSV_COLUMNS.join(","),
    ...events.map((ev) =>
      [ev.ts, ev.kind, ev.category, ev.label, ev.detail, ev.severity, ev.incidentId, ev.sourceChip]
        .map(csvEscape)
        .join(",")
    ),
  ].join("\r\n") + "\r\n";

/** JSON body: export metadata + filters snapshot + full audit events. */
const toJson = (
  events: AuditEvent[],
  filters: { category: CategoryFilter; severity: SeverityFilter; range: RangeFilter }
): string =>
  JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      product: "CineFlow AI",
      environment: "demo (simulated production data)",
      filters: {
        category: filters.category === "ALL" ? "all" : filters.category,
        severity: filters.severity === "ALL" ? "all" : filters.severity,
        timeRange: filters.range === "ALL" ? "all time" : RANGE_LABEL[filters.range].toLowerCase(),
        eventCount: events.length,
      },
      // AuditEvent fields minus view-model artifacts (icon / dotCls / iconCls);
      // ts → timestamp and sourceChip → source to match the CSV column names.
      events: events.map((ev) => ({
        key: ev.key,
        timestamp: ev.ts,
        kind: ev.kind,
        category: ev.category,
        label: ev.label,
        detail: ev.detail,
        severity: ev.severity,
        incidentId: ev.incidentId,
        sourceType: ev.sourceType,
        source: ev.sourceChip,
      })),
    },
    null,
    2
  );

/** `cineflow-audit-YYYYMMDD-HHmmss.<ext>` (24h clock, zero-padded). */
const exportFilename = (ext: "csv" | "json"): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `cineflow-audit-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`;
};

/** Dependency-free download: Blob → object URL → temporary anchor. */
const downloadFile = (content: string, mime: string, filename: string): void => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// ---------------------------------------------------------------------------
// Fetcher — one composed poll (incidents + per-incident events,
// recommendations, agent runs) so a single useApi call drives the whole feed
// ---------------------------------------------------------------------------

async function fetchAuditFeed(): Promise<AuditFeed> {
  const [incidents, recs, runs] = await Promise.all([
    api.incidents(),
    api.recommendations(),
    api.agentRuns(),
  ]);

  // Per-incident detail fetches are resilient: a single failed incident is
  // skipped rather than failing the whole audit trail.
  const details = await Promise.all(
    incidents.map(async (inc) => {
      try {
        return { inc, detail: await api.incident(inc.id) };
      } catch {
        return null;
      }
    })
  );

  const severityByIncident = new Map<string, Severity>(
    incidents.map((i) => [i.id, i.severity])
  );
  const events: AuditEvent[] = [];

  // 1) Real incident events keep their kind / label / detail.
  for (const item of details) {
    if (!item) continue;
    const { inc, detail } = item;
    for (const ev of detail.events) {
      const meta = KIND_META[ev.kind] ?? DEFAULT_META;
      events.push({
        key: ev.id,
        ts: ev.ts,
        kind: ev.kind,
        label: ev.label,
        detail: ev.detail,
        category: KIND_CATEGORY[ev.kind] ?? "agent",
        icon: meta.icon,
        dotCls: meta.dotCls,
        iconCls: meta.iconCls,
        sourceType: "INCIDENT",
        sourceChip: inc.id,
        incidentId: inc.id,
        severity: inc.severity,
      });
    }
  }

  // 2) Recommendation lifecycle → synthetic decision events. Severity is
  // inherited from the linked incident when present.
  for (const rec of recs) {
    const severity = rec.incidentId ? severityByIncident.get(rec.incidentId) ?? null : null;
    const chip = `REC-${rec.id.slice(0, 6)}`;
    const base = {
      sourceType: "RECOMMENDATION" as const,
      sourceChip: chip,
      incidentId: rec.incidentId,
      severity,
    };

    events.push({
      ...base,
      key: `rec-${rec.id}-created`,
      ts: rec.createdAt,
      kind: "RECOMMENDATION",
      label: "Agent recommendation created",
      detail: `"${rec.title}" — ${rec.risk.toLowerCase()} risk, ${rec.confidence}% confidence. Proposed action: ${rec.actionLabel}.`,
      category: "agent",
      icon: Lightbulb,
      ...AMBER_ACTION,
    });

    if (rec.decidedAt != null && rec.status !== "PENDING") {
      const rejected = rec.status === "REJECTED";
      events.push({
        ...base,
        key: `rec-${rec.id}-decided`,
        ts: rec.decidedAt,
        kind: "HUMAN",
        label: rejected ? "Human decision — recommendation rejected" : "Human decision — recommendation approved",
        detail: rejected
          ? `Operator rejected: ${rec.actionLabel}. No action was taken.`
          : `Operator approved: ${rec.actionLabel} (${rec.risk.toLowerCase()} risk — human approval required by guardrail policy).`,
        category: "human",
        icon: rejected ? UserX : UserCheck,
        ...HUMAN_VIOLET,
      });
    }

    if (rec.executedAt != null) {
      events.push({
        ...base,
        key: `rec-${rec.id}-executed`,
        ts: rec.executedAt,
        kind: "ACTION",
        label: "Action executed",
        detail: `${rec.actionLabel} — executed in the Demo environment (simulated action; no real production infrastructure was modified).`,
        category: "action",
        icon: Wrench,
        ...AMBER_ACTION,
      });
    }

    if (rec.verifiedAt != null) {
      const passed = rec.verification?.passed !== false;
      events.push({
        ...base,
        key: `rec-${rec.id}-verified`,
        ts: rec.verifiedAt,
        kind: "VERIFICATION",
        label: passed ? "Verification passed" : "Verification failed",
        detail: rec.verification
          ? rec.verification.summary
            ? truncate(rec.verification.summary)
            : `${rec.verification.checks.length} recovery checks re-evaluated against thresholds.`
          : "Recovery thresholds re-checked after remediation.",
        category: "action",
        icon: passed ? ShieldCheck : XCircle,
        ...(passed ? EMERALD_VERIFIED : AMBER_ACTION),
      });
    }
  }

  // 3) Agent run lifecycle → synthetic run events.
  for (const run of runs) {
    const severity = run.incidentId ? severityByIncident.get(run.incidentId) ?? null : null;
    const chip = `RUN-${run.id.slice(0, 6)}`;
    const base = {
      sourceType: "RUN" as const,
      sourceChip: chip,
      incidentId: run.incidentId,
      severity,
    };

    events.push({
      ...base,
      key: `run-${run.id}-started`,
      ts: run.createdAt,
      kind: "RUN",
      label: "Agent run started",
      detail: `Query: "${run.query}" · intent: ${run.intent.replace(/_/g, " ")} · mode: ${MODE_LABEL[run.mode] ?? run.mode}.`,
      category: "agent",
      ...RUN_META,
    });

    if (run.completedAt != null) {
      events.push({
        ...base,
        key: `run-${run.id}-completed`,
        ts: run.completedAt,
        kind: "RUN",
        label: "Agent run completed",
        detail: run.summary
          ? truncate(run.summary)
          : "Run finished.",
        category: "agent",
        ...RUN_META,
      });
    }
  }

  // Newest first — the audit trail is read top-down like a log.
  events.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  const decided = recs.filter((r) => r.decidedAt != null && r.status !== "PENDING");
  const approved = decided.filter((r) => r.status !== "REJECTED").length;
  const rejected = decided.filter((r) => r.status === "REJECTED").length;

  return {
    events,
    stats: {
      total: events.length,
      approved,
      rejected,
      executed: recs.filter((r) => r.executedAt != null).length,
      verified: recs.filter((r) => r.status === "VERIFIED").length,
      incidents: incidents.length,
      recommendations: recs.length,
      runs: runs.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Small stat tile (audit-flavored StatCard)
// ---------------------------------------------------------------------------

function StatTile({
  label, value, sub, icon: Icon, valueCls, iconCls,
}: {
  label: string;
  value: number;
  sub: string;
  icon: LucideIcon;
  valueCls: string;
  iconCls: string;
}) {
  return (
    <Card className="min-w-0 rounded-lg border-[#E4E7EC] bg-card shadow-none">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="cine-label mb-1.5 truncate">{label}</p>
            <p className={cn("text-2xl font-semibold tabular-nums tracking-tight", valueCls)}>{value}</p>
            <p className="mt-1 truncate text-[13px] text-[#667085]">{sub}</p>
          </div>
          <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-md border", iconCls)}>
            <Icon className="size-4" aria-hidden />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Timeline row
// ---------------------------------------------------------------------------

function AuditRow({ ev }: { ev: AuditEvent }) {
  const clickable = ev.incidentId != null;
  const Icon = ev.icon;

  const open = () => {
    if (ev.incidentId) navigate(`/incidents/${ev.incidentId}`);
  };

  return (
    <li className="relative pl-10">
      <span
        className={cn(
          "absolute left-0 top-1.5 flex size-7 items-center justify-center rounded-full border bg-white",
          ev.iconCls
        )}
        aria-hidden
      >
        <Icon className="size-3.5" />
      </span>
      <div
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={clickable ? open : undefined}
        onKeyDown={
          clickable
            ? (e) => {
                if (e.key === "Enter") open();
              }
            : undefined
        }
        aria-label={clickable ? `Open incident ${ev.incidentId}: ${ev.label}` : undefined}
        className={cn(
          "rounded-lg border border-transparent px-3 py-2.5 transition-colors",
          clickable &&
            "cursor-pointer hover:border-[#B2DDFF] hover:bg-[#F9FAFB] focus-visible:border-[#B2DDFF] focus-visible:bg-[#F9FAFB] focus-visible:outline-none"
        )}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="font-mono text-xs tabular-nums text-[#667085]">
            {fmtDateTime(ev.ts)}
          </span>
          <span className="text-xs text-[#98A2B3]" aria-hidden>·</span>
          <span className="text-xs text-[#667085]">{timeAgo(ev.ts)}</span>
          <span
            className={cn(
              "ml-auto shrink-0 rounded border px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wide",
              ev.iconCls
            )}
            title={`Event kind: ${ev.kind}`}
          >
            {ev.kind}
          </span>
          <span className="shrink-0 rounded border border-[#E4E7EC] bg-[#F9FAFB] px-1.5 py-0.5 font-mono text-[11px] text-[#667085]">
            {ev.sourceChip}
          </span>
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-2">
          <span className={cn("size-1.5 shrink-0 rounded-full", ev.dotCls)} aria-hidden />
          <span className="min-w-0 truncate text-sm font-medium text-[#111827]">{ev.label}</span>
        </div>
        {ev.detail ? (
          <p className="mt-1 line-clamp-2 break-words text-[13px] leading-relaxed text-[#667085]">
            {ev.detail}
          </p>
        ) : null}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export function AuditView() {
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("ALL");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("ALL");
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>("ALL");

  const { data, loading, error, refetch } = useApi(fetchAuditFeed, { intervalMs: 5000 });

  const events = data?.events ?? [];
  const filtered = useMemo(() => {
    const cutoff =
      rangeFilter === "ALL" ? null : Date.now() - RANGE_HOURS[rangeFilter] * 3_600_000;
    return events.filter(
      (ev) =>
        (categoryFilter === "ALL" || ev.category === categoryFilter) &&
        (severityFilter === "ALL" || ev.severity === severityFilter) &&
        (cutoff == null || new Date(ev.ts).getTime() >= cutoff)
    );
  }, [events, categoryFilter, severityFilter, rangeFilter]);

  const stats = data?.stats;
  const filtersActive =
    categoryFilter !== "ALL" || severityFilter !== "ALL" || rangeFilter !== "ALL";

  const clearFilters = () => {
    setCategoryFilter("ALL");
    setSeverityFilter("ALL");
    setRangeFilter("ALL");
  };

  // Keyboard shortcuts 1–4 switch the time-range chips (All / 1h / 24h / 7d).
  // Ignored while typing in any field — mirrors the "?" shortcuts-dialog guard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const idx = ["1", "2", "3", "4"].indexOf(e.key);
      if (idx < 0) return;
      const t = e.target as HTMLElement | null;
      const typing =
        !!t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable ||
          t.getAttribute("role") === "textbox");
      if (typing) return;
      e.preventDefault();
      setRangeFilter(RANGE_KEYS[idx]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Exports respect the CURRENT filters and the on-screen newest-first order.
  const exportDisabled = loading && !data; // feed still loading, nothing to export yet

  const exportAudit = (format: "csv" | "json") => {
    if (exportDisabled) return; // no-op while disabled
    if (filtered.length === 0) {
      toast.error("Nothing to export — the current filters match no events");
      return;
    }
    const filename = exportFilename(format);
    const content =
      format === "csv"
        ? toCsv(filtered)
        : toJson(filtered, { category: categoryFilter, severity: severityFilter, range: rangeFilter });
    downloadFile(content, format === "csv" ? "text/csv;charset=utf-8" : "application/json", filename);
    toast.success(`Exported ${filtered.length} events`, {
      description: `${filename} · demo environment data`,
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        description="A chronological, tamper-evident trail of agent reasoning, human decisions, and executed actions."
        badge={<DemoTag />}
      />

      {/* Filter bar */}
      <Card className="rounded-lg border-[#E4E7EC] bg-card shadow-none">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs
              value={categoryFilter}
              onValueChange={(v) => setCategoryFilter(v as CategoryFilter)}
            >
              <TabsList className="h-auto w-full flex-wrap justify-start sm:h-9 sm:w-fit sm:flex-nowrap">
                <TabsTrigger value="ALL" className="px-3">All</TabsTrigger>
                <TabsTrigger value="agent" className="px-3">Agent activity</TabsTrigger>
                <TabsTrigger value="human" className="px-3">Human decisions</TabsTrigger>
                <TabsTrigger value="action" className="px-3">Actions &amp; verification</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-[#667085]">
                <span className="font-medium tabular-nums text-[#111827]">{filtered.length}</span>
                {" "}of{" "}
                <span className="font-medium tabular-nums text-[#111827]">{events.length}</span>
                {" "}events
              </span>
              <Select
                value={severityFilter}
                onValueChange={(v) => setSeverityFilter(v as SeverityFilter)}
              >
                <SelectTrigger size="sm" className="w-[150px]" aria-label="Filter by severity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All severities</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                </SelectContent>
              </Select>

              {/* Quick time-range chips — one-tap narrowing (1h / 24h / 7d).
                  Digits 1–4 are keyboard shortcuts; the kbd caps say so. */}
              <div
                className="flex items-center gap-0.5 rounded-md border border-[#E4E7EC] bg-white p-0.5"
                role="group"
                aria-label="Filter by time range (keyboard shortcuts 1 to 4)"
              >
                {RANGE_KEYS.map((r, i) => (
                  <button
                    key={r}
                    onClick={() => setRangeFilter(r)}
                    className={cn(
                      "flex items-center gap-1 rounded-[5px] border px-2 py-1 text-[11px] font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                      rangeFilter === r
                        ? "border-[#B2DDFF] bg-[#EFF8FF] text-[#175CD3]"
                        : "border-transparent bg-white text-[#475467] hover:text-[#111827]"
                    )}
                    aria-pressed={rangeFilter === r}
                    title={`${RANGE_LABEL[r]} (press ${i + 1})`}
                  >
                    {r === "ALL" ? "All" : r}
                    <kbd
                      className={cn(
                        "rounded border px-1 font-mono text-[10px] font-normal leading-4",
                        rangeFilter === r
                          ? "border-[#B2DDFF] bg-white text-[#175CD3]"
                          : "border-[#E4E7EC] bg-[#F9FAFB] text-[#667085]"
                      )}
                    >
                      {i + 1}
                    </kbd>
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-[12px]"
                  disabled={exportDisabled}
                  onClick={() => exportAudit("csv")}
                  aria-label={exportDisabled ? "Audit data still loading" : "Export filtered audit events as CSV"}
                  title={exportDisabled ? "Audit data still loading" : undefined}
                >
                  <FileSpreadsheet className="size-3.5" aria-hidden />
                  Export CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-[12px]"
                  disabled={exportDisabled}
                  onClick={() => exportAudit("json")}
                  aria-label={exportDisabled ? "Audit data still loading" : "Export filtered audit events as JSON"}
                  title={exportDisabled ? "Audit data still loading" : undefined}
                >
                  <FileJson className="size-3.5" aria-hidden />
                  Export JSON
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats row */}
      {stats ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile
            label="Events logged"
            value={stats.total}
            sub={`${stats.incidents} incidents · ${stats.recommendations} recommendations · ${stats.runs} runs`}
            icon={ScrollText}
            valueCls="text-[#111827]"
            iconCls="border-border bg-secondary text-muted-foreground"
          />
          <StatTile
            label="Human decisions"
            value={stats.approved + stats.rejected}
            sub={`${stats.approved} approved · ${stats.rejected} rejected`}
            icon={UserCheck}
            valueCls="text-[#6941C6]"
            iconCls="border-[#E9D7FE] bg-[#F9F5FF] text-[#6941C6]"
          />
          <StatTile
            label="Verified actions"
            value={stats.verified}
            sub={`${stats.executed} action${stats.executed === 1 ? "" : "s"} executed in Demo environment`}
            icon={ShieldCheck}
            valueCls="text-[#067647]"
            iconCls="border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]"
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3" aria-busy="true" aria-label="Loading audit stats">
          <Skeleton className="h-[92px] rounded-lg" />
          <Skeleton className="h-[92px] rounded-lg" />
          <Skeleton className="h-[92px] rounded-lg" />
        </div>
      )}

      {/* Main feed */}
      <Card className="gap-0 overflow-hidden rounded-lg border-[#E4E7EC] bg-card py-0 shadow-none">
        <CardContent className="p-4 pb-3 sm:p-5 sm:pb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight text-[#111827]">Audit trail</h2>
              <p className="mt-0.5 text-[13px] text-[#667085]">
                {filtered.length} event{filtered.length === 1 ? "" : "s"} · newest first
              </p>
            </div>
            <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-[#667085]">
              <span className="cine-pulse size-1.5 rounded-full bg-[#12B76A]" aria-hidden />
              Live · 5s
            </span>
          </div>
        </CardContent>

        <div className="border-t border-[#E4E7EC]">
          {loading && !data ? (
            <div className="p-4 sm:p-5">
              <LoadingRows rows={8} />
            </div>
          ) : error && !data ? (
            <div className="p-4 sm:p-5">
              <ErrorState message={error} onRetry={refetch} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4 sm:p-5">
              <EmptyState
                icon={ScrollText}
                title="No audit events match the current filters"
                description={
                  filtersActive
                    ? "Try a different category, severity or time range, or clear the filters to see the full trail."
                    : "No agent activity, human decisions or executed actions have been recorded yet."
                }
                action={
                  filtersActive ? (
                    <Button variant="outline" size="sm" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <div className="cine-scroll max-h-[calc(100vh-320px)] overflow-y-auto p-4 pr-3 sm:p-5 sm:pr-4">
              <ol className="cine-timeline relative space-y-1.5" aria-label="Audit event timeline, newest first">
                {filtered.map((ev) => (
                  <AuditRow key={ev.key} ev={ev} />
                ))}
              </ol>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

export default AuditView;
