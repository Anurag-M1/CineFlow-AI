// CineFlow AI — runtime state helpers.
// Metrics are the source of truth for values; status is always recomputed from
// thresholds so the UI can never drift from the policy.

import { db } from "@/lib/db";
import type { Health } from "@/lib/types";

export function computeStatus(
  value: number,
  warn: number | null,
  crit: number | null,
  badDirection: string
): Health {
  const bad = (threshold: number) =>
    badDirection === "below" ? value < threshold : value > threshold;
  if (crit != null && bad(crit)) return "CRITICAL";
  if (warn != null && bad(warn)) return "WARNING";
  return "HEALTHY";
}

/** Sets a metric value, recomputes its status, and appends a history point. */
export async function setMetric(key: string, value: number, extra?: Partial<{ status: string; appendHistory: boolean }>) {
  const metric = await db.metric.findUnique({ where: { key } });
  if (!metric) return null;
  const history: number[] = metric.history ? JSON.parse(metric.history) : [];
  const append = extra?.appendHistory !== false;
  const nextHistory = append ? [...history, Math.round(value * 100) / 100].slice(-24) : history;
  const status = extra?.status ?? computeStatus(value, metric.warnAbove, metric.critAbove, metric.badDirection);
  const updated = await db.metric.update({
    where: { key },
    data: { value, status, history: JSON.stringify(nextHistory), updatedAt: new Date() },
  });
  return updated;
}

export async function setState(key: string, value: string) {
  await db.systemState.upsert({
    where: { key },
    update: { value, updatedAt: new Date() },
    create: { key, value },
  });
}

export async function getState(key: string): Promise<string | null> {
  const row = await db.systemState.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function getMetricMap() {
  const metrics = await db.metric.findMany();
  return Object.fromEntries(metrics.map((m) => [m.key, m]));
}

/** Recomputes every metric status from its current value (used after batch updates). */
export async function recomputeAllStatuses() {
  const metrics = await db.metric.findMany();
  for (const m of metrics) {
    const status = computeStatus(m.value, m.warnAbove, m.critAbove, m.badDirection);
    if (status !== m.status) {
      await db.metric.update({ where: { key: m.key }, data: { status, updatedAt: new Date() } });
    }
  }
}

/** Adds an incident timeline event. */
export async function addIncidentEvent(
  incidentId: string,
  kind: string,
  label: string,
  detail?: string
) {
  if (!incidentId) return;
  const exists = await db.incident.findUnique({ where: { id: incidentId } });
  if (!exists) return;
  await db.incidentEvent.create({
    data: { incidentId, kind, label, detail: detail ?? null, ts: new Date() },
  });
}
