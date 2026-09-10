"use client";

// CineFlow AI — global command palette (⌘K / Ctrl+K).
//
// Fast keyboard navigation to every view, quick actions (run the demo
// scenario, reset demo data), and live incident lookup — the "power user"
// surface that makes the demo feel like a real operations platform.

import { useEffect } from "react";
import {
  Activity, Boxes, Columns2, Cpu, FileText, FlaskConical, LayoutDashboard, Link2, MessagesSquare, Play,
  RotateCcw, ScrollText, Search, Settings, ShieldCheck, Sparkles,
} from "lucide-react";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem,
  CommandList, CommandSeparator, CommandShortcut,
} from "@/components/ui/command";
import { toast } from "sonner";
import { api } from "@/lib/client/api";
import { useApi } from "@/hooks/use-api";
import { useCineFlowStore } from "@/lib/client/store";
import { navigate } from "@/components/app/router";
import { cn } from "@/lib/utils";
import type { IncidentDTO } from "@/lib/types";
import { SeverityBadge } from "@/components/app/shared/badges";
import { buildPostmortemMarkdown } from "@/components/app/views/incident-detail";
import { buildConversationMarkdown } from "@/components/app/shared/markdown-export";

const CANONICAL_QUERY = "Why is the post-production render pipeline delayed?";
const CANONICAL_INCIDENT = "INC-1042";

interface PaletteItem {
  view: string;
  label: string;
  icon: typeof Search;
  hint?: string;
}

const NAV_ITEMS: PaletteItem[] = [
  { view: "dashboard", label: "Dashboard", icon: LayoutDashboard, hint: "Production overview" },
  { view: "agent", label: "AI Agent console", icon: Sparkles, hint: "Chat + live reasoning" },
  { view: "incidents", label: "Incidents", icon: FileText, hint: "All incidents" },
  { view: "compare", label: "Incident comparison", icon: Columns2, hint: "Two incidents side-by-side" },
  { view: "workflows", label: "Production Workflows", icon: Boxes, hint: "Pipeline health" },
  { view: "infra", label: "Infrastructure", icon: Cpu, hint: "System health & metrics" },
  { view: "recommendations", label: "Recommendations", icon: ShieldCheck, hint: "Approval queue" },
  { view: "audit", label: "Audit Log", icon: ScrollText, hint: "Decision trail" },
  { view: "settings", label: "Settings / Integrations", icon: Settings, hint: "Providers & guardrails" },
  { view: "architecture", label: "Architecture", icon: Cpu, hint: "System design" },
  { view: "demo", label: "Judge Demo", icon: Activity, hint: "2-minute walkthrough" },
];

