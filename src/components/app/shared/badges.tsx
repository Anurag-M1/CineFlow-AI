"use client";

// CineFlow AI — semantic status badges (light surface).
// Palette pairings follow the product spec:
//   success #12B76A · warning #F79009 · critical #F04438 · info #0BA5EC
// Every badge pairs a text label with its dot — status is never color-only.

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Health, RiskLevel, Severity, IncidentStatus } from "@/lib/types";

const dot = (color: string) => (
  <span className={cn("inline-block size-1.5 rounded-full", color)} aria-hidden />
);

/** Solid semantic swatch pairs — bg / border / text / dot. */
export const TONES = {
  success: { cls: "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]", dot: "bg-[#17B268]" },
  warning: { cls: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]", dot: "bg-[#F79009]" },
  critical: { cls: "border-[#FEE4E2] bg-[#FEF3F2] text-[#B42318]", dot: "bg-[#F04438]" },
  info: { cls: "border-[#B2DDFF] bg-[#EFF8FF] text-[#175CD3]", dot: "bg-[#0BA5EC]" },
  accent: { cls: "border-[#B2DDFF] bg-[#EFF8FF] text-[#175CD3]", dot: "bg-[#2563EB]" },
  neutral: { cls: "border-[#E4E7EC] bg-[#F2F4F7] text-[#475467]", dot: "bg-[#667085]" },
} as const;

export type Tone = keyof typeof TONES;

export function StatusBadge({ status, className }: { status: Health | string; className?: string }) {
  const s = status.toUpperCase();
  const t =
    s === "HEALTHY" ? TONES.success
      : s === "WARNING" ? TONES.warning
        : s === "CRITICAL" ? TONES.critical
          : TONES.neutral;
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-medium", t.cls, className)}>
      {dot(t.dot)}
      {s.charAt(0) + s.slice(1).toLowerCase()}
    </Badge>
  );
}

export function SeverityBadge({ severity, className }: { severity: Severity | string; className?: string }) {
  const s = severity.toUpperCase();
  const t =
    s === "HIGH" ? TONES.critical
      : s === "MEDIUM" ? TONES.warning
        : TONES.info;
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-semibold tracking-wide", t.cls, className)}>
      {dot(t.dot)}
      {s}
    </Badge>
  );
}

export function RiskBadge({ risk, className }: { risk: RiskLevel | string; className?: string }) {
  const r = risk.toUpperCase();
  const t =
    r === "HIGH" ? TONES.critical
      : r === "MEDIUM" ? TONES.warning
        : TONES.success;
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-medium", t.cls, className)}>
      {dot(t.dot)}
      {r.charAt(0) + r.slice(1).toLowerCase()} risk
    </Badge>
  );
}

export function IncidentStatusBadge({ status, className }: { status: IncidentStatus | string; className?: string }) {
  const s = status.toUpperCase();
  const map: Record<string, { t: Tone; label: string; pulse?: boolean }> = {
    INVESTIGATING: { t: "info", label: "Investigating", pulse: true },
    AWAITING_APPROVAL: { t: "accent", label: "Awaiting approval" },
    REMEDIATING: { t: "warning", label: "Remediating" },
    MONITORING: { t: "info", label: "Monitoring", pulse: true },
    RESOLVED: { t: "success", label: "Resolved" },
  };
  const m = map[s];
  const t = m ? TONES[m.t] : TONES.neutral;
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-medium", t.cls, className)}>
      {m?.pulse ? <span className={cn("inline-block size-1.5 rounded-full cine-pulse", t.dot)} aria-hidden /> : dot(t.dot)}
      {m?.label ?? s}
    </Badge>
  );
}

export function DemoTag({ label = "Demo data", className }: { label?: string; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("border-[#FEDF89] bg-[#FFFAEB] font-medium text-[#B54708]", className)}
    >
      {label}
    </Badge>
  );
}
