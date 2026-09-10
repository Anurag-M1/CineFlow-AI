"use client";

// CineFlow AI — Reports view. Operational report center: incident postmortems,
// agent run transcripts, and the accountability/audit trail. Every export is
// a real Markdown document generated from live data on click.

import { useState } from "react";
import {
  ClipboardCopy, Download, FileText, Loader2, ScrollText, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { navigate } from "@/components/app/router";
import { useApi } from "@/hooks/use-api";
import { api, type IncidentDetailDTO } from "@/lib/client/api";
import { timeAgo } from "@/lib/format";
import { DemoTag, IncidentStatusBadge, SeverityBadge } from "@/components/app/shared/badges";
import {
  EmptyState, ErrorState, LoadingRows, PageHeader,
} from "@/components/app/shared/ui";
import {
  buildRunTranscriptMarkdown, downloadTextFile,
} from "@/components/app/shared/markdown-export";
import { buildPostmortemMarkdown } from "@/components/app/views/incident-detail";
import type { RecommendationDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Per-row busy state for table action buttons (postmortem + transcripts). */
type BusyKey = string;

function ReportsViewContent() {
  const { data: incidents, loading: incLoading, error: incError } = useApi(() => api.incidents());
  const { data: runs, loading: runLoading } = useApi(() => api.agentRuns());
  const [busy, setBusy] = useState<BusyKey | null>(null);

  const copy = async (key: BusyKey, text: string, label: string) => {
    setBusy(key);
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`, { description: `${text.length.toLocaleString()} characters of Markdown.` });
    } catch {
      toast.error("Could not copy — clipboard unavailable in this context");
    } finally {
      setBusy(null);
    }
  };

  /** Fetch detail + build the honest postmortem document for one incident. */
  const exportPostmortem = async (incidentId: string, mode: "copy" | "download") => {
    const key = `pm-${incidentId}`;
    setBusy(key);
    try {
      const detail: IncidentDetailDTO = await api.incident(incidentId);
      const md = buildPostmortemMarkdown(detail, detail.events);
      const draft = detail.status !== "RESOLVED";
      if (mode === "download") {
        downloadTextFile(`cineflow-postmortem-${incidentId}.md`, md);
        toast.success(draft ? "Draft postmortem downloaded" : "Postmortem downloaded", {
          description: `cineflow-postmortem-${incidentId}.md`,
        });
      } else {
        await navigator.clipboard.writeText(md);
        toast.success(draft ? "Draft postmortem copied" : "Postmortem copied", {
          description: `${md.length.toLocaleString()} characters of Markdown.`,
        });
      }
    } catch (e) {
      toast.error("Could not build the postmortem", {
        description: e instanceof Error ? e.message : "Request failed",
      });
    } finally {
      setBusy(null);
    }
  };

  /** Fetch run detail + recommendations, build the full transcript document. */
  const exportTranscript = async (runId: string, mode: "copy" | "download") => {
    const key = `tr-${runId}`;
    setBusy(key);
    try {
      const [detail, recs] = await Promise.all([api.agentRun(runId), api.recommendations()]);
      const rec: RecommendationDTO | null = recs.find((r) => r.agentRunId === runId) ?? null;
      const md = buildRunTranscriptMarkdown(detail, rec);
      if (mode === "download") {
        downloadTextFile(`cineflow-run-${runId.slice(0, 8)}.md`, md);
        toast.success("Run transcript downloaded", { description: `cineflow-run-${runId.slice(0, 8)}.md` });
      } else {
        await navigator.clipboard.writeText(md);
        toast.success("Transcript copied", { description: `${md.length.toLocaleString()} characters of Markdown.` });
      }
    } catch (e) {
      toast.error("Could not build the transcript", {
        description: e instanceof Error ? e.message : "Request failed",
      });
    } finally {
      setBusy(null);
    }
  };

  if (incError) return <ErrorState message={incError} />;

  const iconBtn =
    "inline-flex size-8 items-center justify-center rounded-md border border-[#E4E7EC] bg-white text-[#667085] transition-colors hover:border-[#98A2B3] hover:text-[#111827] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2563EB] disabled:opacity-50";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Postmortems, run transcripts, and the audit trail — generated from live data as real Markdown documents."
        badge={<DemoTag label="Generated from demo data" />}
      />

      {/* Postmortem reports */}
      <Card className="border-[#E4E7EC] shadow-none">
        <CardHeader className="flex flex-row items-center justify-between border-b border-[#E4E7EC] py-4">
          <div>
            <CardTitle className="text-base font-semibold">Incident postmortems</CardTitle>
            <p className="text-[13px] text-[#667085]">One document per incident — includes timeline, evidence, root cause, and verification.</p>
          </div>
          <FileText className="size-5 text-[#98A2B3]" aria-hidden />
        </CardHeader>
        <CardContent className="pt-0">
          {incLoading && !incidents ? (
            <LoadingRows rows={4} className="pt-4" />
          ) : !incidents || incidents.length === 0 ? (
            <EmptyState title="No incidents to report" description="Postmortems appear once incidents are detected." icon={FileText} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[13px] font-semibold text-[#667085]">ID</TableHead>
                  <TableHead className="text-[13px] font-semibold text-[#667085]">Incident</TableHead>
                  <TableHead className="text-[13px] font-semibold text-[#667085]">Severity</TableHead>
                  <TableHead className="text-[13px] font-semibold text-[#667085]">Status</TableHead>
                  <TableHead className="text-[13px] font-semibold text-[#667085]">Detected</TableHead>
                  <TableHead className="text-right text-[13px] font-semibold text-[#667085]">Export</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incidents.map((inc) => (
                  <TableRow key={inc.id} className="border-[#E4E7EC] text-[14px] cine-row-hover">
                    <TableCell className="py-3 font-mono text-[13px] font-medium text-[#175CD3]">
                      <button className="hover:underline" onClick={() => navigate(`/incidents/${inc.id}`)}>{inc.id}</button>
                    </TableCell>
                    <TableCell className="font-medium text-[#111827]">{inc.title}</TableCell>
                    <TableCell><SeverityBadge severity={inc.severity} /></TableCell>
                    <TableCell><IncidentStatusBadge status={inc.status} /></TableCell>
                    <TableCell className="text-[#667085]">{timeAgo(inc.detectedAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          className={iconBtn}
                          disabled={busy === `pm-${inc.id}`}
                          onClick={() => void exportPostmortem(inc.id, "copy")}
                          aria-label={`Copy ${inc.id} postmortem as Markdown`}
                          title="Copy postmortem"
                        >
                          {busy === `pm-${inc.id}` ? <Loader2 className="size-4 animate-spin" /> : <ClipboardCopy className="size-4" />}
                        </button>
                        <button
                          className={iconBtn}
                          disabled={busy === `pm-${inc.id}`}
                          onClick={() => void exportPostmortem(inc.id, "download")}
                          aria-label={`Download ${inc.id} postmortem`}
                          title="Download postmortem"
                        >
                          <Download className="size-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Agent run transcripts */}
      <Card className="border-[#E4E7EC] shadow-none">
        <CardHeader className="flex flex-row items-center justify-between border-b border-[#E4E7EC] py-4">
          <div>
            <CardTitle className="text-base font-semibold">Agent run transcripts</CardTitle>
            <p className="text-[13px] text-[#667085]">Full investigation transcripts — reasoning steps, tools, evidence, and the final answer.</p>
          </div>
          <ScrollText className="size-5 text-[#98A2B3]" aria-hidden />
        </CardHeader>
        <CardContent className="pt-0">
          {runLoading && !runs ? (
            <LoadingRows rows={3} className="pt-4" />
          ) : !runs || runs.length === 0 ? (
            <EmptyState title="No agent runs yet" description="Run a query in the AI Agent console first." icon={ScrollText} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[13px] font-semibold text-[#667085]">Query</TableHead>
                  <TableHead className="text-[13px] font-semibold text-[#667085]">Status</TableHead>
                  <TableHead className="text-[13px] font-semibold text-[#667085]">Confidence</TableHead>
                  <TableHead className="text-[13px] font-semibold text-[#667085]">Started</TableHead>
                  <TableHead className="text-right text-[13px] font-semibold text-[#667085]">Export</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.slice(0, 8).map((r) => (
                  <TableRow key={r.id} className="border-[#E4E7EC] text-[14px] cine-row-hover">
                    <TableCell className="max-w-80 truncate py-3 font-medium text-[#111827]">
                      <button className="hover:underline" onClick={() => navigate(`/agent?run=${r.id}`)}>{r.query}</button>
                    </TableCell>
                    <TableCell className={cn(
                      "font-medium",
                      r.status === "COMPLETED" ? "text-[#067647]" : r.status === "AWAITING_APPROVAL" ? "text-[#B54708]" : "text-[#175CD3]",
                    )}>
                      {r.status === "COMPLETED" ? "Completed" : r.status === "AWAITING_APPROVAL" ? "Awaiting approval" : r.status.toLowerCase()}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums text-[#344054]">
                      {typeof r.confidence === "number" ? `${r.confidence}%` : "—"}
                    </TableCell>
                    <TableCell className="text-[#667085]">{timeAgo(r.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          className={iconBtn}
                          disabled={busy === `tr-${r.id}`}
                          onClick={() => void exportTranscript(r.id, "copy")}
                          aria-label={`Copy transcript for run ${r.id.slice(0, 8)}`}
                          title="Copy transcript"
                        >
                          {busy === `tr-${r.id}` ? <Loader2 className="size-4 animate-spin" /> : <ClipboardCopy className="size-4" />}
                        </button>
                        <button
                          className={iconBtn}
                          disabled={busy === `tr-${r.id}`}
                          onClick={() => void exportTranscript(r.id, "download")}
                          aria-label={`Download transcript for run ${r.id.slice(0, 8)}`}
                          title="Download transcript"
                        >
                          <Download className="size-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Accountability */}
      <Card className="border-[#E4E7EC] shadow-none">
        <CardHeader className="flex flex-row items-center justify-between border-b border-[#E4E7EC] py-4">
          <div>
            <CardTitle className="text-base font-semibold">Accountability &amp; audit trail</CardTitle>
            <p className="text-[13px] text-[#667085]">Every agent decision, approval, and action is recorded with timestamps and actors.</p>
          </div>
          <ShieldCheck className="size-5 text-[#98A2B3]" aria-hidden />
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-4 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[14px] text-[#344054]">
            The audit log records anomaly detections, agent reasoning milestones, human approvals,
            remediation actions, and recovery verification — filterable and replayable.
          </p>
          <Button variant="outline" className="shrink-0" onClick={() => navigate("/audit")}>
            <ScrollText className="size-4" aria-hidden />
            Open audit log
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function ReportsView() {
  return <ReportsViewContent />;
}
