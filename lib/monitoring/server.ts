import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_RULES, METRICS, ruleKind, type MetricId } from "./catalog";
import { dayKey } from "./days";
import { selfCheckSamples } from "./selfCheckSamples";
import {
  awaitingReading,
  dailySeries,
  evaluateRules,
  missingStatus,
  planAlertChanges,
  RESOLVE_COOLDOWN_HOURS,
  trendOf,
  type ActiveAlert,
  type Level,
  type Rule,
  type Sample,
} from "./engine";

const DAY = 86_400_000;

let rulesReady: Promise<unknown> | null = null;

/** Creates any default rule that isn't in the database yet; edited rules are left alone. */
export function ensureRules() {
  rulesReady ??= prisma.alertRule
    .createMany({ data: DEFAULT_RULES.map((r) => ({ ...r, enabled: true })), skipDuplicates: true })
    .catch((err) => {
      rulesReady = null;
      throw err;
    });
  return rulesReady;
}

export async function loadRules(): Promise<Rule[]> {
  await ensureRules();
  const rows = await prisma.alertRule.findMany({ orderBy: [{ metric: "asc" }, { id: "asc" }] });
  return rows.map((r) => ({ ...r, metric: r.metric as MetricId, kind: ruleKind(r.id, r.kind), comparator: r.comparator as Rule["comparator"] }));
}

/** Logged metric samples plus heart rate and dose from the wearable, for the last `days` days. */
async function loadSamples(db: Prisma.TransactionClient, userId: string, days: number, now: number): Promise<Sample[]> {
  const sinceDay = dayKey(now - days * DAY);
  const since = new Date(sinceDay);
  const [logged, vitals, checks] = await Promise.all([
    db.metricSample.findMany({
      where: { userId, recordedAt: { gte: since } },
      select: { id: true, metric: true, value: true, recordedAt: true, source: true },
    }),
    db.biometricRecord.findMany({
      where: { userId, timestamp: { gte: since } },
      select: { heartRate: true, radiation: true, timestamp: true },
    }),
    db.healthReport.findMany({
      where: {
        userId, kind: "SELF_CHECK",
        // The key has always been the capture timestamp, even in legacy queued reports.
        key: { gte: String(since.getTime()), lte: String(now) },
      },
      select: { key: true, data: true },
    }),
  ]);
  const out = selfCheckSamples(checks
    .map((check) => ({ at: Number(check.key), data: check.data }))
    .filter(({ at }) => Number.isFinite(at) && at >= since.getTime() && at <= now));
  const checkDays = new Set(out.map((s) => `${s.metric}:${dayKey(s.at)}`));
  for (const s of logged) {
    // Original fluid samples were derived from the same reports, using upload time.
    if (s.metric === "hydration" && s.source === "self-report") continue;
    const at = s.recordedAt.getTime();
    // A day's routine log can sync after midnight. Its key still identifies the correct day.
    const logDay = s.source === "log" ? s.id.split(":").at(-1) : undefined;
    const day = logDay && /^\d{4}-\d{2}-\d{2}$/.test(logDay) ? logDay : dayKey(at);
    if (!checkDays.has(`${s.metric}:${day}`)) {
      const sampleAt = day === dayKey(at) ? at : Date.parse(day) + DAY - 1;
      out.push({ metric: s.metric as MetricId, value: s.value, at: sampleAt });
    }
  }
  for (const v of vitals) {
    const at = v.timestamp.getTime();
    out.push({ metric: "pulse", value: v.heartRate, at });
    if (v.radiation != null) out.push({ metric: "radiation", value: v.radiation * 24, at });
  }
  return out;
}

