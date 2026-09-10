"use client";

// CineFlow AI — production view: summary KPIs, a pipeline-load chart (top
// workflows by combined load, colored by health) and a phase-grouped
// operational table. Each row opens a per-workflow drill-down dialog with
// linked incidents.
//
// Data flow: one 8s poll of /api/workflows (KPIs + chart + table) plus one 30s
// poll of /api/incidents (per-workflow incident counts in the drill-down).

import { useEffect, useRef, useState } from "react";
import {
  Boxes, ChevronRight, Layers, ListVideo, Sparkles, Timer, TriangleAlert,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from "@/components/ui/chart";
import { navigate } from "@/components/app/router";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/client/api";
import { useCineFlowStore } from "@/lib/client/store";
import { fmtNumber, healthLabel, timeAgo } from "@/lib/format";
import { DemoTag, IncidentStatusBadge, SeverityBadge, StatusBadge } from "@/components/app/shared/badges";
import { EmptyState, ErrorState, LoadingCards, LoadingRows, PageHeader, StatCard } from "@/components/app/shared/ui";
import { cn } from "@/lib/utils";
import type { Health, IncidentDTO, WorkflowDTO } from "@/lib/types";

const INVESTIGATE_QUERY = "Why is the post-production render pipeline delayed?";

// --- Chart tuning -------------------------------------------------------------
// Health colors mirror the StatusBadge tones (critical = rose, warning =
// amber, healthy = emerald) so the chart, badges and table read as one system.
const HEALTH_COLORS: Record<Health, string> = {
  CRITICAL: "#F04438",
  WARNING: "#F79009",
  HEALTHY: "#12B76A",
};

const LOAD_TOP_N = 8;        // workflows shown in the load chart
const NAME_MAX_CHARS = 15;   // Y-axis label truncation (single line, no wrap)
const LATENCY_ELEVATED_MS = 3000;

const loadChartConfig = {
  load: { label: "Pipeline load", color: "#2563EB" },
} satisfies ChartConfig;

/** Chart row: one workflow's combined load (queue depth + active jobs). */
interface LoadRow {
  key: string;
  name: string; // full name (tooltip label)
  short: string; // truncated name (Y axis)
  load: number;
  fill: string;
  queueDepth: number;
  activeJobs: number;
  latencyMs: number;
}

// --- Small formatting helpers -------------------------------------------------

function failureTone(rate: number): { fill: string; text: string } {
  if (rate < 1) return { fill: "bg-[#12B76A]", text: "text-[#067647]" };
  if (rate < 3) return { fill: "bg-[#F79009]", text: "text-[#B54708]" };
  return { fill: "bg-[#F04438]", text: "text-[#B42318]" };
}

/** "4.2s" style seconds from milliseconds. */
function fmtSeconds(ms: number): string {
  return `${Number((ms / 1000).toFixed(2))}s`;
}

/** Compact axis tick: 1500 → "1.5k". */
function compactTick(v: number): string {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return `${Math.round(v)}`;
}

/** Compact stat value: 1240 → "1.2k", 176 → "176". */
function fmtCompact(n: number): string {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return fmtNumber(Math.round(n));
}

function truncateName(name: string, max = NAME_MAX_CHARS): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

// ---------------------------------------------------------------------------
// Dialog metric (also reused in the drill-down dialog)
// ---------------------------------------------------------------------------

function WorkflowMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="cine-label truncate">{label}</p>
      <p className="mt-0.5 text-sm tabular-nums text-[#111827]">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pipeline load chart — top N workflows by combined load (queue + active jobs),
// colored by health status. Horizontal bars via recharts layout="vertical".
// ---------------------------------------------------------------------------

function PipelineLoadCard({ workflows }: { workflows: WorkflowDTO[] }) {
  // Largest load renders at the top of a vertical-layout bar chart, so the
  // descending top-N list is reversed for display.
  const rows: LoadRow[] = workflows
    .map((w) => ({
      key: w.key,
      name: w.name,
      short: truncateName(w.name),
      load: w.queueDepth + w.activeJobs,
      fill: HEALTH_COLORS[w.health],
      queueDepth: w.queueDepth,
      activeJobs: w.activeJobs,
      latencyMs: w.latencyMs,
    }))
    .sort((a, b) => b.load - a.load)
    .slice(0, LOAD_TOP_N)
    .reverse();

  if (rows.length === 0) return null;

  const totalLoad = workflows.reduce((sum, w) => sum + w.queueDepth + w.activeJobs, 0);

  return (
    <Card className="border-[#E4E7EC] shadow-none">
      <CardHeader className="border-b border-[#E4E7EC] py-4">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base font-semibold text-[#111827]">Pipeline load</CardTitle>
          <DemoTag />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] text-[#667085]">
            Top {rows.length} workflows by combined load — queued + active jobs · bar color = health
          </p>
          <span className="rounded-md border border-[#E4E7EC] bg-[#F9FAFB] px-2 py-1 font-mono text-[11px] tabular-nums text-[#475467]">
            {fmtNumber(totalLoad)} jobs in flight
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="min-w-0">
          <ChartContainer
            config={loadChartConfig}
            className="h-[300px] w-full"
            role="img"
            aria-label={`Horizontal bar chart of the ${rows.length} busiest production workflows by combined queued and active jobs, colored by health status`}
          >
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 42, bottom: 0, left: 0 }}>
              <CartesianGrid horizontal={false} stroke="#E4E7EC" strokeDasharray="3 4" />
              <XAxis
                type="number"
                domain={[0, (dataMax: number) => Math.max(dataMax, 4)]}
                tickCount={5}
                allowDecimals={false}
                tickFormatter={compactTick}
                tickLine={false}
                axisLine={false}
                tickMargin={6}
                tick={{ fill: "#667085", fontSize: 12 }}
              />
              <YAxis
                type="category"
                dataKey="short"
                width={112}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#667085", fontSize: 12 }}
              />
              <ChartTooltip
                cursor={{ fill: "#F9FAFB" }}
                content={
                  <ChartTooltipContent
                    className="border-[#E4E7EC] shadow-sm"
                    labelFormatter={(_label, payload) => {
                      const row = payload?.[0]?.payload as LoadRow | undefined;
                      return row?.name ?? null;
                    }}
                    formatter={(value, _name, item) => {
                      const row = item?.payload as LoadRow | undefined;
                      if (!row) return null;
                      return (
                        <div className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 leading-none">
                          <span className="flex items-center gap-1.5 text-[#667085]">
                            <span
                              className="size-2 shrink-0 rounded-[2px]"
                              style={{ backgroundColor: row.fill }}
                              aria-hidden
                            />
                            Load {fmtCompact(Number(value))}
                          </span>
                          <span className="font-mono font-medium tabular-nums">
                            Queue {fmtNumber(row.queueDepth)} · ACTIVE {fmtNumber(row.activeJobs)} · p95 {fmtSeconds(row.latencyMs)}
                          </span>
                        </div>
                      );
                    }}
                  />
                }
              />
              <Bar dataKey="load" name="load" barSize={16} radius={[0, 3, 3, 0]} isAnimationActive={false}>
                {rows.map((row) => (
                  <Cell key={row.key} fill={row.fill} />
                ))}
                <LabelList
                  dataKey="load"
                  position="right"
                  offset={6}
                  formatter={(v: number) => fmtCompact(v)}
                  style={{ fill: "#667085", fontSize: 11, fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        </div>

        {/* Health color legend */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {(["HEALTHY", "WARNING", "CRITICAL"] as const).map((h) => (
            <span key={h} className="flex items-center gap-1.5 text-[11px] text-[#667085]">
              <span
                className="size-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: HEALTH_COLORS[h] }}
                aria-hidden
              />
              {healthLabel(h)}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Operational table — one row per workflow; the row (and the workflow name
// button) opens the drill-down dialog.
// ---------------------------------------------------------------------------

function WorkflowRow({ workflow, onOpen }: { workflow: WorkflowDTO; onOpen: () => void }) {
  const fTone = failureTone(workflow.failureRate);
  const latencyElevated = workflow.latencyMs > LATENCY_ELEVATED_MS;

  return (
    <TableRow
      className="cursor-pointer border-[#E4E7EC] text-[14px] text-[#344054] cine-row-hover"
      onClick={onOpen}
    >
      <TableCell className="max-w-72 py-3">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          aria-label={`Open workflow details for ${workflow.name}`}
          className="group/wf flex min-w-0 items-center gap-1.5 rounded text-left font-medium text-[#111827] transition-colors hover:text-[#175CD3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/40"
        >
          <span className="max-w-56 truncate">{workflow.name}</span>
          <ChevronRight
            className="size-3.5 shrink-0 text-[#98A2B3] transition-all group-hover/wf:translate-x-0.5 group-hover/wf:text-[#175CD3]"
            aria-hidden
          />
        </button>
      </TableCell>
      <TableCell><StatusBadge status={workflow.health} /></TableCell>
      <TableCell className="text-right font-mono tabular-nums">{fmtNumber(workflow.activeJobs)}</TableCell>
      <TableCell className="hidden text-right font-mono tabular-nums md:table-cell">
        {fmtNumber(workflow.queueDepth)}
      </TableCell>
      <TableCell
        className={cn("text-right font-mono tabular-nums", latencyElevated && "font-semibold text-[#B54708]")}
        title={latencyElevated ? "p95 latency above the 3s elevated threshold" : undefined}
      >
        {fmtNumber(workflow.latencyMs)} ms
      </TableCell>
      <TableCell className="hidden text-right font-mono tabular-nums sm:table-cell">
        {fmtNumber(workflow.throughputPerMin)}/min
      </TableCell>
      <TableCell className={cn("hidden text-right font-mono tabular-nums xl:table-cell", fTone.text)}>
        {workflow.failureRate.toFixed(1)}%
      </TableCell>
      <TableCell className="hidden text-right text-[13px] text-[#667085] md:table-cell">
        {timeAgo(workflow.lastUpdate)}
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Workflow drill-down dialog
// ---------------------------------------------------------------------------

function WorkflowDialog({
  workflow, phaseLabel, incidents, incidentsError, maxQueueDepth, busiestName, onClose,
}: {
  workflow: WorkflowDTO;
  phaseLabel: string;
  incidents: IncidentDTO[] | null;
  incidentsError: string | null;
  maxQueueDepth: number;
  busiestName: string | null;
  onClose: () => void;
}) {
  const queueAutoQuery = useCineFlowStore((s) => s.queueAutoQuery);
  const wf = workflow;
  const linked = (incidents ?? []).filter((i) => i.workflowKey === wf.key);
  const queuePct = maxQueueDepth > 0 ? Math.min(100, (wf.queueDepth / maxQueueDepth) * 100) : 0;
  const isBusiest = maxQueueDepth > 0 && wf.queueDepth === maxQueueDepth;

  const investigate = () => {
    onClose();
    queueAutoQuery(INVESTIGATE_QUERY);
    navigate("/agent");
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      {/* sm:max-w-2xl overrides the default sm:max-w-lg; base width stays
          w-full max-w-[calc(100%-2rem)] so the 390px viewport is safe. */}
      <DialogContent className="cine-scroll max-h-[calc(100vh-4rem)] overflow-y-auto p-4 sm:max-w-2xl sm:p-6">
        <DialogHeader className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="text-base font-semibold leading-snug">{wf.name}</DialogTitle>
            <Badge
              variant="outline"
              className="shrink-0 border-[#E4E7EC] bg-[#F9FAFB] font-mono text-[11px] uppercase tracking-[0.08em] text-[#475467]"
            >
              {phaseLabel}
            </Badge>
            <StatusBadge status={wf.health} className="shrink-0" />
          </div>
          <DialogDescription className="text-left leading-relaxed">{wf.description}</DialogDescription>
          <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-[11px] text-[#667085]">
            <span>
              <span className="cine-label mr-1.5">KEY</span>
              {wf.key}
            </span>
            <span>
              <span className="cine-label mr-1.5">STAGE</span>
              {wf.stage}
            </span>
          </p>
        </DialogHeader>

        {/* Metric grid */}
        <section className="min-w-0 space-y-2.5">
          <p className="cine-label">Pipeline metrics</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-[#E4E7EC] bg-[#F9FAFB] p-4 sm:grid-cols-3">
            <WorkflowMetric label="Active jobs" value={fmtNumber(wf.activeJobs)} />
            <WorkflowMetric label="p95 latency" value={fmtSeconds(wf.latencyMs)} />
            <WorkflowMetric label="Failure rate" value={`${wf.failureRate.toFixed(1)}%`} />
            <WorkflowMetric label="Queue depth" value={fmtNumber(wf.queueDepth)} />
            <WorkflowMetric label="Throughput" value={`${fmtNumber(wf.throughputPerMin)}/min`} />
            <WorkflowMetric label="Last update" value={timeAgo(wf.lastUpdate)} />
          </div>
        </section>

        {/* Queue depth vs busiest pipeline */}
        <div className="min-w-0 rounded-lg border border-[#E4E7EC] bg-[#F9FAFB] px-3.5 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="cine-label">Queue depth vs busiest pipeline</p>
            <p className="font-mono text-xs tabular-nums text-[#111827]">
              {fmtNumber(wf.queueDepth)} <span className="text-[#667085]">/ {fmtNumber(maxQueueDepth)} jobs</span>
            </p>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#E4E7EC]">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${queuePct}%`, backgroundColor: HEALTH_COLORS[wf.health] }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-[#667085]">
            {isBusiest
              ? "This is the busiest pipeline right now."
              : `Busiest: ${busiestName ?? "—"} · ${fmtNumber(maxQueueDepth)} jobs`}
          </p>
        </div>

        {/* Linked incidents */}
        <div className="min-w-0 space-y-2.5">
          <p className="cine-label">Linked incidents</p>
          {incidentsError ? (
            <p className="text-xs text-[#B42318]">Could not load incidents: {incidentsError}</p>
          ) : incidents == null ? (
            <p className="text-xs text-[#667085]">Loading linked incidents…</p>
          ) : linked.length === 0 ? (
            <p className="text-xs text-[#667085]">No incidents linked to this workflow.</p>
          ) : (
            <div className="space-y-2">
              {linked.map((inc) => (
                <button
                  key={inc.id}
                  type="button"
                  onClick={() => navigate(`/incidents/${inc.id}`)}
                  aria-label={`Open incident ${inc.id}: ${inc.title}`}
                  className="w-full rounded-lg border border-[#E4E7EC] bg-white px-3 py-2.5 text-left transition-colors hover:border-[#B2DDFF] hover:bg-[#F9FAFB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/40"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-[#175CD3]">{inc.id}</span>
                    <SeverityBadge severity={inc.severity} />
                    <IncidentStatusBadge status={inc.status} />
                    <span className="ml-auto shrink-0 text-[11px] text-[#667085]">
                      {timeAgo(inc.detectedAt)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm font-medium leading-snug text-[#111827]">{inc.title}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {wf.health !== "HEALTHY" ? (
          <DialogFooter className="mt-1">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-[#E4E7EC] text-[#344054] hover:bg-[#F9FAFB] hover:text-[#111827]"
              onClick={investigate}
            >
              <Sparkles className="size-3.5" aria-hidden />
              Investigate with agent
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export function WorkflowsView({ focusKey }: { focusKey?: string }) {
  const { data, loading, error, refetch } = useApi(() => api.workflows(), { intervalMs: 8000 });
  const { data: incidents, error: incidentsError } = useApi(() => api.incidents(), { intervalMs: 30000 });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const all = data?.phases.flatMap((p) => p.workflows) ?? [];
  const selected = selectedKey != null ? all.find((w) => w.key === selectedKey) ?? null : null;
  const selectedPhaseLabel =
    selected && data ? data.phases.find((p) => p.phase === selected.phase)?.label ?? selected.phase : "";

  // Deep link: #/workflows?wf={key} (e.g. from the compare view's workflow chip)
  // opens that workflow's drill-down dialog once its data has loaded. Guarded by
  // a ref so closing the dialog is respected — the 8s poll won't re-open it.
  const appliedFocusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusKey || appliedFocusRef.current === focusKey || all.length === 0) return;
    appliedFocusRef.current = focusKey;
    if (!all.some((w) => w.key === focusKey)) return;
    const t = setTimeout(() => setSelectedKey(focusKey), 0);
    return () => clearTimeout(t);
  }, [focusKey, all]);

  // Summary strip aggregates (computed live from the poll).
  const unhealthyCount = all.filter((w) => w.health !== "HEALTHY").length;
  const anyCritical = all.some((w) => w.health === "CRITICAL");
  const totalActiveJobs = all.reduce((sum, w) => sum + w.activeJobs, 0);
  const avgLatency = all.length > 0 ? all.reduce((sum, w) => sum + w.latencyMs, 0) / all.length : 0;
  const worstLatency = all.reduce<WorkflowDTO | null>(
    (worst, w) => (worst == null || w.latencyMs > worst.latencyMs ? w : worst),
    null
  );
  const maxQueueDepth = all.reduce((m, w) => Math.max(m, w.queueDepth), 0);
  const busiestName = maxQueueDepth > 0 ? all.find((w) => w.queueDepth === maxQueueDepth)?.name ?? null : null;

  return (
    <div className="space-y-6 pb-4">
      <PageHeader
        title="Production"
        description="Operational status of the 24 AI-assisted production pipelines — health, jobs, queue, latency and throughput across every phase of the studio pipeline."
        badge={<DemoTag label="Seeded demo data" />}
      />

      {loading ? (
        <div className="space-y-6">
          <LoadingCards cards={4} />
          <LoadingRows rows={8} />
        </div>
      ) : null}
      {error ? <ErrorState message={error} onRetry={refetch} /> : null}

      {!loading && !error && data ? (
        all.length === 0 ? (
          <EmptyState
            title="No workflows found"
            description="The demo database has no seeded pipelines. Reset the demo data from Settings to restore them."
            icon={Boxes}
          />
        ) : (
          <>
            {/* Summary strip */}
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <StatCard
                label="Total workflows"
                value={data.total}
                icon={Layers}
                sub={`across ${data.phases.length} phases`}
              />
              <StatCard
                label="Degraded"
                value={unhealthyCount}
                icon={TriangleAlert}
                tone={unhealthyCount === 0 ? "positive" : anyCritical ? "critical" : "warning"}
                sub="warning + critical"
              />
              <StatCard
                label="Active jobs"
                value={fmtCompact(totalActiveJobs)}
                icon={ListVideo}
                tone="accent"
                sub="jobs in flight"
              />
              <StatCard
                label="Avg p95 latency"
                value={fmtSeconds(avgLatency)}
                icon={Timer}
                tone={worstLatency != null && worstLatency.latencyMs > LATENCY_ELEVATED_MS ? "warning" : "default"}
                sub={worstLatency ? `worst: ${worstLatency.name} ${fmtSeconds(worstLatency.latencyMs)}` : undefined}
              />
            </div>

            {/* Pipeline load chart */}
            <PipelineLoadCard workflows={all} />

            {/* Phase sections — operational table per phase */}
            {data.phases.map((phase) => {
              const phaseUnhealthy = phase.workflows.filter((w) => w.health !== "HEALTHY").length;
              const phaseCritical = phase.workflows.some((w) => w.health === "CRITICAL");
              return (
                <section key={phase.phase} aria-labelledby={`phase-${phase.phase}`} className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-baseline gap-2.5">
                      <h2 id={`phase-${phase.phase}`} className="cine-label">
                        {phase.label}
                      </h2>
                      <span className="text-xs text-[#667085]">{phase.workflows.length} workflows</span>
                    </div>
                    {phaseUnhealthy > 0 ? (
                      <Badge
                        variant="outline"
                        className={cn(
                          "gap-1.5 text-[11px] font-medium",
                          phaseCritical
                            ? "border-[#FEE4E2] bg-[#FEF3F2] text-[#B42318]"
                            : "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]"
                        )}
                      >
                        <span
                          className={cn("size-1.5 rounded-full", phaseCritical ? "bg-[#F04438]" : "bg-[#F79009]")}
                          aria-hidden
                        />
                        {phaseUnhealthy} degraded
                      </Badge>
                    ) : null}
                  </div>
                  <Card className="border-[#E4E7EC] shadow-none">
                    <CardContent className="pt-0">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-[#E4E7EC] hover:bg-transparent">
                            <TableHead className="text-[13px] font-semibold text-[#667085]">Workflow</TableHead>
                            <TableHead className="text-[13px] font-semibold text-[#667085]">Status</TableHead>
                            <TableHead className="text-right text-[13px] font-semibold text-[#667085]">Active jobs</TableHead>
                            <TableHead className="hidden text-right text-[13px] font-semibold text-[#667085] md:table-cell">Queue</TableHead>
                            <TableHead className="text-right text-[13px] font-semibold text-[#667085]">p95 latency</TableHead>
                            <TableHead className="hidden text-right text-[13px] font-semibold text-[#667085] sm:table-cell">Throughput</TableHead>
                            <TableHead className="hidden text-right text-[13px] font-semibold text-[#667085] xl:table-cell">Failures</TableHead>
                            <TableHead className="hidden text-right text-[13px] font-semibold text-[#667085] md:table-cell">Last updated</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {phase.workflows.map((wf) => (
                            <WorkflowRow key={wf.key} workflow={wf} onOpen={() => setSelectedKey(wf.key)} />
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </section>
              );
            })}

            {/* Drill-down dialog */}
            {selected ? (
              <WorkflowDialog
                workflow={selected}
                phaseLabel={selectedPhaseLabel}
                incidents={incidents}
                incidentsError={incidentsError}
                maxQueueDepth={maxQueueDepth}
                busiestName={busiestName}
                onClose={() => setSelectedKey(null)}
              />
            ) : null}
          </>
        )
      ) : null}
    </div>
  );
}
