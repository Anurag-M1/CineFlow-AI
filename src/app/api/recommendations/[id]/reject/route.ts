import { NextResponse } from "next/server";
import { rejectRecommendation } from "@/lib/agent/engine";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await rejectRecommendation(id);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, message: result.message, recommendationId: id });
}
