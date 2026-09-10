// CineFlow AI — LLM provider adapters.
//
// Provider chain (server-side only):
//   1. GEMINI   — real Google Gemini REST call, active when GEMINI_API_KEY is set.
//   2. DEMO     — deterministic scripted reasoning (default for the judged
//                 scenario; grounded in real tool evidence, no external LLM required).
//
// The agent NEVER fabricates evidence: LLM output is only used to phrase
// analysis grounded in tool results, or to answer free-form questions with
// live system context supplied in the prompt.

import type { ProviderStatusDTO } from "@/lib/types";

export interface ProviderInfo {
  id: "GEMINI" | "DEMO";
  name: string;
}

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function googleCloudProject(): string | null {
  return process.env.GOOGLE_CLOUD_PROJECT || null;
}

export function googleCloudLocation(): string | null {
  return process.env.GOOGLE_CLOUD_LOCATION || null;
}

/** Which provider actually powers free-form generation right now. */
export function activeProvider(): ProviderInfo {
  if (geminiConfigured()) return { id: "GEMINI", name: "Google Gemini" };
  return { id: "DEMO", name: "Deterministic Demo Reasoning" };
}

export function providerStatusDTO(): ProviderStatusDTO[] {
  return [
    {
      id: "GEMINI",
      name: "Google Gemini (hackathon partner)",
      configured: geminiConfigured(),
      envVar: "GEMINI_API_KEY",
      note: geminiConfigured()
        ? "Configured — Gemini powers agent reasoning."
        : "Not configured — running in demo reasoning mode. Set GEMINI_API_KEY to activate.",
    },
    {
      id: "DEMO",
      name: "Deterministic demo reasoning",
      configured: true,
      envVar: "—",
      note: "Scripted, evidence-grounded pipeline for the judged scenario. Guarantees reproducibility.",
    },
  ];
}

// ---------------------------------------------------------------------------
// Gemini REST adapter (no SDK dependency; works on Cloud Run / Vercel)
// ---------------------------------------------------------------------------

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

export async function generateWithGemini(systemPrompt: string, userPrompt: string): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 700 },
        }),
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
    return text && text.trim() ? text.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Free-form generation through the provider chain: Gemini → null (falls back to deterministic demo response).
 * Returns { text, provider } or null when no LLM produced output.
 */
export async function generateFreeForm(
  systemPrompt: string,
  userPrompt: string
): Promise<{ text: string; provider: "GEMINI" } | null> {
  const gemini = await generateWithGemini(systemPrompt, userPrompt);
  if (gemini) return { text: gemini, provider: "GEMINI" };
  return null;
}

export const CINEFLOW_SYSTEM_PROMPT = `You are CineFlow AI, an agentic production operations assistant for a film/media studio.
You help production managers investigate incidents, explain root causes with evidence, and recommend safe actions.

RULES:
- Ground every claim in the LIVE SYSTEM CONTEXT provided to you. Never invent metrics, incidents, or events.
- If the context is insufficient to answer, say exactly that and recommend human investigation.
- Be concise and operational. Use short paragraphs or bullets. Max ~150 words.
- Never claim to have executed an action. Actions require human approval in the product; you only recommend.
- Refer to incidents by their ID (e.g. INC-1042).`;
