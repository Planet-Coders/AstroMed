import inspiration4 from "./data/inspiration4.json";

const glucose = inspiration4.analytes.find((analyte) => analyte.key === "glucose")!;
export const GLUCOSE_REF = (glucose.ref ?? [70, 99]) as [number, number];
export const GLUCOSE_CREW_AVG = Math.round(glucose.preflightMean);
export const GLUCOSE_LANDING_CHANGE = glucose.changePct;

// Demo thresholds shared by Daily Check and the default monitoring rules.
export const CHECK_LIMITS = {
  systolicHigh: { amber: 130, red: 160 },
  systolicLow: { amber: 95, red: 85 },
  diastolicHigh: { amber: 85, red: 100 },
  diastolicLow: { amber: 60, red: 50 },
  glucoseLow: { amber: GLUCOSE_REF[0], red: 54 },
  glucoseFastingHigh: { amber: GLUCOSE_REF[1] + 1, red: 126 },
  glucoseAfterMealHigh: { amber: 140, red: 200 },
  temperatureHigh: { amber: 37.6, red: 38.5 },
  temperatureLow: { amber: 36, red: 35 },
  moodLow: { amber: 3, red: 2 },
  sleepLow: { amber: 7, red: 5 },
  hydrationLow: { amber: 2000, red: 1500 },
  urineDark: { amber: 4, red: 6 },
};

export const READING_RANGES = {
  systolic: [50, 260], diastolic: [30, 160], glucose: [20, 600],
  temperature: [30, 45], sleepHours: [0, 24], fluidMl: [0, 8000],
  mood: [1, 5], urineColor: [1, 8],
} as const;

export function reading(value: unknown, [min, max]: readonly [number, number]): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

/**
 * Input check before any medical assessment: a reading that can't be right (e.g. 80/120, with
 * the numbers swapped) gets a "please re-enter" message instead of a health warning.
 */
export function bpInputError(sys: number | null, dia: number | null): string | null {
  if (sys == null || dia == null) return null;
  if (sys <= dia) {
    return `The top number (systolic) must be higher than the bottom number (diastolic). Did you swap them? For example ${Math.max(sys, dia)}/${Math.min(sys, dia)}.`;
  }
  if (sys - dia < 10) return "The two numbers are too close together to be a real reading. Please measure again and re-enter.";
  return null;
}

type BpRule = { id: string; metric: string; amber: number; red: number };

/**
 * Admin check for blood pressure alert rules: thresholds must be readings a cuff can show, and
 * the systolic (top) limits must stay above the diastolic (bottom) ones, like a real reading.
 */
export function bpRuleError(edited: BpRule, all: BpRule[]): string | null {
  if (edited.metric !== "systolic" && edited.metric !== "diastolic") return null;
  const range = edited.metric === "systolic" ? READING_RANGES.systolic : READING_RANGES.diastolic;
  for (const v of [edited.amber, edited.red]) {
    if (v < range[0] || v > range[1]) {
      return `Invalid blood pressure rule: ${edited.metric} limits must be between ${range[0]} and ${range[1]} mmHg.`;
    }
  }
  const rules = new Map(all.map((r) => [r.id, r]));
  rules.set(edited.id, edited);
  const pair = (top: string, bottom: string) => {
    const s = rules.get(top);
    const d = rules.get(bottom);
    if (!s || !d) return null;
    if (s.amber <= d.amber || s.red <= d.red) {
      return `Invalid blood pressure rule: the systolic (top) limits must be higher than the diastolic (bottom) limits, e.g. ${Math.max(s.amber, d.amber)}/${Math.min(s.amber, d.amber)} not ${s.amber}/${d.amber}.`;
    }
    return null;
  };
  const order = (low: string, high: string, name: string) => {
    const l = rules.get(low);
    const h = rules.get(high);
    if (l && h && l.amber >= h.amber) return `Invalid blood pressure rule: the low ${name} limit must be below the high ${name} limit.`;
    return null;
  };
  return (
    pair("systolic_high", "diastolic_high") ??
    pair("systolic_low", "diastolic_low") ??
    order("systolic_low", "systolic_high", "systolic") ??
    order("diastolic_low", "diastolic_high", "diastolic")
  );
}
