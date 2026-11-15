import { describe, expect, it } from "vitest";
import { assessBp } from "@/lib/selfCheck";
import { DEFAULT_RULES, ruleKind } from "@/lib/monitoring/catalog";
import { awaitingReading, dailySeries, evaluateRules, planAlertChanges, resolveNote, type ActiveAlert } from "@/lib/monitoring/engine";
import { addLoggedWater, selfCheckSamples } from "@/lib/monitoring/selfCheckSamples";

const morning = Date.parse("2026-11-14T07:00:00Z");
const evening = Date.parse("2026-11-14T18:00:00Z");

it("adds water after the last snapshot and uses a newer 24-hour total as the baseline", () => {
  const samples = selfCheckSamples([
    { at: morning, data: { values: { fluidMl: 1400 } } },
    { at: evening, data: { values: { fluidMl: 1900 } } },
  ]);
  const history = addLoggedWater(samples, [
    { at: morning + 1, value: 500 },
    { at: evening + 1, value: 250 },
  ]);
  expect(history.map((sample) => sample.value)).toEqual([1400, 1900, 1900, 2150]);
});

it("does not carry a snapshot or added water beyond its 24-hour window into a new entry", () => {
  const snapshots = selfCheckSamples([{ at: morning, data: { values: { fluidMl: 1300 } } }]);
  const history = addLoggedWater(snapshots, [
    { at: morning + 1, value: 500 },
    { at: morning + 86_400_002, value: 250 },
  ]);
  expect(history.map((sample) => sample.value)).toEqual([1300, 1800, 250]);
});

const rules = DEFAULT_RULES.map((rule) => ({ ...rule, enabled: true }));
const assess = (reports: Parameters<typeof selfCheckSamples>[0], now = evening) =>
  evaluateRules(rules, selfCheckSamples(reports), now);

describe("Daily Check monitoring", () => {
  it("uses existing fluid rule settings with the latest reading behaviour", () => {
    expect(ruleKind("hydration_low", "threshold")).toBe("latest");
    expect(ruleKind("sleep_low", "threshold")).toBe("threshold");
  });

  it.each([[102, "RED"], [85, "YELLOW"], [59, "YELLOW"], [49, "RED"]] as const)(
    "assesses diastolic %i independently as %s",
    (diastolic, level) => {
      expect(assessBp(118, diastolic).level).toBe(level);
      expect(assessBp(null, diastolic).level).toBe(level);
      expect(assess([{ at: morning, data: { values: { systolic: 118, diastolic } } }])).toEqual([
        expect.objectContaining({ metric: "diastolic", level }),
      ]);
    },
  );

  it("uses the latest measured value when a follow-up skips other readings", () => {
    const firings = assess([
      { at: evening, data: { values: { systolic: 118, diastolic: 76, glucose: 155, fasting: false } } },
      { at: morning, data: { values: { systolic: 118, diastolic: 110, glucose: 130, fasting: true, mood: 2, temperature: 39, sleepHours: 6 } } },
    ]);
    expect(firings.map((f) => f.ruleId).sort()).toEqual([
      "glucose_after_meal_high", "glucose_fasting_high", "mood_low", "self_check_sleep_low", "temperature_high",
    ]);
  });

  it("totals newly logged fluid once per UTC day and resolves only the cleared condition", () => {
    const first = { at: morning, data: { values: { fluidAddedMl: 1200, fluidMl: 1200, urineColor: 6 } } };
    const followUp = { at: evening, data: { values: { fluidAddedMl: 900, fluidMl: 900 } } };
    const yesterday = { at: morning - 86_400_000, data: { values: { fluidAddedMl: 800 } } };
    const samples = selfCheckSamples([followUp, yesterday, first]);
    expect(dailySeries(samples, "hydration", 2, evening).map((point) => point.value)).toEqual([800, 2100]);
    const before = assess([first], morning);
    const active: ActiveAlert[] = before.map((f) => ({ id: f.ruleId, ruleId: f.ruleId, level: f.level, status: "OPEN" }));
    expect(planAlertChanges(active, assess([followUp, yesterday, first]))).toEqual([
      expect.objectContaining({ type: "update", alertId: "urine_color_dark" }),
      { type: "resolve", alertId: "hydration_low", ruleId: "hydration_low" },
    ]);
  });

  it("recovers readings from old checks and keeps only the newest old fluid snapshot", () => {
    const reports = [
      { at: evening, data: { values: { fluidMl: 1600 } } },
      { at: morning, data: { values: { fluidMl: 1100 }, items: [
        { id: "bp", display: "118/102 mmHg" },
        { id: "glucose", display: "129 mg/dL fasting" },
        { id: "temperature", display: "39.0 °C" },
        { id: "mood", display: "🙁 Low" },
        { id: "sleep", display: "6.5 h" },
        { id: "hydration", display: "1100 mL, urine 6/8" },
      ] } },
    ];
    expect(assess(reports).map((f) => f.ruleId).sort()).toEqual([
      "diastolic_high", "glucose_fasting_high", "hydration_low", "mood_low", "self_check_sleep_low",
      "temperature_high", "urine_color_dark",
    ]);
    expect(dailySeries(selfCheckSamples(reports), "hydration", 1, evening)[0].value).toBe(1600);
  });

  it("keeps an alert open while its reading is overdue", () => {
    const samples = selfCheckSamples([{ at: morning, data: { values: { diastolic: 102 } } }]);
    const later = morning + 3 * 86_400_000;
    const active: ActiveAlert[] = [{ id: "a", ruleId: "diastolic_high", level: "RED", status: "OPEN" }];
    expect(planAlertChanges(active, evaluateRules(rules, samples, later), [], awaitingReading(rules, samples, later))).toEqual([]);
  });
});

