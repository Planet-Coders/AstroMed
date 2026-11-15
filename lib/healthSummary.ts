import { worstRisk, type RiskLevel } from "@/lib/risk";
import { INJURY_TYPES, injuryLevel, type Injury } from "@/lib/injuries";
import { summarize, type CycleLog } from "@/lib/periods";
import type { RoutineReport } from "@/lib/routineLog";
import type { StoredCheck } from "@/lib/selfCheck";

/**
 * Turns an astronaut's mirrored health logs into the at-a-glance status the oversight
 * console shows: the same green / amber / red levels the crew sees on their own console.
 */

export type HealthReportRow = {
  kind: "SELF_CHECK" | "ROUTINE" | "INJURIES" | "PERIODS";
  key: string;
  data: unknown;
  recordedAt: string;
};

export type Vitals = { heartRate: number; hrv: number | null; spo2: number; radiation: number | null; timestamp: string };

export type Alert = { level: Exclude<RiskLevel, "GREEN">; source: string; text: string };

export type HealthSummary = {
  selfCheck: (StoredCheck & { level: RiskLevel }) | null;
  routine: { date: string; sleepHours: number | null; exerciseMinutes: number | null; recordedAt: string } | null;
  injuries: { open: Injury[]; all: Injury[]; level: RiskLevel } | null;
  periods: { log: CycleLog; summary: ReturnType<typeof summarize> } | null;
  alerts: Alert[];
  level: RiskLevel;
};

export const LEVEL_TEXT: Record<RiskLevel, string> = { GREEN: "text-mc-green", YELLOW: "text-mc-amber", RED: "text-mc-red" };
export const LEVEL_DOT: Record<RiskLevel, string> = { GREEN: "bg-mc-green", YELLOW: "bg-mc-amber", RED: "bg-mc-red" };

function latest(reports: HealthReportRow[], kind: HealthReportRow["kind"]) {
  const time = (r: HealthReportRow) =>
    r.kind === "SELF_CHECK" && /^\d{13}$/.test(r.key) ? Number(r.key) : Date.parse(r.recordedAt);
  return reports
    .filter((r) => r.kind === kind)
    .sort((a, b) => time(b) - time(a))[0];
}

function sleepHoursOf(day: RoutineReport) {
  if (typeof day.sleepHours === "number") return day.sleepHours;
  if (!day.sleep) return null;
  const [bh, bm] = day.sleep.bed.split(":").map(Number);
  const [wh, wm] = day.sleep.wake.split(":").map(Number);
  let mins = wh * 60 + wm - (bh * 60 + bm);
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
}

export function summarizeHealth(reports: HealthReportRow[], vitalsRisk: RiskLevel | null, vitals?: Vitals | null): HealthSummary {
  const alerts: Alert[] = [];

  if (vitals && vitalsRisk && vitalsRisk !== "GREEN") {
    alerts.push({
      level: vitalsRisk,
      source: "Vitals",
      text: `HR ${vitals.heartRate} bpm, SpO₂ ${Math.round(vitals.spo2 * 10) / 10}%, HRV ${vitals.hrv != null ? Math.round(vitals.hrv) : "?"} ms${
        vitals.radiation != null ? `, radiation ${vitals.radiation.toFixed(3)} mSv/h` : ""
      }`,
    });
  }

  const checkRow = latest(reports, "SELF_CHECK");
  let selfCheck: HealthSummary["selfCheck"] = null;
  if (checkRow) {
    const check = checkRow.data as StoredCheck;
    const items = Array.isArray(check?.items) ? check.items : [];
    selfCheck = { ...check, items, level: worstRisk(items.length ? items.map((i) => i.level) : ["GREEN"]) };
    for (const i of items) {
      if (i.level !== "GREEN") alerts.push({ level: i.level, source: "Self-check", text: `${i.label} ${i.display}: ${i.advice}` });
    }
  }

  const routineRow = latest(reports, "ROUTINE");
  let routine: HealthSummary["routine"] = null;
  if (routineRow) {
    const day = routineRow.data as RoutineReport;
    const sleepHours = sleepHoursOf(day);
    const exerciseMinutes = day.exercise?.reduce((sum, s) => sum + s.minutes, 0) ?? null;
    routine = { date: routineRow.key, sleepHours, exerciseMinutes, recordedAt: routineRow.recordedAt };
    if (sleepHours != null && sleepHours < 6) {
      alerts.push({ level: sleepHours < 5 ? "RED" : "YELLOW", source: "Sleep", text: `${sleepHours.toFixed(1)} h on ${routineRow.key} (target 8.5 h)` });
    }
  }

  const injuryRow = latest(reports, "INJURIES");
  let injuries: HealthSummary["injuries"] = null;
  if (injuryRow) {
    const all = Array.isArray(injuryRow.data) ? (injuryRow.data as Injury[]) : [];
    const open = all.filter((i) => !i.healed);
    injuries = { all, open, level: worstRisk(open.length ? open.map(injuryLevel) : ["GREEN"]) };
    for (const i of open) {
      const level = injuryLevel(i);
      const last = i.updates[i.updates.length - 1];
      if (level !== "GREEN") {
        alerts.push({
          level,
          source: "Injury",
          text: `${INJURY_TYPES[i.type]?.label ?? i.type} on ${i.area.toLowerCase()}, pain ${last?.pain ?? "?"}/10${last?.note ? ` (${last.note})` : ""}`,
        });
      }
    }
  }

  const periodRow = latest(reports, "PERIODS");
  let periods: HealthSummary["periods"] = null;
  if (periodRow) {
    const log = periodRow.data as CycleLog;
    if (log && Array.isArray(log.days)) {
      const summary = summarize(log);
      periods = { log, summary };
      for (const a of summary.alerts) alerts.push({ level: a.level, source: "Cycle", text: a.text });
    }
  }

  alerts.sort((a, b) => (a.level === b.level ? 0 : a.level === "RED" ? -1 : 1));
  const level = worstRisk([vitalsRisk ?? "GREEN", ...alerts.map((a) => a.level)]);
  return { selfCheck, routine, injuries, periods, alerts, level };
}
