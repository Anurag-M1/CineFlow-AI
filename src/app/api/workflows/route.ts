import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import { workflowDTO } from "@/lib/serialize";

export const dynamic = "force-dynamic";

const PHASE_ORDER = ["PRE_PRODUCTION", "PRODUCTION", "POST_PRODUCTION", "DISTRIBUTION"];
const PHASE_LABELS: Record<string, string> = {
  PRE_PRODUCTION: "Pre-Production",
  PRODUCTION: "Production",
  POST_PRODUCTION: "Post-Production",
  DISTRIBUTION: "Distribution",
};

export async function GET() {
  await ensureSeeded();
  const workflows = await db.workflow.findMany({ orderBy: { sortOrder: "asc" } });
  const phases = PHASE_ORDER.map((phase) => ({
    phase,
    label: PHASE_LABELS[phase],
    workflows: workflows.filter((w) => w.phase === phase).map(workflowDTO),
  }));
  return NextResponse.json({
    total: workflows.length,
    degraded: workflows.filter((w) => w.health !== "HEALTHY").length,
    phases,
  });
}
