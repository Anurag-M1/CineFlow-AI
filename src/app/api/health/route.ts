import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import { activeProvider, geminiConfigured } from "@/lib/ai/providers";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSeeded();
  const incidents = await db.incident.count();
  return NextResponse.json({
    status: "ok",
    app: "CineFlow AI",
    environment: "demo",
    seeded: incidents > 0,
    activeProvider: activeProvider(),
    geminiConfigured: geminiConfigured(),
    time: new Date().toISOString(),
  });
}
