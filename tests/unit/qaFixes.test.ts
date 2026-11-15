import { describe, expect, it } from "vitest";
import { assessAll, bpInputError, stepStatus, type SelfCheckValues } from "@/lib/selfCheck";
import { assessRisk } from "@/lib/risk";
import { deliveryState } from "@/lib/db";

const blank: SelfCheckValues = {
  systolic: null, diastolic: null, glucose: null, temperature: null, mood: null,
  sleepHours: null, fasting: true, fluidMl: null, urineColor: null,
};
const raw = { sys: "", dia: "", glucose: "", temp: "", sleep: "", fluid: "" };

describe("blood pressure input validation", () => {
  it("rejects a swapped reading before any medical assessment", () => {
    expect(bpInputError(80, 120)).toMatch(/swap/);
    expect(bpInputError(120, 120)).toMatch(/higher/);
    // no "medical warning" item is produced for an invalid reading
    expect(assessAll({ ...blank, systolic: 80, diastolic: 120 }).find((i) => i.id === "bp")).toBeUndefined();
  });

  it("accepts a normal reading and still assesses real hypertension", () => {
    expect(bpInputError(118, 76)).toBeNull();
    expect(assessAll({ ...blank, systolic: 118, diastolic: 76 })[0].level).toBe("GREEN");
    expect(assessAll({ ...blank, systolic: 170, diastolic: 105 })[0].level).toBe("RED");
  });

  it("flags numbers too close together as a re-measure", () => {
    expect(bpInputError(85, 80)).toMatch(/too close/);
  });
});

describe("Next needs a valid value, Skip is separate", () => {
  it("blood pressure step", () => {
    expect(stepStatus("bp", blank, raw)).toBe("empty");
    expect(stepStatus("bp", { ...blank, systolic: 120 }, { ...raw, sys: "120" })).toBe("invalid");
    expect(stepStatus("bp", { ...blank, systolic: 80, diastolic: 120 }, { ...raw, sys: "80", dia: "120" })).toBe("invalid");
    expect(stepStatus("bp", { ...blank, systolic: 120, diastolic: 80 }, { ...raw, sys: "120", dia: "80" })).toBe("ready");
  });

  it("other steps", () => {
    expect(stepStatus("mood", blank, raw)).toBe("empty");
    expect(stepStatus("mood", { ...blank, mood: 3 }, raw)).toBe("ready");
    expect(stepStatus("glucose", blank, { ...raw, glucose: "9999" })).toBe("invalid");
    expect(stepStatus("hydration", { ...blank, urineColor: 2 }, raw)).toBe("ready");
  });
});

describe("rhythm and overall status", () => {
  const ok = { heartRate: 72, hrv: 60, spo2: 98, radiation: 0.05 };
  it("an irregular rhythm is never nominal", () => {
    expect(assessRisk(ok)).toBe("GREEN");
    expect(assessRisk({ ...ok, arrhythmia: true })).toBe("RED");
  });
});

describe("sync delivery state", () => {
  it("separates queued, sent and confirmed by Earth", () => {
    expect(deliveryState({ synced: false }, false)).toBe("queued");
    expect(deliveryState({ synced: false, sentAt: 1 }, true)).toBe("sending");
    expect(deliveryState({ synced: false, sentAt: 1 }, false)).toBe("sent");
    expect(deliveryState({ synced: true, sentAt: 1 }, false)).toBe("confirmed");
  });
});
