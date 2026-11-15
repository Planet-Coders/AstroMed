import type { RiskLevel } from "@/lib/risk";

/**
 * PVT scoring, shared by the Beacon Lock game, the body map, missions and the co-pilot.
 *
 * Convention (Dinges & Powell PVT; NASA uses a 3-min PVT-B on the ISS): a lapse is a response
 * of 500 ms or more (or no response), and a response under 100 ms is a false start, not a
 * reaction. Median reaction time is used because a few slow taps skew the mean.
 *
 * Beacon Lock adds pointing: targets appear at random spots, so moving the pointer adds time a
 * fixed-button PVT doesn't have. POINTING_ALLOWANCE_MS is subtracted from each tap before
 * scoring so a rested person isn't scored as fatigued for hand travel. Demo values.
 */
export const PVT = {
  /** Response at or above this (after the pointing allowance) is a lapse. */
  LAPSE_MS: 500,
  /** Faster than this is a false start (anticipation), counted separately. */
  FALSE_START_MS: 100,
  /** Typical extra time to move to a random on-screen target vs one fixed button. */
  POINTING_ALLOWANCE_MS: 150,
  /** Alert: median below this and few lapses. */
  ALERT_MEDIAN_MS: 350,
  /** Fatigued only when clearly impaired: median at or above this... */
  FATIGUED_MEDIAN_MS: 450,
  /** ...or more lapses than this per minute of testing. */
  ALERT_LAPSES_PER_MIN: 2,
  FATIGUED_LAPSES_PER_MIN: 5,
  /** The first target of a run is a warm-up and isn't scored. */
  PRACTICE_TRIALS: 1,
} as const;

/** One raw tap time (ms from the beacon being painted) → scored reaction time. */
export function scoredRt(rawMs: number) {
  return Math.max(0, rawMs - PVT.POINTING_ALLOWANCE_MS);
}

export function median(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export type PvtSummary = {
  median: number;
  mean: number;
  lapses: number;
  falseStarts: number;
  responses: number;
  minutes: number;
  level: RiskLevel;
};

/** Scores a run from scored reaction times (practice trials already dropped) and missed targets. */
export function summarizePvt(rts: number[], missed: number, minutes: number): PvtSummary {
  const falseStarts = rts.filter((t) => t < PVT.FALSE_START_MS).length;
  const valid = rts.filter((t) => t >= PVT.FALSE_START_MS);
  const lapses = valid.filter((t) => t >= PVT.LAPSE_MS).length + missed;
  const med = median(valid);
  const mean = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
  return { median: med, mean, lapses, falseStarts, responses: valid.length, minutes, level: pvtLevel(med, lapses, minutes, valid.length) };
}

/** GREEN alert · YELLOW mild fatigue · RED fatigued (clearly impaired only). */
export function pvtLevel(medianMs: number, lapses: number, minutes = 1, responses = 1): RiskLevel {
  if (responses === 0) return "YELLOW";
  const mins = Math.max(1, minutes);
  if (medianMs >= PVT.FATIGUED_MEDIAN_MS || lapses > PVT.FATIGUED_LAPSES_PER_MIN * mins) return "RED";
  if (medianMs < PVT.ALERT_MEDIAN_MS && lapses <= PVT.ALERT_LAPSES_PER_MIN * mins) return "GREEN";
  return "YELLOW";
}

/** Level for a stored summary, including ones saved before median/minutes were recorded. */
export function storedPvtLevel(s: { median?: number; mean?: number; lapses?: number; minutes?: number; level?: RiskLevel }): RiskLevel {
  if (s.level) return s.level;
  return pvtLevel(s.median ?? s.mean ?? 0, s.lapses ?? 0, s.minutes ?? 1);
}
