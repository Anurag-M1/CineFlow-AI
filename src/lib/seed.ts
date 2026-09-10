// CineFlow AI — deterministic demo seed data.
// All values are designed so the render-delay scenario reproduces exactly:
// 4 workers (1 degraded after render-worker v2.4.1 deploy 35m ago), queue 187 (+42% vs 131 baseline),
// p95 latency 4200ms, GPU 91%, historical INC-1039 with the same pattern.
// Re-seed anytime via POST /api/demo/reset.

import { db } from "@/lib/db";

const mins = (n: number) => new Date(Date.now() - n * 60 * 1000);
const hours = (n: number) => new Date(Date.now() - n * 60 * 60 * 1000);
const days = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

function wf(
  key: string,
  name: string,
  phase: string,
  description: string,
  health: string,
  stage: string,
  activeJobs: number,
  latencyMs: number,
  failureRate: number,
  queueDepth: number,
  throughputPerMin: number,
  sortOrder: number,
  updatedMinsAgo = 2
) {
  return {
    key, name, phase, description, health, stage,
    activeJobs, latencyMs, failureRate, queueDepth, throughputPerMin,
    lastUpdate: mins(updatedMinsAgo), sortOrder,
  };
}

const WORKFLOWS = [
  // PRE-PRODUCTION (5)
  wf("script-intake", "Script Intake & Analysis", "PRE_PRODUCTION", "AI-assisted script breakdown, scene tagging and coverage checks.", "HEALTHY", "Scene 42 breakdown", 6, 310, 0.2, 0, 22, 10),
  wf("budget-analysis", "Budget Analysis", "PRE_PRODUCTION", "Line-item budget forecasting against shot complexity models.", "HEALTHY", "Week 6 forecast", 3, 540, 0.0, 0, 9, 11),
  wf("casting-coordination", "Casting Coordination", "PRE_PRODUCTION", "Talent availability matching and callback scheduling.", "HEALTHY", "Supporting roles", 4, 220, 0.0, 0, 14, 12),
  wf("location-scouting", "Location Scouting", "PRE_PRODUCTION", "Location photo tagging and logistics scoring.", "HEALTHY", "Night exteriors", 2, 480, 0.1, 0, 7, 13),
  wf("storyboard-generation", "Storyboard Generation", "PRE_PRODUCTION", "AI storyboard drafts from script beats.", "HEALTHY", "Act 3 sequences", 5, 1900, 0.4, 0, 31, 14),
  // PRODUCTION (5)
  wf("dailies-ingest", "Dailies Ingest", "PRODUCTION", "Camera-original ingest, checksum verification and proxy renders.", "HEALTHY", "Day 24 dailies", 11, 620, 0.1, 3, 48, 20),
  wf("onset-ai-logging", "On-Set AI Logging", "PRODUCTION", "Real-time take logging with speech-to-text and scene detection.", "HEALTHY", "Unit A + B", 8, 140, 0.0, 0, 96, 21),
  wf("continuity-checks", "Continuity Checks", "PRODUCTION", "Cross-take continuity comparison on props, wardrobe and blocking.", "HEALTHY", "Cafe sequence", 4, 900, 0.2, 0, 12, 22),
  wf("rushes-qc", "Rushes QC", "PRODUCTION", "Automated QC gates for exposure, focus and audio levels.", "HEALTHY", "Roll 61-68", 7, 400, 0.3, 2, 26, 23),
  wf("shot-metadata-sync", "Shot Metadata Sync", "PRODUCTION", "Camera metadata normalization into the production taxonomy.", "HEALTHY", "ALE/EDL sync", 3, 260, 0.0, 0, 55, 24),
  // POST-PRODUCTION (9)
  wf("rendering", "Rendering", "POST_PRODUCTION", "GPU render farm for VFX comps, lighting passes and final frames.", "WARNING", "Final VFX renders", 38, 4200, 2.1, 187, 42, 30, 1),
  wf("asset-processing", "Asset Processing", "POST_PRODUCTION", "Media asset normalization, transcoding and versioning.", "WARNING", "Asset normalization", 12, 640, 0.8, 14, 33, 31, 1),
  wf("subtitle-pipeline", "Subtitle Pipeline", "POST_PRODUCTION", "Transcription, timing and localization subtitling.", "HEALTHY", "Ep 1-8 timing", 9, 380, 0.0, 0, 61, 32),
  wf("color-grading", "Color Grading", "POST_PRODUCTION", "Dailies and final color with shot-match automation.", "HEALTHY", "Reel 4 final", 6, 1100, 0.1, 5, 18, 33),
  wf("vfx-compositing", "VFX Compositing", "POST_PRODUCTION", "Comp assembly, rotoscoping and paint-out automation.", "HEALTHY", "Seq 114 comps", 14, 2300, 0.6, 21, 16, 34),
  wf("audio-mixing", "Audio Mixing", "POST_PRODUCTION", "Stem mixing, loudness normalization and dialogue cleanup.", "HEALTHY", "M&E stems", 5, 700, 0.2, 4, 13, 35),
  wf("trailer-assembly", "Trailer Assembly", "POST_PRODUCTION", "AI-assisted trailer cuts from approved selects.", "HEALTHY", "Teaser v3", 4, 1600, 0.3, 2, 8, 36),
  wf("compliance-review", "Compliance Review", "POST_PRODUCTION", "Rating-board pre-checks on content flags.", "HEALTHY", "Territory checks", 2, 300, 0.0, 0, 11, 37),
  wf("master-qc", "Master QC", "POST_PRODUCTION", "Final master quality gates before distribution handoff.", "HEALTHY", "DCP spot checks", 3, 900, 0.1, 1, 6, 38),
  // DISTRIBUTION (5)
  wf("content-delivery", "Content Delivery", "DISTRIBUTION", "Global CDN delivery of masters, trailers and promos.", "HEALTHY", "Territory rollout", 9, 240, 0.2, 0, 130, 40),
  wf("qc-packaging", "QC Packaging", "DISTRIBUTION", "Package validation for DCP/IMF and platform specs.", "HEALTHY", "IMF app 2", 5, 500, 0.1, 3, 19, 41),
  wf("metadata-publishing", "Metadata Publishing", "DISTRIBUTION", "Artwork, synopsis and credits publishing to platforms.", "HEALTHY", "Artwork set B", 6, 180, 0.0, 0, 44, 42),
  wf("localization", "Localization", "DISTRIBUTION", "Dubbing, subtitle localization and cultural QC.", "HEALTHY", "18 territories", 8, 640, 0.2, 6, 27, 43),
  wf("archive-storage", "Archive & Storage", "DISTRIBUTION", "LTO archival and cold storage replication.", "HEALTHY", "Nightly replication", 2, 1200, 0.4, 0, 5, 44),
];

