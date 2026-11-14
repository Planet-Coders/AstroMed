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