describe("Daily Check running totals", () => {
  const noon = Date.parse("2026-11-14T12:00:00Z");

  it("adds a later sleep entry to today's total and resolves the short-sleep alert", () => {
    const first = { at: morning, data: { values: { sleepHours: 5 } } };
    const nap = { at: noon, data: { values: { sleepHours: 7, sleepAddedHours: 2 } } };
    const before = assess([first], morning);
    expect(before).toContainEqual(expect.objectContaining({ ruleId: "self_check_sleep_low", level: "YELLOW", value: 5 }));
    const active: ActiveAlert[] = before.map((f) => ({ id: f.ruleId, ruleId: f.ruleId, level: f.level, status: "OPEN" }));
    const samples = selfCheckSamples([nap, first]);
    const changes = planAlertChanges(active, evaluateRules(rules, samples, evening));
    expect(changes).toContainEqual({ type: "resolve", alertId: "self_check_sleep_low", ruleId: "self_check_sleep_low" });
    expect(changes.every((c) => c.type === "resolve")).toBe(true);
    expect(resolveNote("sleep", samples)).toBe("Today's total 7.0 h · back to safe.");
  });

  it("totals on the server even when the device sent only the added amount", () => {
    const samples = selfCheckSamples([
      { at: morning, data: { values: { sleepHours: 4 } } },
      { at: noon, data: { values: { sleepAddedHours: 1.5 } } },
      { at: evening, data: { values: { sleepAddedHours: 1.5 } } },
    ]);
    expect(dailySeries(samples, "sleep", 1, evening)[0].value).toBe(7);
  });

  it("adds fluid to a full-check snapshot instead of replacing it", () => {
    const samples = selfCheckSamples([
      { at: morning, data: { values: { fluidMl: 1400 } } },
      { at: noon, data: { values: { fluidMl: 2000, fluidAddedMl: 600 } } },
    ]);
    expect(dailySeries(samples, "hydration", 1, evening)[0].value).toBe(2000);
    expect(assess([{ at: morning, data: { values: { fluidMl: 1400 } } }, { at: noon, data: { values: { fluidAddedMl: 600 } } }])
      .some((f) => f.ruleId === "hydration_low")).toBe(false);
  });

  it("starts a new total each day and lets a plain reading replace the total", () => {
    const samples = selfCheckSamples([
      { at: morning - 86_400_000, data: { values: { sleepHours: 6 } } },
      { at: morning, data: { values: { sleepAddedHours: 3 } } },
      { at: noon, data: { values: { sleepHours: 8 } } },
    ]);
    expect(dailySeries(samples, "sleep", 2, evening).map((p) => p.value)).toEqual([6, 8]);
  });
});