const METRICS = [
  {
    key: "renderWorkers", name: "Render Workers", category: "COMPUTE",
    description: "Active GPU render workers in the farm (target 6 for current load).",
    value: 4, unit: "workers", status: "WARNING", warnAbove: 6, critAbove: 3, targetValue: 6,
    badDirection: "below", history: JSON.stringify([6, 6, 6, 6, 6, 4, 4, 4, 4, 4, 4, 4]),
  },
  {
    key: "gpuUtil", name: "GPU Utilization", category: "COMPUTE",
    description: "Average GPU utilization across the render fleet.",
    value: 91, unit: "%", status: "CRITICAL", warnAbove: 75, critAbove: 85, targetValue: 60,
    badDirection: "above", history: JSON.stringify([58, 60, 57, 61, 59, 74, 82, 86, 89, 90, 91, 91]),
  },
  {
    key: "queueDepth", name: "Queue Depth", category: "QUEUE",
    description: "Render jobs waiting in the dispatch queue.",
    value: 187, unit: "jobs", status: "CRITICAL", warnAbove: 120, critAbove: 150, targetValue: 80,
    badDirection: "above", history: JSON.stringify([96, 99, 102, 100, 105, 131, 142, 151, 164, 172, 181, 187]),
  },
  {
    key: "processingLatency", name: "Processing Latency", category: "QUEUE",
    description: "Render queue p95 processing latency.",
    value: 4200, unit: "ms", status: "CRITICAL", warnAbove: 2500, critAbove: 3500, targetValue: 1500,
    badDirection: "above", history: JSON.stringify([1250, 1310, 1280, 1340, 1300, 2210, 2840, 3260, 3620, 3900, 4080, 4200]),
  },
  {
    key: "apiErrors", name: "API Errors", category: "RELIABILITY",
    description: "Production API 5xx error rate.",
    value: 0.4, unit: "%", status: "HEALTHY", warnAbove: 1, critAbove: 3, targetValue: 0.1,
    badDirection: "above", history: JSON.stringify([0.2, 0.3, 0.2, 0.4, 0.3, 0.2, 0.3, 0.5, 0.4, 0.3, 0.4, 0.4]),
  },
  {
    key: "storageUsed", name: "Storage", category: "STORAGE",
    description: "Shared production storage utilization.",
    value: 62, unit: "%", status: "HEALTHY", warnAbove: 75, critAbove: 90, targetValue: null,
    badDirection: "above", history: JSON.stringify([55, 56, 57, 58, 58, 59, 60, 60, 61, 61, 62, 62]),
  },
  {
    key: "workflowFailures", name: "Workflow Failures", category: "RELIABILITY",
    description: "Failed workflow runs across all pipelines (24h rolling).",
    value: 2.1, unit: "%", status: "WARNING", warnAbove: 1.5, critAbove: 4, targetValue: 0.5,
    badDirection: "above", history: JSON.stringify([0.6, 0.5, 0.7, 0.6, 0.6, 1.2, 1.8, 1.9, 2.0, 2.1, 2.1, 2.1]),
  },
  {
    key: "availability", name: "Service Availability", category: "RELIABILITY",
    description: "Platform availability across production services (30d).",
    value: 99.8, unit: "%", status: "HEALTHY", warnAbove: 99.5, critAbove: 99.0, targetValue: 99.9,
    badDirection: "below", history: JSON.stringify([99.9, 99.9, 99.8, 99.9, 99.8, 99.9, 99.8, 99.9, 99.9, 99.8, 99.8, 99.8]),
  },
  {
    key: "renderThroughput", name: "Render Throughput", category: "QUEUE",
    description: "Completed render jobs per minute.",
    value: 42, unit: "jobs/min", status: "WARNING", warnAbove: 55, critAbove: 40, targetValue: 70,
    badDirection: "below", history: JSON.stringify([68, 71, 69, 70, 66, 54, 49, 46, 44, 43, 42, 42]),
  },
];

