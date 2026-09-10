"use client";

// CineFlow AI — global client state (cross-view triggers for the agent console).
//
// The chat transcript is persisted to localStorage via zustand's persist
// middleware so a judge can reload the page (or re-open the tab) and still see
// the conversation history. Runs referenced by old transcript entries are
// re-fetched from the API; if the demo data was reset and a run no longer
// exists, the console renders a graceful "run expired" note instead of an error.

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface ChatEntry {
  kind: "user" | "run";
  text?: string;
  runId?: string;
  at: number;
}

interface CineFlowStore {
  /** Query queued by another view (dashboard/demo/incident "investigate") for the agent console. */
  autoQuery: string | null;
  autoQueryToken: number;
  queueAutoQuery: (query: string) => void;
  consumeAutoQuery: () => string | null;
  /** The active agent run (shared by the agent console + demo checklist). */
  activeRunId: string | null;
  setActiveRunId: (id: string | null) => void;
  /** Chat session transcript for the agent console (persisted). */
  chatEntries: ChatEntry[];
  addUserEntry: (text: string) => void;
  addRunEntry: (runId: string) => void;
  clearChat: () => void;
}

const MAX_PERSISTED_ENTRIES = 60;

export const useCineFlowStore = create<CineFlowStore>()(
  persist(
    (set, get) => ({
      autoQuery: null,
      autoQueryToken: 0,
      queueAutoQuery: (query) =>
        set((s) => ({ autoQuery: query, autoQueryToken: s.autoQueryToken + 1 })),
      consumeAutoQuery: () => {
        const q = get().autoQuery;
        if (q) set({ autoQuery: null });
        return q;
      },
      activeRunId: null,
      setActiveRunId: (id) => set({ activeRunId: id }),
      chatEntries: [],
      addUserEntry: (text) =>
        set((s) => {
          const entry: ChatEntry = { kind: "user", text, at: Date.now() };
          return { chatEntries: [...s.chatEntries, entry].slice(-MAX_PERSISTED_ENTRIES) };
        }),
      addRunEntry: (runId) =>
        set((s) => {
          const entry: ChatEntry = { kind: "run", runId, at: Date.now() };
          return { chatEntries: [...s.chatEntries, entry].slice(-MAX_PERSISTED_ENTRIES) };
        }),
      clearChat: () => set({ chatEntries: [] }),
    }),
    {
      name: "cineflow-chat-v1",
      // SSR-safe: no localStorage on the server; zustand skips persistence there.
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? window.localStorage : (undefined as unknown as Storage)
      ),
      // Avoid SSR/CSR first-paint mismatches: the persisted transcript is only
      // adopted after mount (the app shell calls rehydrate() in an effect).
      skipHydration: true,
      partialize: (s) => ({ chatEntries: s.chatEntries }),
    }
  )
);
