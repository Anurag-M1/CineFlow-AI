"use client";

// CineFlow AI — recommendations view: the approval-gated action worklist.
// Agent recommendations render as approval cards with labeled sections
// (problem, evidence, recommended action, confidence, risk, approval status)
// and a human approval gate — approve / reject with confirm + loading states.

import { useMemo, useState, type ReactNode } from "react";
import { ArrowUpRight, Check, ChevronDown, Clock, Play, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { navigate } from "@/components/app/router";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/client/api";
import { useCineFlowStore } from "@/lib/client/store";
import { fmtDateTime, timeAgo } from "@/lib/format";
import { ConfidenceMeter, EmptyState, ErrorState, LoadingRows, PageHeader } from "@/components/app/shared/ui";
import { DemoTag, RiskBadge } from "@/components/app/shared/badges";
import { cn } from "@/lib/utils";
import type { RecommendationDTO, RecommendationStatus, RiskLevel, VerificationResult } from "@/lib/types";

// Approval status tones follow the product spec pairings:
// awaiting approval = amber · approved/verified = success · executed = info ·
// rejected = neutral (a decision, not a failure state).
const STATUS_META: Record<RecommendationStatus, { cls: string; label: string }> = {
  PENDING: { cls: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]", label: "Awaiting approval" },
  APPROVED: { cls: "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]", label: "Approved" },
  EXECUTED: { cls: "border-[#B2DDFF] bg-[#EFF8FF] text-[#175CD3]", label: "Executed" },
  VERIFIED: { cls: "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]", label: "Verified" },
  REJECTED: { cls: "border-[#E4E7EC] bg-[#F2F4F7] text-[#475467]", label: "Rejected" },
};

const SORT_RANK: Record<RecommendationStatus, number> = {
  PENDING: 0,
  APPROVED: 1,
  EXECUTED: 2,
  VERIFIED: 3,
  REJECTED: 4,
};

const GUARDRAIL_NOTE: Record<RiskLevel, { cls: string; text: string }> = {
  LOW: { cls: "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]", text: "Auto-executable (read-only)" },
  MEDIUM: { cls: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]", text: "Requires approval before execution" },
  HIGH: { cls: "border-[#FEE4E2] bg-[#FEF3F2] text-[#B42318]", text: "Never auto-executes; approval mandatory" },
};

function RecStatusBadge({ status }: { status: RecommendationStatus }) {
  const m = STATUS_META[status] ?? { cls: "border-[#E4E7EC] bg-[#F2F4F7] text-[#475467]", label: status };
  return (
    <Badge variant="outline" className={cn("font-medium", m.cls)}>
      {m.label}
    </Badge>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="cine-label">{children}</p>;
}

function VerificationBlock({ verification }: { verification: VerificationResult }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {verification.passed ? (
          <Badge variant="outline" className="gap-1.5 border-[#ABEFC6] bg-[#ECFDF3] font-medium text-[#067647]">
            <Check className="size-3" aria-hidden />
            Recovery verified
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1.5 border-[#FEDF89] bg-[#FFFAEB] font-medium text-[#B54708]">
            <X className="size-3" aria-hidden />
            Not yet recovered
          </Badge>
        )}
        <span className="text-xs text-[#667085]">{verification.summary}</span>
      </div>
      <div className="max-h-64 overflow-y-auto cine-scroll rounded-md border border-[#E4E7EC]">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-8 text-[11px] uppercase tracking-wider text-[#667085]">Check</TableHead>
              <TableHead className="h-8 text-[11px] uppercase tracking-wider text-[#667085]">Before → After</TableHead>
              <TableHead className="h-8 text-[11px] uppercase tracking-wider text-[#667085]">Threshold</TableHead>
              <TableHead className="h-8 text-right text-[11px] uppercase tracking-wider text-[#667085]">Pass</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {verification.checks.map((c) => (
              <TableRow key={c.label} className="border-[#E4E7EC]">
                <TableCell className="py-2 text-xs font-medium text-[#111827]">{c.label}</TableCell>
                <TableCell className="py-2 font-mono text-xs tabular-nums text-[#667085]">
                  {c.before} <span className="text-[#98A2B3]">→</span>{" "}
                  <span className="text-[#111827]">{c.after}</span>
                </TableCell>
                <TableCell className="py-2 font-mono text-xs tabular-nums text-[#667085]">{c.threshold}</TableCell>
                <TableCell className="py-2 text-right">
                  {c.passed ? (
                    <Check className="ml-auto size-3.5 text-[#12B76A]" aria-label="Pass" />
                  ) : (
                    <X className="ml-auto size-3.5 text-[#F04438]" aria-label="Fail" />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function RecommendationCard({
  rec, onRefetch, index = 0,
}: {
  rec: RecommendationDTO;
  onRefetch: () => void;
  index?: number;
}) {
  const [acting, setActing] = useState<"approve" | "reject" | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(true);
  const guardrail = GUARDRAIL_NOTE[rec.risk] ?? GUARDRAIL_NOTE.MEDIUM;
  const pending = rec.status === "PENDING";
  const evidenceId = `evidence-${rec.id}`;

  async function decide(kind: "approve" | "reject") {
    setActing(kind);
    try {
      const res =
        kind === "approve" ? await api.approveRecommendation(rec.id) : await api.rejectRecommendation(rec.id);
      toast(kind === "approve" ? "Recommendation approved" : "Recommendation rejected", {
        description: res.message ?? "Demo state updated.",
      });
      onRefetch();
    } catch (e) {
      toast.error("Action failed", { description: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setActing(null);
    }
  }

  return (
    <Card
      className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both border-[#E4E7EC] shadow-none motion-reduce:animate-none"
      style={{ animationDelay: `${Math.min(index, 10) * 45}ms`, animationDuration: "350ms" }}
    >
      <CardContent className="space-y-4 p-5">
        {/* Header — title + approval status */}
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="min-w-0 max-w-2xl text-[15px] font-semibold leading-snug tracking-tight text-[#111827]">{rec.title}</h3>
            <RecStatusBadge status={rec.status} />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-[#667085]">
            <span className="flex items-center gap-1">
              <Clock className="size-3" aria-hidden />
              Created {timeAgo(rec.createdAt)}
            </span>
            {rec.incidentId ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-xs text-[#175CD3] hover:bg-[#EFF8FF] hover:text-[#175CD3]"
                onClick={() => navigate(`/incidents/${rec.incidentId}`)}
              >
                <ArrowUpRight className="size-3" aria-hidden />
                {rec.incidentId}
              </Button>
            ) : null}
          </div>
        </div>

        {/* Problem */}
        <section className="space-y-1.5 border-t border-[#E4E7EC] pt-4">
          <SectionLabel>Problem</SectionLabel>
          <p className="text-sm leading-relaxed text-[#344054]">{rec.problem}</p>
        </section>

        {/* Evidence */}
        <section className="space-y-2 border-t border-[#E4E7EC] pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionLabel>Evidence</SectionLabel>
            {pending ? null : (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-xs text-[#175CD3] hover:bg-[#EFF8FF] hover:text-[#175CD3]"
                onClick={() => setEvidenceOpen((v) => !v)}
                aria-expanded={evidenceOpen}
                aria-controls={evidenceId}
              >
                <ChevronDown
                  className={cn("size-3.5 transition-transform", evidenceOpen && "rotate-180")}
                  aria-hidden
                />
                {evidenceOpen ? "Hide" : "View"}
              </Button>
            )}
          </div>
          {evidenceOpen ? (
            <ul id={evidenceId} className="space-y-2">
              {rec.evidence.map((ev, i) => (
                <li
                  key={`${ev.label}-${i}`}
                  className="flex gap-2.5 rounded-md border border-[#E4E7EC] bg-[#F9FAFB] px-3 py-2"
                >
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#2563EB]" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm leading-snug text-[#344054]">
                      <span className="font-mono text-xs text-[#667085]">{ev.label}: </span>
                      {ev.value}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#667085]">source: {ev.source}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        {/* Recommended action */}
        <section className="space-y-2 border-t border-[#E4E7EC] pt-4">
          <SectionLabel>Recommended action</SectionLabel>
          <p className="text-[15px] font-medium leading-relaxed text-[#111827]">{rec.actionLabel}</p>
        </section>

        {/* Confidence + risk */}
        <section className="grid gap-4 border-t border-[#E4E7EC] pt-4 sm:grid-cols-2">
          <div className="min-w-0 space-y-1.5">
            <SectionLabel>Confidence</SectionLabel>
            <ConfidenceMeter value={rec.confidence} />
          </div>
          <div className="min-w-0 space-y-1.5">
            <SectionLabel>Risk</SectionLabel>
            <div className="flex flex-wrap items-center gap-2">
              <RiskBadge risk={rec.risk} />
              <span className={cn("inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium", guardrail.cls)}>
                {guardrail.text}
              </span>
            </div>
          </div>
        </section>

        {/* Analysis + root cause */}
        <section className="space-y-2 border-t border-[#E4E7EC] pt-4">
          <SectionLabel>Analysis &amp; root cause</SectionLabel>
          <p className="text-sm leading-relaxed text-[#667085]">{rec.analysis}</p>
          <p className="text-sm leading-relaxed text-[#344054]">
            <span className="cine-label mr-1.5">ROOT CAUSE</span>
            {rec.rootCause}
          </p>
        </section>

        {/* Decisions / outcome */}
        {pending ? (
          <div className="flex flex-wrap items-center gap-2.5 border-t border-[#E4E7EC] pt-4">
            <Button
              className="gap-1.5 bg-[#2563EB] text-white hover:bg-[#1D4ED8]"
              onClick={() => decide("approve")}
              disabled={acting !== null}
            >
              <Check className="size-3.5" aria-hidden />
              {acting === "approve" ? "Approving…" : "Approve & execute"}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="gap-1.5 border-[#FEE4E2] bg-white text-[#B42318] hover:border-[#FEE4E2] hover:bg-[#FEF3F2] hover:text-[#B42318]"
                  disabled={acting !== null}
                >
                  <X className="size-3.5" aria-hidden />
                  {acting === "reject" ? "Rejecting…" : "Reject"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reject recommendation?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The agent will take no action and the incident stays under investigation.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep recommendation</AlertDialogCancel>
                  <AlertDialogAction
                    className="border-[#FEE4E2] bg-white text-[#B42318] hover:bg-[#FEF3F2] hover:text-[#B42318]"
                    onClick={() => decide("reject")}
                  >
                    Reject recommendation
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button
              variant="outline"
              className="gap-1.5 border-[#E4E7EC] text-[#344054] hover:bg-[#F9FAFB] hover:text-[#111827]"
              onClick={() => setEvidenceOpen((v) => !v)}
              aria-expanded={evidenceOpen}
              aria-controls={evidenceId}
              disabled={acting !== null}
            >
              <ChevronDown className={cn("size-3.5 transition-transform", evidenceOpen && "rotate-180")} aria-hidden />
              {evidenceOpen ? "Hide evidence" : "View evidence"}
            </Button>
            <p className="w-full text-[11px] text-[#667085]">
              Approval continues the agent run: execute action, verify recovery, resolve incident.
            </p>
          </div>
        ) : null}

        {rec.status === "REJECTED" ? (
          <p className="border-t border-[#E4E7EC] pt-4 text-xs text-[#667085]">
            Rejected — no action was taken.
          </p>
        ) : null}

        {rec.executedAt || rec.verification ? (
          <section className="space-y-3 border-t border-[#E4E7EC] pt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <SectionLabel>Action &amp; verification</SectionLabel>
              {rec.executedAt ? (
                <p className="text-[11px] text-[#667085]">Executed {fmtDateTime(rec.executedAt)}</p>
              ) : null}
            </div>
            {rec.verification ? <VerificationBlock verification={rec.verification} /> : (
              <p className="text-sm text-[#667085]">
                Action executed — awaiting verification against thresholds.
              </p>
            )}
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function RecommendationsView() {
  const { data, loading, error, refetch } = useApi(() => api.recommendations(), { intervalMs: 5000 });
  const queueAutoQuery = useCineFlowStore((s) => s.queueAutoQuery);
  const [tabOverride, setTabOverride] = useState<"pending" | "history" | null>(null);

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data].sort(
      (a, b) =>
        (SORT_RANK[a.status] ?? 9) - (SORT_RANK[b.status] ?? 9) ||
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [data]);

  const pendingCount = data?.filter((r) => r.status === "PENDING").length ?? 0;
  const historyCount = sorted.length - pendingCount;
  // Default tab follows the data (approval queue first); an explicit click wins.
  const tab = tabOverride ?? (pendingCount > 0 ? "pending" : "history");
  const visible = tab === "pending"
    ? sorted.filter((r) => r.status === "PENDING")
    : sorted.filter((r) => r.status !== "PENDING");

  return (
    <div className="space-y-6 pb-4">
      <PageHeader
        title="Recommendations"
        description="The approval-gated action worklist. Every recommendation carries its evidence, confidence and risk — medium and high-risk actions require your approval before the agent executes them."
        badge={<DemoTag label="Demo approval flow" />}
        actions={
          sorted.length > 0 ? (
            <Tabs
              value={tab}
              onValueChange={(v) => setTabOverride(v as "pending" | "history")}
            >
              <TabsList className="h-9 border border-[#E4E7EC] bg-white p-[3px]">
                <TabsTrigger
                  value="pending"
                  className="gap-1.5 px-3 text-[13px] data-[state=active]:border-[#B2DDFF] data-[state=active]:bg-[#EFF8FF] data-[state=active]:text-[#175CD3] data-[state=active]:shadow-none"
                >
                  Pending
                  <span className="font-mono text-[11px] tabular-nums">({pendingCount})</span>
                </TabsTrigger>
                <TabsTrigger
                  value="history"
                  className="gap-1.5 px-3 text-[13px] data-[state=active]:border-[#B2DDFF] data-[state=active]:bg-[#EFF8FF] data-[state=active]:text-[#175CD3] data-[state=active]:shadow-none"
                >
                  History
                  <span className="font-mono text-[11px] tabular-nums">({historyCount})</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          ) : undefined
        }
      />

      {loading ? <LoadingRows rows={4} /> : null}
      {error ? <ErrorState message={error} onRetry={refetch} /> : null}

      {!loading && !error ? (
        sorted.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No recommendations yet"
            description="The agent creates recommendations when it investigates incidents. Run the demo scenario to see one."
            action={
              <Button
                className="gap-1.5 bg-[#2563EB] text-white hover:bg-[#1D4ED8]"
                onClick={() => {
                  queueAutoQuery("Why is the post-production render pipeline delayed?");
                  navigate("/agent");
                }}
              >
                <Play className="size-3.5" aria-hidden />
                Run demo scenario
              </Button>
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={tab === "pending" ? Clock : ShieldCheck}
            title={tab === "pending" ? "Nothing awaiting approval" : "No decided recommendations yet"}
            description={
              tab === "pending"
                ? "The queue is clear — new agent recommendations will appear here for your approval."
                : "Approved, executed, verified and rejected recommendations will appear here once decided."
            }
          />
        ) : (
          <div className="space-y-4">
            {visible.map((rec, i) => (
              <RecommendationCard key={rec.id} rec={rec} index={i} onRefetch={refetch} />
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}