const INCIDENTS = [
  {
    id: "INC-1042", title: "Render Queue Delay", description: "Post-production render queue processing latency breached SLO (p95 4.2s vs 2.5s target). Queue depth climbing; final VFX renders at risk of missing the delivery milestone.",
    severity: "HIGH", service: "Post Production", workflowKey: "rendering", status: "INVESTIGATING",
    detectedAt: mins(12), agentConfidence: null, rootCause: null, resolutionNote: null,
    events: [
      { ts: mins(12), kind: "ANOMALY", label: "Latency anomaly detected", detail: "Render queue p95 latency exceeded 3.5s threshold (SLO 2.5s)." },
      { ts: mins(11), kind: "NOTE", label: "Alert routed to CineFlow Agent", detail: "Auto-triage policy matched workflow 'Rendering'." },
    ],
  },
  {
    id: "INC-1043", title: "CDN Cache Miss Spike", description: "Content delivery cache miss rate elevated (18% vs 6% baseline) for the trailer rollout in EU territories.",
    severity: "MEDIUM", service: "Distribution", workflowKey: "content-delivery", status: "INVESTIGATING",
    detectedAt: mins(47), agentConfidence: 64, rootCause: "Cache warmer restart loop after config sync", resolutionNote: null,
    events: [
      { ts: mins(47), kind: "ANOMALY", label: "Cache miss rate spike", detail: "EU edge cache miss 18% (baseline 6%)." },
      { ts: mins(45), kind: "AGENT", label: "Agent triage completed", detail: "Correlated with cache warmer restart loop. Recommendation pending approval." },
    ],
  },
  {
    id: "INC-1044", title: "Storage Replication Lag", description: "Archive storage replication to the secondary region lagging 26 minutes behind schedule during nightly archival window.",
    severity: "LOW", service: "Distribution", workflowKey: "archive-storage", status: "MONITORING",
    detectedAt: hours(2), agentConfidence: 71, rootCause: "Bandwidth contention with LTO verification jobs", resolutionNote: null,
    events: [
      { ts: hours(2), kind: "ANOMALY", label: "Replication lag detected", detail: "Secondary region 26 min behind primary." },
      { ts: hours(1), kind: "AGENT", label: "Agent assessment", detail: "Non-critical lag; bandwidth contention with LTO verification. Monitoring." },
    ],
  },
  {
    id: "INC-1041", title: "Asset Processing Latency", description: "Media asset normalization latency spiked to 2.1s during a large ingest batch.",
    severity: "MEDIUM", service: "Post Production", workflowKey: "asset-processing", status: "RESOLVED",
    detectedAt: hours(5), resolvedAt: hours(3), agentConfidence: 82,
    rootCause: "Cache eviction storm during bulk ingest of dailies rolls 61-68",
    resolutionNote: "Cache warmer policy adjusted; latency back to 640ms. Residual elevated latency under monitoring.",
    events: [
      { ts: hours(5), kind: "ANOMALY", label: "Latency spike detected", detail: "Asset processing p95 2.1s." },
      { ts: hours(4), kind: "ROOT_CAUSE", label: "Root cause identified", detail: "Cache eviction storm during bulk ingest." },
      { ts: hours(3), kind: "VERIFICATION", label: "Recovery verified", detail: "p95 latency back to 640ms." },
    ],
  },
  {
    id: "INC-1040", title: "Subtitle Pipeline Failure", description: "Subtitle timing job for episodes 7-8 failed on malformed timecode in the source SCF.",
    severity: "LOW", service: "Post Production", workflowKey: "subtitle-pipeline", status: "RESOLVED",
    detectedAt: days(1), resolvedAt: days(1), agentConfidence: 93,
    rootCause: "Malformed timecode in episode 7 source file (frame 41,802)",
    resolutionNote: "Source timecode repaired and jobs re-queued; pipeline green.",
    events: [
      { ts: days(1), kind: "ANOMALY", label: "Pipeline job failure", detail: "Subtitle timing job SUB-2201 failed." },
      { ts: days(1), kind: "VERIFICATION", label: "Recovery verified", detail: "Re-queued jobs completed." },
    ],
  },
  {
    id: "INC-1039", title: "Render Queue Backlog", description: "Render queue backed up 210 jobs during batch VFX import; workers saturated at 96% GPU.",
    severity: "HIGH", service: "Post Production", workflowKey: "rendering", status: "RESOLVED",
    detectedAt: days(14), resolvedAt: days(14), agentConfidence: 91,
    rootCause: "Insufficient render workers during batch VFX import (4 workers for 2.1x normal load)",
    resolutionNote: "Render workers scaled 4 → 6; queue drained within 18 minutes and latency normalized.",
    events: [
      { ts: days(14), kind: "ANOMALY", label: "Queue backlog detected", detail: "Queue depth 210 jobs." },
      { ts: days(14), kind: "ACTION", label: "Workers scaled 4 → 6", detail: "Approved by production ops lead." },
      { ts: days(14), kind: "VERIFICATION", label: "Recovery verified", detail: "Queue drained; p95 latency 1.2s." },
    ],
  },
  {
    id: "INC-1038", title: "GPU Thermal Throttling", description: "Render node RENDER-07 throttled to 71% clock after cooling fan degradation.",
    severity: "MEDIUM", service: "Post Production", workflowKey: "rendering", status: "RESOLVED",
    detectedAt: days(21), resolvedAt: days(21), agentConfidence: 88,
    rootCause: "Cooling fan degradation on RENDER-07", resolutionNote: "Node replaced under warranty.",
    events: [{ ts: days(21), kind: "ANOMALY", label: "Thermal throttling detected", detail: "RENDER-07 clock reduced to 71%." }],
  },
];

