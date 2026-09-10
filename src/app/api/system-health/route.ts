import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import { metricDTO } from "@/lib/serialize";
import type { SystemHealthDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSeeded();
  const [metrics, healthyWorkers, degradedWorkers] = await Promise.all([
    db.metric.findMany(),
    db.systemState.findUnique({ where: { key: "healthyRenderWorkers" } }),
    db.systemState.findUnique({ where: { key: "degradedWorkers" } }),
  ]);
  const dto: SystemHealthDTO = {
    overall: {
      status: metrics.some((m) => m.status === "CRITICAL")
        ? "CRITICAL"
        : metrics.some((m) => m.status === "WARNING")
          ? "WARNING"
          : "HEALTHY",
      availability: metrics.find((m) => m.key === "availability")?.value ?? 99.8,
      healthy: metrics.filter((m) => m.status === "HEALTHY").length,
      warning: metrics.filter((m) => m.status === "WARNING").length,
      critical: metrics.filter((m) => m.status === "CRITICAL").length,
    },
    metrics: metrics.map(metricDTO),
    renderWorkers: {
      total: metrics.find((m) => m.key === "renderWorkers")?.value ?? 0,
      healthy: Number(healthyWorkers?.value ?? 0),
      degraded: Number(degradedWorkers?.value ?? 0),
    },
  };
  return NextResponse.json(dto);
}
