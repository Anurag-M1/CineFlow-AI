"use client";

// CineFlow AI — Production Operations Dashboard view.
// Polls /api/summary every 5s (KPIs, scenario state, incidents, agent activity)
// and /api/workflows every 15s (production workflows table). Hosts the demo
// scenario entry point (queues the canonical agent query), the render-pipeline
// trend chart (queue depth + p95 latency via Recharts), the recent-incidents
// table and the live agent activity feed.

import { useState } from "react";
import {
  Activity, AlertTriangle, ArrowRight, Boxes, CheckCircle2, ChevronRight, FileText,
  HeartPulse, Play, RotateCcw, Sparkles, Timer,
} from "lucide-react";
import { toast } from "sonner";
import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { fmtNumber, timeAgo } from "@/lib/format";
import { DemoTag, IncidentStatusBadge, SeverityBadge, StatusBadge } from "@/components/app/shared/badges";
import {
  AnimatedNumber, EmptyState, ErrorState, LoadingRows, PageHeader, StatCard,
} from "@/components/app/shared/ui";
import { cn } from "@/lib/utils";
import type { AgentMode, Health, RunStatus, SummaryDTO, WorkflowDTO } from "@/lib/types";

const CANONICAL_DEMO_QUERY = "Why is the post-production render pipeline delayed?";

// --- Render pipeline trend chart tuning -------------------------------------
// Enterprise light-theme chart: queue depth is primary blue, p95 latency is
// amber. Fills are flat, very low opacity (no gradients); grid lines are the
// neutral border token (#E4E7EC) dashed; axis ticks are 12px #667085.
const QUEUE_STROKE = "#2563EB";
const LATENCY_STROKE = "#F79009";
const QUEUE_BASELINE = 131;        // seeded baseline queue depth (jobs)
const QUEUE_ELEVATED = 150;        // chip switches to "elevated" above this
const LATENCY_SLO_MS = 2500;
const LATENCY_ELEVATED = 3000;     // chip switches to breach above this
const TREND_WINDOW_MIN = 30;       // minutes covered by the history window

const trendChartConfig = {
  queue: { label: "Queue depth", color: QUEUE_STROKE },
  latency: { label: "p95 latency", color: LATENCY_STROKE },
} satisfies ChartConfig;

type TrendTab = "queue" | "latency" | "both";

interface TrendPoint {
  /** Minutes since window start (0 = 30m ago, 30 = now). */
  m: number;
  queue?: number;
  latency?: number;
}

const RUN_STATUS_MAP: Record<RunStatus, { label: string; cls: string }> = {
  RUNNING: { label: "Running", cls: "border-[#B2DDFF] bg-[#EFF8FF] text-[#175CD3]" },
  AWAITING_APPROVAL: { label: "Awaiting approval", cls: "border-[#B2DDFF] bg-[#EFF8FF] text-[#175CD3]" },
  EXECUTING: { label: "Executing", cls: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]" },
  COMPLETED: { label: "Completed", cls: "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]" },
  REJECTED: { label: "Rejected", cls: "border-[#FEE4E2] bg-[#FEF3F2] text-[#B42318]" },
  FAILED: { label: "Failed", cls: "border-[#FEE4E2] bg-[#FEF3F2] text-[#B42318]" },
};

const TERMINAL_RUN_STATUS: readonly RunStatus[] = ["COMPLETED", "REJECTED", "FAILED"];

const MODE_LABEL: Record<AgentMode, string> = {
  DEMO: "demo script",
  GEMINI: "Gemini",
};

const SCENARIO_FLOW = ["Detect", "Investigate", "Recommend", "Approve", "Execute", "Verify"];

const SCENARIO_ACTIVE_STATUSES = ["RUNNING", "AWAITING_APPROVAL", "REMEDIATING"];

// Production workflows table: rows shown on the dashboard (most operationally
// relevant first — unhealthy pipelines, then busiest) out of the full set.
const WORKFLOW_ROWS = 6;
const HEALTH_ORDER: Record<Health, number> = { CRITICAL: 0, WARNING: 1, HEALTHY: 2 };

function RunStatusBadge({ status }: { status: RunStatus }) {
  const m = RUN_STATUS_MAP[status] ?? { label: status, cls: "border-[#E4E7EC] bg-[#F2F4F7] text-[#475467]" };
  return <Badge variant="outline" className={cn("text-[12px] font-medium", m.cls)}>{m.label}</Badge>;
}