const DEPLOYMENTS = [
  { service: "render-worker", version: "v2.4.1", description: "Render worker fleet update — new frame-cache eviction policy.", deployedAt: mins(35) },
  { service: "asset-processor", version: "v1.9.4", description: "Asset processing cache warmer policy fix (INC-1041).", deployedAt: hours(3) },
  { service: "subtitle-pipeline", version: "v3.2.0", description: "Timecode parser hardening (INC-1040).", deployedAt: days(1) },
  { service: "content-delivery", version: "v5.0.7", description: "EU edge configuration sync.", deployedAt: days(2) },
];

const LOGS = [
  // Healthy baseline (pre-deployment)
  { service: "render-queue", level: "INFO", message: "queue depth 96; p95 latency 1.31s; 4/4 workers healthy", ts: hours(2) },
  { service: "render-queue", level: "INFO", message: "nightly batch import complete (1,204 frames queued)", ts: hours(1) },
  // Deployment and degradation sequence
  { service: "render-queue", level: "INFO", message: "deploy complete: render-worker v2.4.1; 4/4 workers registered", ts: mins(35) },
  { service: "render-worker", level: "INFO", message: "worker-02 applying frame-cache eviction policy v2", ts: mins(34) },
  { service: "render-worker", level: "WARN", message: "worker-02 frame-cache eviction rate 94% (expected <30%)", ts: mins(33) },
  { service: "render-worker", level: "WARN", message: "worker-02 render throughput degraded 38% vs fleet median", ts: mins(32) },
  { service: "render-queue", level: "WARN", message: "queue depth rising: 132 (threshold 120)", ts: mins(30) },
  { service: "render-worker", level: "WARN", message: "worker-02 health probe: degraded (response latency 8.2s)", ts: mins(26) },
  { service: "render-queue", level: "ERROR", message: "dispatch backlog: 168 jobs waiting; oldest job age 6m12s", ts: mins(20) },
  { service: "render-queue", level: "WARN", message: "queue depth 182; p95 latency 4.1s", ts: mins(15) },
  { service: "render-queue", level: "ERROR", message: "SLO breach: render queue p95 latency 4.2s (SLO 2.5s)", ts: mins(12) },
  { service: "render-queue", level: "INFO", message: "CineFlow Agent investigation triggered for INC-1042", ts: mins(9) },
  // Other services (context)
  { service: "asset-processor", level: "INFO", message: "cache warmer policy v1.9.4 stable; p95 640ms", ts: mins(28) },
  { service: "content-delivery", level: "WARN", message: "EU edge cache miss 18% (baseline 6%); warmer restart loop detected", ts: mins(44) },
  { service: "archive-storage", level: "INFO", message: "replication lag 26m; LTO verification window active", ts: hours(2) },
];

