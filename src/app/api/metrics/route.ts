import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import { metricDTO } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSeeded();
  const metrics = await db.metric.findMany();
  return NextResponse.json({
    metrics: metrics.map(metricDTO),
    overall: {
      healthy: metrics.filter((m) => m.status === "HEALTHY").length,
      warning: metrics.filter((m) => m.status === "WARNING").length,
      critical: metrics.filter((m) => m.status === "CRITICAL").length,
    },
  });
}
