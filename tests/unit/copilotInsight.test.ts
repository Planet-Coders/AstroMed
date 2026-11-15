import { afterEach, describe, expect, it, vi } from "vitest";
import type { AlertView } from "@/components/monitoring/types";
import { dailyCheckInsight, insightMessages, monitoringInsight, selectInsight } from "@/lib/copilotInsight";
import { summarizeHealth } from "@/lib/healthSummary";
import { METRIC } from "@/lib/monitoring/catalog";
import { getPvtResult, savePvtResult } from "@/lib/pvtLog";
import { getRoutineDay, recordedRoutine } from "@/lib/routineLog";
import { assessAll, mergeIntoLatest, singleReadingCheck, type SelfCheckValues } from "@/lib/selfCheck";

const values: SelfCheckValues = {
  systolic: 118, diastolic: 102, glucose: null, temperature: null,
  mood: null, sleepHours: 8, fasting: true, fluidMl: 1100, urineColor: null,
};

describe("saved-check explanations", () => {
  const current = { userId: "crew-1", at: Date.now(), values, items: assessAll(values) };
  const snapshot = dailyCheckInsight(current, null)!;

  it("limits model choices to the highest-severity findings and supplied references", () => {
    expect(snapshot.findings.map((item) => item.id)).toEqual(["bp", "hydration"]);
    const chosen = selectInsight(snapshot, '{"finding":"hydration","next":1,"compare":false,"reference":"NTRS 20240012429"}', 11);
    expect(chosen).toMatchObject({
      mode: "webllm", evidence: { id: "NTRS 20240012429" }, durationMs: 11,
    });
    expect(chosen.finding.detail).toContain("1100");
    expect(chosen.followUp).toBe(chosen.finding.followUps[1]);
    expect(JSON.stringify(insightMessages(snapshot))).not.toContain("crew-1");
  });

  it.each([
    "Invented advice",
    '{"finding":"sleep","next":0,"compare":false,"reference":null}',
    '{"finding":"bp","next":0,"compare":false,"reference":"OSD-575"}',
    '{"finding":"bp","next":0,"compare":true,"reference":null}',
    '{"finding":"bp","next":3,"compare":false,"reference":null}',
  ])("keeps the original reading and follow-up when the model returns %s", (reply) => {
    expect(selectInsight(snapshot, reply, 20)).toMatchObject({
      mode: "basic", finding: { id: "bp", detail: "118/102 mmHg · WARNING" }, durationMs: 20,
    });
  });

  it("compares retests with the actual previous capture, even after a different step was saved", () => {
    const at = new Date().setHours(8, 0, 0, 0);
    const initial = singleReadingCheck(current.userId, at, "bp", values);
    const sleep = singleReadingCheck(current.userId, at + 1000, "sleep", values);
    const merged = mergeIntoLatest(mergeIntoLatest(null, initial), sleep);
    const later = singleReadingCheck(current.userId, at + 2000, "bp", { ...values, diastolic: 76 });
    expect(dailyCheckInsight(later, merged)?.findings[0]).toMatchObject({
      detail: "118/76 mmHg · NOMINAL",
      comparison: { at, text: "118/102 mmHg · WARNING" },
    });
    expect(dailyCheckInsight(later, { ...merged, userId: "crew-2" })?.findings[0].comparison).toBeUndefined();
    expect(dailyCheckInsight(later, { ...merged, recordedItems: undefined })?.findings[0].comparison).toBeUndefined();
  });
});

describe("monitoring explanations", () => {
  const rule = { ...METRIC.hydration.rules.find((item) => item.id === "hydration_low")!, metric: "hydration" as const, enabled: true };
  const alert: AlertView = {
    id: "alert-1", ruleId: rule.id, metric: rule.metric, level: "RED", status: "OPEN",
    value: 1100, threshold: 1500, explanation: "Latest fluid intake was 1100 mL, below the red threshold of 1500 mL.",
    updatedAt: "2026-11-15T07:00:00.000Z", openedAt: "2026-11-15T07:00:00.000Z",
    acknowledgedAt: null, acknowledgedBy: null, resolvedAt: null, resolvedBy: null, notes: [],
  };

  it("uses the stored trigger and replaces advice for an expired reading with a fresh check", () => {
    const active = monitoringInsight("crew-1", alert, rule, undefined)!;
    expect(selectInsight(active, undefined, 0).followUp).toContain("Log water");
    expect(active.findings[0].detail).toBe(alert.explanation);

    const stale = monitoringInsight("crew-1", { ...alert, awaitingReading: true }, rule, undefined)!;
    expect(stale.findings[0].detail).toContain("Awaiting a fresh reading");
    expect(selectInsight(stale, undefined, 0).followUp).toContain("record a fresh reading");
    expect(monitoringInsight("crew-1", { ...alert, status: "RESOLVED" }, rule, undefined)).toBeNull();
  });
});

describe("crew-owned inputs", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("scopes cognitive and routine data to the crew member and excludes examples", () => {
    const entries = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
    });
    const day = new Date().toISOString().slice(0, 10);
    const demo = getRoutineDay("crew-1");
    const personal = { ...demo, sleep: { ...demo.sleep, bed: "22:00", wake: "06:00", source: "manual" } };
    entries.set(`aahms_routine:crew-1:${day}`, JSON.stringify(personal));
    entries.set("aahms_pvt_summary", JSON.stringify({ at: 1, mean: 410, lapses: 3 }));
    savePvtResult("crew-1", { at: 2, mean: 290, lapses: 0 });

    expect(recordedRoutine(getRoutineDay("crew-1"))).toMatchObject({ sleepHours: 8, exercise: undefined });
    expect(recordedRoutine(getRoutineDay("crew-2"))).toMatchObject({ sleepHours: undefined, exercise: undefined });
    expect(getPvtResult("crew-1")?.mean).toBe(290);
    expect(getPvtResult("crew-2")).toBeNull();
  });

  it("shows an exercise-only report without creating a sleep value or warning", () => {
    const summary = summarizeHealth([{
      kind: "ROUTINE", key: "2026-11-15", data: { exercise: [{ minutes: 20 }] }, recordedAt: "2026-11-15T07:00:00.000Z",
    }], null);
    expect(summary.routine).toMatchObject({ sleepHours: null, exerciseMinutes: 20 });
    expect(summary.alerts).toEqual([]);
  });
});
