"use client";

// CineFlow AI — architecture view. Shows the production architecture (as
// deployed for the hackathon: Next.js API routes stand in for the FastAPI
// service) and clearly marks the Google Cloud / Gemini partner integration.
//
// The request flow renders as a clean, technical vertical diagram: white
// boxes with #E4E7EC borders, 11px mono uppercase group labels (Client /
// API / Agent / Model / Data / Safety / Execution) and thin gray arrows.
// No 3D, no glows, no decoration.

import {
  ArrowDown, Boxes, Brain, CheckCircle2, Cloud, Database, FileSearch,
  Gauge, LineChart, Lock, MonitorPlay, Server, ShieldCheck, User2, Wrench,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader, SectionHeader } from "@/components/app/shared/ui";
import { DemoTag } from "@/components/app/shared/badges";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Flow diagram primitives
// ---------------------------------------------------------------------------

type FlowTone = "default" | "partner" | "gate" | "verify";

interface FlowItem {
  icon: LucideIcon;
  label: string;
}

interface FlowNodeSpec {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  tone?: FlowTone;
  /** Small mono tag rendered next to the title (e.g. GATE, PARTNER). */
  tag?: string;
  items?: FlowItem[];
}

interface FlowGroupSpec {
  /** 11px mono uppercase group label. */
  label: string;
  nodes: FlowNodeSpec[];
  /** Arrow label between the previous group and this one. */
  arrowLabel?: string;
}

const SWATCH_CLS: Record<FlowTone, string> = {
  default: "border-[#E4E7EC] bg-[#F9FAFB] text-[#475467]",
  partner: "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]",
  gate: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]",
  verify: "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]",
};

const TAG_CLS: Record<FlowTone, string> = {
  default: "border-[#E4E7EC] bg-[#F9FAFB] text-[#667085]",
  partner: "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]",
  gate: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]",
  verify: "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]",
};

