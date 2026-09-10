"use client";

// CineFlow AI — application shell: dark 240px sidebar (primary navigation),
// white top action bar (demo controls, search, notifications, user profile),
// hash-routed view container, sticky footer. Landing renders standalone.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity, ArrowUp, BarChart3, Bell, Boxes, CheckCircle2, ChevronRight, Cpu,
  FileText, FileWarning, Keyboard, LayoutDashboard, LogOut, Menu, Play,
  Plug, ScrollText, Search, Settings, ShieldCheck, Sparkles, User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CommandPalette } from "@/components/app/command-palette";
import { ShortcutsHelp } from "@/components/app/shortcuts-help";
import { navigate, useRoute, type Route } from "@/components/app/router";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/client/api";
import { useCineFlowStore } from "@/lib/client/store";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LandingView } from "@/components/app/views/landing";
import { DashboardView } from "@/components/app/views/dashboard";
import { AgentView } from "@/components/app/views/agent";
import { IncidentsView } from "@/components/app/views/incidents";
import { IncidentDetailView } from "@/components/app/views/incident-detail";
import { CompareView } from "@/components/app/views/compare";
import { WorkflowsView } from "@/components/app/views/workflows";
import { SystemHealthView } from "@/components/app/views/system-health";
import { RecommendationsView } from "@/components/app/views/recommendations";
import { AnalyticsView } from "@/components/app/views/analytics";
import { ReportsView } from "@/components/app/views/reports";
import { IntegrationsView } from "@/components/app/views/integrations";
import { AuditView } from "@/components/app/views/audit";
import { SettingsView } from "@/components/app/views/settings";
import { ArchitectureView } from "@/components/app/views/architecture";
import { DemoView } from "@/components/app/views/demo";
import { SeverityBadge } from "@/components/app/shared/badges";

// ---------------------------------------------------------------------------
// Navigation model — the product's primary sections.
// ---------------------------------------------------------------------------

const NAV_MAIN = [
  { view: "dashboard", label: "Overview", icon: LayoutDashboard },
  { view: "agent", label: "AI Agent", icon: Sparkles },
  { view: "incidents", label: "Incidents", icon: FileWarning },
  { view: "workflows", label: "Production", icon: Boxes },
  { view: "infra", label: "Infrastructure", icon: Cpu },
  { view: "recommendations", label: "Recommendations", icon: ShieldCheck },
  { view: "analytics", label: "Analytics", icon: BarChart3 },
  { view: "reports", label: "Reports", icon: FileText },
] as const;

const NAV_BOTTOM = [
  { view: "integrations", label: "Integrations", icon: Plug },
  { view: "settings", label: "Settings", icon: Settings },
] as const;

const NAV_ALL = [...NAV_MAIN, ...NAV_BOTTOM] as const;

const isNavActive = (view: string, route: Route) =>
  route.view === view || (view === "incidents" && route.view === "incident");

const SCENARIO_LIVE = ["RUNNING", "AWAITING_APPROVAL", "EXECUTING", "REMEDIATING"];

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function Logo({ onDark = true }: { onDark?: boolean }) {
  return (
    <Link href="#/" className="group flex items-center gap-2.5" aria-label="CineFlow AI home">
      <span className={cn(
        "relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border shadow-xs transition-transform group-hover:scale-105",
        onDark ? "border-white/20 bg-[#0B0F19]" : "border-[#D0D5DD] bg-[#0B0F19]",
      )}>
        <svg viewBox="0 0 32 32" className="size-5" fill="none" aria-hidden>
          <circle cx="16" cy="16" r="10" stroke="url(#nav-cf-grad)" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="3.5 1.5" />
          <path d="M12 11L22 16L12 21V11Z" fill="url(#nav-cf-grad)" />
          <circle cx="22" cy="16" r="1.8" fill="#38BDF8" />
          <defs>
            <linearGradient id="nav-cf-grad" x1="6" y1="6" x2="26" y2="26" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#38BDF8" />
              <stop offset="50%" stopColor="#3B82F6" />
              <stop offset="100%" stopColor="#818CF8" />
            </linearGradient>
          </defs>
        </svg>
      </span>
      <span className="leading-tight">
        <span className={cn("block text-[15px] font-semibold tracking-tight", onDark ? "text-white" : "text-[#111827]")}>
          CineFlow <span className="bg-gradient-to-r from-[#38BDF8] to-[#818CF8] bg-clip-text text-transparent">AI</span>
        </span>
        <span className={cn("block text-[11px]", onDark ? "text-[#98A2B3]" : "text-[#667085]")}>Production Operations</span>
      </span>
    </Link>
  );
}

