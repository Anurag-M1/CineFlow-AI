import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { executeAction, verifyRecovery } from "@/lib/agent/actions";
import { evaluateGuardrails } from "@/lib/agent/guardrails";
import { addIncidentEvent } from "@/lib/agent/state";

export const dynamic = "force-dynamic";

/**
 * POST /api/actions/execute
 * Body: { recommendationId: string }
 * Executes an APPROVED recommendation (guardrails enforce approval for
 * medium/high-risk actions). Refuses PENDING recommendations.
 */
export async function POST(req: NextRequest) {
  let body: { recommendationId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const recId = body.recommendationId;
  if (!recId) {
    return NextResponse.json({ ok: false, error: "recommendationId is required" }, { status: 400 });
  }

  const rec = await db.recommendation.findUnique({ where: { id: recId } });
  if (!rec) return NextResponse.json({ ok: false, error: "Recommendation not found" }, { status: 404 });

  const evaluation = evaluateGuardrails(rec.actionType);
  if (rec.status === "PENDING" && evaluation.requiresApproval) {
    return NextResponse.json(
      { ok: false, error: `Guardrail: "${rec.actionLabel}" is ${evaluation.risk.toLowerCase()}-risk and requires human approval before execution.` },
      { status: 403 }
    );
  }
  if (rec.status === "REJECTED") {
    return NextResponse.json({ ok: false, error: "Recommendation was rejected — no action executed." }, { status: 403 });
  }
  if (rec.status === "EXECUTED" || rec.status === "VERIFIED") {
    return NextResponse.json({ ok: false, error: `Action already executed at ${rec.executedAt}` }, { status: 409 });
  }

  const params = JSON.parse(rec.actionParams || "{}");
  const result = await executeAction(rec.actionType, params, {
    incidentId: rec.incidentId,
    recommendationId: rec.id,
  });
  await db.recommendation.update({ where: { id: rec.id }, data: { status: "EXECUTED", executedAt: new Date() } });
  if (rec.incidentId) {
    await db.incident.update({ where: { id: rec.incidentId }, data: { status: "REMEDIATING" } });
  }

  const verification = await verifyRecovery(rec.incidentId);
  if (verification.passed) {
    await db.recommendation.update({
      where: { id: rec.id },
      data: { status: "VERIFIED", verifiedAt: new Date(), verification: JSON.stringify(verification) },
    });
    if (rec.incidentId) {
      await db.incident.update({
        where: { id: rec.incidentId },
        data: {
          status: "RESOLVED",
          resolvedAt: new Date(),
          resolutionNote: `${rec.actionLabel} executed with approval; recovery verified by CineFlow Agent.`,
        },
      });
      await addIncidentEvent(rec.incidentId, "VERIFICATION", "Incident resolved", verification.summary);
    }
  }

  return NextResponse.json({
    ok: true,
    action: result,
    verification,
    demoEnvironment: true,
    note: "Demo environment: action applied to local demo state only. No external system was contacted.",
  });
}
