import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, METRICS, type MetricId } from "@/lib/monitoring/catalog";
import {
  dailySeries,
  describeTrend,
  evaluateRules,
  missingStatus,
  planAlertChanges,
  trendOf,
  type Firing,
  type Rule,
  type Sample,
} from "@/lib/monitoring/engine";
import { generate, vitalsToSamples, type Profile } from "@/lib/monitoring/synthetic";

const NOW = Date.UTC(2026, 10, 4, 12, 0, 0);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const RULES: Rule[] = DEFAULT_RULES.map((r) => ({ ...r, enabled: true }));

function samplesFor(profile: Profile, days = 30, seed = 1): Sample[] {
  const g = generate(profile, days, NOW, seed);
  return [...g.samples, ...vitalsToSamples(g.vitals)];
}

const fired = (profile: Profile, seed = 1) =>
  Object.fromEntries(evaluateRules(RULES, samplesFor(profile, 30, seed), NOW).map((f) => [f.ruleId, f.level]));

describe("metric catalog", () => {
  const originalMetrics: MetricId[] = ["activity", "hydration", "pulse", "radiation", "sleep"];

  it("covers the wearable, routine, and Daily Check metrics with sourced rationales", () => {
    expect(METRICS.map((m) => m.id).sort()).toEqual([
      "activity", "diastolic", "glucose_after_meal", "glucose_fasting", "hydration", "mood",
      "pulse", "radiation", "sleep", "systolic", "temperature", "urine_color",
    ]);
    for (const m of METRICS) {
      expect(m.rationale.length).toBeGreaterThan(80);
      expect(m.citations.length).toBeGreaterThan(0);
      for (const c of m.citations) expect(c.url).toMatch(/^https:\/\/(ntrs\.nasa\.gov\/citations\/\d+|osdr\.nasa\.gov\/bio\/repo\/data\/studies\/OSD-\d+|standards\.nasa\.gov\/)/);
      expect(m.rules.some((r) => r.kind === (originalMetrics.includes(m.id) ? "missing" : "latest"))).toBe(true);
    }
  });

  it("orders thresholds so red is past amber", () => {
    for (const r of DEFAULT_RULES) {
      if (r.comparator === "above") expect(r.red).toBeGreaterThan(r.amber);
      else expect(r.red).toBeLessThan(r.amber);
    }
  });
});

describe("synthetic normal case", () => {
  it.each([1, 2, 3, 4, 5])("raises no alerts (seed %i)", (seed) => {
    expect(fired("normal", seed)).toEqual({});
  });

  it("is reproducible for a seed and differs across seeds", () => {
    expect(generate("normal", 14, NOW, 7)).toEqual(generate("normal", 14, NOW, 7));
    expect(generate("normal", 14, NOW, 7)).not.toEqual(generate("normal", 14, NOW, 8));
  });

  it("reports every metric as on time", () => {
    const s = samplesFor("normal");
    for (const metric of ["activity", "hydration", "pulse", "radiation", "sleep"] as const) {
      expect(missingStatus(s, metric, NOW).status).toBe("ok");
    }
  });
});

describe("synthetic missing-data case", () => {
  const s = samplesFor("missing");

  it("flags the wearable and hydration gaps by expected cadence", () => {
    expect(missingStatus(s, "pulse", NOW).status).toBe("missing"); // 20 h > 18 h
    expect(missingStatus(s, "radiation", NOW).status).toBe("late"); // 20 h: late after 6 h, missing after 24 h
    expect(missingStatus(s, "hydration", NOW).status).toBe("missing"); // 3 days
    expect(missingStatus(s, "sleep", NOW).status).toBe("ok");
  });

  it("raises missing-data alerts at the right level", () => {
    const f = fired("missing");
    expect(f.pulse_missing).toBe("RED");
    expect(f.radiation_missing).toBe("YELLOW");
    expect(f.hydration_missing).toBe("RED");
    expect(f.sleep_missing).toBeUndefined();
  });

  it("leaves gaps as nulls in the daily series instead of zeros", () => {
    const sleep = dailySeries(s, "sleep", 14, NOW);
    expect(sleep.filter((p) => p.value == null)).toHaveLength(2);
    expect(dailySeries(s, "hydration", 7, NOW).slice(-3).every((p) => p.value == null)).toBe(true);
  });

  it("treats a metric that never reported as 'never', not as an alert", () => {
    expect(missingStatus([], "sleep", NOW).status).toBe("never");
    expect(evaluateRules(RULES, [], NOW)).toEqual([]);
  });
});

