"use client";

// CineFlow AI — shared UI primitives (light production-surface styling).
// Cards are white with #E4E7EC borders; semantic color appears only as small
// indicators. Typography: h1 28px/700, section 18px/600, body 14px.

import { useEffect } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge, TONES } from "@/components/app/shared/badges";
import { AlertTriangle, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Animated number (count-up / smooth re-target via framer-motion)
// ---------------------------------------------------------------------------

export function AnimatedNumber({
  value, format, duration = 0.7, className,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const mv = useMotionValue(0);
  const text = useTransform(mv, (latest) => (format ? format(latest) : String(Math.round(latest))));

  useEffect(() => {
    const controls = animate(mv, value, {
      duration: reduced ? 0 : duration,
      ease: [0.16, 1, 0.3, 1],
    });
    return () => controls.stop();
  }, [value, mv, duration, reduced]);

  return <motion.span className={className}>{text}</motion.span>;
}

// ---------------------------------------------------------------------------
// Metric card (dashboard KPI) — white surface, small semantic indicator
// ---------------------------------------------------------------------------

export function StatCard({
  label, value, sub, icon: Icon, tone = "default", status, onClick,
}: {
  label: string;
  value: string | number | React.ReactNode;
  sub?: string;
  icon: LucideIcon;
  tone?: "default" | "positive" | "warning" | "critical" | "accent";
  status?: string;
  onClick?: () => void;
}) {
  const valueCls = {
    default: "text-[#111827]",
    positive: "text-[#067647]",
    warning: "text-[#B54708]",
    critical: "text-[#B42318]",
    accent: "text-[#175CD3]",
  }[tone];
  const swatch =
    tone === "critical" ? TONES.critical
      : tone === "warning" ? TONES.warning
        : tone === "positive" ? TONES.success
          : tone === "accent" ? TONES.info
            : TONES.neutral;
  return (
    <Card
      className={cn(
        "border-[#E4E7EC] bg-card shadow-none",
        onClick && "cine-card-hover cursor-pointer"
      )}
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="mb-1.5 truncate text-[13px] font-medium text-[#667085]">{label}</p>
            <p className={cn("text-[28px] leading-8 font-semibold tabular-nums tracking-tight", valueCls)}>{value}</p>
            {sub ? <p className="mt-1.5 text-[13px] text-[#667085] truncate">{sub}</p> : null}
          </div>
          <div className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-md border",
            swatch.cls
          )}>
            <Icon className="size-4" aria-hidden />
          </div>
        </div>
        {status ? <div className="mt-3 flex items-center gap-2"><StatusBadge status={status} /></div> : null}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section header — 18px semibold with 14px supporting text
// ---------------------------------------------------------------------------

export function SectionHeader({
  title, subtitle, actions, className,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-[#111827]">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-sm text-[#667085]">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page header — 28px bold primary heading
// ---------------------------------------------------------------------------

export function PageHeader({
  title, description, actions, badge,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E4E7EC] pb-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[28px] leading-9 font-bold tracking-tight text-[#111827]">{title}</h1>
          {badge}
        </div>
        {description ? <p className="mt-1.5 max-w-2xl text-sm text-[#667085]">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sparkline (dependency-free SVG)
// ---------------------------------------------------------------------------

export function Sparkline({
  data, stroke = "#2563EB", height = 36, className, fill = true,
}: {
  data: number[];
  stroke?: string;
  height?: number;
  className?: string;
  fill?: boolean;
}) {
  if (!data || data.length < 2) return <div style={{ height }} className={className} />;
  const w = 120;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = height - 3 - ((v - min) / range) * (height - 6);
    return [x, y] as const;
  });
  const path = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${path} L${w},${height} L0,${height} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ height }} className={cn("w-full", className)} aria-hidden>
      {fill ? <path d={area} fill={stroke} fillOpacity={0.08} /> : null}
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2" fill={stroke} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Confidence meter — solid semantic tone, no gradient
// ---------------------------------------------------------------------------

export function ConfidenceMeter({ value, className }: { value: number; className?: string }) {
  const tone =
    value >= 80
      ? "bg-[#12B76A]"
      : value >= 60
        ? "bg-[#F79009]"
        : "bg-[#F04438]";
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        className="h-1.5 w-24 overflow-hidden rounded-full bg-[#E4E7EC]"
        role="meter"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Agent confidence ${value} percent`}
      >
        <div className={cn("h-full rounded-full transition-all duration-700", tone)} style={{ width: `${value}%` }} />
      </div>
      <span className="font-mono text-[13px] tabular-nums text-[#344054]">{value}%</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty / error / loading states
// ---------------------------------------------------------------------------

export function EmptyState({
  title, description, action, icon: Icon = Inbox,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[#E4E7EC] bg-white px-6 py-12 text-center">
      <div className="flex size-10 items-center justify-center rounded-full border border-[#E4E7EC] bg-[#F9FAFB] text-[#667085]">
        <Icon className="size-5" aria-hidden />
      </div>
      <p className="mt-3 text-sm font-semibold text-[#111827]">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-[13px] text-[#667085]">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-[#FEE4E2] bg-[#FEF3F2] px-4 py-3">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#F04438]" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[#B42318]">Something went wrong</p>
        <p className="mt-0.5 break-words text-[13px] text-[#667085]">{message}</p>
      </div>
      {onRetry ? (
        <Button size="sm" variant="outline" onClick={onRetry} className="shrink-0">
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function LoadingRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-md" />
      ))}
    </div>
  );
}

export function LoadingCards({ cards = 4, className }: { cards?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-4", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: cards }).map((_, i) => (
        <Skeleton key={i} className="h-28 w-full rounded-lg" />
      ))}
    </div>
  );
}
