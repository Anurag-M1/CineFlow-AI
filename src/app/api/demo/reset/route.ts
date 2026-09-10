import { NextResponse } from "next/server";
import { seedDatabase } from "@/lib/seed";

export const dynamic = "force-dynamic";

/**
 * POST /api/demo/reset
 * Re-seeds the deterministic demo dataset (workflows, metrics, incidents,
 * deployments, logs, agent runs, recommendations). Used to make the judge
 * demo perfectly reproducible.
 */
export async function POST() {
  await seedDatabase();
  return NextResponse.json({
    ok: true,
    message: "Demo environment reset to the deterministic seed state.",
    time: new Date().toISOString(),
  });
}
