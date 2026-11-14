import { METRIC, formatValue, type MetricId, type RuleDefault } from "./catalog";
import { dayKey } from "./days";

/**
 * Pure monitoring logic shared by the server, the dashboards and the unit tests: daily
 * series, missing-data status, trend summaries, rule evaluation and the alert lifecycle.
 * Nothing here touches the database or the clock; `now` is always passed in.
 */

export type Sample = { metric: MetricId; value: number; at: number; fromSelfCheck?: boolean };
export type Rule = RuleDefault & { metric: MetricId; enabled: boolean };

export type Level = "YELLOW" | "RED";

const DAY = 86_400_000;
const HOUR = 3_600_000;

export { dayKey } from "./days";

export type DailyPoint = { date: string; value: number | null; count: number };

/** One point per day for the last `days` days, ending today; days without data are null. */
export function dailySeries(samples: Sample[], metric: MetricId, days: number, now: number): DailyPoint[] {
  const how = METRIC[metric].daily;
  const byDay = new Map<string, Sample[]>();
  for (const s of samples) {
    if (s.metric !== metric || s.at > now) continue;
    const k = dayKey(s.at);
    const list = byDay.get(k);
    if (list) list.push(s);
    else byDay.set(k, [s]);
  }
  const out: DailyPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = dayKey(now - i * DAY);
    const list = byDay.get(date) ?? [];
    let value: number | null = null;
    if (list.length) {
      if (how === "sum") value = list.reduce((a, s) => a + s.value, 0);
      else if (how === "mean") value = list.reduce((a, s) => a + s.value, 0) / list.length;
      else value = list.reduce((a, s) => (s.at >= a.at ? s : a)).value;
    }
    out.push({ date, value, count: list.length });
  }
  return out;
}

