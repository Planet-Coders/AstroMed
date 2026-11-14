import { describe, expect, it } from "vitest";
import { assessBp } from "@/lib/selfCheck";
import { DEFAULT_RULES } from "@/lib/monitoring/catalog";
import { awaitingReading, dailySeries, evaluateRules, planAlertChanges, type ActiveAlert } from "@/lib/monitoring/engine";
import { selfCheckSamples } from "@/lib/monitoring/selfCheckSamples";

const morning = Date.parse("2026-11-14T07:00:00Z");
const evening = Date.parse("2026-11-14T18:00:00Z");
const rules = DEFAULT_RULES.map((rule) => ({ ...rule, enabled: true }));
const assess = (reports: Parameters<typeof selfCheckSamples>[0], now = evening) =>
  evaluateRules(rules, selfCheckSamples(reports), now);

describe("Daily Check monitoring", () => {
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
