import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import { verifyRecovery } from "@/lib/agent/actions";
import { recommendationDTO, incidentDTO } from "@/lib/serialize";
import { addIncidentEvent } from "@/lib/agent/state";
import type { IncidentDTO, RecommendationDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/verification/run
 * Body: { incidentId: string }
 * Re-checks live metric state against thresholds and resolves the incident if
 * recovery is confirmed. Also updates any linked recommendation to VERIFIED.
 */
export async function POST(req: NextRequest) {
  await ensureSeeded();
  let body: { incidentId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const incidentId = body.incidentId;
  if (!incidentId) {
    return NextResponse.json({ ok: false, error: "incidentId is required" }, { status: 400 });
  }
  const incident = await db.incident.findUnique({ where: { id: incidentId } });
  if (!incident) {
    return NextResponse.json({ ok: false, error: "Incident not found" }, { status: 404 });
  }

  const verification = await verifyRecovery(incidentId);
  let recommendation: RecommendationDTO | null = null;
  let incidentResult: IncidentDTO = incidentDTO(incident);

  if (verification.passed) {
    const rec = await db.recommendation.findFirst({ where: { incidentId }, orderBy: { createdAt: "desc" } });
    if (rec) {
      const updated = await db.recommendation.update({
        where: { id: rec.id },
        data: { status: "VERIFIED", verifiedAt: new Date(), verification: JSON.stringify(verification) },
      });
      recommendation = recommendationDTO(updated);
    }
    if (incident.status !== "RESOLVED") {
      const resolved = await db.incident.update({
        where: { id: incidentId },
        data: {
          status: "RESOLVED",
          resolvedAt: new Date(),
          resolutionNote: incident.resolutionNote ?? "Recovery verified by CineFlow Agent.",
        },
      });
      await addIncidentEvent(incidentId, "VERIFICATION", "Recovery verified", verification.summary);
      incidentResult = incidentDTO(resolved);
    }
  }

  return NextResponse.json({ ok: true, verification, incident: incidentResult, recommendation });
}