export function CommandPalette({
  open, onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queueAutoQuery = useCineFlowStore((s) => s.queueAutoQuery);

  // Fetch incidents only while the palette is open (cheap, fresh enough).
  const { data: incidents } = useApi<IncidentDTO[]>(() => api.incidents(), {
    enabled: open,
    intervalMs: 15000,
  });

  // Global ⌘K / Ctrl+K binding (app-level, registered once).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpenChange]);

  const go = (view: string) => {
    navigate(`/${view}`);
    onOpenChange(false);
  };

  const runDemoScenario = () => {
    queueAutoQuery(CANONICAL_QUERY);
    navigate("/agent");
    onOpenChange(false);
    toast.info("Demo scenario queued", { description: "The agent is starting its investigation." });
  };

  const resetDemo = async () => {
    onOpenChange(false);
    try {
      const res = await api.resetDemo();
      toast.success(res.message || "Demo data reset.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reset failed");
    }
  };

  const shareActiveRun = () => {
    onOpenChange(false);
    const { activeRunId } = useCineFlowStore.getState();
    if (!activeRunId) {
      toast.error("No active run to share yet", {
        description: "Run a query in the agent console first — then copy its link.",
      });
      return;
    }
    const url = `${window.location.origin}/#/agent?run=${activeRunId}`;
    void navigator.clipboard
      .writeText(url)
      .then(() => {
        toast.success("Share link copied", {
          description: "Opening it restores this conversation at the current run.",
        });
      })
      .catch(() => {
        toast.error("Could not copy — clipboard unavailable in this context");
      });
  };

  const copyPostmortem = async () => {
    onOpenChange(false);
    try {
      const incident = await api.incident(CANONICAL_INCIDENT);
      const events = [...incident.events].sort(
        (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime(),
      );
      const md = buildPostmortemMarkdown(incident, events);
      await navigator.clipboard.writeText(md);
      toast.success(
        incident.status === "RESOLVED" ? "Postmortem copied as Markdown" : `Draft postmortem copied (${incident.status.toLowerCase()})`,
        {
          description: `${CANONICAL_INCIDENT} · ${events.length} events · ${md.length.toLocaleString()} characters — open the incident view for the full story.`,
        },
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not build the postmortem");
    }
  };

  const copyConversation = async () => {
    onOpenChange(false);
    const { chatEntries } = useCineFlowStore.getState();
    const runCount = chatEntries.filter((e) => e.kind === "run").length;
    if (runCount === 0) {
      toast.error("No conversation to copy yet", {
        description: "Run a query in the agent console first — then this exports every query and run transcript.",
      });
      return;
    }
    try {
      const md = await buildConversationMarkdown(chatEntries);
      await navigator.clipboard.writeText(md);
      toast.success("Conversation copied as Markdown", {
        description: `${md.length.toLocaleString()} characters · ${runCount} run transcripts included.`,
      });
    } catch {
      toast.error("Could not copy — clipboard unavailable in this context");
    }
  };

  const activeIncidents = (incidents ?? []).filter((i) => i.status !== "RESOLVED");
  const resolvedIncidents = (incidents ?? []).filter((i) => i.status === "RESOLVED");

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command palette"
      description="Navigate views, run actions, and search incidents"
      className="sm:max-w-[520px]"
    >
      <CommandInput placeholder="Search views, actions, incidents…" />
      <CommandList className="cine-scroll max-h-[420px]">
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Actions">
          <CommandItem
            value="run demo scenario production incident render queue INC-1042 investigate"
            onSelect={runDemoScenario}
            className="gap-2.5"
          >
            <span className="flex size-5 items-center justify-center rounded-md bg-[#EFF8FF]">
              <Play className="size-3.5 text-[#2563EB]" aria-hidden />
            </span>
            Run demo scenario
            <span className="ml-auto text-[11px] text-muted-foreground">INVESTIGATE INC-1042</span>
          </CommandItem>
          <CommandItem
            value="reset demo data reseed restore seed state"
            onSelect={() => void resetDemo()}
            className="gap-2.5"
          >
            <span className="flex size-5 items-center justify-center rounded-md bg-secondary">
              <RotateCcw className="size-3.5 text-muted-foreground" aria-hidden />
            </span>
            Reset demo data
            <span className="ml-auto text-[11px] text-muted-foreground">RESTORE SEED STATE</span>
          </CommandItem>
          <CommandItem
            value="copy share link active run agent conversation deep link"
            onSelect={shareActiveRun}
            className="gap-2.5"
          >
            <span className="flex size-5 items-center justify-center rounded-md bg-[#EFF8FF]">
              <Link2 className="size-3.5 text-[#2563EB]" aria-hidden />
            </span>
            Copy share link for active run
            <span className="ml-auto text-[11px] text-muted-foreground">⌘⇧C</span>
          </CommandItem>
          <CommandItem
            value="copy conversation export chat transcript markdown all runs queries"
            onSelect={() => void copyConversation()}
            className="gap-2.5"
          >
            <span className="flex size-5 items-center justify-center rounded-md bg-[#EFF8FF]">
              <MessagesSquare className="size-3.5 text-[#2563EB]" aria-hidden />
            </span>
            Copy conversation export
            <span className="ml-auto text-[11px] text-muted-foreground">MARKDOWN</span>
          </CommandItem>
          <CommandItem
            value="copy postmortem incident report markdown export INC-1042 draft"
            onSelect={() => void copyPostmortem()}
            className="gap-2.5"
          >
            <span className="flex size-5 items-center justify-center rounded-md bg-[#ECFDF3]">
              <FileText className="size-3.5 text-[#12B76A]" aria-hidden />
            </span>
            Copy {CANONICAL_INCIDENT} postmortem
            <span className="ml-auto text-[11px] text-muted-foreground">MARKDOWN</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navigate">
          {NAV_ITEMS.map((item) => (
            <CommandItem
              key={item.view}
              value={`${item.label} ${item.hint ?? ""}`}
              onSelect={() => go(item.view)}
              className="gap-2.5"
            >
              <item.icon className="size-4 text-muted-foreground" aria-hidden />
              {item.label}
              <span className="ml-auto hidden text-[11px] text-muted-foreground sm:inline">
                {item.hint}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>

        {activeIncidents.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Active incidents">
              {activeIncidents.map((inc) => (
                <CommandItem
                  key={inc.id}
                  value={`${inc.id} ${inc.title} ${inc.service} ${inc.severity}`}
                  onSelect={() => go(`incidents/${inc.id}`)}
                  className="gap-2.5"
                >
                  <FileText className="size-4 text-muted-foreground" aria-hidden />
                  <span className="font-mono text-xs">{inc.id}</span>
                  <span className="min-w-0 flex-1 truncate">{inc.title}</span>
                  <SeverityBadge severity={inc.severity} className={cn("h-5 shrink-0 text-[9px]")} />
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}

        {resolvedIncidents.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Resolved incidents">
              {resolvedIncidents.map((inc) => (
                <CommandItem
                  key={inc.id}
                  value={`${inc.id} ${inc.title} ${inc.service} resolved`}
                  onSelect={() => go(`incidents/${inc.id}`)}
                  className="gap-2.5"
                >
                  <FileText className="size-4 text-muted-foreground/60" aria-hidden />
                  <span className="font-mono text-xs text-muted-foreground">{inc.id}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{inc.title}</span>
                  <span className="shrink-0 text-[10px] text-[#12B76A]">resolved</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}

        <CommandSeparator />
        <div className="flex items-center justify-between px-3 py-2 text-[10px] text-muted-foreground/70">
          <span className="flex items-center gap-1.5">
            <FlaskConical className="size-3" aria-hidden />
            Demo environment — simulated production data
          </span>
          <span className="flex items-center gap-1">
            <CommandShortcut>⌘K</CommandShortcut>
            to toggle
          </span>
        </div>
      </CommandList>
    </CommandDialog>
  );
}
