import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import { recommendationDTO } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSeeded();
  const recs = await db.recommendation.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(recs.map(recommendationDTO));
}
