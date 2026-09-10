import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import { activeProvider, providerStatusDTO, googleCloudProject, googleCloudLocation } from "@/lib/ai/providers";
import { guardrailPoliciesDTO } from "@/lib/agent/guardrails";
import type { SettingsDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSeeded();
  const scenario = await db.demoScenario.findUnique({ where: { id: "render_delay" } });
  const active = activeProvider();

  const dto: SettingsDTO = {
    activeProvider: `${active.name}`,
    providers: providerStatusDTO(),
    googleCloud: {
      projectConfigured: Boolean(googleCloudProject()),
      locationConfigured: Boolean(googleCloudLocation()),
      note: "Set GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION to wire the Google Cloud agent infrastructure (Agent Builder / Vertex AI endpoints). Adapters are ready; demo mode runs without them.",
    },
    integrations: [
      {
        id: "gemini",
        name: "Google Gemini (LLM reasoning)",
        status: active.id === "GEMINI" ? "CONFIGURED" : "DEMO_MODE",
        note: "REST adapter ready (generativelanguage.googleapis.com). Activates when GEMINI_API_KEY is set; demo reasoning is used otherwise.",
      },
      {
        id: "agent-builder",
        name: "Google Cloud Agent Builder (agent infrastructure)",
        status: "READY",
        note: "Agent orchestration layer mirrors the Agent Builder tool-calling contract (tools, guardrails, approval gates). Deployment wiring via GOOGLE_CLOUD_PROJECT/LOCATION env vars.",
      },
      {
        id: "vertex",
        name: "Vertex AI (production model serving)",
        status: "READY",
        note: "Same provider interface; switch GEMINI_MODEL to a Vertex-hosted model in production.",
      },
      {
        id: "render-fleet",
        name: "Render fleet operations (scale/restart)",
        status: "DEMO_MODE",
        note: "Demo adapter mutates local demo state. Production mapping: Google Cloud GKE node pool / Batch jobs via the guarded tool interface.",
      },
      {
        id: "auth",
        name: "Authentication (NextAuth placeholder)",
        status: "READY",
        note: "Auth architecture placeholder: SSO/NextAuth can gate the approval endpoint. Out of scope for the hackathon demo; approvals are attributed to 'Production Manager (demo)'.",
      },
    ],
    guardrails: guardrailPoliciesDTO(),
    scenario: {
      id: scenario?.id ?? "render_delay",
      status: scenario?.status ?? "IDLE",
      runCount: scenario?.runCount ?? 0,
      lastRunId: scenario?.lastRunId ?? null,
    },
  };
  return NextResponse.json(dto);
}
