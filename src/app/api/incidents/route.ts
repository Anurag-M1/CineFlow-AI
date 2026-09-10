import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import { incidentDTO } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureSeeded();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const severity = searchParams.get("severity");
  const incidents = await db.incident.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(severity ? { severity } : {}),
    },
    orderBy: { detectedAt: "desc" },
  });
  return NextResponse.json(incidents.map(incidentDTO));
}
