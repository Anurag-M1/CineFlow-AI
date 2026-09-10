import { NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/seed";
import { createRun, CANONICAL_DEMO_QUERY } from "@/lib/agent/engine";

export const dynamic = "force-dynamic";

/**
 * POST /api/agent/demo
 * Starts the canonical, deterministic judge demo scenario:
 * "Why is the post-production render pipeline delayed?" (INC-1042).
 */
export async function POST() {
  await ensureSeeded();
  const runId = await createRun(CANONICAL_DEMO_QUERY);
  return NextResponse.json({ ok: true, runId, scenario: "render_delay", query: CANONICAL_DEMO_QUERY });
}
