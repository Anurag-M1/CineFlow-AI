"use client";

// CineFlow AI — settings / integrations view: provider status, guardrail
// policies and demo controls. Keys live in server-side env vars only.

import { useState } from "react";
import { Brain, Check, Cloud, FlaskConical, Minus, Plug, Play, RotateCcw, ShieldCheck, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { navigate } from "@/components/app/router";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/client/api";
import { useCineFlowStore } from "@/lib/client/store";
import { RiskBadge } from "@/components/app/shared/badges";
import { ErrorState, PageHeader } from "@/components/app/shared/ui";
import { cn } from "@/lib/utils";
import type { SettingsDTO } from "@/lib/types";

function ConfigBadge({ configured, labelOn = "CONFIGURED", labelOff = "NOT CONFIGURED" }: { configured: boolean; labelOn?: string; labelOff?: string }) {
  return configured ? (
    <Badge variant="outline" className="gap-1 border-[#ABEFC6] bg-[#ECFDF3] font-medium text-[#067647]">
      <Check className="size-3" aria-hidden />
      {labelOn}
    </Badge>
  ) : (
    <Badge variant="outline" className="border-[#FEDF89] bg-[#FFFAEB] font-medium text-[#B54708]">
      {labelOff}
    </Badge>
  );
}

function IntegrationStatusBadge({ status }: { status: "CONFIGURED" | "DEMO_MODE" | "READY" }) {
  const map = {
    CONFIGURED: "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]",
    DEMO_MODE: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]",
    READY: "border-[#B2DDFF] bg-[#EFF8FF] text-[#175CD3]",
  } as const;
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap font-medium", map[status])}>
      {status.replace("_", " ")}
    </Badge>
  );
}