const SYSTEM_STATE = [
  { key: "healthyRenderWorkers", value: "3" },
  { key: "degradedWorkers", value: "1" },
  { key: "degradedWorkerDetail", value: "worker-02: frame-cache eviction rate 94% after v2.4.1 rollout" },
  { key: "baselineQueueDepth", value: "131" },
  { key: "baselineLatencyMs", value: "1310" },
  { key: "remediationApplied", value: "false" },
  { key: "remediationAppliedAt", value: "" },
];

const SEED_RUNS = [
  {
    query: "Why is asset processing latency high?", intent: "free_form", status: "COMPLETED", mode: "DEMO",
    incidentId: "INC-1041", confidence: 82, createdAt: hours(4), completedAt: hours(4),
    summary: "Cache eviction storm during bulk ingest of dailies rolls 61-68. Warmer policy adjusted; latency recovered to 640ms.",
  },
  {
    query: "Summarize current production status", intent: "status_summary", status: "COMPLETED", mode: "DEMO",
    incidentId: null, confidence: null, createdAt: hours(1), completedAt: hours(1),
    summary: "23/24 workflows nominal. Rendering degraded (queue 187, p95 4.2s) — INC-1042 investigating. 3 active incidents, 1 critical.",
  },
];

const SEED_RECOMMENDATIONS = [
  {
    incidentId: "INC-1043", agentRunId: null, title: "Restart content-delivery cache warmer",
    problem: "EU edge cache miss rate at 18% vs 6% baseline during trailer rollout.",
    evidence: JSON.stringify([
      { label: "Cache miss rate (EU edge)", value: "18% (baseline 6%)", source: "content-delivery metrics" },
      { label: "Warmer restart loop", value: "5 restarts in 40 minutes", source: "content-delivery logs" },
      { label: "Correlated change", value: "content-delivery v5.0.7 config sync (2d ago)", source: "deployment events" },
    ]),
    analysis: "Cache warmer entered a restart loop after the v5.0.7 EU config sync; edge nodes are serving from origin, driving miss rate to 18%. A non-critical service restart re-registers the warmer with valid config.",
    rootCause: "Cache warmer restart loop after EU edge configuration sync",
    actionType: "RESTART_CACHE_WARMER", actionLabel: "Restart content-delivery cache warmer (non-critical demo service)",
    actionParams: JSON.stringify({ service: "content-delivery-cache-warmer" }),
    confidence: 64, risk: "MEDIUM", status: "PENDING",
  },
];

