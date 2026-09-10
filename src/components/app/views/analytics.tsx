"use client";

// CineFlow AI — Analytics view. Cross-cutting operational analysis:
// incident volume trends, severity mix, agent performance, and workflow
// throughput. All values derive from the live API (demo-labeled).

import { useMemo, useState } from "react";
import {
  Activity, BarChart3, CheckCircle2, FileWarning, Gauge, Timer,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { navigate } from "@/components/app/router";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/client/api";
import { fmtNumber, timeAgo } from "@/lib/format";
import { StatusBadge } from "@/components/app/shared/badges";
import {
  EmptyState, ErrorState, LoadingCards, LoadingRows, PageHeader, SectionHeader, StatCard,
} from "@/components/app/shared/ui";
import type { IncidentDTO, WorkflowDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

const RANGES = [
  { id: "1h", label: "Last 1 hour", hours: 1 },
  { id: "6h", label: "Last 6 hours", hours: 6 },
  { id: "24h", label: "Last 24 hours", hours: 24 },
  { id: "7d", label: "Last 7 days", hours: 168 },
] as const;

const SEVERITY_COLORS: Record<string, string> = {
  HIGH: "#F04438",
  MEDIUM: "#F79009",
  LOW: "#0BA5EC",
};

function AnalyticsViewContent() {
  const [rangeId, setRangeId] = useState<(typeof RANGES)[number]["id"]>("24h");
  const range = RANGES.find((r) => r.id === rangeId) ?? RANGES[2];

  const { data: incidents, loading: incLoading, error: incError } = useApi(() => api.incidents());
  const { data: workflows, loading: wfLoading } = useApi(() => api.workflows());
  const { data: runs, loading: runLoading } = useApi(() => api.agentRuns());
  const { data: summary } = useApi(() => api.summary(), { intervalMs: 15000 });

  // --- Incidents within the selected range (honest bucketing by hour/day) ---
  const inRange = useMemo(() => {
    if (!incidents) return [];
    const cutoff = Date.now() - range.hours * 3600_000;
    return incidents.filter((i) => new Date(i.detectedAt).getTime() >= cutoff);
  }, [incidents, range.hours]);

  const volumeData = useMemo(() => {
    if (inRange.length === 0) return [];
    const useDays = range.hours > 48;
    const bucketMs = useDays ? 86_400_000 : 3_600_000;
    const buckets = new Map<number, { t: number; HIGH: number; MEDIUM: number; LOW: number }>();
    for (const inc of inRange) {
      const t = Math.floor(new Date(inc.detectedAt).getTime() / bucketMs) * bucketMs;
      let b = buckets.get(t);
      if (!b) { b = { t, HIGH: 0, MEDIUM: 0, LOW: 0 }; buckets.set(t, b); }
      const sev = (inc.severity ?? "LOW").toUpperCase();
      if (sev === "HIGH" || sev === "MEDIUM" || sev === "LOW") b[sev] += 1;
    }
    const fmt = new Intl.DateTimeFormat("en-US", useDays ? { month: "short", day: "numeric" } : { hour: "numeric", minute: "2-digit" });
    return [...buckets.values()].sort((a, b) => a.t - b.t).map((b) => ({ ...b, label: fmt.format(b.t) }));
  }, [inRange, range.hours]);

  const sevMix = useMemo(() => {
    const mix = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const inc of inRange) {
      const sev = (inc.severity ?? "LOW").toUpperCase();
      if (sev === "HIGH" || sev === "MEDIUM" || sev === "LOW") mix[sev] += 1;
    }
    return mix;
  }, [inRange]);

  const resolvedCount = inRange.filter((i) => i.status === "RESOLVED").length;
  const openCount = inRange.length - resolvedCount;
  const resolutionRate = inRange.length > 0 ? Math.round((resolvedCount / inRange.length) * 100) : null;

  // --- Agent performance ---
  const agentStats = useMemo(() => {
    if (!runs) return null;
    const completed = runs.filter((r) => r.status === "COMPLETED");
    const awaiting = runs.filter((r) => r.status === "AWAITING_APPROVAL").length;
    const conf = completed.filter((r) => typeof r.confidence === "number");
    const avgConf = conf.length > 0 ? Math.round(conf.reduce((s, r) => s + (r.confidence ?? 0), 0) / conf.length) : null;
    return { total: runs.length, completed: completed.length, awaiting, avgConf };
  }, [runs]);

  const byMode = useMemo(() => {
    if (!runs) return [];
    const modes = new Map<string, number>();
    for (const r of runs) modes.set(r.mode, (modes.get(r.mode) ?? 0) + 1);
    return [...modes.entries()].map(([mode, count]) => ({ mode, count }));
  }, [runs]);

  // --- Workflow throughput ---
  const flatWorkflows: WorkflowDTO[] = useMemo(() => {
    if (!workflows) return [];
    return workflows.phases.flatMap((p) => p.workflows);
  }, [workflows]);
  const maxThroughput = Math.max(1, ...flatWorkflows.map((w) => w.throughputPerMin));

  const rangeIncidentsKpi = inRange.length;
  const renderQueue = summary ? summary.queueDepth : null;

  if (incError) {
    return <ErrorState message={incError} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Production trends, incident volume, and agent performance across the pipeline."
        actions={
          <Tabs value={rangeId} onValueChange={(v) => setRangeId(v as typeof rangeId)}>
            <TabsList className="grid h-auto w-full grid-cols-2 sm:flex sm:h-9 sm:w-auto">
              {RANGES.map((r) => (
                <TabsTrigger key={r.id} value={r.id} className="text-[13px]">{r.label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
      />

      {/* KPI row */}
      {incLoading && !incidents ? (
        <LoadingCards cards={4} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label={`Incidents · ${range.label.toLowerCase()}`}
            value={fmtNumber(rangeIncidentsKpi)}
            sub={`${openCount} open · ${resolvedCount} resolved`}
            icon={FileWarning}
            tone={rangeIncidentsKpi > 3 ? "warning" : "default"}
          />
          <StatCard
            label="Resolution rate"
            value={resolutionRate === null ? "—" : `${resolutionRate}%`}
            sub="Resolved vs detected, in range"
            icon={CheckCircle2}
            tone="positive"
          />
          <StatCard
            label="Agent runs (total)"
            value={agentStats ? fmtNumber(agentStats.total) : "…"}
            sub={agentStats ? `${agentStats.completed} completed · ${agentStats.awaiting} awaiting approval` : undefined}
            icon={Activity}
            tone="accent"
          />
          <StatCard
            label="Avg confidence"
            value={agentStats?.avgConf === null || agentStats === null ? "—" : `${agentStats.avgConf}%`}
            sub={renderQueue !== null ? `Render queue now ${renderQueue} jobs` : "Completed runs only"}
            icon={Gauge}
            tone="default"
          />
        </div>
      )}

      {/* Volume + mix */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-[#E4E7EC] shadow-none lg:col-span-2">
          <CardHeader className="border-b border-[#E4E7EC] py-4">
            <CardTitle className="text-base font-semibold">Incident volume by severity</CardTitle>
            <p className="text-[13px] text-[#667085]">
              Detected incidents bucketed {range.hours > 48 ? "per day" : "per hour"} · {range.label.toLowerCase()}
            </p>
          </CardHeader>
          <CardContent className="pt-4">
            {incLoading && !incidents ? (
              <Skeleton className="h-64 w-full" />
            ) : volumeData.length === 0 ? (
              <EmptyState
                title="No incidents detected in this range"
                description={`Nothing was detected in the ${range.label.toLowerCase()}. Try a wider range.`}
                icon={FileWarning}
              />
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={volumeData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E4E7EC" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#667085" }} tickLine={false} axisLine={{ stroke: "#E4E7EC" }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#667085" }} tickLine={false} axisLine={false} width={36} />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, border: "1px solid #E4E7EC", background: "#FFFFFF", fontSize: 13, color: "#111827" }}
                      cursor={{ fill: "#F9FAFB" }}
                    />
                    <Bar dataKey="HIGH" name="High" stackId="sev" fill={SEVERITY_COLORS.HIGH} radius={[0, 0, 0, 0]} maxBarSize={28} />
                    <Bar dataKey="MEDIUM" name="Medium" stackId="sev" fill={SEVERITY_COLORS.MEDIUM} maxBarSize={28} />
                    <Bar dataKey="LOW" name="Low" stackId="sev" fill={SEVERITY_COLORS.LOW} radius={[3, 3, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-[#E4E7EC] shadow-none">
          <CardHeader className="border-b border-[#E4E7EC] py-4">
            <CardTitle className="text-base font-semibold">Severity mix</CardTitle>
            <p className="text-[13px] text-[#667085]">Share of incidents in range</p>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {(["HIGH", "MEDIUM", "LOW"] as const).map((sev) => {
              const total = Math.max(1, inRange.length);
              const pct = Math.round((sevMix[sev] / total) * 100);
              return (
                <div key={sev}>
                  <div className="mb-1.5 flex items-center justify-between text-[13px]">
                    <span className="flex items-center gap-2 font-medium text-[#344054]">
                      <span className="size-2 rounded-[2px]" style={{ background: SEVERITY_COLORS[sev] }} aria-hidden />
                      {sev === "HIGH" ? "High" : sev === "MEDIUM" ? "Medium" : "Low"}
                    </span>
                    <span className="font-mono tabular-nums text-[#667085]">{sevMix[sev]} · {pct}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[#F2F4F7]" role="presentation">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: SEVERITY_COLORS[sev] }} />
                  </div>
                </div>
              );
            })}
            <div className="border-t border-[#E4E7EC] pt-4">
              <p className="mb-2 text-[13px] font-medium text-[#344054]">Agent runs by mode</p>
              <div className="flex flex-wrap gap-2">
                {byMode.length === 0 ? (
                  <p className="text-[13px] text-[#667085]">No runs recorded yet.</p>
                ) : (
                  byMode.map((m) => (
                    <Badge key={m.mode} variant="outline" className="border-[#B2DDFF] bg-[#EFF8FF] font-mono text-[12px] font-medium text-[#175CD3]">
                      {m.mode} · {m.count}
                    </Badge>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Workflow throughput */}
      <Card className="border-[#E4E7EC] shadow-none">
        <CardHeader className="border-b border-[#E4E7EC] py-4">
          <CardTitle className="text-base font-semibold">Workflow throughput</CardTitle>
          <p className="text-[13px] text-[#667085]">Jobs completed per minute, by production workflow</p>
        </CardHeader>
        <CardContent className="pt-0">
          {wfLoading && !workflows ? (
            <LoadingRows rows={5} className="pt-4" />
          ) : flatWorkflows.length === 0 ? (
            <EmptyState title="No workflow data" description="Workflow telemetry is not available." icon={BarChart3} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[13px] font-semibold text-[#667085]">Workflow</TableHead>
                  <TableHead className="text-[13px] font-semibold text-[#667085]">Phase</TableHead>
                  <TableHead className="text-[13px] font-semibold text-[#667085]">Status</TableHead>
                  <TableHead className="text-right text-[13px] font-semibold text-[#667085]">Active jobs</TableHead>
                  <TableHead className="text-right text-[13px] font-semibold text-[#667085]">Throughput/min</TableHead>
                  <TableHead className="w-48 text-[13px] font-semibold text-[#667085]">Relative volume</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flatWorkflows.map((w) => (
                  <TableRow
                    key={w.key}
                    className="cursor-pointer border-[#E4E7EC] text-[14px] text-[#344054] cine-row-hover"
                    onClick={() => navigate(`/workflows?wf=${w.key}`)}
                  >
                    <TableCell className="py-3 font-medium text-[#111827]">{w.name}</TableCell>
                    <TableCell className="text-[#667085]">{w.phase}</TableCell>
                    <TableCell><StatusBadge status={w.health} /></TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{fmtNumber(w.activeJobs)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{fmtNumber(w.throughputPerMin)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2" aria-hidden>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#F2F4F7]">
                          <div
                            className={cn("h-full rounded-full", w.health === "HEALTHY" ? "bg-[#2563EB]" : w.health === "WARNING" ? "bg-[#F79009]" : "bg-[#F04438]")}
                            style={{ width: `${Math.max(4, Math.round((w.throughputPerMin / maxThroughput) * 100))}%` }}
                          />
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recent runs table */}
      <Card className="border-[#E4E7EC] shadow-none">
        <CardHeader className="border-b border-[#E4E7EC] py-4">
          <CardTitle className="text-base font-semibold">Recent agent activity</CardTitle>
          <p className="text-[13px] text-[#667085]">Latest investigation runs with confidence and status</p>
        </CardHeader>
        <CardContent className="pt-0">
          {runLoading && !runs ? (
            <LoadingRows rows={4} className="pt-4" />
          ) : !runs || runs.length === 0 ? (
            <EmptyState title="No agent runs yet" description="Run a query in the AI Agent console to populate this table." icon={Timer} />
          ) : (
            <div className="max-h-96 overflow-y-auto cine-scroll">
              <Table>
                <TableHeader className="sticky top-0 bg-white">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[13px] font-semibold text-[#667085]">Query</TableHead>
                    <TableHead className="text-[13px] font-semibold text-[#667085]">Intent</TableHead>
                    <TableHead className="text-[13px] font-semibold text-[#667085]">Mode</TableHead>
                    <TableHead className="text-[13px] font-semibold text-[#667085]">Status</TableHead>
                    <TableHead className="text-right text-[13px] font-semibold text-[#667085]">Confidence</TableHead>
                    <TableHead className="text-right text-[13px] font-semibold text-[#667085]">Started</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.slice(0, 12).map((r) => (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer border-[#E4E7EC] text-[14px] cine-row-hover"
                      onClick={() => navigate(`/agent?run=${r.id}`)}
                    >
                      <TableCell className="max-w-72 truncate py-3 font-medium text-[#111827]">{r.query}</TableCell>
                      <TableCell className="text-[#667085]">{r.intent}</TableCell>
                      <TableCell><span className="font-mono text-[12px] text-[#667085]">{r.mode}</span></TableCell>
                      <TableCell className={cn("font-medium", r.status === "COMPLETED" ? "text-[#067647]" : r.status === "AWAITING_APPROVAL" ? "text-[#B54708]" : "text-[#175CD3]")}>
                        {r.status === "COMPLETED" ? "Completed" : r.status === "AWAITING_APPROVAL" ? "Awaiting approval" : r.status === "EXECUTING" ? "Executing" : r.status.toLowerCase()}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-[#344054]">
                        {typeof r.confidence === "number" ? `${r.confidence}%` : "—"}
                      </TableCell>
                      <TableCell className="text-right text-[#667085]">{timeAgo(r.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <SectionHeader
        title="Data sources"
        subtitle="All analytics derive from live demo telemetry — no sampling, no synthetic aggregation."
      />
    </div>
  );
}

export function AnalyticsView() {
  return <AnalyticsViewContent />;
}
