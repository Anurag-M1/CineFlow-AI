import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import { incidentDTO } from "@/lib/serialize";
import type { SummaryDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSeeded();
  const [workflows, metrics, incidents, runs, scenario] = await Promise.all([
    db.workflow.findMany(),
    db.metric.findMany(),
    db.incident.findMany({ orderBy: { detectedAt: "desc" } }),
    db.agentRun.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
    db.demoScenario.findUnique({ where: { id: "render_delay" } }),
  ]);

  // Production health: 100 minus 3 per warning workflow, 7 per critical workflow
  const productionHealth = Math.max(
    0,
    100 - workflows.reduce((acc, w) => acc + (w.health === "CRITICAL" ? 7 : w.health === "WARNING" ? 3 : 0), 0)
  );
  const active = incidents.filter((i) => i.status !== "RESOLVED");
  const availability = metrics.find((m) => m.key === "availability")?.value ?? 99.8;
  const queue = metrics.find((m) => m.key === "queueDepth");
  const latency = metrics.find((m) => m.key === "processingLatency");
  const workers = metrics.find((m) => m.key === "renderWorkers");
  const pendingRecs = await db.recommendation.count({ where: { status: "PENDING" } });

  const dto: SummaryDTO = {
    productionHealth,
    activeIncidents: active.length,
    criticalIncidents: active.filter((i) => i.severity === "HIGH").length,
    aiWorkflows: workflows.length,
    systemHealth: availability,
    activeRecommendations: pendingRecs,
    queueDepth: queue?.value ?? 0,
    renderLatencyMs: latency?.value ?? 0,
    renderWorkers: workers?.value ?? 0,
    queueDepthHistory: queue?.history ? JSON.parse(queue.history) : [],
    latencyHistory: latency?.history ? JSON.parse(latency.history) : [],
    recentIncidents: incidents.slice(0, 5).map(incidentDTO),
    agentActivity: runs.map((r) => ({
      id: r.id, query: r.query, intent: r.intent,
      status: r.status as SummaryDTO["agentActivity"][number]["status"],
      mode: r.mode as SummaryDTO["agentActivity"][number]["mode"],
      confidence: r.confidence, summary: r.summary, createdAt: r.createdAt.toISOString(),
    })),
    scenario: {
      id: scenario?.id ?? "render_delay",
      status: scenario?.status ?? "IDLE",
      runCount: scenario?.runCount ?? 0,
      lastRunId: scenario?.lastRunId ?? null,
    },
    generatedAt: new Date().toISOString(),
  };
  return NextResponse.json(dto);
}
