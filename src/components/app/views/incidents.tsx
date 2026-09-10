"use client";

// CineFlow AI — Incidents list view.
// Status filter (All / Active / Resolved) + severity filter backed by
// /api/incidents. Severity is applied server-side; the status buckets are
// derived client-side so "Active" (status != RESOLVED) and the count summary
// stay accurate on every tab.

import { useEffect, useRef, useState } from "react";
import { ChevronRight, Inbox, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { navigate, useRoute } from "@/components/app/router";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/client/api";
import { timeAgo } from "@/lib/format";
import { IncidentStatusBadge, SeverityBadge } from "@/components/app/shared/badges";
import { EmptyState, ErrorState, LoadingRows, PageHeader } from "@/components/app/shared/ui";
import { IncidentDetailView } from "@/components/app/views/incident-detail";
import { cn } from "@/lib/utils";
import type { Severity } from "@/lib/types";

type StatusFilter = "ALL" | "ACTIVE" | "RESOLVED";
type SeverityFilter = "ALL" | Severity;

// Table headers — 13px semibold gray (spec); rows stay 14px.
const HEAD_CLS = "h-10 px-4 text-[13px] font-semibold text-[#667085]";

// Confidence column — mono tabular % with a tiered semantic tone, or an em
// dash when the agent has not assessed the incident yet.
function confidenceTone(v: number) {
  return v >= 80 ? "text-[#067647]" : v >= 60 ? "text-[#B54708]" : "text-[#B42318]";
}

export function IncidentsView() {
  // Forward id-bearing routes (#/incidents/{id}) to the detail view. The app
  // shell currently maps only the bare "incidents" view here, so this keeps
  // the documented URL scheme working for every link that targets
  // /incidents/{id}; it becomes a no-op once the shell routes these directly.
  const route = useRoute();
  if (route.view === "incidents" && route.id) {
    return <IncidentDetailView incidentId={route.id} />;
  }
  return <IncidentsList />;
}

function IncidentsList() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("ALL");
  const [query, setQuery] = useState("");

  const severityParam = severityFilter === "ALL" ? undefined : severityFilter;
  const { data, loading, error, refetch } = useApi(
    () => api.incidents({ severity: severityParam }),
    { intervalMs: 8000 }
  );

  // Live resolution awareness: when the 8s poll sees an incident flip to
  // RESOLVED (e.g. while the agent executes an approved remediation), surface
  // a toast so the change is visible even from the list. Ref-only — no state.
  const prevStatuses = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    if (!data) return;
    const prev = prevStatuses.current;
    if (prev) {
      for (const inc of data) {
        const before = prev.get(inc.id);
        if (before && before !== "RESOLVED" && inc.status === "RESOLVED") {
          toast.success(`${inc.id} resolved`, {
            description: inc.resolutionNote?.slice(0, 100) ?? "Agent remediation verified.",
          });
        }
      }
    }
    prevStatuses.current = new Map(data.map((i) => [i.id, i.status]));
  }, [data]);

  // useApi always invokes the latest fetcher, but only re-runs on tick —
  // trigger a refetch when the server-side severity parameter changes.
  const prevSeverity = useRef(severityParam);
  useEffect(() => {
    if (prevSeverity.current !== severityParam) {
      prevSeverity.current = severityParam;
      refetch();
    }
  }, [severityParam, refetch]);

  const incidents = data ?? [];
  const needle = query.trim().toLowerCase();
  const visible = incidents
    .filter((i) =>
      statusFilter === "ALL" ? true
      : statusFilter === "RESOLVED" ? i.status === "RESOLVED"
      : i.status !== "RESOLVED"
    )
    .filter((i) =>
      !needle
        ? true
        : i.id.toLowerCase().includes(needle) ||
          i.title.toLowerCase().includes(needle) ||
          i.service.toLowerCase().includes(needle)
    );
  const activeCount = incidents.filter((i) => i.status !== "RESOLVED").length;
  const resolvedCount = incidents.length - activeCount;
  const filtersActive = statusFilter !== "ALL" || severityFilter !== "ALL" || query.trim() !== "";

  const clearFilters = () => {
    setStatusFilter("ALL");
    setSeverityFilter("ALL");
    setQuery("");
  };

  const openIncident = (id: string) => navigate(`/incidents/${id}`);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Incidents"
        description="Detect, investigate and close production incidents with agent-verified recovery (demo data)."
      />

      <Card className="gap-0 overflow-hidden rounded-lg border-[#E4E7EC] bg-card py-0 shadow-none">
        {/* Filter bar + count summary */}
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Status filter — clean segmented control (white bg, spec border) */}
            <Tabs
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as StatusFilter)}
            >
              <TabsList
                aria-label="Filter incidents by status"
                className="h-9 gap-0.5 rounded-lg border border-[#E4E7EC] bg-white p-0.5 shadow-none"
              >
                <TabsTrigger
                  value="ALL"
                  className="rounded-md px-3 text-[13px] text-[#667085] data-[state=active]:bg-[#F2F4F7] data-[state=active]:text-[#111827] data-[state=active]:shadow-none"
                >
                  All
                </TabsTrigger>
                <TabsTrigger
                  value="ACTIVE"
                  className="rounded-md px-3 text-[13px] text-[#667085] data-[state=active]:bg-[#F2F4F7] data-[state=active]:text-[#111827] data-[state=active]:shadow-none"
                >
                  Active
                </TabsTrigger>
                <TabsTrigger
                  value="RESOLVED"
                  className="rounded-md px-3 text-[13px] text-[#667085] data-[state=active]:bg-[#F2F4F7] data-[state=active]:text-[#111827] data-[state=active]:shadow-none"
                >
                  Resolved
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-3 text-[13px] text-[#667085]" aria-live="polite">
                <span className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-[#F79009]" aria-hidden />
                  <span className="font-semibold tabular-nums text-[#111827]">{activeCount}</span>
                  active
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-[#12B76A]" aria-hidden />
                  <span className="font-semibold tabular-nums text-[#111827]">{resolvedCount}</span>
                  resolved
                </span>
              </span>
              {/* Text search — filters across id / title / service */}
              <div className="relative w-full sm:w-64">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#98A2B3]"
                  aria-hidden
                />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search id, title, service…"
                  aria-label="Search incidents by id, title or service"
                  className="h-9 border-[#E4E7EC] bg-white pl-8 pr-8 text-[13px]"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center rounded text-[#98A2B3] transition-colors hover:text-[#111827] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/60"
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                ) : null}
              </div>
              <Select
                value={severityFilter}
                onValueChange={(v) => setSeverityFilter(v as SeverityFilter)}
              >
                <SelectTrigger
                  size="sm"
                  aria-label="Filter by severity"
                  className="h-9 w-[150px] border-[#E4E7EC] bg-white text-[13px] text-[#111827]"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All severities</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>

        {/* Table */}
        <div className="border-t border-[#E4E7EC]">
          {loading && !data ? (
            <div className="p-4 sm:p-5">
              <LoadingRows rows={6} />
            </div>
          ) : error && !data ? (
            <div className="p-4 sm:p-5">
              <ErrorState message={error} onRetry={refetch} />
            </div>
          ) : visible.length === 0 ? (
            <div className="p-4 sm:p-5">
              <EmptyState
                icon={Inbox}
                title="No incidents match the current filter"
                description={
                  filtersActive
                    ? "Try a different status, severity or search term, or clear the filters to see everything."
                    : "No incidents have been detected in this demo environment."
                }
                action={filtersActive ? (
                  <Button variant="outline" size="sm" className="border-[#E4E7EC] shadow-none" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : undefined}
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={HEAD_CLS}>ID</TableHead>
                  <TableHead className={HEAD_CLS}>Incident</TableHead>
                  <TableHead className={HEAD_CLS}>Severity</TableHead>
                  <TableHead className={`${HEAD_CLS} hidden md:table-cell`}>Service</TableHead>
                  <TableHead className={HEAD_CLS}>Status</TableHead>
                  <TableHead className={`${HEAD_CLS} hidden sm:table-cell`}>Detected</TableHead>
                  <TableHead className={HEAD_CLS}>Confidence</TableHead>
                  <TableHead className={`${HEAD_CLS} hidden w-20 py-2.5 text-right sm:table-cell`}>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((inc, i) => (
                  <TableRow
                    key={inc.id}
                    tabIndex={0}
                    className="group animate-in fade-in slide-in-from-bottom-1 cursor-pointer border-[#E4E7EC] text-[14px] cine-row-hover fill-mode-both focus-visible:bg-[#F9FAFB] focus-visible:outline-none motion-reduce:animate-none"
                    style={{ animationDelay: `${Math.min(i, 12) * 35}ms`, animationDuration: "300ms" }}
                    onClick={() => openIncident(inc.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") openIncident(inc.id);
                    }}
                    aria-label={`Open incident ${inc.id}: ${inc.title}`}
                  >
                    <TableCell className="py-3 font-mono text-[13px] font-medium text-[#175CD3]">
                      {inc.id}
                    </TableCell>
                    <TableCell className="max-w-[280px] py-3">
                      <span className="block truncate text-sm font-medium text-[#111827]">{inc.title}</span>
                      <span className="mt-0.5 block truncate text-[13px] text-[#667085] md:hidden">
                        {inc.service}
                      </span>
                    </TableCell>
                    <TableCell className="py-3">
                      <SeverityBadge severity={inc.severity} />
                    </TableCell>
                    <TableCell className="hidden py-3 text-[13px] text-[#667085] md:table-cell">
                      {inc.service}
                    </TableCell>
                    <TableCell className="py-3">
                      <IncidentStatusBadge status={inc.status} />
                    </TableCell>
                    <TableCell
                      className="hidden py-3 text-[13px] text-[#667085] sm:table-cell"
                      title={new Date(inc.detectedAt).toLocaleString()}
                    >
                      {timeAgo(inc.detectedAt)}
                    </TableCell>
                    <TableCell className="py-3">
                      {inc.agentConfidence != null ? (
                        <span
                          className={cn("font-mono text-[13px] font-medium tabular-nums", confidenceTone(inc.agentConfidence))}
                        >
                          {inc.agentConfidence}%
                        </span>
                      ) : (
                        <span className="text-[13px] text-[#667085]">—</span>
                      )}
                    </TableCell>
                    {/* Drill-down affordance — "View" + chevron brighten on
                        row hover/focus (the whole row navigates). */}
                    <TableCell className="hidden w-20 py-3 text-right sm:table-cell">
                      <span className="ml-auto inline-flex items-center gap-1 text-[13px] font-medium text-[#175CD3] opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100 group-focus-visible:opacity-100">
                        View
                        <ChevronRight className="size-4" aria-hidden />
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>
    </div>
  );
}
