"use client";

// CineFlow AI — infrastructure view: live metric cards that respond to agent
// remediation in the demo environment. Each metric card opens a drill-down
// dialog with the full history chart, threshold reference lines (warn / crit /
// target) and window statistics.

import { useEffect, useRef, useState } from "react";
import { ChevronRight, RefreshCw, ServerCog } from "lucide-react";
import { toast } from "sonner";
import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from "@/components/ui/chart";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/client/api";
import { fmtNumber, timeAgo } from "@/lib/format";
import { DemoTag, StatusBadge } from "@/components/app/shared/badges";
import { EmptyState, ErrorState, LoadingCards, PageHeader, Sparkline } from "@/components/app/shared/ui";
import { cn } from "@/lib/utils";
import type { MetricDTO } from "@/lib/types";

// Series color follows the metric's live status: emerald = healthy, amber =
// warning, rose = critical (same solids the StatusBadges use).
const SPARK_STROKE: Record<string, string> = {
  HEALTHY: "#12B76A",
  WARNING: "#F79009",
  CRITICAL: "#F04438",
};

const TREND_WINDOW_MIN = 30;

function valueTone(status: string): string {
  if (status === "CRITICAL") return "text-[#B42318]";
  if (status === "WARNING") return "text-[#B54708]";
  return "text-[#111827]";
}

// ---------------------------------------------------------------------------
// Metric card (header is a button → drill-down dialog)
// ---------------------------------------------------------------------------

