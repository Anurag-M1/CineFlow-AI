"use client";

// CineFlow AI — agent run subscription. Centralizes polling of
// GET /api/agent/runs/{id} (each poll advances the server-side pipeline).

import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import type { AgentRunDetailDTO } from "@/lib/types";

const TERMINAL = ["COMPLETED", "REJECTED", "FAILED"] as const;

interface RunState {
  /** The run id the stored data belongs to (stale data is never surfaced). */
  id: string | null;
  data: AgentRunDetailDTO | null;
  error: string | null;
}

export function useAgentRun(runId: string | null, intervalMs = 700) {
  const [state, setState] = useState<RunState>({ id: null, data: null, error: null });

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      try {
        const data = await api.agentRun(runId);
        if (cancelled) return;
        setState({ id: runId, data, error: null });
        // Stop the interval once the run reaches a terminal state
        if (TERMINAL.includes(data.run.status as (typeof TERMINAL)[number]) && timer) {
          clearInterval(timer);
          timer = null;
        }
      } catch (e) {
        if (!cancelled) {
          setState((prev) =>
            prev.id === runId || prev.data === null
              ? { id: runId, data: prev.data, error: e instanceof Error ? e.message : "Run request failed" }
              : prev
          );
        }
      }
    };

    void poll();
    timer = setInterval(poll, intervalMs);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [runId, intervalMs]);

  // Only surface data belonging to the current runId — a runId change
  // immediately blanks the view without needing a reset effect.
  const run = state.id === runId ? state.data : null;
  const error = state.id === runId ? state.error : null;
  const terminal = run ? TERMINAL.includes(run.run.status as (typeof TERMINAL)[number]) : false;
  return { run, error, terminal };
}
