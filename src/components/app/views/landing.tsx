"use client";

// CineFlow AI — landing page. Minimal, product-first marketing surface:
// headline, subheadline, CTAs, the agentic loop, and a real product
// screenshot. No futuristic illustration, no decorative gradients.

import { ArrowRight, CheckCircle2, Eye, Search, ShieldCheck, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { navigate } from "@/components/app/router";
import { useCineFlowStore } from "@/lib/client/store";

const LOOP_STEPS = [
  "Observe", "Detect", "Diagnose", "Recommend", "Approve", "Remediate", "Verify",
] as const;

const CAPABILITIES = [
  {
    icon: Eye,
    title: "Observes production",
    body: "Continuously monitors render queues, pipelines, and infrastructure across the studio.",
  },
  {
    icon: Search,
    title: "Investigates with evidence",
    body: "Collects metrics, deployment history, and logs — then explains the root cause, not just the symptom.",
  },
  {
    icon: ShieldCheck,
    title: "Acts safely",
    body: "Every recommendation passes confidence, risk, and policy checks — humans approve before anything changes.",
  },
] as const;

export function LandingView() {
  const { queueAutoQuery } = useCineFlowStore();

  const launchDemo = () => {
    queueAutoQuery("Why is the post-production render pipeline delayed?");
    navigate("/agent");
  };

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Minimal top bar */}
      <header className="sticky top-0 z-30 border-b border-[#E4E7EC] bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#D0D5DD] bg-[#0B0F19] shadow-xs">
              <svg viewBox="0 0 32 32" className="size-5" fill="none" aria-hidden>
                <circle cx="16" cy="16" r="10" stroke="url(#land-cf-grad)" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="3.5 1.5" />
                <path d="M12 11L22 16L12 21V11Z" fill="url(#land-cf-grad)" />
                <circle cx="22" cy="16" r="1.8" fill="#38BDF8" />
                <defs>
                  <linearGradient id="land-cf-grad" x1="6" y1="6" x2="26" y2="26" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#38BDF8" />
                    <stop offset="50%" stopColor="#3B82F6" />
                    <stop offset="100%" stopColor="#818CF8" />
                  </linearGradient>
                </defs>
              </svg>
            </span>
            <span className="leading-tight">
              <span className="block text-[15px] font-semibold tracking-tight text-[#111827]">
                CineFlow <span className="bg-gradient-to-r from-[#2563EB] to-[#7C3AED] bg-clip-text text-transparent">AI</span>
              </span>
              <span className="block text-[11px] text-[#667085]">Production Operations</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-md border border-[#FEDF89] bg-[#FFFAEB] px-2 py-1 text-[12px] font-medium text-[#B54708] sm:inline-flex">
              <span className="size-1.5 rounded-full bg-[#F79009]" aria-hidden />
              Demo Environment
            </span>
            <Button
              onClick={launchDemo}
              className="h-9 gap-1.5 bg-[#2563EB] px-4 text-[14px] font-semibold text-white hover:bg-[#1D4ED8]"
            >
              Launch Demo
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="border-b border-[#E4E7EC]">
          <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 md:py-24">
            <p className="font-mono text-[12px] font-medium tracking-[0.08em] text-[#667085] uppercase">
              Agentic Production Operations Assistant
            </p>
            <h1 className="mt-4 max-w-3xl text-[36px] leading-[1.15] font-bold tracking-tight text-[#111827] sm:text-[44px] md:text-[52px]">
              Reliable Production Operations,{" "}
              <span className="text-[#2563EB]">Powered by Agents.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-[16px] leading-7 text-[#667085] sm:text-[18px] sm:leading-8">
              CineFlow AI investigates production incidents, explains what happened,
              recommends safe actions, and verifies recovery.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                onClick={launchDemo}
                size="lg"
                className="h-11 gap-2 bg-[#2563EB] px-6 text-[15px] font-semibold text-white hover:bg-[#1D4ED8]"
              >
                Launch Demo
                <ArrowRight className="size-4" aria-hidden />
              </Button>
              <Button
                onClick={() => navigate("/architecture")}
                size="lg"
                variant="outline"
                className="h-11 border-[#D0D5DD] bg-white px-6 text-[15px] font-semibold text-[#344054] hover:border-[#98A2B3] hover:bg-[#F9FAFB] hover:text-[#111827]"
              >
                View Architecture
              </Button>
            </div>

            {/* Agentic loop */}
            <div className="mt-12">
              <p className="mb-3 text-[13px] font-medium text-[#667085]">The agentic loop</p>
              <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2" aria-label="Agentic workflow steps">
                {LOOP_STEPS.map((step, i) => (
                  <li key={step} className="flex items-center gap-1.5">
                    <span className="flex items-center gap-2 rounded-md border border-[#E4E7EC] bg-[#F9FAFB] px-2.5 py-1.5 text-[13px] font-medium text-[#344054]">
                      {i === 4 ? <ShieldCheck className="size-3.5 text-[#2563EB]" aria-hidden /> : null}
                      {step}
                    </span>
                    {i < LOOP_STEPS.length - 1 ? (
                      <span className="text-[#98A2B3]" aria-hidden>→</span>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* Product screenshot in a browser frame */}
        <section className="border-b border-[#E4E7EC] bg-[#F7F8FA]">
          <div className="mx-auto max-w-[1200px] px-4 py-14 sm:px-6">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-[20px] font-semibold tracking-tight text-[#111827]">
                  The operations workspace
                </h2>
                <p className="mt-1 text-[14px] text-[#667085]">
                  Production health, live incidents, and agent activity — one mission-control surface.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => navigate("/dashboard")}
                className="h-9 border-[#D0D5DD] bg-white text-[14px] font-medium text-[#344054] hover:border-[#98A2B3] hover:bg-[#F9FAFB] hover:text-[#111827]"
              >
                Open the dashboard
                <ArrowRight className="size-4" aria-hidden />
              </Button>
            </div>
            {/* Browser frame */}
            <figure className="overflow-hidden rounded-lg border border-[#E4E7EC] bg-white shadow-[0_4px_24px_-8px_rgba(16,24,40,0.12)]">
              <div className="flex items-center gap-2 border-b border-[#E4E7EC] bg-[#F9FAFB] px-4 py-2.5" aria-hidden>
                <span className="flex gap-1.5">
                  <span className="size-2.5 rounded-full bg-[#F04438]" />
                  <span className="size-2.5 rounded-full bg-[#F79009]" />
                  <span className="size-2.5 rounded-full bg-[#12B76A]" />
                </span>
                <span className="mx-auto flex h-6 w-64 max-w-full items-center justify-center rounded-md border border-[#E4E7EC] bg-white font-mono text-[11px] text-[#667085]">
                  cineflow.ai/dashboard
                </span>
              </div>
              <div className="bg-[#F8F9FA] p-4 sm:p-6 text-left">
                {/* Mockup subheader */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4E7EC] pb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-7 items-center justify-center rounded-md bg-[#1D2939] text-white text-xs font-semibold">
                      CF
                    </div>
                    <div>
                      <div className="text-[13px] font-semibold text-[#101828]">Production Operations Center</div>
                      <div className="text-[11px] text-[#667085]">Active Project: Feature Film &quot;Aurora&quot; · Stage 4</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ECFDF3] px-2.5 py-0.5 text-[11px] font-medium text-[#027A48]">
                      <span className="size-1.5 rounded-full bg-[#12B76A]" />
                      23 / 24 Pipelines Nominal
                    </span>
                    <span className="rounded-md border border-[#D0D5DD] bg-white px-2 py-0.5 text-[11px] text-[#344054]">
                      Autonomous Agent Active
                    </span>
                  </div>
                </div>

                {/* Mockup metrics */}
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-[#EAECF0] bg-white p-3 shadow-xs">
                    <div className="text-[11px] text-[#667085]">Pipeline Availability</div>
                    <div className="mt-1 text-lg font-bold text-[#101828]">99.8%</div>
                    <div className="mt-0.5 text-[10px] text-[#027A48]">↑ 0.2% vs target</div>
                  </div>
                  <div className="rounded-lg border border-[#EAECF0] bg-white p-3 shadow-xs">
                    <div className="text-[11px] text-[#667085]">Active Render Queue</div>
                    <div className="mt-1 text-lg font-bold text-[#B42318]">187 items</div>
                    <div className="mt-0.5 text-[10px] text-[#B42318]">High saturation</div>
                  </div>
                  <div className="rounded-lg border border-[#EAECF0] bg-white p-3 shadow-xs">
                    <div className="text-[11px] text-[#667085]">P95 Render Latency</div>
                    <div className="mt-1 text-lg font-bold text-[#B42318]">4,200 ms</div>
                    <div className="mt-0.5 text-[10px] text-[#667085]">Target: 1,500 ms</div>
                  </div>
                  <div className="rounded-lg border border-[#EAECF0] bg-white p-3 shadow-xs">
                    <div className="text-[11px] text-[#667085]">Mean Time To Resolve</div>
                    <div className="mt-1 text-lg font-bold text-[#101828]">4.2 min</div>
                    <div className="mt-0.5 text-[10px] text-[#027A48]">Autonomous triage</div>
                  </div>
                </div>

                {/* Mockup split view */}
                <div className="mt-4 grid gap-4 lg:grid-cols-12">
                  {/* Active Incident */}
                  <div className="rounded-lg border border-[#FECDCA] bg-[#FFFBFA] p-4 lg:col-span-7">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-[#FEE4E2] px-2 py-0.5 text-[11px] font-semibold text-[#B42318]">
                          INC-1042
                        </span>
                        <span className="text-[11px] font-medium text-[#475467]">POST_PRODUCTION</span>
                      </div>
                      <span className="text-[10px] font-medium text-[#B42318]">CRITICAL</span>
                    </div>
                    <div className="mt-2 text-[13px] font-semibold text-[#101828]">
                      4K VFX Render Farm Queue Congestion
                    </div>
                    <p className="mt-1 text-[11px] text-[#475467]">
                      Queue backed up past 180 frames. Latency exceeded SLA threshold (4.2s vs 1.5s).
                    </p>
                    <div className="mt-3 rounded border border-[#EAECF0] bg-white p-2.5 text-[11px]">
                      <span className="font-medium text-[#101828]">Root Cause: </span>
                      <span className="text-[#475467]">
                        Worker pool constrained at 4 nodes. Insufficient concurrency for 4K EXR passes.
                      </span>
                    </div>
                  </div>

                  {/* Agent reasoning panel */}
                  <div className="rounded-lg border border-[#EAECF0] bg-white p-4 lg:col-span-5">
                    <div className="flex items-center justify-between border-b border-[#EAECF0] pb-2">
                      <span className="text-[12px] font-semibold text-[#101828]">Agentic Reasoning</span>
                      <span className="inline-flex items-center gap-1 rounded bg-[#EFF8FF] px-2 py-0.5 text-[10px] font-medium text-[#175CD3]">
                        Live Loop
                      </span>
                    </div>
                    <div className="mt-2.5 space-y-2 text-[11px]">
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 flex size-3.5 items-center justify-center rounded-full bg-[#ECFDF3] text-[9px] text-[#027A48]">✓</span>
                        <span className="text-[#344054]">Diagnosed bottleneck via metrics &amp; worker logs</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 flex size-3.5 items-center justify-center rounded-full bg-[#ECFDF3] text-[9px] text-[#027A48]">✓</span>
                        <span className="text-[#344054]">Generated remediation: Scale render pool to 6 nodes</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 flex size-3.5 items-center justify-center rounded-full bg-[#EFF8FF] text-[9px] text-[#175CD3]">●</span>
                        <span className="font-medium text-[#175CD3]">Guardrails check passed · Human approval gate</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </figure>
            <p className="mt-3 text-center text-[12px] text-[#667085]">
              Real-time operations interface with autonomous incident detection, root-cause analysis, and guardrailed remediation.
            </p>
          </div>
        </section>

        {/* Capabilities */}
        <section className="border-b border-[#E4E7EC]">
          <div className="mx-auto max-w-[1200px] px-4 py-14 sm:px-6">
            <div className="grid gap-6 md:grid-cols-3">
              {CAPABILITIES.map((cap) => (
                <div key={cap.title} className="rounded-lg border border-[#E4E7EC] bg-white p-5">
                  <div className="flex size-9 items-center justify-center rounded-md border border-[#B2DDFF] bg-[#EFF8FF] text-[#175CD3]">
                    <cap.icon className="size-4" aria-hidden />
                  </div>
                  <h3 className="mt-3.5 text-[16px] font-semibold text-[#111827]">{cap.title}</h3>
                  <p className="mt-1.5 text-[14px] leading-6 text-[#667085]">{cap.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="bg-[#111827]">
          <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-4 px-4 py-14 text-center sm:px-6">
            <h2 className="max-w-xl text-[24px] font-bold tracking-tight text-white sm:text-[28px]">
              See the agent resolve a real production incident
            </h2>
            <p className="max-w-lg text-[14px] leading-6 text-[#98A2B3]">
              The demo scenario walks through detection, evidence collection, root-cause analysis,
              approval-gated remediation, and verified recovery — end to end.
            </p>
            <Button
              onClick={launchDemo}
              size="lg"
              className="h-11 gap-2 bg-[#2563EB] px-6 text-[15px] font-semibold text-white hover:bg-[#1D4ED8]"
            >
              Run the demo scenario
              <ArrowRight className="size-4" aria-hidden />
            </Button>
            <p className="flex items-center gap-1.5 text-[12px] text-[#667085]">
              <CheckCircle2 className="size-3.5 text-[#12B76A]" aria-hidden />
              Runs in your browser · no account required · demo data
            </p>
          </div>
        </section>
      </main>

      {/* Minimal footer */}
      <footer className="mt-auto border-t border-[#E4E7EC] bg-white">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-2 px-4 py-4 text-[12px] text-[#667085] sm:px-6">
          <span className="flex items-center gap-1.5">
            <Workflow className="size-3.5" aria-hidden />
            CineFlow AI — Agentic Production Operations Assistant
          </span>
          <span>Demo environment · Agentic Cinema: The Blockbuster Hackathon</span>
        </div>
      </footer>
    </div>
  );
}
