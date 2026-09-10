import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import { agentRunDTO } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSeeded();
  const runs = await db.agentRun.findMany({ orderBy: { createdAt: "desc" }, take: 12 });
  return NextResponse.json(runs.map(agentRunDTO));
}
