import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { advanceRun } from "@/lib/agent/engine";
import { agentRunDTO, agentRunStepDTO, toolsStatusDTO } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/**
 * GET /api/agent/runs/{id}
 * Returns the run with its steps. Each poll advances the pipeline by at most
 * one state transition, which is what makes tool usage visibly progressive.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await advanceRun(id);
  const run = await db.agentRun.findUnique({
    where: { id },
    include: { steps: { orderBy: { seq: "asc" } } },
  });
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  return NextResponse.json({
    run: agentRunDTO(run),
    steps: run.steps.map(agentRunStepDTO),
    tools: toolsStatusDTO(run.steps),
  });
}