function FlowBox({ icon: Icon, title, subtitle, tone = "default", tag, items }: FlowNodeSpec) {
  return (
    <div className="w-full max-w-md rounded-lg border border-[#E4E7EC] bg-white px-4 py-3.5">
      <div className="flex items-start gap-3">
        <span
          className={cn("flex size-8 shrink-0 items-center justify-center rounded-md border", SWATCH_CLS[tone])}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm font-semibold tracking-tight text-[#111827]">{title}</p>
            {tag ? (
              <span
                className={cn(
                  "rounded border px-1.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wide",
                  TAG_CLS[tone]
                )}
              >
                {tag}
              </span>
            ) : null}
          </div>
          {subtitle ? <p className="mt-0.5 text-[13px] leading-snug text-[#667085]">{subtitle}</p> : null}
        </div>
      </div>
      {items ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {items.map((it) => (
            <div
              key={it.label}
              className="flex items-center gap-2 rounded-md border border-[#E4E7EC] bg-[#F9FAFB] px-2.5 py-1.5"
            >
              <it.icon className="size-3.5 shrink-0 text-[#667085]" aria-hidden />
              <span className="truncate text-[13px] text-[#475467]">{it.label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FlowArrow({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 py-0.5">
      <ArrowDown className="size-3.5 text-[#98A2B3]" aria-hidden />
      {label ? <span className="cine-label">{label}</span> : null}
    </div>
  );
}

function GroupLabel({ label }: { label: string }) {
  return (
    <div className="flex w-full max-w-md items-center gap-3" aria-hidden>
      <span className="cine-label shrink-0">{label}</span>
      <span className="h-px flex-1 bg-[#E4E7EC]" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The request flow: User → Next.js → (FastAPI) API → Google Cloud Agent →
// Gemini → Agent Tools / Production Data → Reasoning → Guardrails → Human
// Approval → Action → Verification, grouped into labeled layers.
// ---------------------------------------------------------------------------

const FLOW: FlowGroupSpec[] = [
  {
    label: "Client",
    nodes: [
      {
        icon: User2,
        title: "User",
        subtitle: "Production manager asks: “Why is our render pipeline delayed?”",
      },
      {
        icon: MonitorPlay,
        title: "Next.js UI",
        subtitle: "Single-page console — conversation, activity, evidence, tools",
        tag: "SPA",
      },
    ],
    arrowLabel: "HTTPS",
  },
  {
    label: "API",
    nodes: [
      {
        icon: Server,
        title: "Agent API",
        subtitle: "Typed endpoints — /agent/query, /recommendations/{id}/approve, /actions/execute · FastAPI on Google Cloud Run in production",
      },
    ],
    arrowLabel: "REST / JSON",
  },
  {
    label: "Agent",
    nodes: [
      {
        icon: Brain,
        title: "Agent Orchestrator",
        subtitle: "Google Cloud Agent Builder contract — plans the pipeline: understand → collect → analyze → … → verify",
      },
    ],
    arrowLabel: "reasoning",
  },
  {
    label: "Model",
    nodes: [
      {
        icon: Brain,
        title: "Gemini (Google Cloud)",
        subtitle: "LLM reasoning via provider adapter — demo script when unconfigured",
        tone: "partner",
        tag: "Partner",
      },
    ],
    arrowLabel: "tool calls",
  },
  {
    label: "Data",
    nodes: [
      {
        icon: Wrench,
        title: "Agent Tools",
        subtitle: "Real queries against production data — the agent never invents evidence",
        items: [
          { icon: Boxes, label: "Production data" },
          { icon: Gauge, label: "System health" },
          { icon: FileSearch, label: "Incident history" },
          { icon: Database, label: "Logs" },
          { icon: LineChart, label: "Metrics" },
        ],
      },
    ],
    arrowLabel: "evidence",
  },
  {
    label: "Agent · reasoning",
    nodes: [
      {
        icon: Brain,
        title: "Reasoning",
        subtitle: "Root cause + confidence computed from gathered evidence",
      },
    ],
  },
  {
    label: "Safety",
    nodes: [
      {
        icon: ShieldCheck,
        title: "Guardrails",
        subtitle: "Risk classification: LOW auto-exec · MEDIUM approval · HIGH never auto",
        tone: "gate",
        tag: "Policy",
      },
      {
        icon: User2,
        title: "Human approval",
        subtitle: "The run pauses. Nothing executes without an explicit Approve.",
        tone: "gate",
        tag: "Gate",
      },
    ],
    arrowLabel: "approved",
  },
  {
    label: "Execution",
    nodes: [
      {
        icon: Wrench,
        title: "Action",
        subtitle: "Demo adapters mutate demo state; production maps to Cloud operations",
      },
      {
        icon: CheckCircle2,
        title: "Verification",
        subtitle: "Metrics re-checked against thresholds before resolving",
        tone: "verify",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Layer table (demo deployment vs production mapping)
// ---------------------------------------------------------------------------

const LAYERS = [
  {
    layer: "Client",
    demo: "Next.js 16 App Router SPA (this app) — hash-routed views, TanStack-style polling hooks",
    production: "Next.js on Vercel or Google Cloud — identical code",
    demoNow: true,
  },
  {
    layer: "Agent API",
    demo: "Next.js route handlers under /api/* — typed request/response models, guardrail enforcement, approval endpoints",
    production: "FastAPI service on Google Cloud Run — same contract (see README)",
    demoNow: true,
  },
  {
    layer: "Agent Orchestrator",
    demo: "Poll-advancing state machine in src/lib/agent/engine.ts — plans steps, executes tools, pauses at approval gates",
    production: "Google Cloud Agent Builder agent / Vertex AI agent runtime",
    demoNow: true,
  },
  {
    layer: "Reasoning (Gemini)",
    demo: "DEMO mode: deterministic, evidence-grounded scripted reasoning (default). Gemini REST adapter activates automatically when GEMINI_API_KEY is set",
    production: "Gemini via generativelanguage.googleapis.com / Vertex AI",
    demoNow: false,
  },
  {
    layer: "Tools",
    demo: "9 DB-backed tools (get_workflow_status, get_system_health, analyze_logs, …) — real queries, real evidence",
    production: "Same tool contract bound to production systems",
    demoNow: true,
  },
  {
    layer: "Guardrails",
    demo: "Risk classification + approval gates in src/lib/agent/guardrails.ts — low/medium/high policy",
    production: "Same policy layer in the FastAPI service",
    demoNow: true,
  },
  {
    layer: "Actions",
    demo: "Demo adapters mutate local demo state only, clearly labeled",
    production: "GKE node pool / Cloud Run operations through the guarded tool interface",
    demoNow: false,
  },
  {
    layer: "Data",
    demo: "SQLite via Prisma with deterministic seed (incidents, workflows, metrics, logs, deployments)",
    production: "PostgreSQL on Cloud SQL",
    demoNow: false,
  },
];

function LayerTag({ demoNow }: { demoNow: boolean }) {
  return (
    <span
      className={cn(
        "mb-1.5 inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-medium",
        demoNow
          ? "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]"
          : "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]"
      )}
    >
      {demoNow ? "Real in demo" : "Demo adapter"}
    </span>
  );
}

function EnvCode({ name }: { name: string }) {
  return (
    <code className="rounded border border-[#E4E7EC] bg-[#F9FAFB] px-1 py-0.5 font-mono text-[11px] text-[#475467]">
      {name}
    </code>
  );
}

export function ArchitectureView() {
  return (
    <div className="space-y-8 pb-8">
      <PageHeader
        title="Architecture"
        description="How a user request becomes an evidence-backed, approval-gated, verified remediation."
        badge={<DemoTag label="Demo deployment topology" />}
      />

      {/* Partner callout — Google Cloud + Gemini */}
      <Card className="rounded-lg border-[#ABEFC6] bg-card shadow-none">
        <CardContent className="flex flex-wrap items-center gap-4 p-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[#ABEFC6] bg-[#ECFDF3]">
            <Cloud className="size-5 text-[#067647]" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[#067647]">Hackathon partner integration — Google Cloud + Gemini</p>
            <p className="mt-1 text-[13px] leading-relaxed text-[#667085]">
              The reasoning layer is wired through a Gemini REST adapter (active when <EnvCode name="GEMINI_API_KEY" /> is
              set), and the orchestrator mirrors the Agent Builder tool-calling contract for a drop-in Google Cloud agent
              runtime. Configure via <EnvCode name="GEMINI_API_KEY" />, <EnvCode name="GOOGLE_CLOUD_PROJECT" />,{" "}
              <EnvCode name="GOOGLE_CLOUD_LOCATION" />.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Request flow diagram — grouped, technical, flat */}
      <Card className="rounded-lg border-[#E4E7EC] bg-card shadow-none">
        <CardContent className="p-5">
          <SectionHeader
            title="Request flow"
            subtitle="One request, end to end — grouped by layer. Demo adapters are labeled."
          />
          <div className="mt-6 flex flex-col items-center">
            {FLOW.map((group, gi) => (
              <div key={group.label} className="flex w-full flex-col items-center">
                {gi > 0 ? <FlowArrow label={group.arrowLabel} /> : null}
                <GroupLabel label={group.label} />
                <div className="mt-2 flex w-full flex-col items-center gap-1">
                  {group.nodes.map((node, ni) => (
                    <div key={node.title} className="flex w-full flex-col items-center">
                      {ni > 0 ? <FlowArrow /> : null}
                      <FlowBox {...node} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Demo vs production layer table */}
      <section>
        <SectionHeader
          title="Layer-by-layer: demo vs production"
          subtitle="Every layer in this deployment and where it lands in the production topology."
          className="mb-4"
        />
        <div className="overflow-hidden rounded-lg border border-[#E4E7EC] bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#F9FAFB]">
              <tr className="border-b border-[#E4E7EC]">
                <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-[#667085]">Layer</th>
                <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-[#667085]">This demo deployment</th>
                <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-[#667085]">Production mapping</th>
              </tr>
            </thead>
            <tbody>
              {LAYERS.map((l) => (
                <tr key={l.layer} className="border-b border-[#E4E7EC] last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 align-top font-medium text-[#111827]">{l.layer}</td>
                  <td className="px-4 py-3 align-top">
                    <LayerTag demoNow={l.demoNow} />
                    <p className="text-[13px] leading-relaxed text-[#667085]">{l.demo}</p>
                  </td>
                  <td className="px-4 py-3 align-top text-[13px] leading-relaxed text-[#667085]">{l.production}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Security note */}
      <Card className="rounded-lg border-[#E4E7EC] bg-card shadow-none">
        <CardContent className="flex items-start gap-3 p-5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-[#E4E7EC] bg-[#F9FAFB] text-[#475467]">
            <Lock className="size-4" aria-hidden />
          </span>
          <p className="text-[13px] leading-relaxed text-[#667085]">
            API keys never touch the frontend. The Gemini adapter, Google Cloud project and location are
            read from server-side environment variables only (see <code className="font-mono">.env.example</code>).
            Authentication is an architectural placeholder (NextAuth gate on approval endpoints) — documented in Settings.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