describe("synthetic anomalous cases", () => {
  const cases: [Profile, string, "YELLOW" | "RED"][] = [
    ["sleep_debt", "sleep_low", "RED"],
    ["rising_hr", "pulse_trend", "RED"],
    ["dehydration", "hydration_low", "RED"],
    ["spe", "radiation_high", "RED"],
  ];

  it.each(cases)("%s fires %s at %s", (profile, rule, level) => {
    expect(fired(profile)[rule]).toBe(level);
  });

  it.each(cases)("%s fires only its own rule", (profile, rule) => {
    expect(Object.keys(fired(profile))).toEqual([rule]);
  });

  it("explains why, with value and threshold", () => {
    const f = evaluateRules(RULES, samplesFor("dehydration"), NOW).find((x) => x.ruleId === "hydration_low")!;
    expect(f.value).toBeLessThan(1500);
    expect(f.threshold).toBe(1500);
    expect(f.explanation).toMatch(/below the red threshold of 1500 mL/);
  });

  it("keeps the rising heart rate under the absolute 100 bpm limit (trend-only signal)", () => {
    const pulse = dailySeries(samplesFor("rising_hr"), "pulse", 7, NOW);
    expect(Math.max(...pulse.map((p) => p.value ?? 0))).toBeLessThan(100);
  });
});

describe("trend summaries", () => {
  const flat = (metric: MetricId, v1: number, v2: number): Sample[] =>
    Array.from({ length: 14 }, (_, i) => ({ metric, value: i < 7 ? v1 : v2, at: NOW - (13 - i) * DAY }));

  it("computes % change against the previous window", () => {
    const t = trendOf(flat("pulse", 60, 66), "pulse", 7, NOW);
    expect(t.previous).toBe(60);
    expect(t.current).toBe(66);
    expect(t.pct).toBeCloseTo(10);
    expect(describeTrend("pulse", t)).toBe("Pulse trend up 10% vs the previous 7 days (60 → 66 bpm).");
  });

  it("calls small changes steady and handles no history", () => {
    expect(describeTrend("pulse", trendOf(flat("pulse", 60, 60.5), "pulse", 7, NOW))).toMatch(/^Steady/);
    const recentOnly = flat("sleep", 7, 7).slice(7);
    expect(describeTrend("sleep", trendOf(recentOnly, "sleep", 7, NOW))).toMatch(/not enough earlier data/);
    expect(describeTrend("sleep", trendOf([], "sleep", 7, NOW))).toMatch(/^No sleep data/);
  });

  it("sums exercise sessions per day and averages heart rate", () => {
    const s: Sample[] = [
      { metric: "activity", value: 50, at: NOW - 1 * HOUR },
      { metric: "activity", value: 40, at: NOW - 2 * HOUR },
      { metric: "pulse", value: 60, at: NOW - 1 * HOUR },
      { metric: "pulse", value: 80, at: NOW - 2 * HOUR },
    ];
    expect(dailySeries(s, "activity", 1, NOW)[0].value).toBe(90);
    expect(dailySeries(s, "pulse", 1, NOW)[0].value).toBe(70);
  });
});

describe("configurable rules", () => {
  it("respects edited thresholds and switched-off rules", () => {
    const s = samplesFor("dehydration");
    const looser = RULES.map((r) => (r.id === "hydration_low" ? { ...r, amber: 1250, red: 1000 } : r));
    expect(evaluateRules(looser, s, NOW).find((f) => f.ruleId === "hydration_low")).toBeUndefined();
    const off = RULES.map((r) => (r.id === "hydration_low" ? { ...r, enabled: false } : r));
    expect(evaluateRules(off, s, NOW)).toEqual([]);
  });
});

describe("alert lifecycle", () => {
  const firing = (ruleId: string, level: "YELLOW" | "RED"): Firing => ({ ruleId, metric: "sleep", level, value: 1, threshold: 1, explanation: "" });

  it("opens new alerts, updates existing ones and resolves cleared ones", () => {
    const changes = planAlertChanges(
      [
        { id: "a1", ruleId: "sleep_low", level: "YELLOW", status: "ACKNOWLEDGED" },
        { id: "a2", ruleId: "pulse_high", level: "RED", status: "OPEN" },
      ],
      [firing("sleep_low", "RED"), firing("hydration_low", "YELLOW")]
    );
    expect(changes).toEqual([
      { type: "update", alertId: "a1", firing: firing("sleep_low", "RED"), escalated: true },
      { type: "open", firing: firing("hydration_low", "YELLOW") },
      { type: "resolve", alertId: "a2", ruleId: "pulse_high" },
    ]);
  });

  it("keeps a rule quiet during the cool-down after a manual resolve", () => {
    expect(planAlertChanges([], [firing("sleep_low", "RED")], ["sleep_low"])).toEqual([]);
    expect(planAlertChanges([], [firing("sleep_low", "RED")], ["pulse_high"])).toEqual([{ type: "open", firing: firing("sleep_low", "RED") }]);
  });

  it("does not escalate when the level stays the same", () => {
    const [c] = planAlertChanges([{ id: "a1", ruleId: "sleep_low", level: "RED", status: "OPEN" }], [firing("sleep_low", "RED")]);
    expect(c).toMatchObject({ type: "update", escalated: false });
  });
});
