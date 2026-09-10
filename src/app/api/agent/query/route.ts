import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import { createRun } from "@/lib/agent/engine";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  await ensureSeeded();
  let body: { query?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const query = body.query?.trim();
  if (!query) {
    return NextResponse.json({ ok: false, error: "query is required" }, { status: 400 });
  }
  const runId = await createRun(query);
  return NextResponse.json({ ok: true, runId });
}