function MetricCard({ metric, onOpen }: { metric: MetricDTO; onOpen: () => void }) {
  const stroke = SPARK_STROKE[metric.status] ?? "#2563EB";
  const cmp = metric.badDirection === "below" ? "≤" : "≥";

  // Window delta (first → latest history point), colored by whether the move
  // is worsening for this metric's "bad" direction (e.g. availability going
  // DOWN is bad, queue depth going UP is bad).
  const windowDelta = metric.history.length >= 2
    ? metric.history[metric.history.length - 1] - metric.history[0]
    : null;
  const worsening =
    windowDelta == null ? false
    : metric.badDirection === "below" ? windowDelta < 0 : windowDelta > 0;

  return (
    <Card className="cine-card-hover border-[#E4E7EC] py-0 shadow-none">
      <CardContent className="space-y-3 p-4 sm:p-5">
        {/* Header — clickable, opens the metric drill-down */}
        <button
          onClick={onOpen}
          aria-label={`Open metric details for ${metric.name}`}
          className="group flex w-full items-start justify-between gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/40"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#111827] transition-colors group-hover:text-[#175CD3]">{metric.name}</p>
            <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-[#667085]">{metric.description}</p>
          </div>
          <span className="flex shrink-0 items-center gap-1.5">
            <StatusBadge status={metric.status} />
            <ChevronRight
              className="size-4 text-[#98A2B3] transition-transform group-hover:translate-x-0.5 group-hover:text-[#175CD3]"
              aria-hidden
            />
          </span>
        </button>

        {/* Big value + window delta chip */}
        <div className="flex items-baseline gap-1.5">
          <span className={cn("font-mono text-2xl font-semibold tabular-nums tracking-tight", valueTone(metric.status))}>
            {fmtNumber(metric.value)}
          </span>
          <span className="font-mono text-xs text-[#667085]">{metric.unit}</span>
          {windowDelta != null ? (
            <span
              className={cn(
                "ml-auto self-center rounded-full border px-2 py-0.5 font-mono text-[11px] tabular-nums",
                windowDelta === 0
                  ? "border-[#E4E7EC] bg-[#F9FAFB] text-[#667085]"
                  : worsening
                    ? "border-[#FEE4E2] bg-[#FEF3F2] text-[#B42318]"
                    : "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]",
              )}
              title={`${metric.badDirection === "below" ? "Down" : "Up"} is bad for this metric · window delta over the last ${TREND_WINDOW_MIN} minutes`}
            >
              {windowDelta > 0 ? "↑ +" : windowDelta < 0 ? "↓ " : "→ "}
              {fmtNumber(Math.round(windowDelta * 10) / 10)}
              {metric.unit}/{TREND_WINDOW_MIN}m
            </span>
          ) : null}
        </div>

        {/* Sparkline */}
        <Sparkline data={metric.history} stroke={stroke} height={36} />

        {/* Thresholds */}
        <p className="text-[11px] leading-relaxed text-[#667085]">
          {metric.warnAbove != null ? `warn ${cmp} ${fmtNumber(metric.warnAbove)}${metric.unit}` : null}
          {metric.critAbove != null ? ` · crit ${cmp} ${fmtNumber(metric.critAbove)}${metric.unit}` : null}
          {metric.targetValue != null ? ` · target ${fmtNumber(metric.targetValue)}${metric.unit}` : null}
        </p>

        {/* Category + updated */}
        <div className="flex items-center justify-between gap-2 border-t border-[#E4E7EC] pt-2.5">
          <span className="cine-label">{metric.category}</span>
          <span className="text-[11px] text-[#667085]">Updated {timeAgo(metric.updatedAt)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Metric drill-down dialog (full history chart + thresholds + stats)
// ---------------------------------------------------------------------------

interface MetricPoint {
  m: number;
  v: number;
}

function compactTick(v: number): string {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return `${Math.round(v)}`;
}

function metricStats(history: number[]) {
  if (history.length === 0) return null;
  const min = Math.min(...history);
  const max = Math.max(...history);
  const avg = history.reduce((a, b) => a + b, 0) / history.length;
  const delta = history[history.length - 1] - history[0];
  return { min, max, avg, delta };
}

function MetricDialog({ metric, onClose }: { metric: MetricDTO; onClose: () => void }) {
  const stroke = SPARK_STROKE[metric.status] ?? "#2563EB";
  const cmp = metric.badDirection === "below" ? "≤" : "≥";
  const points = metric.history.length;
  const data: MetricPoint[] = Array.from({ length: points }, (_, i) => ({
    m: points > 1 ? (i / (points - 1)) * TREND_WINDOW_MIN : TREND_WINDOW_MIN,
    v: metric.history[i],
  }));

  // Y domain covers the series AND the threshold lines so every reference
  // line stays visible (with a little breathing room).
  const thresholds = [metric.warnAbove, metric.critAbove, metric.targetValue]
    .filter((t): t is number => t != null);
  const loRaw = Math.min(...metric.history, ...thresholds);
  const hiRaw = Math.max(...metric.history, ...thresholds);
  const pad = (hiRaw - loRaw) * 0.1 || Math.max(1, Math.abs(hiRaw) * 0.05);
  const lo = loRaw - pad;
  const hi = hiRaw + pad;

  const stats = metricStats(metric.history);
  // Trend coloring respects the metric's "bad" direction.
  const worsening = metric.badDirection === "below" ? stats && stats.delta < 0 : stats && stats.delta > 0;

  const chartConfig = {
    v: { label: metric.name, color: stroke },
  } satisfies ChartConfig;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="cine-scroll max-h-[calc(100vh-4rem)] overflow-y-auto p-4 sm:max-w-2xl sm:p-6">
        <DialogHeader className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="text-base font-semibold leading-snug">{metric.name}</DialogTitle>
            <StatusBadge status={metric.status} className="shrink-0" />
          </div>
          <DialogDescription className="text-left leading-relaxed">{metric.description}</DialogDescription>
          <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-[11px] text-[#667085]">
            <span><span className="cine-label mr-1.5">KEY</span>{metric.key}</span>
            <span><span className="cine-label mr-1.5">CATEGORY</span>{metric.category}</span>
            <span><span className="cine-label mr-1.5">WINDOW</span>last {TREND_WINDOW_MIN} min</span>
          </p>
        </DialogHeader>

        {/* History chart with threshold reference lines */}
        <div className="min-w-0">
          {points >= 2 ? (
            <ChartContainer
              config={chartConfig}
              className="h-[240px] w-full"
              role="img"
              aria-label={`Area chart of ${metric.name} in ${metric.unit} over the last ${TREND_WINDOW_MIN} minutes${thresholds.length > 0 ? " with warn, critical and target threshold lines" : ""}`}
            >
              <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                {metric.warnAbove != null ? (
                  <ReferenceLine
                    y={metric.warnAbove}
                    stroke="#F79009"
                    strokeWidth={1}
                    strokeDasharray="5 4"
                    strokeOpacity={0.8}
                    ifOverflow="extendDomain"
                  />
                ) : null}
                {metric.critAbove != null ? (
                  <ReferenceLine
                    y={metric.critAbove}
                    stroke="#F04438"
                    strokeWidth={1}
                    strokeDasharray="5 4"
                    strokeOpacity={0.8}
                    ifOverflow="extendDomain"
                  />
                ) : null}
                {metric.targetValue != null ? (
                  <ReferenceLine
                    y={metric.targetValue}
                    stroke="#2563EB"
                    strokeWidth={1}
                    strokeDasharray="1 3"
                    strokeOpacity={0.7}
                    ifOverflow="extendDomain"
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
                  tick={{ fill: "#667085", fontSize: 12 }}
                />
                <YAxis
                  domain={[lo, hi]}
                  width={40}
                  tickCount={4}
                  tickFormatter={compactTick}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#667085", fontSize: 12 }}
                />
                <ChartTooltip
                  cursor={{ stroke: "#667085", strokeOpacity: 0.35, strokeDasharray: "3 3" }}
                  content={
                    <ChartTooltipContent
                      className="border-[#E4E7EC] shadow-sm"
                      labelFormatter={(_label, payload) => {
                        const point = payload?.[0]?.payload as MetricPoint | undefined;
                        if (!point || !Number.isFinite(point.m)) return null;
                        const ago = Math.round(TREND_WINDOW_MIN - point.m);
                        return ago <= 0 ? "now" : `${ago}m ago`;
                      }}
                      formatter={(value) => {
                        const v = Number(value);
                        return (
                          <div className="flex w-full items-center justify-between gap-4 leading-none">
                            <span className="flex items-center gap-1.5 text-[#667085]">
                              <span className="size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: stroke }} aria-hidden />
                              {metric.name}
                            </span>
                            <span className="font-mono font-medium tabular-nums">
                              {fmtNumber(Math.round(v * 10) / 10)} {metric.unit}
                            </span>
                          </div>
                        );
                      }}
                    />
                  }
                />
                <Area
                  dataKey="v"
                  name="v"
                  type="monotone"
                  stroke={stroke}
                  strokeWidth={1.75}
                  fill={stroke}
                  fillOpacity={0.08}
                  isAnimationActive={false}
                  dot={false}
                  activeDot={{ r: 3 }}
                />
              </AreaChart>
            </ChartContainer>
          ) : (
            <p className="rounded-md border border-dashed border-[#E4E7EC] bg-[#F9FAFB] px-4 py-6 text-center text-xs text-[#667085]">
              Not enough history points yet ({points}).
            </p>
          )}

          {/* Threshold legend */}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-[#667085]">
            {metric.warnAbove != null ? (
              <span className="flex items-center gap-1.5">
                <span className="h-0 w-4 border-t border-dashed border-[#F79009]" aria-hidden />
                warn {cmp} {fmtNumber(metric.warnAbove)}{metric.unit}
              </span>
            ) : null}
            {metric.critAbove != null ? (
              <span className="flex items-center gap-1.5">
                <span className="h-0 w-4 border-t border-dashed border-[#F04438]" aria-hidden />
                crit {cmp} {fmtNumber(metric.critAbove)}{metric.unit}
              </span>
            ) : null}
            {metric.targetValue != null ? (
              <span className="flex items-center gap-1.5">
                <span className="h-0 w-4 border-t border-dotted border-[#2563EB]" aria-hidden />
                target {fmtNumber(metric.targetValue)}{metric.unit}
              </span>
            ) : null}
          </div>
        </div>

        {/* Window statistics */}
        {stats ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-[#E4E7EC] bg-[#F9FAFB] p-4 sm:grid-cols-4">
            <div className="min-w-0">
              <p className="cine-label">Current</p>
              <p className={cn("mt-1 font-mono text-sm font-semibold tabular-nums", valueTone(metric.status))}>
                {fmtNumber(metric.value)} <span className="text-xs font-normal text-[#667085]">{metric.unit}</span>
              </p>
            </div>
            <div className="min-w-0">
              <p className="cine-label">Min</p>
              <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-[#111827]">{fmtNumber(stats.min)}</p>
            </div>
            <div className="min-w-0">
              <p className="cine-label">Max</p>
              <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-[#111827]">{fmtNumber(stats.max)}</p>
            </div>
            <div className="min-w-0">
              <p className="cine-label">Trend (window)</p>
              <p className={cn(
                "mt-1 font-mono text-sm font-semibold tabular-nums",
                worsening ? "text-[#B42318]" : "text-[#067647]",
              )}>
                {stats.delta > 0 ? "+" : ""}{fmtNumber(Math.round(stats.delta * 10) / 10)} {metric.unit}
              </p>
            </div>
          </div>
        ) : null}

        <p className="text-[11px] leading-relaxed text-[#667085]">
          Live demo metric — seeded history that responds to agent remediation (updated {timeAgo(metric.updatedAt)}).
          Thresholds: {" "}
          {metric.warnAbove != null ? `warn ${cmp} ${fmtNumber(metric.warnAbove)}${metric.unit}` : "—"}
          {metric.critAbove != null ? ` · crit ${cmp} ${fmtNumber(metric.critAbove)}${metric.unit}` : ""}
          {metric.targetValue != null ? ` · target ${fmtNumber(metric.targetValue)}${metric.unit}` : ""}.
        </p>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export function SystemHealthView({ focusKey }: { focusKey?: string }) {
  const { data, loading, error, refetch } = useApi(() => api.systemHealth(), { intervalMs: 4000 });
  const [verifying, setVerifying] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const overall = data?.overall;
  const workers = data?.renderWorkers;
  // Selection is derived from the live poll — the dialog stays current while open.
  const selected = selectedKey ? data?.metrics.find((m) => m.key === selectedKey) ?? null : null;

  // Deep link: #/infra?metric={key} (e.g. from the incident verification card or
  // the dashboard KPI) opens that metric's drill-down dialog once data loads.
  // Ref-guarded so closing the dialog is respected — the 4s poll won't re-open it.
  const appliedFocusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusKey || appliedFocusRef.current === focusKey || !data) return;
    appliedFocusRef.current = focusKey;
    if (!data.metrics.some((m) => m.key === focusKey)) return;
    const t = setTimeout(() => setSelectedKey(focusKey), 0);
    return () => clearTimeout(t);
  }, [focusKey, data]);

  async function runVerification() {
    setVerifying(true);
    try {
      const res = await api.runVerification("INC-1042");
      toast("Verification re-run on INC-1042", { description: res.verification.summary });
      refetch();
    } catch (e) {
      toast.error("Verification failed", {
        description: e instanceof Error ? e.message : "Request failed",
      });
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="space-y-6 pb-4">
      <PageHeader
        title="Infrastructure"
        description="Live infrastructure signals for the media production stack — compute, queue, reliability and storage metrics that respond to agent remediation in the demo environment."
        badge={<DemoTag label="Live demo metrics" />}
      />

      {loading ? <LoadingCards cards={6} /> : null}
      {error ? <ErrorState message={error} onRetry={refetch} /> : null}

      {!loading && !error && data ? (
        data.metrics.length === 0 ? (
          <EmptyState
            title="No metrics available"
            description="Infrastructure metrics appear once the demo data is seeded. Reset the demo from Settings if this persists."
            icon={ServerCog}
          />
        ) : (
          <>
            {/* Overall system-health summary row */}
            {overall && workers ? (
              <Card className="border-[#E4E7EC] py-0 shadow-none">
                <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-4 p-4 sm:p-5">
                  <div className="flex items-center gap-3">
                    <StatusBadge status={overall.status} />
                    <div>
                      <p className="cine-label">Availability</p>
                      <p className="text-lg font-semibold tabular-nums text-[#111827]">{overall.availability}%</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="flex items-center gap-1.5">
                      <span className="font-mono text-sm font-semibold tabular-nums text-[#067647]">{overall.healthy}</span>
                      <StatusBadge status="HEALTHY" />
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="font-mono text-sm font-semibold tabular-nums text-[#B54708]">{overall.warning}</span>
                      <StatusBadge status="WARNING" />
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="font-mono text-sm font-semibold tabular-nums text-[#B42318]">{overall.critical}</span>
                      <StatusBadge status="CRITICAL" />
                    </span>
                  </div>
                  <div className="text-sm text-[#667085]">
                    <p>
                      <span className="cine-label mr-1.5">Render fleet</span>
                      <span className="font-medium text-[#111827]">
                        {workers.healthy}/{workers.total}
                      </span>{" "}
                      healthy workers
                      {workers.degraded > 0 ? <span className="text-[#B42318]"> · {workers.degraded} degraded</span> : null}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto gap-1.5 border-[#E4E7EC] text-[#344054] hover:bg-[#F9FAFB] hover:text-[#111827]"
                    onClick={runVerification}
                    disabled={verifying}
                  >
                    <RefreshCw className={cn("size-3.5", verifying && "animate-spin")} aria-hidden />
                    {verifying ? "Verifying…" : "Verify recovery now"}
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            {/* Metrics grid */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.metrics.map((m) => (
                <MetricCard key={m.key} metric={m} onOpen={() => setSelectedKey(m.key)} />
              ))}
            </div>

            {/* Drill-down dialog (derived from the live 4s poll) */}
            {selected ? (
              <MetricDialog metric={selected} onClose={() => setSelectedKey(null)} />
            ) : null}
          </>
        )
      ) : null}
    </div>
  );
}

export default SystemHealthView;
