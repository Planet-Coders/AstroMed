import { describe, expect, it, vi } from "vitest";
import { bpRuleError } from "@/lib/selfCheckThresholds";
import { selfCheckSamples } from "@/lib/monitoring/selfCheckSamples";
import { resolveNote } from "@/lib/monitoring/engine";
import { agoLabel, lastValidReading } from "@/lib/risk";
import { STATUS_TONE } from "@/lib/statusColors";
import { checkDoneToday, mergeIntoLatest, singleReadingCheck, type SelfCheckValues } from "@/lib/selfCheck";

const rules = [
  { id: "systolic_high", metric: "systolic", amber: 130, red: 160 },
  { id: "systolic_low", metric: "systolic", amber: 95, red: 85 },
  { id: "diastolic_high", metric: "diastolic", amber: 85, red: 100 },
  { id: "diastolic_low", metric: "diastolic", amber: 60, red: 50 },
];

describe("admin blood pressure rules", () => {
  it("accepts the defaults and ignores other metrics", () => {
    expect(bpRuleError(rules[0], rules)).toBeNull();
    expect(bpRuleError({ id: "pulse_high", metric: "pulse", amber: 1, red: 2 }, rules)).toBeNull();
  });
  it("rejects systolic limits at or below diastolic ones", () => {
    expect(bpRuleError({ id: "systolic_high", metric: "systolic", amber: 80, red: 120 }, rules)).toMatch(/Invalid blood pressure rule/);
    expect(bpRuleError({ id: "diastolic_high", metric: "diastolic", amber: 140, red: 150 }, rules)).toMatch(/higher than the diastolic/);
  });
  it("rejects impossible values and low above high", () => {
    expect(bpRuleError({ id: "systolic_high", metric: "systolic", amber: 400, red: 500 }, rules)).toMatch(/between/);
    expect(bpRuleError({ id: "systolic_low", metric: "systolic", amber: 140, red: 100 }, rules)).toMatch(/low systolic/);
  });
  it("monitoring never turns a swapped reading into blood pressure samples", () => {
    const at = Date.parse("2026-11-14T08:00:00Z");
    const bad = selfCheckSamples([{ at, data: { values: { systolic: 80, diastolic: 120 }, items: [] } }]);
    expect(bad.filter((s) => s.metric === "systolic" || s.metric === "diastolic")).toHaveLength(0);
    const good = selfCheckSamples([{ at, data: { values: { systolic: 118, diastolic: 76 }, items: [] } }]);
    expect(good.map((s) => s.metric)).toEqual(expect.arrayContaining(["systolic", "diastolic"]));
  });
});

describe("last valid reading while the sensor is silent", () => {
  it("uses the newest plausible reading and never a glitch", () => {
    const rows = [
      { heartRate: 74, hrv: 60, spo2: 98, radiation: 0.07, timestamp: 1000 },
      { heartRate: 0, hrv: 0, spo2: Number.NaN, radiation: 0.07, timestamp: 3000 },
      { heartRate: 76, hrv: 58, spo2: 97.6, radiation: 0.07, timestamp: 2000 },
    ];
    expect(lastValidReading(rows)?.timestamp).toBe(2000);
    expect(lastValidReading([])).toBeNull();
    expect(agoLabel(2 * 3600_000)).toBe("2 h ago");
    expect(agoLabel(5_000)).toBe("just now");
  });
});

describe("shared status colours", () => {
  it("uses the same red for every WARNING and orange for caution", () => {
    expect(STATUS_TONE.RED.text).toBe("text-mc-red");
    expect(STATUS_TONE.YELLOW.text).toBe("text-mc-amber");
    expect(STATUS_TONE.GREEN.text).toBe("text-mc-green");
  });
});

describe("single-tab saves and re-tests", () => {
  const base: SelfCheckValues = {
    systolic: 165, diastolic: 104, glucose: 92, temperature: 36.8, mood: 4,
    sleepHours: 7, fasting: true, fluidMl: 2200, urineColor: 2,
  };
  it("a hydration log saves only hydration and doesn't count as the full check", () => {
    const single = singleReadingCheck("u1", Date.now(), "hydration", { ...base, fluidMl: 500 });
    expect(single.items.map((i) => i.id)).toEqual(["hydration"]);
    expect(single.values?.systolic).toBeNull();
    expect(checkDoneToday(mergeIntoLatest(null, single))).toBe(false);
  });
  it("a blood pressure re-test replaces the high reading and turns it safe", () => {
    const morning = { userId: "u1", at: Date.now() - 3600_000, items: [], values: base };
    const retest = singleReadingCheck("u1", Date.now(), "bp", { ...base, systolic: 118, diastolic: 76 });
    const merged = mergeIntoLatest(morning, retest);
    expect(merged.items.find((i) => i.id === "bp")).toMatchObject({ display: "118/76 mmHg", level: "GREEN" });
    expect(merged.items.find((i) => i.id === "glucose")).toBeTruthy(); // other readings kept
    expect(merged.merged).toBe(true);
  });
  it("the alert log names the re-test reading that cleared it", () => {
    const at = 5000;
    const samples = [
      { metric: "systolic" as const, value: 165, at: 1000, fromSelfCheck: true },
      { metric: "systolic" as const, value: 118, at, fromSelfCheck: true },
      { metric: "diastolic" as const, value: 76, at, fromSelfCheck: true },
    ];
    expect(resolveNote("systolic", samples)).toBe("Re-test 118/76 mmHg · back to safe.");
    expect(resolveNote(undefined, samples)).toMatch(/Back within/);
  });
});

describe("Talk to me quiets the reminder voice", () => {
  it("cancels speech and blocks new lines until resumed", async () => {
    const cancel = vi.fn();
    const speak = vi.fn();
    vi.stubGlobal("window", { speechSynthesis: { cancel, speak, speaking: false, pending: false }, addEventListener: () => {}, dispatchEvent: () => true });
    const v = await import("@/lib/voiceReminder");
    v.setCatVoicePaused(true);
    expect(cancel).toHaveBeenCalled();
    const done = vi.fn();
    v.catSpeak("Time to drink water", done);
    expect(done).toHaveBeenCalled(); // finished silently
    expect(speak).not.toHaveBeenCalled();
    v.setCatVoicePaused(false);
    expect(v.isCatVoicePaused()).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe("e2e test accounts", () => {
  it("cleanup matches only the throwaway test emails", async () => {
    const { TEST_ACCOUNT, testEmail } = await import("../e2e/testAccounts");
    expect(TEST_ACCOUNT.test(testEmail("replay"))).toBe(true);
    expect(TEST_ACCOUNT.test(testEmail("water-retry"))).toBe(true);
    expect(TEST_ACCOUNT.test("john@aahms.demo")).toBe(false);
    expect(TEST_ACCOUNT.test("replay-team@aahms.demo")).toBe(false);
  });
});
