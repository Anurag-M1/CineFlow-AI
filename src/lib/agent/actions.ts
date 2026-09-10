// CineFlow AI — Action executors + recovery verification.
// Actions mutate ONLY local demo-database state (labeled demo environment).
// In production these would call Google Cloud APIs (documented per action).

import { db } from "@/lib/db";
import { setMetric, setState, addIncidentEvent } from "@/lib/agent/state";
import type { VerificationResult } from "@/lib/types";

export interface ActionResult {
  actionType: string;
  executed: boolean;
  demoEnvironment: true;
  label: string;
  before: Record<string, number | string>;
  after: Record<string, number | string>;
  productionNote: string;
  executedAt: string;
}

// ---------------------------------------------------------------------------
// SCALE_RENDER_WORKERS (MEDIUM risk — approval gated)
// Production mapping: Google Cloud Batch / GKE node pool resize / Vertex AI
// render fleet autoscaler via the Agent Builder tool contract.
// ---------------------------------------------------------------------------

async function scaleRenderWorkers(from: number, to: number, incidentId: string | null): Promise<ActionResult> {
  const gpuUtil = to > 0 ? Math.round((91 * 4) / to) : 91; // same load spread across more workers
  const queue = to >= 6 ? 54 : 187;
  const latency = to >= 6 ? 1180 : 4200;
  const throughput = to >= 6 ? 71 : 42;
  const failures = to >= 6 ? 0.6 : 2.1;

  const before = {
    renderWorkers: from,
    queueDepth: 187,
    processingLatencyMs: 4200,
    gpuUtilization: 91,
    throughputPerMin: 42,
  };
  const after = {
    renderWorkers: to,
    queueDepth: queue,
    processingLatencyMs: latency,
    gpuUtilization: gpuUtil,
    throughputPerMin: throughput,
  };

  await Promise.all([
    setMetric("renderWorkers", to),
    setMetric("queueDepth", queue),
    setMetric("processingLatency", latency),
    setMetric("gpuUtil", gpuUtil),
    setMetric("renderThroughput", throughput),
    setMetric("workflowFailures", failures),
  ]);
  await setState("healthyRenderWorkers", String(to));
  await setState("degradedWorkers", "0");
  await setState("degradedWorkerDetail", "none — all workers healthy after fleet scale-out");
  await setState("remediationApplied", "true");
  await setState("remediationAppliedAt", new Date().toISOString());

  // The rendering workflow recovers
  await db.workflow.update({
    where: { key: "rendering" },
    data: {
      health: "HEALTHY",
      latencyMs: latency,
      queueDepth: queue,
      failureRate: 0.4,
      throughputPerMin: throughput,
      stage: "Final VFX renders (recovered)",
      lastUpdate: new Date(),
    },
  });

  if (incidentId) {
    await addIncidentEvent(
      incidentId,
      "ACTION",
      "Remediation executed — render workers scaled 4 → 6",
      "Demo environment: worker fleet scaled out; degraded worker-02 drained and replaced. Queue dispatch resumed at full capacity."
    );
  }

  return {
    actionType: "SCALE_RENDER_WORKERS",
    executed: true,
    demoEnvironment: true,
    label: `Render workers scaled from ${from} → ${to}`,
    before,
    after,
    productionNote:
      "Demo environment: state change applied to the local demo database. In production this maps to a Google Cloud render-fleet scale operation (GKE node pool / Batch jobs) executed through the same guarded tool interface.",
    executedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// RESTART_CACHE_WARMER (MEDIUM risk — approval gated)
// ---------------------------------------------------------------------------

async function restartCacheWarmer(incidentId: string | null): Promise<ActionResult> {
  const before = { cacheMissRate: 18, warmerRestarts: 5 };
  const after = { cacheMissRate: 6, warmerRestarts: 0 };

  await setMetric("apiErrors", 0.2);
  if (incidentId) {
    await addIncidentEvent(
      incidentId,
      "ACTION",
      "Cache warmer restarted with valid config",
      "Demo environment: content-delivery cache warmer re-registered with the v5.0.7 EU config; edge nodes repopulating."
    );
  }
  await db.workflow.update({
    where: { key: "content-delivery" },
    data: { health: "HEALTHY", latencyMs: 210, failureRate: 0.1, lastUpdate: new Date(), stage: "Territory rollout (recovered)" },
  });
  await setState("remediationApplied", "true");

  return {
    actionType: "RESTART_CACHE_WARMER",
    executed: true,
    demoEnvironment: true,
    label: "Cache warmer restarted (non-critical demo service)",
    before,
    after,
    productionNote:
      "Demo environment: simulated service restart applied to demo state. In production this maps to a Cloud Run service restart through the guarded tool interface.",
    executedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------

export async function executeAction(
  actionType: string,
  actionParams: Record<string, unknown>,
  ctx: { incidentId: string | null; recommendationId: string | null }
): Promise<ActionResult> {
  switch (actionType) {
    case "SCALE_RENDER_WORKERS": {
      const from = Number(actionParams.from ?? 4);
      const to = Number(actionParams.to ?? 6);
      return scaleRenderWorkers(from, to, ctx.incidentId);
    }
    case "RESTART_CACHE_WARMER":
      return restartCacheWarmer(ctx.incidentId);
    default:
      return {
        actionType,
        executed: false,
        demoEnvironment: true,
        label: "Blocked by guardrail policy",
        before: {},
        after: {},
        productionNote:
          "This action type is policy-blocked in the demo environment (high-risk / not implemented). No external action was taken.",
        executedAt: new Date().toISOString(),
      };
  }
}

// ---------------------------------------------------------------------------
// Recovery verification — re-checks real metric state against thresholds.
// ---------------------------------------------------------------------------

export async function verifyRecovery(
  incidentId: string | null,
  opts: { quiet?: boolean } = {}
): Promise<VerificationResult> {
  const incident = incidentId ? await db.incident.findUnique({ where: { id: incidentId } }) : null;

  // Content-delivery incidents verify against delivery signals
  if (incident?.workflowKey === "content-delivery") {
    const [apiErrors, delivery] = await Promise.all([
      db.metric.findUnique({ where: { key: "apiErrors" } }),
      db.workflow.findUnique({ where: { key: "content-delivery" } }),
    ]);
    const remediationApplied = (await db.systemState.findUnique({ where: { key: "remediationApplied" } }))?.value === "true";
    const cacheMissNow = remediationApplied ? 6 : 18;
    const checks: VerificationResult["checks"] = [
      {
        label: "EU edge cache miss rate",
        before: "18% (baseline 6%)",
        after: `${cacheMissNow}%`,
        threshold: "≤ 8%",
        passed: cacheMissNow <= 8,
      },
      {
        label: "Production API error rate",
        before: "0.4%",
        after: `${apiErrors?.value ?? "?"}%`,
        threshold: "≤ 1%",
        passed: (apiErrors?.value ?? 9) <= 1,
      },
      {
        label: "Content delivery workflow",
        before: "degraded latency",
        after: `${delivery?.latencyMs ?? "?"} ms p95`,
        threshold: "≤ 300 ms",
        passed: (delivery?.latencyMs ?? 999) <= 300,
      },
    ];
    const passed = checks.every((c) => c.passed);
    const verification: VerificationResult = {
      passed,
      checks,
      summary: passed
        ? "Cache miss rate returned to baseline; content delivery healthy."
        : "Cache miss rate still elevated — recovery not yet complete.",
      verifiedAt: new Date().toISOString(),
    };
    if (incidentId && !opts.quiet && passed) {
      await addIncidentEvent(incidentId, "VERIFICATION", "Recovery verified", verification.summary);
    }
    return verification;
  }

  // Default: render-pipeline verification
  const metrics = await db.metric.findMany({
    where: { key: { in: ["queueDepth", "processingLatency", "gpuUtil", "renderWorkers", "renderThroughput"] } },
  });
  const map = Object.fromEntries(metrics.map((m) => [m.key, m]));
  const remediationApplied = (await db.systemState.findUnique({ where: { key: "remediationApplied" } }))?.value === "true";

  const checks: VerificationResult["checks"] = [
    {
      label: "Queue depth",
      before: "187 jobs (crit > 150)",
      after: `${map.queueDepth?.value ?? "?"} jobs`,
      threshold: "≤ 120",
      passed: (map.queueDepth?.value ?? 999) <= 120,
    },
    {
      label: "p95 processing latency",
      before: "4200 ms (crit > 3500)",
      after: `${map.processingLatency?.value ?? "?"} ms`,
      threshold: "≤ 2500",
      passed: (map.processingLatency?.value ?? 9999) <= 2500,
    },
    {
      label: "GPU utilization",
      before: "91% (crit > 85)",
      after: `${map.gpuUtil?.value ?? "?"}%`,
      threshold: "≤ 85",
      passed: (map.gpuUtil?.value ?? 100) <= 85,
    },
    {
      label: "Render workers",
      before: "4 (1 degraded)",
      after: `${map.renderWorkers?.value ?? "?"} (target 6)`,
      threshold: "≥ 6",
      passed: (map.renderWorkers?.value ?? 0) >= 6,
    },
  ];

  const passed = checks.every((c) => c.passed);
  const verification: VerificationResult = {
    passed,
    checks,
    summary: passed
      ? "Queue latency returned to normal range; all monitored thresholds green."
      : remediationApplied
        ? "Metrics still outside normal range — remediation applied but recovery not yet complete."
        : "No remediation applied yet; metrics remain outside normal range.",
    verifiedAt: new Date().toISOString(),
  };

  if (incidentId && !opts.quiet && passed) {
    await addIncidentEvent(incidentId, "VERIFICATION", "Recovery verified", verification.summary);
  }
  return verification;
}