/** Average of the days that have data, or null when none do. */
export function meanOf(points: DailyPoint[]): number | null {
  const vals = points.map((p) => p.value).filter((v): v is number => v != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

export type MissingStatus = {
  status: "ok" | "late" | "missing" | "never";
  lastAt: number | null;
  hoursSince: number | null;
};

/** Is data arriving as often as the metric expects? */
export function missingStatus(samples: Sample[], metric: MetricId, now: number, late = METRIC[metric].lateAfterHours, gone = METRIC[metric].missingAfterHours): MissingStatus {
  let lastAt: number | null = null;
  for (const s of samples) if (s.metric === metric && s.at <= now && (lastAt == null || s.at > lastAt)) lastAt = s.at;
  if (lastAt == null) return { status: "never", lastAt: null, hoursSince: null };
  const hoursSince = Math.max(0, (now - lastAt) / HOUR);
  return { status: hoursSince >= gone ? "missing" : hoursSince >= late ? "late" : "ok", lastAt, hoursSince };
}

export type Trend = {
  current: number | null;
  previous: number | null;
  /** % change of the current window's average vs the previous window's. */
  pct: number | null;
  days: number;
};

/** Compares the last `days` days with the `days` before them. */
export function trendOf(samples: Sample[], metric: MetricId, days: number, now: number): Trend {
  const both = dailySeries(samples, metric, days * 2, now);
  const previous = meanOf(both.slice(0, days));
  const current = meanOf(both.slice(days));
  const pct = current != null && previous != null && previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : null;
  return { current, previous, pct, days };
}

/** "Heart rate up 9% over 7 days (78 → 85 bpm)". */
export function describeTrend(metric: MetricId, t: Trend): string {
  const m = METRIC[metric];
  if (t.current == null) return `No ${m.label.toLowerCase()} data in the last ${t.days} days.`;
  if (t.pct == null) return `Average ${formatValue(metric, t.current)} over ${t.days} days; not enough earlier data to compare.`;
  const dir = Math.abs(t.pct) < 2 ? "steady" : t.pct > 0 ? "up" : "down";
  const pct = Math.abs(t.pct).toFixed(0);
  return dir === "steady"
    ? `Steady over ${t.days} days (${formatValue(metric, t.current)} average, ${t.pct >= 0 ? "+" : "−"}${pct}%).`
    : `${m.label} ${dir} ${pct}% vs the previous ${t.days} days (${t.previous!.toFixed(m.decimals)} → ${formatValue(metric, t.current)}).`;
}

export type Firing = {
  ruleId: string;
  metric: MetricId;
  level: Level;
  value: number;
  threshold: number;
  explanation: string;
};

export function crosses(value: number, rule: Rule): Level | null {
  const past = (t: number) => (rule.comparator === "above" ? value >= t : value < t);
  if (past(rule.red)) return "RED";
  if (past(rule.amber)) return "YELLOW";
  return null;
}

const word = (r: Rule) => (r.comparator === "above" ? "above" : "below");

function latestReading(rule: Rule, samples: Sample[], now: number) {
  let latest: Sample | undefined;
  for (const sample of samples) {
    if (sample.metric !== rule.metric || sample.at > now || sample.at <= now - rule.windowDays * DAY) continue;
    if (rule.id === "self_check_sleep_low" && !sample.fromSelfCheck) continue;
    if (!latest || sample.at > latest.at) latest = sample;
  }
  return latest;
}

/** An expired reading alone cannot resolve an alert that calls for a follow-up. */
export function awaitingReading(rules: Rule[], samples: Sample[], now: number): Set<string> {
  return new Set(rules.filter((r) => r.enabled && r.kind === "latest" && !latestReading(r, samples, now)).map((r) => r.id));
}

/** Which enabled rules fire for these samples right now, with a plain-language reason. */
export function evaluateRules(rules: Rule[], samples: Sample[], now: number): Firing[] {
  const out: Firing[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const m = METRIC[rule.metric];
    if (!m) continue;

    if (rule.kind === "missing") {
      const st = missingStatus(samples, rule.metric, now, rule.amber, rule.red);
      // A metric that never reported has no baseline to be "missing" from; the dashboard
      // shows it as "No data yet" instead of raising an alert.
      if (st.hoursSince == null) continue;
      const level = crosses(st.hoursSince, { ...rule, comparator: "above" });
      if (level) {
        const t = level === "RED" ? rule.red : rule.amber;
        out.push({
          ruleId: rule.id,
          metric: rule.metric,
          level,
          value: Math.round(st.hoursSince * 10) / 10,
          threshold: t,
          explanation: `No ${m.label.toLowerCase()} data for ${st.hoursSince.toFixed(0)} h (expected about every ${m.cadenceHours} h; ${level === "RED" ? "red" : "amber"} after ${t} h).`,
        });
      }
      continue;
    }

    if (rule.kind === "trend") {
      const tr = trendOf(samples, rule.metric, rule.windowDays, now);
      if (tr.pct == null) continue;
      const level = crosses(tr.pct, rule);
      if (level) {
        const t = level === "RED" ? rule.red : rule.amber;
        out.push({
          ruleId: rule.id,
          metric: rule.metric,
          level,
          value: Math.round(tr.pct * 10) / 10,
          threshold: t,
          explanation: `${m.label}: ${rule.windowDays}-day average ${tr.current!.toFixed(m.decimals)} ${m.unit} vs ${tr.previous!.toFixed(m.decimals)} ${m.unit} the ${rule.windowDays} days before, a change of ${tr.pct >= 0 ? "+" : ""}${tr.pct.toFixed(1)}%, ${word(rule)} the ${level === "RED" ? "red" : "amber"} limit of ${t}%.`,
        });
      }
      continue;
    }

    const value = rule.kind === "latest"
      ? latestReading(rule, samples, now)?.value
      : meanOf(dailySeries(samples, rule.metric, rule.windowDays, now));
    if (value == null) continue;
    const level = crosses(value, rule);
    if (level) {
      const t = level === "RED" ? rule.red : rule.amber;
      const span = rule.windowDays === 1 ? "today" : `over the last ${rule.windowDays} days`;
      out.push({
        ruleId: rule.id,
        metric: rule.metric,
        level,
        value: Math.round(value * 100) / 100,
        threshold: t,
        explanation: `${rule.kind === "latest" ? `Latest ${m.label.toLowerCase()}` : `Average ${m.label.toLowerCase()} ${span}`} was ${formatValue(rule.metric, value)}, ${word(rule)} the ${level === "RED" ? "red" : "amber"} threshold of ${formatValue(rule.metric, t)}.`,
      });
    }
  }
  return out;
}

// --- Alert lifecycle -------------------------------------------------------------------

export type ActiveAlert = { id: string; ruleId: string; level: Level; status: "OPEN" | "ACKNOWLEDGED" };

export type AlertChange =
  | { type: "open"; firing: Firing }
  | { type: "update"; alertId: string; firing: Firing; escalated: boolean }
  | { type: "resolve"; alertId: string; ruleId: string };

/** After someone resolves an alert by hand, the same rule stays quiet this long. */
export const RESOLVE_COOLDOWN_HOURS = 24;

/**
 * What to do with stored alerts given what fires now: open new ones, update (and re-open
 * on escalation from amber to red), and resolve those whose condition has cleared.
 * Rules that are switched off resolve their alerts too. `quiet` lists rules resolved by a
 * person within the cool-down, which don't open a new alert yet.
 */
export function planAlertChanges(active: ActiveAlert[], firings: Firing[], quiet: string[] = [], awaiting = new Set<string>()): AlertChange[] {
  const changes: AlertChange[] = [];
  const byRule = new Map(active.map((a) => [a.ruleId, a]));
  for (const f of firings) {
    const a = byRule.get(f.ruleId);
    if (!a) {
      if (!quiet.includes(f.ruleId)) changes.push({ type: "open", firing: f });
    }
    else changes.push({ type: "update", alertId: a.id, firing: f, escalated: a.level === "YELLOW" && f.level === "RED" });
  }
  const firingRules = new Set(firings.map((f) => f.ruleId));
  for (const a of active) {
    if (!firingRules.has(a.ruleId) && !awaiting.has(a.ruleId)) changes.push({ type: "resolve", alertId: a.id, ruleId: a.ruleId });
  }
  return changes;
}
