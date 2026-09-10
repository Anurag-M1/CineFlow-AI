"use client";

// CineFlow AI — shared Markdown export builders (single source of truth).
//
// Moved out of the agent view in R13 so THREE surfaces compose the same honest
// documents instead of duplicating builders:
//   1. agent.tsx      — per-run transcript buttons + the conversation Export button
//   2. incident-detail — per-row transcript buttons in the Agent Runs card
//   3. command-palette — "Copy conversation" action
// Everything here is pure over DTOs that are already (or freshly) fetched —
// the documents reflect the run's CURRENT state, so mid-investigation exports
// honestly read as such.

import { api } from "@/lib/client/api";
import type { ChatEntry } from "@/lib/client/store";
import type { AgentRunDetailDTO, RecommendationDTO } from "@/lib/types";

// ---------------------------------------------------------------------------
// Phase / provider metadata (labels shared by the console + exporters)
// ---------------------------------------------------------------------------

export const PHASE_LABELS: Record<string, { label: string }> = {
  UNDERSTAND: { label: "Understand" },
  COLLECT: { label: "Collect" },
  ANALYZE: { label: "Analyze" },
  ROOT_CAUSE: { label: "Root cause" },
  CONFIDENCE: { label: "Confidence" },
  RISK: { label: "Risk" },
  RECOMMEND: { label: "Recommend" },
  APPROVAL: { label: "Approval" },
  ACTION: { label: "Action" },
  VERIFY: { label: "Verify" },
  RESOLVE: { label: "Resolve" },
  REPORT: { label: "Report" },
};

export const MODE_LABEL: Record<string, string> = {
  DEMO: "Demo script",
  GEMINI: "Gemini",
};

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function fmtTranscriptDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

function mdInline(text: string): string {
  return text.replace(/\r?\n+/g, " ").replace(/\|/g, "\\|").trim();
}

// ---------------------------------------------------------------------------
// Run transcript — one agent run as Markdown (query, reasoning steps, tool
// calls, recommendation, verification, final answer + share URL footer).
// ---------------------------------------------------------------------------