/** Workflows most relevant to operations: worst health first, then busiest. */
function topWorkflowsByOpsInterest(workflows: WorkflowDTO[], limit: number): WorkflowDTO[] {
  return [...workflows]
    .sort((a, b) => (HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health]) || (b.activeJobs - a.activeJobs))
    .slice(0, limit);
}

// --- Small formatting helpers (chart chips / MTTR) ---------------------------

function compactTick(v: number): string {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return `${Math.round(v)}`;
}

function fmtSeconds(ms: number): string {
  return `${Number((ms / 1000).toFixed(2))}s`;
}

function fmtDurationShort(ms: number): string {
  const minutes = ms / 60_000;
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))}m`;
  return `${(minutes / 60).toFixed(1)}h`;
}

/** Mean time to resolve across incidents that have a resolvedAt timestamp. */
function computeMttr(incidents: SummaryDTO["recentIncidents"]): string | null {
  const deltas = incidents
    .map((i) => (i.resolvedAt
      ? Math.max(0, new Date(i.resolvedAt).getTime() - new Date(i.detectedAt).getTime())
      : null))
    .filter((d): d is number => d != null);
  if (deltas.length === 0) return null;
  return fmtDurationShort(deltas.reduce((a, b) => a + b, 0) / deltas.length);
}

/**
 * Detect the strongest positive step change in the latency history (the
 * v2.4.1 deployment moment in the seeded demo) and return its x position in
 * minutes-from-window-start. Returns null when no meaningful step exists —
 * the marker is only ever drawn from real data. Robust to appended
 * post-remediation points: recovery is a negative step, never the max.
 */
function findDeployChangePoint(history: number[], windowMin: number): number | null {
  if (!history || history.length < 3) return null;
  let bestI = -1;
  let bestDelta = 0;
  for (let i = 1; i < history.length; i++) {
    const d = history[i] - history[i - 1];
    if (d > bestDelta) {
      bestDelta = d;
      bestI = i;
    }
  }
  if (bestI < 1 || bestDelta <= 0) return null;
  const range = Math.max(...history) - Math.min(...history);
  if (range <= 0 || bestDelta < range * 0.2) return null;
  // Fractional index between the two points that bracket the step.
  const frac = bestI - 0.5;
  return (frac / (history.length - 1)) * windowMin;
}

// ---------------------------------------------------------------------------
// Dashboard skeleton (initial load)
// ---------------------------------------------------------------------------

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <Skeleton className="h-40 w-full rounded-lg" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-[420px] w-full rounded-lg" />
      <Card className="rounded-lg border-[#E4E7EC] shadow-none gap-0 py-0">
        <CardHeader className="border-b border-[#E4E7EC] px-5 py-4 [.border-b]:pb-4">
          <Skeleton className="h-5 w-44" />
        </CardHeader>
        <CardContent className="px-5 pt-4 pb-5">
          <LoadingRows rows={5} />
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card className="rounded-lg border-[#E4E7EC] shadow-none gap-0 py-0">
          <CardHeader className="border-b border-[#E4E7EC] px-5 py-4 [.border-b]:pb-4">
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent className="px-5 pt-4 pb-5">
            <LoadingRows rows={4} />
          </CardContent>
        </Card>
        <Card className="rounded-lg border-[#E4E7EC] shadow-none gap-0 py-0">
          <CardHeader className="border-b border-[#E4E7EC] px-5 py-4 [.border-b]:pb-4">
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="px-5 pt-4 pb-5">
            <LoadingRows rows={4} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demo scenario card — entry point for the canonical agent run
// ---------------------------------------------------------------------------

function ScenarioCard({ summary, onReset, resetting }: {
  summary: { scenario: { status: string; runCount: number }; queueDepth: number; renderWorkers: number };
  onReset: () => void;
  resetting: boolean;
}) {
  const resolved = summary.scenario.status === "RESOLVED";
  const active = SCENARIO_ACTIVE_STATUSES.includes(summary.scenario.status);

  const loadScenario = () => {
    useCineFlowStore.getState().queueAutoQuery(CANONICAL_DEMO_QUERY);
    navigate("/agent");
  };

  if (resolved) {
    return (
      <Card className="rounded-lg border-[#E4E7EC] border-l-[3px] border-l-[#12B76A] shadow-none gap-0 py-0">
        <CardHeader className="border-b border-[#E4E7EC] px-5 py-4 [.border-b]:pb-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-[#ABEFC6] bg-[#ECFDF3]">
              <CheckCircle2 className="size-4 text-[#067647]" aria-hidden />
            </span>
            <CardTitle className="text-base font-semibold">Scenario resolved</CardTitle>
            <IncidentStatusBadge status="RESOLVED" />
            <span className="cine-label">run #{summary.scenario.runCount}</span>
          </div>
          <p className="text-[13px] text-[#667085]">INC-1042 · recovery verified against thresholds</p>
        </CardHeader>
        <CardContent className="px-5 pt-4 pb-5">
          <p className="max-w-3xl text-sm leading-relaxed text-[#475467]">
            INC-1042 is resolved: the agent diagnosed the degraded worker after the
            render-worker v2.4.1 rollout, you approved scaling workers 4&nbsp;→&nbsp;6, and
            recovery was verified against queue, latency and GPU thresholds. Reset the demo
            data to run the scenario again from the start.
          </p>
          <div className="mt-4">
            <Button
              variant="outline"
              className="h-9 border-[#D0D5DD] bg-white px-3.5 text-[13px] font-semibold text-[#344054] hover:bg-[#F9FAFB]"
              onClick={onReset}
              disabled={resetting}
            >
              <RotateCcw className={cn("size-4", resetting && "cine-pulse")} aria-hidden />
              {resetting ? "Resetting…" : "Reset demo data"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-lg border-[#E4E7EC] border-l-[3px] border-l-[#0BA5EC] shadow-none gap-0 py-0">
      <CardHeader className="border-b border-[#E4E7EC] px-5 py-4 [.border-b]:pb-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <CardTitle className="text-base font-semibold">Resolve a render pipeline delay with the agent</CardTitle>
          <Badge
            variant="outline"
            className="gap-1.5 border-[#B2DDFF] bg-[#EFF8FF] text-[12px] font-medium text-[#175CD3]"
          >
            <Sparkles className="size-3" aria-hidden />
            Demo scenario
          </Badge>
        </div>
        <p className="text-[13px] text-[#667085]">INC-1042 · post-production render delay</p>
      </CardHeader>
      <CardContent className="px-5 pt-4 pb-5">
        <p className="max-w-3xl text-sm leading-relaxed text-[#475467]">
          One of 4 render workers went degraded after the render-worker v2.4.1 deployment 35
          minutes ago. Queue depth is 187 jobs (+42% vs baseline) and p95 latency sits at 4.2s
          against a 2.5s SLO — final VFX renders are at risk. The agent investigates with real
          tool calls, identifies the root cause and recommends scaling render workers 4&nbsp;→&nbsp;6.
          That medium-risk action pauses for your approval, then executes and verifies recovery
          against thresholds.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className="sr-only">Scenario stages</span>
          {SCENARIO_FLOW.map((step, i) => (
            <span key={step} className="flex items-center gap-1.5">
              {i > 0 ? <ArrowRight className="size-3 text-[#98A2B3]" aria-hidden /> : null}
              <span className="rounded-md border border-[#E4E7EC] bg-[#F9FAFB] px-2 py-1 text-[11px] font-medium text-[#475467]">
                {step}
              </span>
            </span>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2.5">
          <Button
            className="h-9 bg-[#2563EB] px-3.5 text-[13px] font-semibold text-white hover:bg-[#1D4ED8]"
            onClick={loadScenario}
          >
            <Play className="size-4" aria-hidden />
            Load Demo Scenario
          </Button>
          {active ? (
            <button
              type="button"
              onClick={() => navigate("/agent")}
              className="flex items-center gap-1.5 text-[13px] font-medium text-[#175CD3] hover:underline"
            >
              <span className="cine-pulse inline-block size-1.5 rounded-full bg-[#2563EB]" aria-hidden />
              Run in progress — open agent console
            </button>
          ) : (
            <span className="text-[12px] text-[#667085]">
              Deterministic · ~60 seconds end-to-end
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Render pipeline trends (queue depth + p95 latency, Recharts area chart)
// ---------------------------------------------------------------------------

function RenderPipelineCard({ queueDepth, renderLatencyMs, renderWorkers, queueHistory, latencyHistory }: {
  queueDepth: number;
  renderLatencyMs: number;
  renderWorkers: number;
  queueHistory: number[];
  latencyHistory: number[];
}) {
  const [tab, setTab] = useState<TrendTab>("both");
  const showQueue = tab !== "latency";
  const showLatency = tab !== "queue";

  // Both histories are newest-last; the window is labeled as 30 minutes.
  const points = Math.max(queueHistory.length, latencyHistory.length);
  const data: TrendPoint[] = Array.from({ length: points }, (_, i) => ({
    m: points > 1 ? (i / (points - 1)) * TREND_WINDOW_MIN : TREND_WINDOW_MIN,
    queue: queueHistory[i],
    latency: latencyHistory[i],
  }));
  const hasHistory = queueHistory.length >= 2 || latencyHistory.length >= 2;

  const queueElevated = queueDepth > QUEUE_ELEVATED;
  const latencyElevated = renderLatencyMs > LATENCY_ELEVATED;
  const queuePct = Math.floor(((queueDepth - QUEUE_BASELINE) / QUEUE_BASELINE) * 100);
  const sloLabel = `${(LATENCY_SLO_MS / 1000).toFixed(1)}s`;
  // Change-point marker for the render-worker v2.4.1 deployment (data-driven:
  // strongest positive step in the latency history; null → marker hidden).
  const deployX = findDeployChangePoint(latencyHistory, TREND_WINDOW_MIN);

  const ariaLabel = showQueue && showLatency
    ? `Area chart of render queue depth in jobs (left axis) and p95 latency in milliseconds (right axis) over the last ${TREND_WINDOW_MIN} minutes${showLatency ? `, with the ${sloLabel} SLO line` : ""}${deployX != null ? " and a marker at the v2.4.1 deployment change point" : ""}`
    : showQueue
      ? `Area chart of render queue depth in jobs over the last ${TREND_WINDOW_MIN} minutes${deployX != null ? " with a marker at the v2.4.1 deployment change point" : ""}`
      : `Area chart of p95 render latency in milliseconds over the last ${TREND_WINDOW_MIN} minutes with the ${sloLabel} SLO line`;

  const axisTick = { fontSize: 12, fill: "#667085" };

  return (
    <Card className="min-w-0 rounded-lg border-[#E4E7EC] shadow-none gap-0 py-0">
      <CardHeader className="border-b border-[#E4E7EC] px-5 py-4 [.border-b]:pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base font-semibold">Render pipeline trends</CardTitle>
          <DemoTag />
        </div>
        {/* Subtitle + series tabs share a row on wide screens; the tabs wrap
            below on narrow viewports (they don't fit the header's auto column
            at ≤390px otherwise). */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="text-[13px] text-[#667085]">
            Queue depth (jobs) and p95 processing latency (ms) · last {TREND_WINDOW_MIN} minutes
          </p>
          <Tabs value={tab} onValueChange={(v) => setTab(v as TrendTab)}>
            <TabsList aria-label="Trend series" className="shrink-0">
              <TabsTrigger value="queue">Queue depth</TabsTrigger>
              <TabsTrigger value="latency">p95 latency</TabsTrigger>
              <TabsTrigger value="both">Both</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent className="px-5 pt-4 pb-5">
        {/* Live current-value chips (from summary fields, not chart history) */}
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-md border px-2 py-1 font-mono text-[12px] tabular-nums",
              queueElevated
                ? "border-[#FEE4E2] bg-[#FEF3F2] text-[#B42318]"
                : "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]",
            )}
          >
            Queue {fmtNumber(queueDepth)} · {queueElevated ? `+${queuePct}% vs baseline ${QUEUE_BASELINE}` : "within capacity"}
          </span>
          <span
            className={cn(
              "rounded-md border px-2 py-1 font-mono text-[12px] tabular-nums",
              latencyElevated
                ? "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]"
                : "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]",
            )}
          >
            p95 {fmtSeconds(renderLatencyMs)} · {latencyElevated ? `SLO ${sloLabel}` : `within SLO ${sloLabel}`}
          </span>
          <span className="rounded-md border border-[#E4E7EC] bg-[#F9FAFB] px-2 py-1 font-mono text-[12px] tabular-nums text-[#475467]">
            {renderWorkers} render workers
          </span>
        </div>

        <div className="mt-3 min-w-0">
          {hasHistory ? (
            <ChartContainer
              config={trendChartConfig}
              className="h-[260px] w-full"
              role="img"
              aria-label={ariaLabel}
            >
              <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                {/* SLO line (latency modes) — critical dashed at 2.5s */}
                {showLatency ? (
                  <ReferenceLine
                    yAxisId="latency"
                    y={LATENCY_SLO_MS}
                    stroke="#F04438"
                    strokeWidth={1}
                    strokeDasharray="5 4"
                    strokeOpacity={0.7}
                    label={{
                      value: `SLO ${sloLabel}`,
                      position: "insideTopLeft",
                      fontSize: 11,
                      fill: "#B42318",
                    }}
                  />
                ) : null}
                {/* Deployment change-point marker (v2.4.1) — neutral dashed vertical.
                    yAxisId must name a MOUNTED axis: in latency-only mode the
                    queue axis is absent, so bind to whichever axis is shown. */}
                {deployX != null ? (
                  <ReferenceLine
                    x={deployX}
                    yAxisId={showQueue ? "queue" : "latency"}
                    stroke="#667085"
                    strokeWidth={1}
                    strokeDasharray="2 3"
                    strokeOpacity={0.7}
                    label={{
                      value: "v2.4.1",
                      position: "insideTop",
                      fontSize: 11,
                      fill: "#475467",
                    }}
                  />
                ) : null}
                <CartesianGrid vertical={false} stroke="#E4E7EC" strokeDasharray="3 4" />
                <XAxis
                  dataKey="m"
                  type="number"
                  domain={[0, TREND_WINDOW_MIN]}
                  ticks={[0, 6, 12, 18, 24, 30]}
                  tickFormatter={(v: number) => (v >= TREND_WINDOW_MIN ? "now" : `${TREND_WINDOW_MIN - v}m`)}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tick={axisTick}
                />
                {showQueue ? (
                  <YAxis
                    yAxisId="queue"
                    width={40}
                    tickCount={4}
                    tickFormatter={compactTick}
                    tickLine={false}
                    axisLine={false}
                    tick={axisTick}
                  />
                ) : null}
                {showLatency ? (
                  <YAxis
                    yAxisId="latency"
                    orientation="right"
                    width={40}
                    tickCount={4}
                    tickFormatter={compactTick}
                    tickLine={false}
                    axisLine={false}
                    tick={axisTick}
                  />
                ) : null}
                <ChartTooltip
                  cursor={{ stroke: "#667085", strokeOpacity: 0.35, strokeDasharray: "3 3" }}
                  content={
                    <ChartTooltipContent
                      className="rounded-lg border-[#E4E7EC] bg-white px-3 py-2 shadow-xs"
                      labelClassName="text-[13px] font-semibold text-[#111827]"
                      labelFormatter={(_label, payload) => {
                        const point = payload?.[0]?.payload as TrendPoint | undefined;
                        if (!point || !Number.isFinite(point.m)) return null;
                        const ago = Math.round(TREND_WINDOW_MIN - point.m);
                        return ago <= 0 ? "now" : `${ago}m ago`;
                      }}
                      formatter={(value, name) => {
                        const v = Number(value);
                        const isQueue = String(name) === "queue";
                        return (
                          <div className="flex w-full items-center justify-between gap-4 leading-none">
                            <span className="flex items-center gap-1.5 text-[13px] text-[#667085]">
                              <span
                                className="size-2 shrink-0 rounded-[2px]"
                                style={{ backgroundColor: isQueue ? QUEUE_STROKE : LATENCY_STROKE }}
                                aria-hidden
                              />
                              {isQueue ? "Queue" : "p95"}
                            </span>
                            <span className="font-mono text-[13px] font-medium tabular-nums text-[#111827]">
                              {isQueue ? `${fmtNumber(Math.round(v))} jobs` : `${fmtNumber(Math.round(v))} ms`}
                            </span>
                          </div>
                        );
                      }}
                    />
                  }
                />
                {showQueue ? (
                  <Area
                    yAxisId="queue"
                    dataKey="queue"
                    name="queue"
                    type="monotone"
                    stroke={QUEUE_STROKE}
                    strokeWidth={1.75}
                    fill={QUEUE_STROKE}
                    fillOpacity={0.08}
                    isAnimationActive={false}
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                ) : null}
                {showLatency ? (
                  <Area
                    yAxisId="latency"
                    dataKey="latency"
                    name="latency"
                    type="monotone"
                    stroke={LATENCY_STROKE}
                    strokeWidth={1.75}
                    fill={LATENCY_STROKE}
                    fillOpacity={0.08}
                    isAnimationActive={false}
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                ) : null}
              </AreaChart>
            </ChartContainer>
          ) : (
            <Skeleton className="h-[260px] w-full rounded-lg" />
          )}
          {/* Chart legend + annotations */}
          {hasHistory ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-[#667085]">
              {showQueue ? (
                <span className="flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-[2px]"
                    style={{ backgroundColor: QUEUE_STROKE }}
                    aria-hidden
                  />
                  Queue depth (jobs)
                </span>
              ) : null}
              {showLatency ? (
                <span className="flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-[2px]"
                    style={{ backgroundColor: LATENCY_STROKE }}
                    aria-hidden
                  />
                  p95 latency (ms)
                </span>
              ) : null}
              {showLatency ? (
                <span className="flex items-center gap-1.5">
                  <span className="h-0 w-4 border-t border-dashed border-[#F04438]" aria-hidden />
                  SLO {sloLabel} — p95 target
                </span>
              ) : null}
              {deployX != null ? (
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-0 border-l border-dashed border-[#667085]/80" aria-hidden />
                  v2.4.1 — deployment change point
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export function DashboardView() {
  const { data: summary, loading, error, refetch } = useApi(() => api.summary(), { intervalMs: 5000 });
  const {
    data: workflowsData, loading: wfLoading, error: wfError, refetch: wfRefetch,
  } = useApi(() => api.workflows(), { intervalMs: 15000 });
  const [resetting, setResetting] = useState(false);

  const resetDemo = async () => {
    setResetting(true);
    try {
      const res = await api.resetDemo();
      toast.success(res.message || "Demo data reset");
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reset demo data");
    } finally {
      setResetting(false);
    }
  };

  const recentIncidents = summary?.recentIncidents.slice(0, 5) ?? [];
  const agentActivity = summary?.agentActivity.slice(0, 6) ?? [];
  const allWorkflows = workflowsData?.phases.flatMap((p) => p.workflows) ?? [];
  const topWorkflows = topWorkflowsByOpsInterest(allWorkflows, WORKFLOW_ROWS);
  const mttr = summary ? computeMttr(summary.recentIncidents) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Production Operations"
        description="Monitor, investigate, and resolve production issues with AI."
        badge={<DemoTag label="Demo environment — seeded data" />}
      />

      {error && !summary ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : loading && !summary ? (
        <DashboardSkeleton />
      ) : summary ? (
        <>
          <ScenarioCard summary={summary} onReset={resetDemo} resetting={resetting} />

          {/* KPI row */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            <StatCard
              label="Production Health"
              value={<AnimatedNumber value={summary.productionHealth} format={(n) => `${Math.round(n)}%`} />}
              icon={HeartPulse}
              tone={summary.productionHealth >= 90 ? "positive" : "warning"}
              sub="workflow health"
            />
            <StatCard
              label="Active Incidents"
              value={<AnimatedNumber value={summary.activeIncidents} />}
              icon={FileText}
              tone={summary.activeIncidents > 0 ? "warning" : "positive"}
              sub="open incidents"
              onClick={() => navigate("/incidents")}
            />
            <StatCard
              label="Critical Incidents"
              value={<AnimatedNumber value={summary.criticalIncidents} />}
              icon={AlertTriangle}
              tone={summary.criticalIncidents > 0 ? "critical" : "default"}
              sub="high severity"
            />
            <StatCard
              label="AI Workflows"
              value={<AnimatedNumber value={summary.aiWorkflows} />}
              icon={Boxes}
              tone="accent"
              sub="production pipelines"
              onClick={() => navigate("/workflows")}
            />
            <StatCard
              label="System Health"
              value={<AnimatedNumber value={summary.systemHealth} format={(n) => `${n.toFixed(1)}%`} />}
              icon={Activity}
              tone={summary.systemHealth >= 99 ? "positive" : "warning"}
              sub="30d availability"
              onClick={() => navigate("/infra?metric=availability")}
            />
          </div>

          {/* Render pipeline trends */}
          <RenderPipelineCard
            queueDepth={summary.queueDepth}
            renderLatencyMs={summary.renderLatencyMs}
            renderWorkers={summary.renderWorkers}
            queueHistory={summary.queueDepthHistory}
            latencyHistory={summary.latencyHistory}
          />

          {/* Recent incidents */}
          <Card className="rounded-lg border-[#E4E7EC] shadow-none gap-0 py-0">
            <CardHeader className="border-b border-[#E4E7EC] px-5 py-4 [.border-b]:pb-4">
              <CardTitle className="text-base font-semibold">Recent incidents</CardTitle>
              <p className="text-[13px] text-[#667085]">Latest detected incidents across production services</p>
              <CardAction className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-[#E4E7EC] bg-[#F9FAFB] px-2 py-1 font-mono text-[12px] tabular-nums text-[#475467]">
                  <Timer className="size-4 text-[#667085]" aria-hidden />
                  MTTR {mttr ?? "—"}
                </span>
                <button
                  type="button"
                  onClick={() => navigate("/incidents")}
                  className="flex items-center gap-1 text-[13px] font-semibold text-[#175CD3] hover:underline"
                >
                  View all
                  <ArrowRight className="size-3.5" aria-hidden />
                </button>
              </CardAction>
            </CardHeader>
            <CardContent className="px-5 pt-4 pb-5">
              {recentIncidents.length === 0 ? (
                <EmptyState
                  title="No incidents detected"
                  description="Incidents appear here as soon as production monitors detect a deviation."
                  icon={FileText}
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="h-9 px-2 text-[13px] font-semibold text-[#667085]">ID</TableHead>
                      <TableHead className="h-9 px-2 text-[13px] font-semibold text-[#667085]">Incident</TableHead>
                      <TableHead className="h-9 px-2 text-[13px] font-semibold text-[#667085]">Severity</TableHead>
                      <TableHead className="h-9 px-2 text-[13px] font-semibold text-[#667085]">Service</TableHead>
                      <TableHead className="h-9 px-2 text-[13px] font-semibold text-[#667085]">Status</TableHead>
                      <TableHead className="h-9 px-2 text-[13px] font-semibold text-[#667085]">Detected</TableHead>
                      <TableHead className="h-9 px-2 text-right text-[13px] font-semibold text-[#667085]">Confidence</TableHead>
                      <TableHead className="h-9 px-2 text-right text-[13px] font-semibold text-[#667085]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentIncidents.map((inc) => (
                      <TableRow
                        key={inc.id}
                        tabIndex={0}
                        className="cursor-pointer border-[#E4E7EC] cine-row-hover"
                        onClick={() => navigate(`/incidents/${inc.id}`)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") navigate(`/incidents/${inc.id}`);
                        }}
                        aria-label={`Open incident ${inc.id}: ${inc.title}`}
                      >
                        <TableCell className="py-3 font-mono text-sm text-[#175CD3]">{inc.id}</TableCell>
                        <TableCell className="max-w-[300px] py-3">
                          <span className="block truncate text-sm font-medium text-[#111827]">{inc.title}</span>
                        </TableCell>
                        <TableCell className="py-3">
                          <SeverityBadge severity={inc.severity} />
                        </TableCell>
                        <TableCell className="py-3 text-sm text-[#667085]">{inc.service}</TableCell>
                        <TableCell className="py-3">
                          <IncidentStatusBadge status={inc.status} />
                        </TableCell>
                        <TableCell className="py-3 text-sm text-[#667085]">
                          {timeAgo(inc.detectedAt)}
                        </TableCell>
                        <TableCell className="py-3 text-right font-mono text-sm tabular-nums text-[#344054]">
                          {inc.agentConfidence != null ? `${inc.agentConfidence}%` : "—"}
                        </TableCell>
                        <TableCell className="py-3 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/incidents/${inc.id}`);
                            }}
                            className="text-[13px] font-semibold text-[#175CD3] hover:underline"
                            aria-label={`View incident ${inc.id}`}
                          >
                            View
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Production workflows + agent activity */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.5fr_1fr]">
            <Card className="min-w-0 rounded-lg border-[#E4E7EC] shadow-none gap-0 py-0">
              <CardHeader className="border-b border-[#E4E7EC] px-5 py-4 [.border-b]:pb-4">
                <CardTitle className="text-base font-semibold">Production workflows</CardTitle>
                <p className="text-[13px] text-[#667085]">Health, active jobs and latency across pipelines</p>
                <CardAction>
                  <button
                    type="button"
                    onClick={() => navigate("/workflows")}
                    className="flex items-center gap-1 text-[13px] font-semibold text-[#175CD3] hover:underline"
                  >
                    View all
                    <ArrowRight className="size-3.5" aria-hidden />
                  </button>
                </CardAction>
              </CardHeader>
              <CardContent className="px-5 pt-4 pb-5">
                {wfError ? (
                  <ErrorState message={wfError} onRetry={wfRefetch} />
                ) : wfLoading && !workflowsData ? (
                  <LoadingRows rows={5} />
                ) : topWorkflows.length === 0 ? (
                  <EmptyState
                    title="No workflow data"
                    description="Workflow telemetry is not available. Reset the demo data to restore seeded pipelines."
                    icon={Boxes}
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="h-9 px-2 text-[13px] font-semibold text-[#667085]">Workflow</TableHead>
                        <TableHead className="h-9 px-2 text-[13px] font-semibold text-[#667085]">Status</TableHead>
                        <TableHead className="h-9 px-2 text-right text-[13px] font-semibold text-[#667085]">Active jobs</TableHead>
                        <TableHead className="h-9 px-2 text-right text-[13px] font-semibold text-[#667085]">Latency</TableHead>
                        <TableHead className="h-9 px-2 text-[13px] font-semibold text-[#667085]">Last updated</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topWorkflows.map((wf) => (
                        <TableRow
                          key={wf.key}
                          tabIndex={0}
                          className="cursor-pointer border-[#E4E7EC] cine-row-hover"
                          onClick={() => navigate(`/workflows?wf=${wf.key}`)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") navigate(`/workflows?wf=${wf.key}`);
                          }}
                          aria-label={`Open workflow ${wf.name}: ${wf.health.toLowerCase()}`}
                        >
                          <TableCell className="py-3 text-sm font-medium text-[#111827]">{wf.name}</TableCell>
                          <TableCell className="py-3">
                            <StatusBadge status={wf.health} />
                          </TableCell>
                          <TableCell className="py-3 text-right font-mono text-sm tabular-nums text-[#344054]">
                            {fmtNumber(wf.activeJobs)}
                          </TableCell>
                          <TableCell className="py-3 text-right font-mono text-sm tabular-nums text-[#344054]">
                            {fmtNumber(wf.latencyMs)} ms
                          </TableCell>
                          <TableCell className="py-3 text-sm text-[#667085]">
                            {timeAgo(wf.lastUpdate)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card className="flex min-w-0 rounded-lg border-[#E4E7EC] shadow-none gap-0 py-0">
              <CardHeader className="border-b border-[#E4E7EC] px-5 py-4 [.border-b]:pb-4">
                <CardTitle className="text-base font-semibold">Agent activity</CardTitle>
                <p className="text-[13px] text-[#667085]">Recent investigation runs and their outcomes</p>
                <CardAction>
                  <button
                    type="button"
                    onClick={() => navigate("/agent")}
                    className="flex items-center gap-1 text-[13px] font-semibold text-[#175CD3] hover:underline"
                  >
                    Open console
                    <ArrowRight className="size-3.5" aria-hidden />
                  </button>
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col px-0 pt-0 pb-0">
                {agentActivity.length === 0 ? (
                  <div className="px-5 py-6">
                    <EmptyState
                      title="No agent activity yet"
                      description="Agent runs appear here once a query is submitted from the console or the demo scenario is loaded."
                    />
                  </div>
                ) : (
                  <div className="cine-scroll flex-1 divide-y divide-[#E4E7EC] overflow-y-auto">
                    {agentActivity.map((run) => (
                      <button
                        key={run.id}
                        type="button"
                        onClick={() => navigate(`/agent?run=${run.id}`)}
                        className="cine-row-hover group flex w-full flex-col gap-2 px-5 py-3.5 text-left transition-colors"
                        aria-label={`Open this run in the agent console: ${run.query}`}
                        title="Open this run's transcript in the agent console"
                      >
                        <div className="flex items-center gap-2">
                          {TERMINAL_RUN_STATUS.includes(run.status) ? null : (
                            <span className="cine-pulse size-1.5 shrink-0 rounded-full bg-[#2563EB]" aria-hidden />
                          )}
                          <p className="min-w-0 flex-1 truncate text-sm font-medium text-[#111827]">{run.query}</p>
                          <span className="shrink-0 text-[12px] text-[#667085]">
                            {timeAgo(run.createdAt)}
                          </span>
                          <ChevronRight
                            className="size-4 shrink-0 text-[#98A2B3] transition-all group-hover:translate-x-0.5 group-hover:text-[#175CD3]"
                            aria-hidden
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <RunStatusBadge status={run.status} />
                          <span className="text-[12px] text-[#667085]">
                            {MODE_LABEL[run.mode] ?? run.mode}
                          </span>
                          {run.confidence != null ? (
                            <span className="ml-auto font-mono text-[12px] tabular-nums text-[#667085]">
                              {run.confidence}%
                            </span>
                          ) : null}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