function RunDemoButton({ className, onRan }: { className?: string; onRan?: () => void }) {
  const { queueAutoQuery } = useCineFlowStore();
  return (
    <Button
      size="sm"
      className={cn("h-8 gap-1.5 whitespace-nowrap bg-[#2563EB] px-3 text-[13px] font-semibold text-white hover:bg-[#1D4ED8]", className)}
      onClick={() => {
        queueAutoQuery("Why is the post-production render pipeline delayed?");
        navigate("/agent");
        onRan?.();
      }}
    >
      <Play className="size-3.5" aria-hidden />
      Run Demo Scenario
    </Button>
  );
}

/** Live demo-scenario status chip — visible while a scenario is running
 *  (pulsing info tone) or resolved (success); click jumps to the action. */
function ScenarioStatusChip({ status }: { status: string }) {
  if (SCENARIO_LIVE.includes(status)) {
    return (
      <button
        onClick={() => navigate("/agent")}
        className="hidden h-8 items-center gap-2 rounded-md border border-[#B2DDFF] bg-[#EFF8FF] px-2.5 text-[12px] font-medium text-[#175CD3] transition-colors hover:border-[#84B7F7] md:inline-flex"
        aria-label="Demo scenario is live — open the agent console"
        aria-live="polite"
      >
        <span className="size-1.5 rounded-full bg-[#0BA5EC] cine-pulse" aria-hidden />
        Scenario live
      </button>
    );
  }
  if (status === "RESOLVED") {
    return (
      <button
        onClick={() => navigate("/incidents/INC-1042")}
        className="hidden h-8 items-center gap-2 rounded-md border border-[#ABEFC6] bg-[#ECFDF3] px-2.5 text-[12px] font-medium text-[#067647] transition-colors hover:border-[#75E0A7] md:inline-flex"
        aria-label="Demo scenario resolved — open incident INC-1042"
      >
        <CheckCircle2 className="size-3.5" aria-hidden />
        Resolved
      </button>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function SidebarNavItem({
  item, active, onClick, compact = false,
}: {
  item: { view: string; label: string; icon: typeof LayoutDashboard };
  active: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-3 text-[14px] font-medium transition-colors",
        compact ? "py-1.5" : "py-2",
        active
          ? "cine-nav-active text-white"
          : "text-[#98A2B3] hover:bg-white/5 hover:text-white",
      )}
      aria-current={active ? "page" : undefined}
    >
      <item.icon className={cn("size-4 shrink-0", active ? "text-white" : "text-[#667085]")} aria-hidden />
      <span className="flex-1 text-left">{item.label}</span>
      {active ? <span className="size-1.5 rounded-full bg-[#3D9BFF]" aria-hidden /> : null}
    </button>
  );
}

function SidebarNav({ route, onNavigate }: { route: Route; onNavigate?: () => void }) {
  const go = (view: string) => {
    navigate(`/${view}`);
    onNavigate?.();
  };
  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4 cine-scroll-dark" aria-label="Primary">
      <div>
        <p className="mb-1.5 px-3 font-mono text-[11px] font-medium tracking-[0.08em] text-[#475467] uppercase" aria-hidden>
          Operations
        </p>
        <div className="space-y-0.5">
          {NAV_MAIN.map((item) => (
            <SidebarNavItem key={item.view} item={item} active={isNavActive(item.view, route)} onClick={() => go(item.view)} />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 px-3 font-mono text-[11px] font-medium tracking-[0.08em] text-[#475467] uppercase" aria-hidden>
          Workspace
        </p>
        <div className="space-y-0.5">
          {NAV_BOTTOM.map((item) => (
            <SidebarNavItem key={item.view} item={item} active={isNavActive(item.view, route)} onClick={() => go(item.view)} />
          ))}
        </div>
      </div>
    </nav>
  );
}

function SidebarUser({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div className="border-t border-white/10 p-3">
      <button
        onClick={onOpenSettings}
        className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-white/5"
        aria-label="Open profile menu — Anurag Singh, Production Operations"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#2563EB] text-[12px] font-semibold text-white" aria-hidden>
          AS
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[13px] font-medium text-white">Anurag Singh</span>
          <span className="block truncate text-[11px] text-[#98A2B3]">Production Operations</span>
        </span>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top header actions
// ---------------------------------------------------------------------------

function HeaderActions({
  scenarioStatus, activeIncidents, recentIncidents, onOpenPalette, onOpenShortcuts, onRanDemo,
}: {
  scenarioStatus: string;
  activeIncidents: number;
  recentIncidents: { id: string; title: string; severity: string; status: string; detectedAt: string }[];
  onOpenPalette: () => void;
  onOpenShortcuts: () => void;
  onRanDemo: () => void;
}) {
  const iconBtn =
    "flex size-8 items-center justify-center rounded-md border border-[#E4E7EC] bg-white text-[#475467] transition-colors hover:border-[#98A2B3] hover:text-[#111827]";

  return (
    <div className="ml-auto flex items-center gap-2">
      <ScenarioStatusChip status={scenarioStatus} />

      <Badge
        variant="outline"
        className="hidden gap-1.5 border-[#FEDF89] bg-[#FFFAEB] px-2 py-0.5 text-[12px] font-medium text-[#B54708] xl:inline-flex"
      >
        <span className="size-1.5 rounded-full bg-[#F79009]" aria-hidden />
        Demo Environment
      </Badge>

      <RunDemoButton className="hidden sm:inline-flex" onRan={onRanDemo} />

      <button onClick={onOpenPalette} className={iconBtn} aria-label="Search (Ctrl K)" title="Search (⌘K)">
        <Search className="size-4" aria-hidden />
      </button>

      {/* Notifications — recent incidents, grouped by severity */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(iconBtn, "relative")}
            aria-label={`Notifications — ${activeIncidents} active incident${activeIncidents === 1 ? "" : "s"}`}
          >
            <Bell className="size-4" aria-hidden />
            {activeIncidents > 0 ? (
              <span
                className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#F04438] px-1 text-[10px] font-semibold text-white"
                aria-hidden
              >
                {activeIncidents}
              </span>
            ) : null}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80 p-0">
          <div className="flex items-center justify-between border-b border-[#E4E7EC] px-4 py-3">
            <p className="text-[14px] font-semibold text-[#111827]">Notifications</p>
            <span className="text-[12px] text-[#667085]">{activeIncidents} active</span>
          </div>
          <div className="max-h-80 overflow-y-auto cine-scroll">
            {recentIncidents.length === 0 ? (
              <p className="px-4 py-6 text-center text-[13px] text-[#667085]">No notifications.</p>
            ) : (
              recentIncidents.slice(0, 6).map((inc) => (
                <DropdownMenuItem
                  key={inc.id}
                  onClick={() => navigate(`/incidents/${inc.id}`)}
                  className="flex-col items-start gap-1.5 border-b border-[#F2F4F7] px-4 py-3 last:border-0"
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="font-mono text-[12px] font-medium text-[#175CD3]">{inc.id}</span>
                    <SeverityBadge severity={inc.severity} />
                  </div>
                  <p className="w-full truncate text-[13px] font-medium text-[#111827]">{inc.title}</p>
                  <p className="w-full text-[12px] text-[#667085]">
                    {inc.status === "RESOLVED" ? "Resolved" : "Open"} · detected {timeAgo(inc.detectedAt)}
                  </p>
                </DropdownMenuItem>
              ))
            )}
          </div>
          <button
            onClick={() => navigate("/incidents")}
            className="flex w-full items-center justify-between border-t border-[#E4E7EC] px-4 py-2.5 text-[13px] font-medium text-[#175CD3] transition-colors hover:bg-[#F9FAFB]"
          >
            View all incidents
            <ChevronRight className="size-3.5" aria-hidden />
          </button>
        </DropdownMenuContent>
      </DropdownMenu>

      <button onClick={onOpenShortcuts} className={cn(iconBtn, "hidden md:flex")} aria-label="Keyboard shortcuts (question mark)" aria-keyshortcuts="?" title="Keyboard shortcuts (?)">
        <Keyboard className="size-4" aria-hidden />
      </button>

      {/* User profile menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex size-8 items-center justify-center rounded-full bg-[#2563EB] text-[12px] font-semibold text-white transition-colors hover:bg-[#1D4ED8]"
            aria-label="Open user menu — Anurag Singh"
          >
            AS
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="flex items-center gap-3 py-2">
            <span className="flex size-9 items-center justify-center rounded-full bg-[#2563EB] text-[13px] font-semibold text-white" aria-hidden>AS</span>
            <span className="leading-tight">
              <span className="block text-[14px] font-semibold text-[#111827]">Anurag Singh</span>
              <span className="block text-[12px] text-[#667085]">anuragsingh@cineflow.ai</span>
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate("/settings")} className="gap-2.5 text-[14px]">
            <Settings className="size-4 text-[#667085]" aria-hidden />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate("/integrations")} className="gap-2.5 text-[14px]">
            <Plug className="size-4 text-[#667085]" aria-hidden />
            Integrations
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate("/demo")} className="gap-2.5 text-[14px]">
            <Activity className="size-4 text-[#667085]" aria-hidden />
            Demo scenario
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate("/audit")} className="gap-2.5 text-[14px]">
            <ScrollText className="size-4 text-[#667085]" aria-hidden />
            Audit log
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate("/architecture")} className="gap-2.5 text-[14px]">
            <Cpu className="size-4 text-[#667085]" aria-hidden />
            Architecture
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => toast.info("Demo environment — account switching is simulated")}
            className="gap-2.5 text-[14px]"
          >
            <LogOut className="size-4 text-[#667085]" aria-hidden />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scroll-to-top affordance
// ---------------------------------------------------------------------------

function ScrollToTop() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setVisible(window.scrollY > 600);
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!visible) return null;
  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="fixed bottom-16 left-4 z-30 flex size-9 items-center justify-center rounded-full border border-[#E4E7EC] bg-white text-[#475467] shadow-sm transition-colors hover:border-[#98A2B3] hover:text-[#111827] motion-reduce:hidden lg:left-[252px]"
      aria-label="Scroll back to top"
    >
      <ArrowUp className="size-4" aria-hidden />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export function AppShell() {
  const route = useRoute();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Light app-wide summary poll (10s) — powers the scenario chip + notifications.
  const { data: summary } = useApi(() => api.summary(), { intervalMs: 10000 });
  const scenarioStatus = summary?.scenario.status ?? "IDLE";
  const activeIncidents = summary?.activeIncidents ?? 0;
  const recentIncidents = summary?.recentIncidents ?? [];

  // Adopt the persisted chat transcript after mount (skipHydration pattern —
  // keeps SSR markup and the first client render identical).
  useEffect(() => {
    void useCineFlowStore.persist.rehydrate();
  }, []);

  // Alt+Backspace: browser-style "back" from an incident detail page to the
  // incidents list (surfaced in the shortcuts help panel).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.key !== "Backspace") return;
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (typing) return;
      const isDetail = route.view === "incident" || (route.view === "incidents" && route.id);
      if (isDetail) {
        e.preventDefault();
        navigate("/incidents");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [route.view, route.id]);

  // Ctrl/⌘+Shift+C: copy a share link for the active agent run (#/agent?run=…).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey || e.key.toLowerCase() !== "c") return;
      const { activeRunId } = useCineFlowStore.getState();
      if (!activeRunId) {
        toast.error("No active run to share yet", {
          description: "Run a query in the agent console first — then ⌘⇧C copies its link.",
        });
        return;
      }
      e.preventDefault();
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
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Landing renders standalone — minimal marketing surface, no app chrome.
  if (route.view === "landing") {
    return (
      <>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        <LandingView />
      </>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ShortcutsHelp open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      {/* Sidebar — fixed 240px dark rail */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-[#111827] lg:flex" aria-label="Application sidebar">
        <div className="flex h-16 shrink-0 items-center border-b border-white/10 px-5">
          <Logo />
        </div>
        <SidebarNav route={route} />
        <SidebarUser onOpenSettings={() => navigate("/settings")} />
      </aside>

      {/* Main column */}
      <div className="flex min-h-screen w-full flex-col lg:pl-60">
        {/* Top action bar */}
        <header className="sticky top-0 z-30 h-16 border-b border-[#E4E7EC] bg-white/95 backdrop-blur">
          <div className="mx-auto flex h-full max-w-[1500px] items-center gap-3 px-4 sm:px-6">
            {/* Mobile: menu + logo. Desktop: nothing (nav is in the sidebar). */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="size-8 shrink-0 lg:hidden" aria-label="Open navigation">
                  <Menu className="size-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 border-white/10 bg-[#111827] p-0" aria-label="Mobile navigation">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <div className="flex h-full flex-col">
                  <div className="flex h-16 items-center border-b border-white/10 px-5">
                    <Logo />
                  </div>
                  <SidebarNav route={route} onNavigate={() => setMobileOpen(false)} />
                  <div className="border-t border-white/10 p-3">
                    <RunDemoButton className="w-full" onRan={() => setMobileOpen(false)} />
                    <p className="mt-3 px-2 text-center text-[11px] leading-4 text-[#98A2B3]">
                      Simulated production data · no real infrastructure
                    </p>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
            <div className="lg:hidden">
              <Logo onDark={false} />
            </div>

            <HeaderActions
              scenarioStatus={scenarioStatus}
              activeIncidents={activeIncidents}
              recentIncidents={recentIncidents}
              onOpenPalette={() => setPaletteOpen(true)}
              onOpenShortcuts={() => setShortcutsOpen(true)}
              onRanDemo={() => setMobileOpen(false)}
            />
          </div>
        </header>

        {/* View container — keyed by route for a subtle enter transition. */}
        <main
          key={`${route.view}:${route.id ?? ""}:${route.id2 ?? ""}`}
          className="mx-auto w-full max-w-[1500px] flex-1 animate-in fade-in-0 slide-in-from-bottom-1 px-4 py-6 duration-300 sm:px-6 sm:py-8 motion-reduce:animate-none"
        >
          {renderView(route)}
        </main>

        <ScrollToTop />

        {/* Sticky footer */}
        <footer className="mt-auto border-t border-[#E4E7EC] bg-white">
          <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-2 px-4 py-4 text-[12px] text-[#667085] sm:px-6">
            <span className="flex items-center gap-1.5">
              <svg viewBox="0 0 24 24" className="size-3" fill="none" aria-hidden>
                <path d="M6 5v14M18 5v14M6 12h12M9 5l3 7-3 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              CineFlow AI — Agentic Production Operations Assistant
            </span>
            <span className="flex items-center gap-3">
              <button
                onClick={() => setShortcutsOpen(true)}
                className="rounded px-1 font-mono transition-colors hover:text-[#111827]"
                aria-label="Keyboard shortcuts (question mark)"
              >
                press ? for shortcuts
              </button>
              <span className="font-medium text-[#B54708]">Demo environment · simulated data</span>
              <span className="hidden sm:inline">Agentic Cinema: The Blockbuster Hackathon</span>
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}

function renderView(route: Route) {
  switch (route.view) {
    case "landing":
      return <LandingView />;
    case "dashboard":
      return <DashboardView />;
    case "agent":
      // #/agent?run={id} deep-links the conversation to a specific run
      return <AgentView focusRunId={route.query?.run} />;
    case "incidents":
      // #/incidents/{id} routes straight to the detail view
      return route.id ? <IncidentDetailView incidentId={route.id} /> : <IncidentsView />;
    case "incident":
      return <IncidentDetailView incidentId={route.id ?? ""} />;
    case "compare":
      // #/compare/{idA}/{idB} — side-by-side incident comparison
      return <CompareView idA={route.id ?? ""} idB={route.id2 ?? ""} />;
    case "workflows":
      // #/workflows?wf={key} opens that workflow's drill-down dialog
      return <WorkflowsView focusKey={route.query?.wf} />;
    case "infra":
      // #/infra?metric={key} opens that metric's drill-down dialog
      return <SystemHealthView focusKey={route.query?.metric} />;
    case "recommendations":
      return <RecommendationsView />;
    case "analytics":
      return <AnalyticsView />;
    case "reports":
      return <ReportsView />;
    case "integrations":
      return <IntegrationsView />;
    case "audit":
      return <AuditView />;
    case "settings":
      return <SettingsView />;
    case "architecture":
      return <ArchitectureView />;
    case "demo":
      return <DemoView />;
    default:
      return <LandingView />;
  }
}
