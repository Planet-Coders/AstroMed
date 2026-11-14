import type { Sample } from "./engine";

/**
 * Seeded generator for SYNTHETIC crew records, used by `npm run db:synthetic` and the unit
 * tests. Ranges follow the metric catalog: ~7 h sleep, ~2.5 h exercise (ISS plan), ~2.4 L
 * fluid, a resting heart rate in the 60s, and ~1.8 mSv/day galactic background on a Mars
 * transit. Nothing here is real astronaut data.
 */

export type Profile = "normal" | "missing" | "sleep_debt" | "rising_hr" | "dehydration" | "spe";

export const PROFILES: { id: Profile; name: string; callsign: string; summary: string }[] = [
  { id: "normal", name: "Sim Nominal", callsign: "SIM1", summary: "All metrics in range, data arriving on time." },
  { id: "missing", name: "Sim Dropout", callsign: "SIM2", summary: "Wearable offline for 20 h, no hydration report for 3 days, two nights without a sleep log." },
  { id: "sleep_debt", name: "Sim Sleep Debt", callsign: "SIM3", summary: "Sleep falling to about 4.5 h over the last 6 nights." },
  { id: "rising_hr", name: "Sim Rising HR", callsign: "SIM4", summary: "Resting heart rate up about 17% over the last week, still under 100 bpm." },
  { id: "dehydration", name: "Sim Dehydrated", callsign: "SIM5", summary: "Fluid intake down to about 1.4 L/day for 4 days, darker urine." },
  { id: "spe", name: "Sim Solar Event", callsign: "SIM6", summary: "Solar particle event: dose rate jumps to ~0.5 mSv/h for the last 36 h." },
];

export type VitalRow = { at: number; heartRate: number; hrv: number; spo2: number; radiation: number };

export type SyntheticRecords = {
  /** Daily sleep, exercise and hydration values. */
  samples: (Sample & { detail?: { urineColor: number } })[];
  /** Hourly wearable and dosimeter readings (heart rate in bpm, radiation in mSv/h). */
  vitals: VitalRow[];
};

/** mulberry32: small, fast, deterministic. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 86_400_000;
const HOUR = 3_600_000;

export function generate(profile: Profile, days: number, now: number, seed = 1): SyntheticRecords {
  const r = rng(seed * 1000 + PROFILES.findIndex((p) => p.id === profile) + 1);
  const jitter = (mid: number, spread: number) => mid + (r() - 0.5) * 2 * spread;
  const samples: SyntheticRecords["samples"] = [];
  const vitals: VitalRow[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const base = now - i * DAY;

    // Sleep, logged on waking (2 h before "now" on each day).
    let sleep = jitter(7.2, 0.6);
    if (profile === "sleep_debt" && i < 6) sleep = 6.2 - (5 - i) * 0.35 + jitter(0, 0.15);
    const sleepGap = profile === "missing" && (i === 8 || i === 9);
    if (!sleepGap) samples.push({ metric: "sleep", value: round(sleep, 1), at: base - 2 * HOUR });

    // Exercise, logged in the evening of the previous day.
    samples.push({ metric: "activity", value: Math.round(jitter(140, 15)), at: base - 6 * HOUR });

    // Hydration self-report with urine colour (1 pale – 8 dark).
    let fluid = jitter(2400, 200);
    let urine = Math.round(jitter(2.5, 0.6));
    if (profile === "dehydration" && i < 4) {
      fluid = jitter(1400, 120);
      urine = Math.round(jitter(5.5, 0.6));
    }
    const hydrationGap = profile === "missing" && i < 3;
    if (!hydrationGap) samples.push({ metric: "hydration", value: Math.round(fluid / 10) * 10, at: base - 1 * HOUR, detail: { urineColor: clamp(urine, 1, 8) } });
  }

  // Hourly vitals for the whole span.
  const start = now - days * DAY;
  for (let t = start + HOUR / 2; t < now; t += HOUR) {
    const hoursAgo = (now - t) / HOUR;
    if (profile === "missing" && hoursAgo < 20) continue; // wearable offline
    const daysAgo = hoursAgo / 24;
    const hourOfDay = new Date(t).getUTCHours();
    const circadian = Math.sin(((hourOfDay - 10) / 24) * 2 * Math.PI) * 4;
    let hr = 64 + circadian + jitter(0, 2.5);
    if (profile === "rising_hr" && daysAgo < 7) hr *= 1 + 0.34 * ((7 - daysAgo) / 7); // ~+17% weekly mean, peak ~90 bpm
    let rad = jitter(0.075, 0.004);
    if (profile === "spe" && hoursAgo < 36) rad = jitter(0.5, 0.05);
    vitals.push({
      at: Math.round(t),
      heartRate: Math.round(hr),
      hrv: round(jitter(profile === "rising_hr" && daysAgo < 7 ? 48 : 62, 4), 1),
      spo2: round(jitter(97.8, 0.4), 1),
      radiation: round(rad, 4),
    });
  }

  return { samples, vitals };
}

/** Wearable rows as metric samples: daily mean heart rate and dose (mSv/h × 24). */
export function vitalsToSamples(vitals: VitalRow[]): Sample[] {
  return vitals.flatMap((v) => [
    { metric: "pulse" as const, value: v.heartRate, at: v.at },
    { metric: "radiation" as const, value: v.radiation * 24, at: v.at },
  ]);
}

function round(v: number, d: number) {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
