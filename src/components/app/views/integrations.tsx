"use client";

// CineFlow AI — Integrations view. Connection status for the production stack:
// AI providers, Google Cloud agent infrastructure, and studio data sources.
// Status is read live from /api/settings — demo integrations are labeled.

import {
  Cable, CheckCircle2, Cloud, Database, Film, Plug, Sparkles, Video,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { navigate } from "@/components/app/router";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/client/api";
import { EmptyState, ErrorState, LoadingCards, PageHeader } from "@/components/app/shared/ui";
import { cn } from "@/lib/utils";

function IntegrationStatusBadge({ status }: { status: "CONFIGURED" | "DEMO_MODE" | "READY" }) {
  if (status === "CONFIGURED") {
    return <Badge variant="outline" className="border-[#ABEFC6] bg-[#ECFDF3] gap-1.5 font-medium text-[#067647]">
      <span className="size-1.5 rounded-full bg-[#12B76A]" aria-hidden />
      Connected
    </Badge>;
  }
  if (status === "DEMO_MODE") {
    return <Badge variant="outline" className="border-[#FEDF89] bg-[#FFFAEB] gap-1.5 font-medium text-[#B54708]">
      <span className="size-1.5 rounded-full bg-[#F79009]" aria-hidden />
      Demo mode
    </Badge>;
  }
  return <Badge variant="outline" className="border-[#B2DDFF] bg-[#EFF8FF] gap-1.5 font-medium text-[#175CD3]">
    <span className="size-1.5 rounded-full bg-[#0BA5EC]" aria-hidden />
    Ready
  </Badge>;
}

const INTEGRATION_ICONS: Record<string, typeof Film> = {
  render: Video,
  asset: Database,
  schedule: Film,
  delivery: Plug,
};

function integrationIcon(id: string) {
  return INTEGRATION_ICONS[id.split("-")[0]] ?? Cable;
}

function IntegrationsViewContent() {
  const { data, loading, error } = useApi(() => api.settings());

  if (error) return <ErrorState message={error} />;

  const activeProvider = data?.providers.find((p) => p.id === data?.activeProvider);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrations"
        description="Connections between CineFlow AI and the production stack — providers, cloud infrastructure, and studio data sources."
        badge={data ? <Badge variant="outline" className="border-[#FEDF89] bg-[#FFFAEB] font-medium text-[#B54708]">Demo environment</Badge> : undefined}
      />

      {loading && !data ? (
        <LoadingCards cards={3} />
      ) : !data ? (
        <EmptyState title="Integration status unavailable" description="Settings could not be loaded." icon={Cable} />
      ) : (
        <>
          {/* AI provider adapters */}
          <Card className="border-[#E4E7EC] shadow-none">
            <CardHeader className="flex flex-row items-center justify-between border-b border-[#E4E7EC] py-4">
              <div>
                <CardTitle className="text-base font-semibold">AI provider adapters</CardTitle>
                <p className="text-[13px] text-[#667085]">Reasoning backend selection — falls back deterministically so the pipeline never blocks.</p>
              </div>
              <Sparkles className="size-5 text-[#98A2B3]" aria-hidden />
            </CardHeader>
            <CardContent className="grid gap-4 pt-4 md:grid-cols-3">
              {data.providers.map((p) => {
                const active = p.id === data.activeProvider;
                return (
                  <div
                    key={p.id}
                    className={cn(
                      "rounded-lg border p-4",
                      active ? "border-[#B2DDFF] bg-[#EFF8FF]" : "border-[#E4E7EC] bg-white",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[14px] font-semibold text-[#111827]">{p.name}</p>
                      {active ? (
                        <Badge className="gap-1 border-[#B2DDFF] bg-[#EFF8FF] font-medium text-[#175CD3]" variant="outline">
                          <CheckCircle2 className="size-3" aria-hidden />
                          Active
                        </Badge>
                      ) : p.configured ? (
                        <Badge variant="outline" className="border-[#ABEFC6] bg-[#ECFDF3] font-medium text-[#067647]">Configured</Badge>
                      ) : (
                        <Badge variant="outline" className="border-[#E4E7EC] bg-[#F2F4F7] font-medium text-[#475467]">Not configured</Badge>
                      )}
                    </div>
                    <p className="mt-2 text-[13px] leading-5 text-[#667085]">{p.note}</p>
                    <p className="mt-3 font-mono text-[12px] text-[#667085]">{p.envVar}</p>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Google Cloud agent infrastructure */}
          <Card className="border-[#E4E7EC] shadow-none">
            <CardHeader className="flex flex-row items-center justify-between border-b border-[#E4E7EC] py-4">
              <div>
                <CardTitle className="text-base font-semibold">Google Cloud agent infrastructure</CardTitle>
                <p className="text-[13px] text-[#667085]">Cloud Run deployment configuration for the agent service and Gemini endpoint.</p>
              </div>
              <Cloud className="size-5 text-[#98A2B3]" aria-hidden />
            </CardHeader>
            <CardContent className="grid gap-4 pt-4 sm:grid-cols-2">
              <div className="rounded-lg border border-[#E4E7EC] bg-white p-4">
                <p className="text-[13px] font-medium text-[#344054]">Project</p>
                <p className="mt-1 text-[14px] font-semibold text-[#111827]">
                  {data.googleCloud.projectConfigured ? "Configured" : "Demo project"}
                </p>
                <p className="mt-1 text-[13px] text-[#667085]">Google Cloud project hosting the agent runtime.</p>
              </div>
              <div className="rounded-lg border border-[#E4E7EC] bg-white p-4">
                <p className="text-[13px] font-medium text-[#344054]">Location</p>
                <p className="mt-1 text-[14px] font-semibold text-[#111827]">
                  {data.googleCloud.locationConfigured ? "Configured" : "Demo region"}
                </p>
                <p className="mt-1 text-[13px] text-[#667085]">Cloud Run service region for low-latency inference.</p>
              </div>
            </CardContent>
            <CardContent className="pt-2">
              <p className="text-[13px] text-[#667085]">{data.googleCloud.note}</p>
            </CardContent>
          </Card>

          {/* Studio data sources */}
          <Card className="border-[#E4E7EC] shadow-none">
            <CardHeader className="flex flex-row items-center justify-between border-b border-[#E4E7EC] py-4">
              <div>
                <CardTitle className="text-base font-semibold">Studio data sources</CardTitle>
                <p className="text-[13px] text-[#667085]">Production systems the agent observes and acts on.</p>
              </div>
              <Cable className="size-5 text-[#98A2B3]" aria-hidden />
            </CardHeader>
            <CardContent className="grid gap-4 pt-4 md:grid-cols-2 xl:grid-cols-3">
              {data.integrations.map((integration) => {
                const Icon = integrationIcon(integration.id);
                return (
                  <div key={integration.id} className="rounded-lg border border-[#E4E7EC] bg-white p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex size-9 items-center justify-center rounded-md border border-[#E4E7EC] bg-[#F9FAFB] text-[#344054]">
                        <Icon className="size-4" aria-hidden />
                      </div>
                      <IntegrationStatusBadge status={integration.status} />
                    </div>
                    <p className="mt-3 text-[14px] font-semibold text-[#111827]">{integration.name}</p>
                    <p className="mt-1 text-[13px] leading-5 text-[#667085]">{integration.note}</p>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <p className="text-[13px] text-[#667085]">
            Current reasoning provider: {activeProvider?.name ?? data.activeProvider}. Provider and guardrail
            details are managed in{" "}
            <button className="font-medium text-[#175CD3] hover:underline" onClick={() => navigate("/settings")}>
              Settings
            </button>
            .
          </p>
        </>
      )}
    </div>
  );
}

export function IntegrationsView() {
  return <IntegrationsViewContent />;
}
