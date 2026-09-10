"use client";

// CineFlow AI — keyboard shortcuts help dialog. Opened with "?" anywhere in the
// app (except while typing in a field) or from the header help button.

import { useEffect } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Keyboard, Command, CornerDownLeft } from "lucide-react";

export interface ShortcutRow {
  keys: string[];
  label: string;
  hint?: string;
}

const SHORTCUT_GROUPS: { group: string; rows: ShortcutRow[] }[] = [
  {
    group: "Global",
    rows: [
      { keys: ["Ctrl", "K"], label: "Open command palette", hint: "⌘K on macOS" },
      { keys: ["?"], label: "Toggle this shortcuts panel", hint: "works anywhere you're not typing" },
      { keys: ["Esc"], label: "Close dialogs & menus" },
      { keys: ["Tab"], label: "Move focus", hint: "every card, row and button is reachable" },
    ],
  },
  {
    group: "Agent console",
    rows: [
      { keys: ["Enter"], label: "Send message" },
      { keys: ["Shift", "Enter"], label: "New line in the composer" },
      { keys: ["Ctrl", "⇧", "C"], label: "Copy share link for the active run", hint: "⌘⇧C on macOS — deep-links the conversation" },
    ],
  },
  {
    group: "Navigation",
    rows: [
      { keys: ["M"], label: "Open the More views menu", hint: "desktop nav — then arrows + Enter to navigate" },
      { keys: ["Enter"], label: "Open focused incident, workflow or run", hint: "rows and cards are focusable" },
      { keys: ["Backspace"], label: "Back to incidents list", hint: "with Alt on the incident detail page" },
    ],
  },
  {
    group: "Incident timeline replay",
    rows: [
      { keys: ["←", "→"], label: "Step one event back / forward", hint: "while replay mode is on" },
      { keys: ["Home", "End"], label: "Jump to the first / latest event", hint: "while replay mode is on" },
    ],
  },
  {
    group: "Audit log",
    rows: [
      { keys: ["1", "2", "3", "4"], label: "Switch time range — All / 1h / 24h / 7d", hint: "on the audit view, while not typing" },
    ],
  },
];

function KeyCap({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-border bg-secondary/60 px-1.5 font-mono text-[11px] font-medium text-secondary-foreground shadow-[0_1px_0_#101828]">
      {children}
    </kbd>
  );
}

export function ShortcutsHelp({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  // "?" toggles the panel — ignored while the user is typing in any field so
  // question marks in agent queries still work.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const typing =
        !!t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable ||
          t.getAttribute("role") === "textbox");
      if (typing) return;
      e.preventDefault();
      onOpenChange(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-border/80 bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="flex size-7 items-center justify-center rounded-md border border-[#B2DDFF] bg-[#EFF8FF]">
              <Keyboard className="size-4 text-[#2563EB]" aria-hidden />
            </span>
            Keyboard shortcuts
          </DialogTitle>
          <DialogDescription className="text-xs">
            Move through the demo without touching the mouse — every control is keyboard reachable.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {SHORTCUT_GROUPS.map((g) => (
            <section key={g.group} aria-label={g.group}>
              <p className="cine-label mb-1.5">{g.group}</p>
              <ul className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/60">
                {g.rows.map((r) => (
                  <li
                    key={r.label}
                    className="flex items-center justify-between gap-3 bg-secondary/20 px-3 py-2"
                  >
                    <span className="min-w-0 text-[13px] text-foreground/90">
                      {r.label}
                      {r.hint ? (
                        <span className="block text-[11px] text-muted-foreground">{r.hint}</span>
                      ) : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      {r.keys.map((k) => (
                        <KeyCap key={k}>{k}</KeyCap>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <p className="flex items-center gap-2 rounded-md border border-border/60 bg-secondary/30 px-3 py-2 text-[11px] text-muted-foreground">
          <Command className="size-3.5 shrink-0" aria-hidden />
          The command palette also navigates to every view, searches incidents and runs the demo scenario.
          <CornerDownLeft className="size-3.5 shrink-0" aria-hidden />
        </p>
      </DialogContent>
    </Dialog>
  );
}
