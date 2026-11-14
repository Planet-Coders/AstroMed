import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_RULES, METRICS, type MetricId } from "./catalog";
import {
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
  return rows.map((r) => ({ ...r, metric: r.metric as MetricId, kind: r.kind as Rule["kind"], comparator: r.comparator as Rule["comparator"] }));
}

/** Logged metric samples plus heart rate and dose from the wearable, for the last `days` days. */
export async function loadSamples(userId: string, days: number, now = Date.now()): Promise<Sample[]> {
  const since = new Date(now - days * DAY);
  const [logged, vitals] = await Promise.all([
    prisma.metricSample.findMany({
      where: { userId, recordedAt: { gte: since } },
      select: { metric: true, value: true, recordedAt: true },
    }),
    prisma.biometricRecord.findMany({
      where: { userId, timestamp: { gte: since } },
      select: { heartRate: true, radiation: true, timestamp: true },
    }),
  ]);
  const out: Sample[] = logged.map((s) => ({ metric: s.metric as MetricId, value: s.value, at: s.recordedAt.getTime() }));
  for (const v of vitals) {
    const at = v.timestamp.getTime();
    out.push({ metric: "pulse", value: v.heartRate, at });
    if (v.radiation != null) out.push({ metric: "radiation", value: v.radiation * 24, at });
  }
  return out;
}

/** Applies what the rules say now to the stored alerts and returns the open ones. */
export async function syncAlerts(userId: string, rules: Rule[], samples: Sample[], now = Date.now()) {
  const firings = evaluateRules(rules, samples, now);
  const active = await prisma.alert.findMany({
    where: { userId, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
    select: { id: true, ruleId: true, level: true, status: true },
  });
  const quiet = await prisma.alert.findMany({
    where: {
      userId,
      status: "RESOLVED",
      resolvedAt: { gte: new Date(now - RESOLVE_COOLDOWN_HOURS * 3_600_000) },
      NOT: { resolvedBy: "Monitoring (auto)" },
    },
    select: { ruleId: true },
  });
  const changes = planAlertChanges(active as ActiveAlert[], firings, quiet.map((q) => q.ruleId));
  for (const c of changes) {
    if (c.type === "open") {
      await prisma.alert.create({
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
      const data: Prisma.AlertUpdateInput = {
        level: c.firing.level,
        value: c.firing.value,
        threshold: c.firing.threshold,
        explanation: c.firing.explanation,
      };
      if (c.escalated) {
        // Amber → red re-opens an acknowledged alert so someone looks again.
        data.status = "OPEN";
        data.notes = { create: { authorName: "Monitoring", authorRole: "SYSTEM", action: "escalated", text: `Escalated to red. ${c.firing.explanation}` } };
      }
      await prisma.alert.update({ where: { id: c.alertId }, data });
    } else {
      await prisma.alert.update({
        where: { id: c.alertId },
        data: {
          status: "RESOLVED",
          resolvedAt: new Date(now),
          resolvedBy: "Monitoring (auto)",
          notes: { create: { authorName: "Monitoring", authorRole: "SYSTEM", action: "auto-resolved", text: "Back within the rule's limits, or the rule was switched off." } },
        },
      });
    }
  }
  return firings;
}

export const ALERT_INCLUDE = {
  notes: { orderBy: { createdAt: "asc" as const }, select: { id: true, authorName: true, authorRole: true, action: true, text: true, createdAt: true } },
} satisfies Prisma.AlertInclude;

/** Everything a monitoring view needs for one crew member. */
export async function monitoringFor(userId: string, days: number, now = Date.now()) {
  const rules = await loadRules();
  // Twice the range for trend comparison, and at least 30 days so rule windows have data.
  const samples = await loadSamples(userId, Math.max(days * 2, 30), now);
  await syncAlerts(userId, rules, samples, now);

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
  const samples = await loadSamples(userId, 30, now);
  await syncAlerts(userId, rules, samples, now);
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
 * Turns mirrored console logs into metric samples: a day's sleep and exercise from the
 * routine log, and fluid intake from the self-check's hydration step.
 */
export async function ingestHealthReport(userId: string, kind: string, key: string, data: unknown, recordedAt: Date) {
  const rows: { id: string; metric: MetricId; value: number; detail?: Prisma.InputJsonValue }[] = [];
  // Synthetic crew get sleep and exercise from the generator; the console's default
  // wearable log would otherwise overwrite today's generated values.
  const synthetic = kind === "ROUTINE" && (await prisma.user.findUnique({ where: { id: userId }, select: { synthetic: true } }))?.synthetic;
  if (kind === "ROUTINE" && !synthetic && data && typeof data === "object") {
    const day = data as { exercise?: { minutes?: number }[]; sleepHours?: number };
    if (typeof day.sleepHours === "number") rows.push({ id: `${userId}:sleep:${key}`, metric: "sleep", value: day.sleepHours });
    if (Array.isArray(day.exercise)) {
      rows.push({ id: `${userId}:activity:${key}`, metric: "activity", value: day.exercise.reduce((a, s) => a + (Number(s.minutes) || 0), 0) });
    }
  }
  if (kind === "SELF_CHECK" && data && typeof data === "object") {
    const v = (data as { values?: { fluidMl?: number | null; urineColor?: number | null } }).values;
    if (v && typeof v.fluidMl === "number") {
      rows.push({
        id: `${userId}:hydration:${recordedAt.toISOString().slice(0, 10)}`,
        metric: "hydration",
        value: v.fluidMl,
        detail: { urineColor: v.urineColor ?? null },
      });
    }
  }
  for (const r of rows) {
    const fields = { value: r.value, recordedAt, detail: r.detail };
    await prisma.metricSample.upsert({
      where: { id: r.id },
      update: fields,
      create: { id: r.id, userId, metric: r.metric, source: kind === "SELF_CHECK" ? "self-report" : "log", ...fields },
    });
  }
}