function SectionTitle({ icon: Icon, title, subtitle }: { icon: LucideIcon; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-[#B2DDFF] bg-[#EFF8FF] text-[#2563EB]">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <h3 className="text-base font-semibold tracking-tight text-[#111827]">{title}</h3>
        <p className="mt-0.5 text-[13px] leading-snug text-[#667085]">{subtitle}</p>
      </div>
    </div>
  );
}

function EnvChip({ name }: { name: string }) {
  return (
    <code className="rounded border border-[#E4E7EC] bg-[#F9FAFB] px-1.5 py-0.5 font-mono text-[11px] text-[#475467]">
      {name}
    </code>
  );
}

function YesNo({ yes, tone = "muted" }: { yes: boolean; tone?: "muted" | "caution" | "positive" }) {
  const toneCls =
    !yes
      ? "text-[#667085]"
      : tone === "caution"
        ? "text-[#B54708]"
        : tone === "positive"
          ? "text-[#067647]"
          : "text-[#111827]";
  return (
    <span className={cn("inline-flex items-center gap-1 text-[13px] font-medium", toneCls)}>
      {yes ? <Check className="size-3.5" aria-hidden /> : <Minus className="size-3.5" aria-hidden />}
      {yes ? "Yes" : "No"}
    </span>
  );
}

function ProviderSection({ data }: { data: SettingsDTO }) {
  return (
    <Card className="rounded-lg border-[#E4E7EC] bg-card shadow-none">
      <CardContent className="space-y-4 p-5">
        <SectionTitle
          icon={Brain}
          title="AI Reasoning Provider"
          subtitle="Which reasoning backend the agent uses. Keys are read from server-side environment variables only."
        />
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-[#ABEFC6] bg-[#ECFDF3] px-3 py-2">
          <span className="size-2 rounded-full bg-[#12B76A]" aria-hidden />
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[#067647]">Active</span>
          <span className="text-sm font-medium text-[#111827]">{data.activeProvider}</span>
        </div>
        <ul className="divide-y divide-[#E4E7EC]">
          {data.providers.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1 basis-52">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-[#111827]">{p.name}</span>
                  <EnvChip name={p.envVar} />
                </div>
                <p className="mt-0.5 text-[13px] text-[#667085]">{p.note}</p>
              </div>
              <ConfigBadge configured={p.configured} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function GoogleCloudSection({ data }: { data: SettingsDTO }) {
  return (
    <Card className="rounded-lg border-[#E4E7EC] bg-card shadow-none">
      <CardContent className="space-y-4 p-5">
        <SectionTitle
          icon={Cloud}
          title="Google Cloud"
          subtitle="Agent infrastructure wiring for the production deployment (Agent Builder / Vertex AI)."
        />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="cine-label">Project</span>
            <ConfigBadge configured={data.googleCloud.projectConfigured} labelOn="SET" labelOff="NOT SET" />
          </div>
          <div className="flex items-center gap-2">
            <span className="cine-label">Location</span>
            <ConfigBadge configured={data.googleCloud.locationConfigured} labelOn="SET" labelOff="NOT SET" />
          </div>
        </div>
        <p className="text-sm leading-relaxed text-[#667085]">{data.googleCloud.note}</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="cine-label">ENV VARS</span>
          <EnvChip name="GOOGLE_CLOUD_PROJECT" />
          <EnvChip name="GOOGLE_CLOUD_LOCATION" />
          <EnvChip name="GEMINI_API_KEY" />
        </div>
        <p className="rounded-md border border-[#FEDF89] bg-[#FFFAEB] px-3 py-2.5 text-[13px] leading-relaxed text-[#B54708]">
          Copy <code className="font-mono">.env.example</code> → <code className="font-mono">.env</code> and set keys to
          activate the real Gemini integration. The demo reasoning script is used while unconfigured.
        </p>
      </CardContent>
    </Card>
  );
}

function IntegrationsSection({ data }: { data: SettingsDTO }) {
  return (
    <Card className="rounded-lg border-[#E4E7EC] bg-card shadow-none">
      <CardContent className="space-y-4 p-5">
        <SectionTitle
          icon={Plug}
          title="Integrations"
          subtitle="Adapter status for reasoning, agent infrastructure and production operations."
        />
        <ul className="cine-scroll max-h-80 divide-y divide-[#E4E7EC] overflow-y-auto">
          {data.integrations.map((it) => (
            <li key={it.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1 basis-64">
                <p className="text-sm font-medium text-[#111827]">{it.name}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-[#667085]">{it.note}</p>
              </div>
              <IntegrationStatusBadge status={it.status} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function GuardrailsSection({ data }: { data: SettingsDTO }) {
  return (
    <Card className="rounded-lg border-[#E4E7EC] bg-card shadow-none">
      <CardContent className="space-y-4 p-5">
        <SectionTitle
          icon={ShieldCheck}
          title="Guardrail Policies"
          subtitle="Every agent action is risk-classified. Medium and high risk never run without a human decision."
        />
        <div className="overflow-hidden rounded-md border border-[#E4E7EC]">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#F9FAFB] hover:bg-transparent">
                <TableHead className="h-9 text-[11px] uppercase tracking-wider text-[#667085]">Action</TableHead>
                <TableHead className="h-9 text-[11px] uppercase tracking-wider text-[#667085]">Risk</TableHead>
                <TableHead className="h-9 text-[11px] uppercase tracking-wider text-[#667085]">Approval required</TableHead>
                <TableHead className="h-9 text-[11px] uppercase tracking-wider text-[#667085]">Auto-executable</TableHead>
                <TableHead className="h-9 text-[11px] uppercase tracking-wider text-[#667085]">Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.guardrails.map((g) => (
                <TableRow key={g.actionType} className={cn(g.actionType === "SCALE_RENDER_WORKERS" && "bg-[#F9FAFB]")}>
                  <TableCell className="py-2.5">
                    <p className="text-sm font-medium text-[#111827]">{g.actionLabel}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-[#667085]">{g.actionType}</p>
                  </TableCell>
                  <TableCell className="py-2.5">
                    <RiskBadge risk={g.risk} />
                  </TableCell>
                  <TableCell className="py-2.5">
                    <YesNo yes={g.requiresApproval} tone="caution" />
                  </TableCell>
                  <TableCell className="py-2.5">
                    <YesNo yes={g.autoExecutable} tone="positive" />
                  </TableCell>
                  <TableCell className="max-w-xs whitespace-normal py-2.5 text-[13px] leading-relaxed text-[#667085]">
                    {g.note}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function DemoControlsSection({ data, onRefetch }: { data: SettingsDTO; onRefetch: () => void }) {
  const queueAutoQuery = useCineFlowStore((s) => s.queueAutoQuery);
  const [resetting, setResetting] = useState(false);

  async function resetDemo() {
    setResetting(true);
    try {
      const res = await api.resetDemo();
      toast("Demo data reset", { description: res.message });
      onRefetch();
    } catch (e) {
      toast.error("Reset failed", { description: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setResetting(false);
    }
  }

  return (
    <Card className="rounded-lg border-[#E4E7EC] bg-card shadow-none">
      <CardContent className="space-y-4 p-5">
        <SectionTitle
          icon={FlaskConical}
          title="Demo Controls"
          subtitle="Deterministic scenario tooling for the judged demo."
        />
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            size="sm"
            className="gap-1.5 bg-[#2563EB] text-white hover:bg-[#1D4ED8]"
            onClick={() => {
              queueAutoQuery("Why is the post-production render pipeline delayed?");
              navigate("/agent");
            }}
          >
            <Play className="size-3.5" aria-hidden />
            Run demo scenario
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-[#FEE4E2] bg-white text-[#F04438] hover:bg-[#FEF3F2] hover:text-[#B42318]"
                disabled={resetting}
              >
                <RotateCcw className={cn("size-3.5", resetting && "animate-spin")} aria-hidden />
                {resetting ? "Resetting…" : "Reset demo data"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset demo environment?</AlertDialogTitle>
                <AlertDialogDescription>
                  Re-seeds all demo data: incidents, metrics, workflows and agent history. The deterministic
                  scenario will be reproducible from scratch.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={resetDemo}
                  className="bg-[#F04438] text-white hover:bg-[#D92D20]"
                >
                  Reset demo data
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-[#E4E7EC] bg-[#F9FAFB] px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="cine-label">SCENARIO</span>
            <span className="font-mono text-xs text-[#475467]">{data.scenario.id}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="cine-label">STATUS</span>
            <span className="text-sm font-medium text-[#111827]">{data.scenario.status}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="cine-label">RUNS</span>
            <span className="text-sm font-medium tabular-nums text-[#111827]">
              {data.scenario.runCount} <span className="text-xs font-normal text-[#667085]">times run</span>
            </span>
          </div>
        </div>
        <p className="text-[13px] leading-relaxed text-[#667085]">
          The scenario (render queue delay on INC-1042) is fully deterministic: investigation, evidence,
          approval-gated scaling and verification replay identically after every reset.
        </p>
      </CardContent>
    </Card>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading settings">
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-48 w-full rounded-lg" />
      <Skeleton className="h-56 w-full rounded-lg" />
      <Skeleton className="h-40 w-full rounded-lg" />
    </div>
  );
}

export function SettingsView() {
  const { data, loading, error, refetch } = useApi(() => api.settings());

  return (
    <div className="space-y-6 pb-4">
      <PageHeader
        title="Settings"
        description="Provider status, guardrail policies and demo controls. Keys are read from server-side environment variables only."
      />

      {loading ? <SettingsSkeleton /> : null}
      {error ? <ErrorState message={error} onRetry={refetch} /> : null}

      {!loading && !error && data ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ProviderSection data={data} />
          <GoogleCloudSection data={data} />
          <IntegrationsSection data={data} />
          <GuardrailsSection data={data} />
          <div className="lg:col-span-2">
            <DemoControlsSection data={data} onRefetch={refetch} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
