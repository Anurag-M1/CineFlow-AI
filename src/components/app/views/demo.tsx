"use client";

// CineFlow AI — Demo scenario page (#/demo).
//
// A one-click, self-explanatory walkthrough of the canonical agentic workflow:
// WHAT happened, HOW the agent works, and WHY it matters — then a single
// "Run Production Incident Demo" button that runs the deterministic
// end-to-end scenario with a live step list, the inline human approval gate,
// and before/after verification results.

import { useMemo, useState } from "react";
import {
  Activity, AlertTriangle, Bot, Check, CheckCircle2, Clock, Crosshair,
  Database, Eye, FileText, Gauge, Lightbulb, Link2, ListChecks, Loader2, Play, RotateCcw,
  ShieldCheck, Sparkles, UserCheck, Wrench, X, Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { api } from "@/lib/client/api";
import { useApi } from "@/hooks/use-api";
import { useAgentRun } from "@/hooks/use-agent-run";
import { fmtNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { navigate } from "@/components/app/router";
import type { RecommendationDTO, RunStatus, SummaryDTO } from "@/lib/types";
import { ConfidenceMeter, PageHeader } from "@/components/app/shared/ui";
import { DemoTag, RiskBadge } from "@/components/app/shared/badges";
import { ApprovalCard } from "@/components/app/views/agent";

// Scenario states where the page should resume the last run instead of
// showing the idle CTA — including RESOLVED so a reload still shows the
// verified outcome (before/after table) rather than a blank start state.
const ACTIVE_SCENARIO: string[] = ["RUNNING", "AWAITING_APPROVAL", "EXECUTING", "REMEDIATING", "RESOLVED"];

// ---------------------------------------------------------------------------
// WHAT / HOW / WHY — the 30-second explainer
// ---------------------------------------------------------------------------

const EXPLAINERS = [
  {
    icon: AlertTriangle,
    title: "What",
    body: "INC-1042: the post-production render queue is delayed — queue depth up 42%, p95 latency 4.2s vs a 2.5s SLO. A high-severity incident is hurting the delivery schedule.",
  },
  {
    icon: Bot,
    title: "How",
    body: "The agent investigates with real tools (workflow status, worker health, deployments, logs, incident history), finds the root cause with 87% confidence, and recommends scaling render workers — but guardrails pause execution until a human approves.",
  },
  {
    icon: ShieldCheck,
    title: "Why",
    body: "Production ops teams lose hours triaging alerts across dashboards. CineFlow compresses that to minutes — every conclusion evidence-grounded, every risky action human-approved, every fix verified.",
  },
] as const;

// ---------------------------------------------------------------------------
// Live step list (phase icon + 13px description per step)
// ---------------------------------------------------------------------------

const CHECK_ICONS: Record<string, typeof Eye> = {
  UNDERSTAND: Eye,
  COLLECT: Database,
  ANALYZE: Activity,
  ROOT_CAUSE: Crosshair,
  CONFIDENCE: Gauge,
  RISK: ShieldCheck,
  RECOMMEND: Lightbulb,
  APPROVAL: UserCheck,
  ACTION: Zap,
  VERIFY: CheckCircle2,
  RESOLVE: Check,
  REPORT: FileText,
};

/** Short 13px descriptions shown under each step label. */
const PHASE_DESC: Record<string, string> = {
  UNDERSTAND: "Detect the incident and plan the investigation.",
  COLLECT: "Collect evidence with real production tools.",
  ANALYZE: "Analyze metrics, logs and deployments.",
  ROOT_CAUSE: "Determine the root cause from the evidence.",
  RECOMMEND: "Generate the remediation recommendation.",
  CONFIDENCE: "Calculate confidence from evidence coverage.",
  RISK: "Evaluate risk under guardrail policy.",
  APPROVAL: "Request approval — the run pauses for a human.",
  ACTION: "Execute the safe demo action.",
  VERIFY: "Verify recovery against thresholds.",
  RESOLVE: "Resolve the incident.",
  REPORT: "Report the post-incident summary.",
};

function ChecklistRow({
  phase, title, status, tool, toolStatus,
}: {
  phase: string;
  title: string;
  status: string;
  tool: string | null;
  toolStatus: string | null;
}) {
  const Icon = CHECK_ICONS[phase] ?? Activity;
  const desc = PHASE_DESC[phase];
  const running = status === "RUNNING";
  const done = status === "COMPLETED";
  const skipped = status === "SKIPPED";
  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-md border px-3 py-2.5 transition-colors",
        running ? "border-[#B2DDFF] bg-[#EFF8FF]" : "border-transparent"
      )}
    >
      <span className="mt-0.5 shrink-0">
        {running ? (
          <Loader2 className="size-4 animate-spin text-[#2563EB]" aria-hidden />
        ) : done ? (
          <span className="flex size-4 items-center justify-center rounded-full border border-[#ABEFC6] bg-[#ECFDF3]">
            <Check className="size-3 text-[#12B76A]" aria-label="done" />
          </span>
        ) : skipped ? (
          <span className="flex size-4 items-center justify-center rounded-full border border-[#FEE4E2] bg-[#FEF3F2]">
            <X className="size-3 text-[#F04438]" aria-hidden />
          </span>
        ) : (
          <Clock className="size-4 text-[#98A2B3]" aria-hidden />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <Icon
            className={cn("size-3.5 shrink-0", done || running ? "text-[#667085]" : "text-[#98A2B3]")}
            aria-hidden
          />
          <p
            className={cn(
              "min-w-0 flex-1 truncate text-sm font-medium",
              done || running ? "text-[#111827]" : "text-[#667085]"
            )}
          >
            {title}
          </p>
          {tool ? (
            <Badge
              variant="outline"
              className={cn(
                "hidden shrink-0 gap-1 px-1.5 font-mono text-[11px] font-medium sm:inline-flex",
                toolStatus === "RUNNING"
                  ? "border-[#B2DDFF] bg-[#EFF8FF] text-[#2563EB]"
                  : toolStatus === "COMPLETED"
                    ? "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]"
                    : "border-[#E4E7EC] bg-[#F9FAFB] text-[#667085]"
              )}
            >
              {toolStatus === "RUNNING" ? <Loader2 className="size-2.5 animate-spin" aria-hidden /> : null}
              {tool}
            </Badge>
          ) : null}
        </div>
        {desc ? (
          <p
            className={cn(
              "mt-0.5 text-[13px] leading-snug",
              done || running ? "text-[#667085]" : "text-[#98A2B3]"
            )}
          >
            {desc}
          </p>
        ) : null}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Before / after verification — clean comparison table with mono values
// ---------------------------------------------------------------------------

function OutcomeTable({ rec }: { rec: RecommendationDTO }) {
  const checks = rec.verification?.checks ?? [];
  if (checks.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-lg border border-[#E4E7EC] bg-white">
      <table className="w-full text-left">
        <thead className="bg-[#F9FAFB]">
          <tr className="border-b border-[#E4E7EC]">
            <th className="cine-label px-4 py-2.5 font-normal">Check</th>
            <th className="cine-label px-4 py-2.5 font-normal">Before</th>
            <th className="cine-label px-4 py-2.5 font-normal">After</th>
            <th className="cine-label px-4 py-2.5 font-normal">Target</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((c, i) => (
            <tr key={i} className="border-b border-[#E4E7EC] last:border-0">
              <td className="px-4 py-2.5 text-[13px] font-medium text-[#111827]">{c.label}</td>
              <td className="px-4 py-2.5 font-mono text-[13px] tabular-nums text-[#B42318]">{c.before}</td>
              <td className="px-4 py-2.5 font-mono text-[13px] tabular-nums text-[#067647]">{c.after}</td>
              <td className="px-4 py-2.5 font-mono text-[13px] tabular-nums text-[#667085]">{c.threshold}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demo script (judge talking points)
// ---------------------------------------------------------------------------

const SCRIPT = [
  "Point at the dashboard: “24 AI-assisted workflows, 3 active incidents — INC-1042 is the critical one.”",
  "Click “Run Production Incident Demo” and narrate the checklist: the agent is collecting evidence with real tools.",
  "“Queue depth spiked 42% right after the render-worker v2.4.1 deployment — worker-02 is degraded. Root cause, 87% confidence, medium risk.”",
  "Approval gate: “Guardrails paused the run. Nothing happens without a human.” — click Approve.",
  "Watch the action execute and verification pass: queue 187 → 54, p95 4.2s → 1.18s. INC-1042 resolves.",
  "Close: “Evidence-grounded, human-approved, self-verified — that's the agentic loop.”",
];

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function DemoView() {
  const [localRunId, setLocalRunId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [resetting, setResetting] = useState(false);

  const { data: summary, refetch: refetchSummary } = useApi<SummaryDTO>(() => api.summary(), { intervalMs: 3000 });
  const scenario = summary?.scenario;

  // Resume an in-flight scenario (e.g. judge reloads the page mid-run)
  const effectiveRunId = localRunId
    ?? (scenario && ACTIVE_SCENARIO.includes(scenario.status) ? scenario.lastRunId : null);
  const { run: detail } = useAgentRun(effectiveRunId, 800);

  const awaiting = detail?.run.status === "AWAITING_APPROVAL";
  const { data: recs, refetch: refetchRecs } = useApi(() => api.recommendations(), {
    intervalMs: awaiting ? 3000 : undefined,
  });
  const rec = useMemo(
    () => recs?.find((r) => r.agentRunId === effectiveRunId) ?? null,
    [recs, effectiveRunId]
  );

  const runStatus: RunStatus | null = detail?.run.status ?? null;
  const resolved = scenario?.status === "RESOLVED" || rec?.status === "VERIFIED";
  const completed = detail && ["COMPLETED", "REJECTED", "FAILED"].includes(detail.run.status);
  const steps = detail?.steps ?? [];
  const doneSteps = steps.filter((s) => s.status === "COMPLETED").length;
  const progress = steps.length ? Math.round((doneSteps / steps.length) * 100) : 0;

  const startDemo = async () => {
    setStarting(true);
    try {
      // If a previous scenario already resolved, reset first so the run starts clean
      if (scenario?.status === "RESOLVED") {
        await api.resetDemo();
        await refetchSummary();
      }
      const { runId } = await api.agentDemo();
      setLocalRunId(runId);
      toast.success("Demo scenario started — the agent is investigating INC-1042.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start the demo scenario");
    } finally {
      setStarting(false);
    }
  };

  const resetDemo = async () => {
    setResetting(true);
    try {
      const res = await api.resetDemo();
      setLocalRunId(null);
      await Promise.all([refetchSummary(), refetchRecs()]);
      toast.success(res.message || "Demo data reset.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setResetting(false);
    }
  };

  // Copy a deep link that reopens this exact run in the agent console
  // (#/agent?run=… — works even in a fresh browser).
  const shareRun = async () => {
    if (!effectiveRunId) return;
    const url = `${window.location.origin}/#/agent?run=${effectiveRunId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied", {
        description: "Opening it in a fresh browser restores this run's full transcript.",
      });
    } catch {
      toast.error("Could not copy — clipboard unavailable in this context");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Demo scenario"
        description="A two-minute, one-click walkthrough of the full agentic loop — investigation, evidence, guardrails, human approval, execution, and verification."
        badge={<DemoTag label="Demo Environment" />}
      />

      {/* WHAT / HOW / WHY */}
      <div className="grid gap-4 md:grid-cols-3">
        {EXPLAINERS.map((e) => (
          <Card key={e.title} className="rounded-lg border-[#E4E7EC] bg-card shadow-none">
            <CardContent className="p-5">
              <div className="mb-2.5 flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-[#B2DDFF] bg-[#EFF8FF] text-[#2563EB]">
                  <e.icon className="size-4" aria-hidden />
                </span>
                <h3 className="text-base font-semibold tracking-tight text-[#111827]">{e.title}</h3>
              </div>
              <p className="text-sm leading-relaxed text-[#667085]">{e.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Live demo runner */}
        <Card className="rounded-lg border-[#E4E7EC] bg-card shadow-none">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b border-[#E4E7EC] px-4 py-3.5 sm:px-6">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[#111827]">
              <Play className="size-4 text-[#2563EB]" aria-hidden />
              Production Incident Demo — INC-1042
            </CardTitle>
            {scenario ? (
              <Badge variant="outline" className="gap-1.5 text-[11px] font-normal text-[#667085]">
                {scenario.runCount} run{scenario.runCount === 1 ? "" : "s"} this session
              </Badge>
            ) : null}
          </CardHeader>

          <CardContent className="p-4 sm:p-6">
            {!effectiveRunId ? (
              /* Idle state — the one-click CTA */
              <div className="flex flex-col items-center py-6 text-center">
                <span className="flex size-12 items-center justify-center rounded-lg border border-[#B2DDFF] bg-[#EFF8FF]">
                  <Sparkles className="size-6 text-[#2563EB]" aria-hidden />
                </span>
                <h3 className="mt-4 text-lg font-semibold tracking-tight text-[#111827]">Run the render-queue incident, end to end</h3>
                <p className="mt-1.5 max-w-md text-sm leading-relaxed text-[#667085]">
                  The agent will investigate INC-1042, prove the root cause with tool evidence, and pause for your
                  approval before scaling render workers. Everything is deterministic and labeled — no real
                  infrastructure is touched.
                </p>
                <Button
                  size="lg"
                  onClick={() => void startDemo()}
                  disabled={starting}
                  className="mt-6 h-12 gap-2 bg-[#2563EB] px-8 text-[15px] font-semibold text-white hover:bg-[#1D4ED8]"
                >
                  {starting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Play className="size-4" aria-hidden />}
                  Run Production Incident Demo
                </Button>
                <p className="mt-3 font-mono text-[11px] text-[#667085]">
                  “Why is the post-production render pipeline delayed?”
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Progress header */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <Badge variant="outline" className={cn(
                    "gap-1.5 font-medium",
                    runStatus === "AWAITING_APPROVAL"
                      ? "border-[#E9D7FE] bg-[#F9F5FF] text-[#6941C6]"
                      : runStatus === "COMPLETED"
                        ? "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]"
                        : runStatus === "REJECTED"
                          ? "border-[#FEE4E2] bg-[#FEF3F2] text-[#B42318]"
                          : "border-[#B2DDFF] bg-[#EFF8FF] text-[#175CD3]"
                  )}>
                    {(runStatus === "AWAITING_APPROVAL" || runStatus === "RUNNING" || runStatus === "EXECUTING") ? (
                      <span className="cine-pulse inline-block size-1.5 rounded-full bg-current" aria-hidden />
                    ) : null}
                    {runStatus === "AWAITING_APPROVAL"
                      ? "Awaiting your approval"
                      : runStatus === "EXECUTING"
                        ? "Executing approved action"
                        : runStatus === "COMPLETED"
                          ? "Investigation complete"
                          : runStatus === "REJECTED"
                            ? "Recommendation rejected"
                            : runStatus === "FAILED"
                              ? "Run failed"
                              : "Agent investigating"}
                  </Badge>
                  {detail?.run.confidence != null ? (
                    <span className="flex items-center gap-2">
                      <span className="cine-label">confidence</span>
                      <ConfidenceMeter value={detail.run.confidence} />
                    </span>
                  ) : null}
                  {steps.length > 0 && !completed ? (
                    <span className="ml-auto font-mono text-xs tabular-nums text-[#667085]">
                      {doneSteps}/{steps.length} steps
                    </span>
                  ) : null}
                </div>
                {steps.length > 0 && !completed ? (
                  <div className="h-1 overflow-hidden rounded-full bg-[#E4E7EC]">
                    <div
                      className={cn("h-full rounded-full transition-all duration-500", awaiting ? "bg-[#7A5AF8]" : "bg-[#2563EB]")}
                      style={{ width: `${Math.max(progress, 3)}%` }}
                    />
                  </div>
                ) : null}

                {/* Live step list */}
                <ol className="cine-scroll max-h-[430px] space-y-1 overflow-y-auto pr-1" aria-label="Demo scenario steps">
                  {steps.map((s) => (
                    <ChecklistRow
                      key={s.id}
                      phase={s.phase}
                      title={s.title}
                      status={s.status}
                      tool={s.tool}
                      toolStatus={s.toolStatus}
                    />
                  ))}
                </ol>

                {/* Root cause + recommendation (once available) */}
                {rec && rec.rootCause && !resolved ? (
                  <div className="rounded-lg border border-[#B2DDFF] bg-[#EFF8FF] p-4">
                    <p className="cine-label mb-1.5 flex items-center gap-1.5">
                      <Crosshair className="size-3" aria-hidden />
                      Probable root cause
                    </p>
                    <p className="text-sm leading-relaxed text-[#111827]">{rec.rootCause}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <span className="flex items-center gap-2">
                        <ListChecks className="size-3.5 text-[#667085]" aria-hidden />
                        <span className="text-xs text-[#667085]">{rec.evidence.length} evidence items</span>
                      </span>
                      <RiskBadge risk={rec.risk} />
                    </div>
                  </div>
                ) : null}

                {/* Human approval gate */}
                {runStatus === "AWAITING_APPROVAL" && rec && rec.status === "PENDING" ? (
                  <ApprovalCard rec={rec} onDecided={() => void refetchRecs()} />
                ) : null}

                {/* Rejection outcome */}
                {runStatus === "REJECTED" ? (
                  <div className="rounded-lg border border-[#FEE4E2] bg-[#FEF3F2] p-4 text-sm leading-relaxed text-[#667085]">
                    <span className="font-semibold text-[#B42318]">Rejected — no action was taken.</span>{" "}
                    The incident remains under investigation.{" "}
                    <button onClick={() => void startDemo()} className="font-medium text-[#2563EB] underline-offset-2 hover:underline">
                      Run the demo again
                    </button>
                  </div>
                ) : null}

                {/* Success outcome */}
                {resolved && rec ? (
                  <div className="space-y-4 rounded-lg border border-[#ABEFC6] bg-white p-4 sm:p-5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <CheckCircle2 className="size-5 text-[#12B76A]" aria-hidden />
                      <p className="text-sm font-semibold text-[#067647]">INC-1042 resolved — recovery verified</p>
                      <DemoTag label="Demo environment" />
                    </div>
                    <OutcomeTable rec={rec} />
                    <p className="text-sm leading-relaxed text-[#667085]">{rec.verification?.summary ?? detail?.run.summary ?? ""}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => navigate("/incidents/INC-1042")} className="gap-1.5 bg-[#2563EB] font-medium text-white hover:bg-[#1D4ED8]">
                        <FileText className="size-3.5" aria-hidden />
                        View incident timeline
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => navigate("/agent")} className="gap-1.5">
                        <Wrench className="size-3.5" aria-hidden />
                        Open agent console
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void startDemo()} className="gap-1.5">
                        <RotateCcw className="size-3.5" aria-hidden />
                        Run again
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void shareRun()}
                        className="gap-1.5"
                        aria-label="Copy a share link that reopens this run's transcript"
                      >
                        <Link2 className="size-3.5" aria-hidden />
                        Share run
                      </Button>
                    </div>
                  </div>
                ) : null}

                {/* Completed but not resolved (e.g. summary-only rerun) */}
                {completed && !resolved && !rec ? (
                  <p className="rounded-lg border border-[#E4E7EC] bg-[#F9FAFB] p-4 text-sm leading-relaxed text-[#667085]">
                    {detail?.run.summary ?? "Run completed."}
                  </p>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right rail: script + live state + reset */}
        <div className="space-y-6">
          <Card className="rounded-lg border-[#E4E7EC] bg-card shadow-none">
            <CardHeader className="border-b border-[#E4E7EC] px-4 py-3.5 sm:px-6">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[#111827]">
                <Activity className="size-4 text-[#2563EB]" aria-hidden />
                Demo script — 2 minutes
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <ol className="space-y-3">
                {SCRIPT.map((line, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-[#E4E7EC] bg-[#F9FAFB] font-mono text-[11px] text-[#667085]">
                      {i + 1}
                    </span>
                    <p className="text-[13px] leading-relaxed text-[#667085]">{line}</p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          {summary ? (
            <Card className="rounded-lg border-[#E4E7EC] bg-card shadow-none">
              <CardHeader className="border-b border-[#E4E7EC] px-4 py-3.5 sm:px-6">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[#111827]">
                  <Gauge className="size-4 text-[#2563EB]" aria-hidden />
                  Live state
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 p-4">
                <div>
                  <p className="cine-label">Render workers</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-[#111827]">{fmtNumber(summary.renderWorkers)}</p>
                </div>
                <div>
                  <p className="cine-label">Queue depth</p>
                  <p className={cn("mt-1 text-lg font-semibold tabular-nums", summary.queueDepth > 150 ? "text-[#B42318]" : "text-[#067647]")}>
                    {fmtNumber(summary.queueDepth)}
                  </p>
                </div>
                <div>
                  <p className="cine-label">p95 latency</p>
                  <p className={cn("mt-1 text-lg font-semibold tabular-nums", summary.renderLatencyMs > 3000 ? "text-[#B54708]" : "text-[#067647]")}>
                    {(summary.renderLatencyMs / 1000).toFixed(2)}s
                  </p>
                </div>
                <div>
                  <p className="cine-label">Active incidents</p>
                  <p className={cn("mt-1 text-lg font-semibold tabular-nums", summary.activeIncidents > 0 ? "text-[#B54708]" : "text-[#067647]")}>
                    {summary.activeIncidents}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card className="rounded-lg border-[#E4E7EC] bg-card shadow-none">
            <CardContent className="p-4">
              <p className="cine-label mb-1.5">Reset</p>
              <p className="text-[13px] leading-relaxed text-[#667085]">
                Restore the seeded demo state (4 workers, queue depth 187, 3 active incidents) at any time.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void resetDemo()}
                disabled={resetting}
                className="mt-3 w-full gap-1.5 border-[#FEE4E2] bg-white text-[#F04438] hover:bg-[#FEF3F2] hover:text-[#B42318]"
              >
                {resetting ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <RotateCcw className="size-3.5" aria-hidden />}
                Reset demo data
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