export function buildRunTranscriptMarkdown(
  run: AgentRunDetailDTO,
  rec: RecommendationDTO | null,
): string {
  const lines: string[] = [];
  const r = run.run;

  lines.push(`# Agent run transcript — ${r.id.slice(0, 8)}`);
  lines.push("");
  lines.push(
    `> Exported from **CineFlow AI** (demo environment) · ${fmtTranscriptDateTime(new Date().toISOString())} · provider: ${MODE_LABEL[r.mode] ?? r.mode}`,
  );
  lines.push("");

  lines.push(`- **Query:** "${mdInline(r.query)}"`);
  lines.push(`- **Intent:** ${r.intent}`);
  lines.push(`- **Status:** ${r.status}`);
  if (r.incidentId) lines.push(`- **Incident:** ${r.incidentId}`);
  if (r.confidence != null) lines.push(`- **Confidence:** ${r.confidence}%`);
  lines.push(`- **Created:** ${fmtTranscriptDateTime(r.createdAt)}`);
  if (r.completedAt) lines.push(`- **Completed:** ${fmtTranscriptDateTime(r.completedAt)}`);
  lines.push("");

  // Reasoning steps
  lines.push(`## Reasoning steps (${run.steps.length})`);
  lines.push("");
  for (const s of run.steps) {
    const phase = PHASE_LABELS[s.phase]?.label ?? s.phase;
    lines.push(`${s.seq + 1}. **${phase} — ${mdInline(s.title)}** · ${s.status}`);
    if (s.detail) lines.push(`   ${mdInline(s.detail)}`);
    if (s.tool) lines.push(`   - tool: \`${s.tool}\` (${s.toolStatus ?? "—"})`);
    if (s.evidence && Object.keys(s.evidence).length > 0) {
      lines.push("   ```json");
      lines.push(JSON.stringify(s.evidence, null, 2).split("\n").map((l) => `   ${l}`).join("\n"));
      lines.push("   ```");
    }
  }
  lines.push("");

  // Tool calls
  lines.push(`## Tools (${run.tools.filter((t) => t.status === "completed").length}/${run.tools.length} completed)`);
  lines.push("");
  for (const t of run.tools) {
    lines.push(`- \`${t.name}\` — ${t.status}: ${mdInline(t.description)}`);
  }
  lines.push("");

  // Recommendation (if the run produced one)
  if (rec) {
    lines.push("## Recommendation");
    lines.push("");
    lines.push(
      `**${mdInline(rec.title)}** — ${mdInline(rec.actionLabel)} (risk: ${rec.risk}, status: ${rec.status}, confidence: ${rec.confidence}%)`,
    );
    lines.push("");
    if (rec.problem) lines.push(mdInline(rec.problem));
    if (rec.analysis) lines.push(`**Analysis:** ${mdInline(rec.analysis)}`);
    if (rec.rootCause) lines.push(`**Root cause:** ${mdInline(rec.rootCause)}`);
    if (rec.evidence.length > 0) {
      lines.push("**Evidence:**");
      for (const e of rec.evidence) {
        lines.push(`- ${mdInline(e.label)}: ${mdInline(e.value)} _(${mdInline(e.source)})_`);
      }
    }
    if (rec.decidedAt) lines.push(`- Decided (human gate): ${fmtTranscriptDateTime(rec.decidedAt)}`);
    if (rec.executedAt) lines.push(`- Executed: ${fmtTranscriptDateTime(rec.executedAt)}`);
    if (rec.verifiedAt) lines.push(`- Verified: ${fmtTranscriptDateTime(rec.verifiedAt)}`);
    lines.push("");
  }

  // Verification table (mirrors the console's final answer)
  if (rec?.verification) {
    lines.push("## Verification");
    lines.push("");
    if (rec.verification.summary) lines.push(mdInline(rec.verification.summary));
    lines.push("");
    lines.push("| Check | Before | After | Threshold | Pass |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const c of rec.verification.checks) {
      lines.push(
        `| ${mdInline(c.label)} | ${mdInline(c.before)} | ${mdInline(c.after)} | ${mdInline(c.threshold)} | ${c.passed ? "✅ pass" : "❌ fail"} |`,
      );
    }
    lines.push("");
  }

  // Final answer
  if (r.summary) {
    lines.push("## Final answer");
    lines.push("");
    lines.push(mdInline(r.summary));
    lines.push("");
  }

  lines.push("---");
  lines.push(
    `_Reopen this conversation: ${typeof window !== "undefined" ? `${window.location.origin}/#/agent?run=${r.id}` : `#/agent?run=${r.id}`} — CineFlow AI, Agentic Cinema hackathon._`,
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Conversation — the WHOLE agent-console transcript (every user query plus
// each run's full transcript) as one Markdown document. Run details are
// fetched fresh so the export reflects current statuses; expired runs (demo
// reset) are noted honestly instead of failing the whole export.
// ---------------------------------------------------------------------------

export async function buildConversationMarkdown(entries: ChatEntry[]): Promise<string> {
  const runCount = entries.filter((e) => e.kind === "run").length;
  const header: string[] = [
    "# CineFlow AI — Agent conversation export",
    "",
    `> ${runCount} agent runs · exported ${fmtTranscriptDateTime(new Date().toISOString())} · ${typeof window !== "undefined" ? `${window.location.origin}/#/agent` : "#/agent"}`,
    "",
  ];
  const recs = await api.recommendations();
  const body: string[] = [];
  for (const entry of entries) {
    if (entry.kind === "user") {
      body.push(`## You asked`);
      body.push("");
      body.push(`> "${entry.text ?? ""}"`);
      body.push("");
    } else {
      const runId = entry.runId ?? "";
      try {
        const detail = await api.agentRun(runId);
        const rec = recs.find((r) => r.agentRunId === runId) ?? null;
        body.push("---");
        body.push("");
        body.push(buildRunTranscriptMarkdown(detail, rec));
        body.push("");
      } catch {
        body.push(`## Run ${runId.slice(0, 8)} (expired)`);
        body.push("");
        body.push("_This transcript entry references an agent run that is no longer stored — the demo data was reset._");
        body.push("");
      }
    }
  }
  return [...header, ...body].join("\n");
}

// ---------------------------------------------------------------------------
// File download helper (shared by every .md export surface)
// ---------------------------------------------------------------------------

export function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