/** Applies what the rules say now to the stored alerts and returns the open ones. */
async function syncAlerts(db: Prisma.TransactionClient, userId: string, rules: Rule[], samples: Sample[], now: number) {
  const firings = evaluateRules(rules, samples, now);
  const active = await db.alert.findMany({
    where: { userId, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
    select: { id: true, ruleId: true, level: true, status: true, value: true, threshold: true, explanation: true },
  });
  const quiet = await db.alert.findMany({
    where: {
      userId,
      status: "RESOLVED",
      resolvedAt: { gte: new Date(now - RESOLVE_COOLDOWN_HOURS * 3_600_000) },
      NOT: { resolvedBy: "Monitoring (auto)" },
    },
    select: { ruleId: true },
  });
  const changes = planAlertChanges(active as ActiveAlert[], firings, quiet.map((q) => q.ruleId), awaitingReading(rules, samples, now));
  for (const c of changes) {
    if (c.type === "open") {
      await db.alert.create({
        data: {
          userId,
          ruleId: c.firing.ruleId,
          metric: c.firing.metric,
          level: c.firing.level,
          value: c.firing.value,
          threshold: c.firing.threshold,
          explanation: c.firing.explanation,
          notes: { create: { authorName: "Monitoring", authorRole: "SYSTEM", action: "opened", text: c.firing.explanation } },
        },
      });
    } else if (c.type === "update") {
      const current = active.find((a) => a.id === c.alertId);
      if (current?.level === c.firing.level && current.value === c.firing.value &&
          current.threshold === c.firing.threshold && current.explanation === c.firing.explanation) continue;
      const data: Prisma.AlertUpdateInput = {
        level: c.firing.level,
        value: c.firing.value,
        threshold: c.firing.threshold,
        explanation: c.firing.explanation,
      };
      if (c.escalated) {
        // Amber → red re-opens an acknowledged alert so someone looks again.
        data.status = "OPEN";
        data.acknowledgedAt = null;
        data.acknowledgedBy = null;
        data.notes = { create: { authorName: "Monitoring", authorRole: "SYSTEM", action: "escalated", text: `Escalated to red. ${c.firing.explanation}` } };
      }
      await db.alert.update({ where: { id: c.alertId, status: { not: "RESOLVED" } }, data });
    } else {
      await db.alert.update({
        where: { id: c.alertId, status: { not: "RESOLVED" } },
        data: {
          status: "RESOLVED",
          resolvedAt: new Date(now),
          resolvedBy: "Monitoring (auto)",
          notes: { create: { authorName: "Monitoring", authorRole: "SYSTEM", action: "auto-resolved", text: "Back within the rule's limits, or the rule was switched off." } },
        },
      });
    }
  }
}

function ruleLookback(rules: Rule[]) {
  return Math.max(30, ...rules.map((r) => r.windowDays * (r.kind === "trend" ? 2 : 1)));
}

async function refreshMonitoring(userId: string, rules: Rule[], days: number, now: number) {
  return prisma.$transaction(async (db) => {
    // Crew and oversight can poll the same account at once. Serialize alert transitions.
    await db.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR NO KEY UPDATE`;
    const samples = await loadSamples(db, userId, days, now);
    await syncAlerts(db, userId, rules, samples, now);
    return samples;
  }, { timeout: 15_000 });
}

export const ALERT_INCLUDE = {
  notes: { orderBy: { createdAt: "asc" as const }, select: { id: true, authorName: true, authorRole: true, action: true, text: true, createdAt: true } },
} satisfies Prisma.AlertInclude;

/** Everything a monitoring view needs for one crew member. */
export async function monitoringFor(userId: string, days: number, now = Date.now()) {
  const rules = await loadRules();
  const samples = await refreshMonitoring(userId, rules, Math.max(days * 2, ruleLookback(rules)), now);

  const metrics = METRICS.map((m) => {
    const trend = trendOf(samples, m.id, days, now);
    return {
      id: m.id,
      series: dailySeries(samples, m.id, days, now),
      missing: missingStatus(samples, m.id, now),
      trend,
    };
  });
  const alerts = await prisma.alert.findMany({
    where: { userId, OR: [{ status: { not: "RESOLVED" } }, { resolvedAt: { gte: new Date(now - 30 * DAY) } }] },
    orderBy: [{ status: "asc" }, { openedAt: "desc" }],
    include: ALERT_INCLUDE,
  });
  return { now, days, rules, metrics, alerts };
}

/** At-a-glance monitoring status for a group card: missing data and open alert counts. */
export async function monitoringSummary(userId: string, rules: Rule[], now = Date.now()) {
  const samples = await refreshMonitoring(userId, rules, ruleLookback(rules), now);
  const open = await prisma.alert.findMany({
    where: { userId, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
    select: { level: true, status: true, metric: true, explanation: true },
  });
  return {
    missing: Object.fromEntries(METRICS.map((m) => [m.id, missingStatus(samples, m.id, now).status])) as Record<MetricId, string>,
    alerts: {
      open: open.filter((a) => a.status === "OPEN").length,
      acknowledged: open.filter((a) => a.status === "ACKNOWLEDGED").length,
      worst: (open.some((a) => a.level === "RED") ? "RED" : open.length ? "YELLOW" : null) as Level | null,
    },
  };
}

/**
 * Mirrors sleep and exercise from a routine log into the monitoring series.
 * Daily Check metrics are read directly from the individual synced reports.
 */
export async function ingestRoutineLog(db: Prisma.TransactionClient, userId: string, key: string, data: unknown, recordedAt: Date) {
  const rows: { id: string; metric: MetricId; value: number }[] = [];
  // Synthetic crew get sleep and exercise from the generator; the console's default
  // wearable log would otherwise overwrite today's generated values.
  const synthetic = (await db.user.findUnique({ where: { id: userId }, select: { synthetic: true } }))?.synthetic;
  if (!synthetic && data && typeof data === "object") {
    const day = data as { exercise?: { minutes?: number }[]; sleepHours?: number };
    if (typeof day.sleepHours === "number") rows.push({ id: `${userId}:sleep:${key}`, metric: "sleep", value: day.sleepHours });
    if (Array.isArray(day.exercise)) {
      rows.push({ id: `${userId}:activity:${key}`, metric: "activity", value: day.exercise.reduce((a, s) => a + (Number(s.minutes) || 0), 0) });
    }
  }
  for (const r of rows) {
    const fields = { value: r.value, recordedAt };
    await db.metricSample.upsert({
      where: { id: r.id },
      update: fields,
      create: { id: r.id, userId, metric: r.metric, source: "log", ...fields },
    });
  }
}