export async function seedDatabase() {
  // Wipe (order matters for FKs)
  await db.agentRunStep.deleteMany();
  await db.agentRun.deleteMany();
  await db.recommendation.deleteMany();
  await db.incidentEvent.deleteMany();
  await db.incident.deleteMany();
  await db.workflow.deleteMany();
  await db.metric.deleteMany();
  await db.systemState.deleteMany();
  await db.deployment.deleteMany();
  await db.logEntry.deleteMany();
  await db.demoScenario.deleteMany();

  await db.workflow.createMany({ data: WORKFLOWS });
  await db.metric.createMany({ data: METRICS.map((m) => ({ ...m, updatedAt: new Date() })) });
  await db.systemState.createMany({ data: SYSTEM_STATE.map((s) => ({ ...s, updatedAt: new Date() })) });
  await db.deployment.createMany({ data: DEPLOYMENTS });
  await db.logEntry.createMany({ data: LOGS });
  await db.agentRun.createMany({ data: SEED_RUNS });
  await db.recommendation.createMany({ data: SEED_RECOMMENDATIONS.map((r) => ({ ...r, createdAt: mins(40) })) });

  for (const inc of INCIDENTS) {
    await db.incident.create({
      data: {
        id: inc.id, title: inc.title, description: inc.description, severity: inc.severity,
        service: inc.service, workflowKey: inc.workflowKey, status: inc.status,
        detectedAt: inc.detectedAt, resolvedAt: inc.resolvedAt ?? null,
        agentConfidence: inc.agentConfidence ?? null, rootCause: inc.rootCause ?? null,
        resolutionNote: inc.resolutionNote ?? null,
        events: { create: inc.events },
      },
    });
  }

  await db.demoScenario.create({
    data: { id: "render_delay", status: "IDLE", runCount: 0, lastRunId: null },
  });
}

let seedPromise: Promise<void> | null = null;

/** Seeds once if the database is empty. Cheap check; safe to call from any GET route. */
export async function ensureSeeded() {
  const count = await db.incident.count();
  if (count > 0) return;
  if (!seedPromise) {
    seedPromise = seedDatabase().finally(() => {
      seedPromise = null;
    });
  }
  await seedPromise;
}
