import type { Prisma } from "@prisma/client";
import { dayKey } from "./days";
import type { MetricId } from "./catalog";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MINUTE = 60_000;

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round = (v: number, d = 1) => Number(v.toFixed(d));

/**
 * Ensures a crew member has 60 days of continuous, realistic historical metric samples
 * and wearable telemetry. If the user already has ample history, this is a no-op.
 * Synthetic test users (SIM-1) are ignored to preserve their scripted anomalies.
 */
export async function ensureCrewBaseline(
  db: Prisma.TransactionClient,
  userId: string,
  now: number = Date.now(),
  days = 60,
) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, callsign: true, synthetic: true },
  });
  if (!user || user.synthetic) return;

  // Check how many metric samples exist for this user over the last 30 days
  const recentSampleCount = await db.metricSample.count({
    where: {
      userId,
      recordedAt: { gte: new Date(now - 30 * DAY) },
    },
  });

  const r = mulberry32(hashString(userId) + 54321);

  // Astronaut-specific nominal baselines (with minor realistic variation per astronaut)
  const baseSleep = 7.2 + (r() - 0.5) * 0.6; // ~6.9 - 7.5 h
  const baseActivity = 122 + Math.round((r() - 0.5) * 20); // ~112 - 132 min
  const basePulse = 66 + Math.round((r() - 0.5) * 8); // ~62 - 70 bpm
  const baseHydration = 2450 + Math.round((r() - 0.5) * 300); // ~2300 - 2600 mL
  const baseRadiation = 1.78 + (r() - 0.5) * 0.08; // ~1.74 - 1.82 mSv/day
  const baseSystolic = 116 + Math.round((r() - 0.5) * 8); // ~112 - 120 mmHg
  const baseDiastolic = 75 + Math.round((r() - 0.5) * 6); // ~72 - 78 mmHg
  const baseGlucoseFasting = 89 + Math.round((r() - 0.5) * 6); // ~86 - 92 mg/dL
  const baseGlucoseAfterMeal = 120 + Math.round((r() - 0.5) * 10); // ~115 - 125 mg/dL
  const baseTemperature = 36.7 + (r() - 0.5) * 0.2; // ~36.6 - 36.8 °C

  // 1. Backfill daily metric samples if lacking
  if (recentSampleCount < 60) {
    // Find what dates already have any user-submitted samples
    const existing = await db.metricSample.findMany({
      where: { userId, recordedAt: { gte: new Date(now - days * DAY) } },
      select: { metric: true, recordedAt: true },
    });
    const existingDayMetrics = new Set(
      existing.map((s) => `${s.metric}:${dayKey(s.recordedAt.getTime())}`),
    );

    const todayStr = dayKey(now);
    const samplesToCreate: Prisma.MetricSampleCreateManyInput[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const dayStart = new Date(dayKey(now - i * DAY)).getTime();
      const dateStr = dayKey(dayStart);
      const isToday = dateStr === todayStr;

      // Metric generators with realistic daily micro-fluctuations
      const metricsForDay: { metric: MetricId; value: number; hourOffset: number }[] = [
        { metric: "sleep", value: clamp(round(baseSleep + (r() - 0.5) * 0.9, 1), 6.1, 8.4), hourOffset: 7 },
        { metric: "activity", value: clamp(Math.round(baseActivity + (r() - 0.5) * 35), 85, 160), hourOffset: 16 },
        { metric: "hydration", value: clamp(Math.round((baseHydration + (r() - 0.5) * 400) / 50) * 50, 1950, 3100), hourOffset: 20 },
        { metric: "systolic", value: clamp(Math.round(baseSystolic + (r() - 0.5) * 10), 108, 126), hourOffset: 8 },
        { metric: "diastolic", value: clamp(Math.round(baseDiastolic + (r() - 0.5) * 8), 68, 82), hourOffset: 8 },
        { metric: "glucose_fasting", value: clamp(Math.round(baseGlucoseFasting + (r() - 0.5) * 10), 82, 98), hourOffset: 7.5 },
        { metric: "glucose_after_meal", value: clamp(Math.round(baseGlucoseAfterMeal + (r() - 0.5) * 16), 110, 138), hourOffset: 19 },
        { metric: "temperature", value: clamp(round(baseTemperature + (r() - 0.5) * 0.35, 1), 36.5, 37.1), hourOffset: 8 },
        { metric: "mood", value: clamp(Math.round(4 + (r() - 0.5) * 1.2), 3, 5), hourOffset: 21 },
        { metric: "urine_color", value: clamp(Math.round(2 + (r() - 0.5) * 1.2), 1, 3), hourOffset: 20 },
      ];

      for (const m of metricsForDay) {
        // If a real sample already exists on this day for this metric, keep it!
        if (existingDayMetrics.has(`${m.metric}:${dateStr}`)) continue;
        // On day 0 (today), don't force artificial baseline if not strictly needed, unless it's missing
        if (isToday && existingDayMetrics.has(`${m.metric}:${dateStr}`)) continue;

        samplesToCreate.push({
          id: `base-${userId}-${m.metric}-${dateStr}`,
          userId,
          metric: m.metric,
          value: m.value,
          recordedAt: new Date(dayStart + m.hourOffset * HOUR),
          source: "baseline",
          synthetic: false,
        });
      }
    }

    if (samplesToCreate.length > 0) {
      await db.metricSample.createMany({
        data: samplesToCreate,
        skipDuplicates: true,
      });
    }
  }

  // 2. Backfill continuous biometric records if lacking older history
  const bioHistoryCount = await db.biometricRecord.count({
    where: {
      userId,
      timestamp: {
        gte: new Date(now - days * DAY),
        lte: new Date(now - 2 * DAY),
      },
    },
  });

  if (bioHistoryCount < 30) {
    const vitalsToCreate: Prisma.BiometricRecordCreateManyInput[] = [];

    for (let i = days - 1; i >= 2; i--) {
      const dayStart = new Date(dayKey(now - i * DAY)).getTime();
      const dateStr = dayKey(dayStart);

      // 6 readings spread across the day (every 4 hours)
      const hours = [2, 6, 10, 14, 18, 22];
      for (const h of hours) {
        // Circadian variation: heart rate dips at 02:00 / 06:00, peaks at 14:00
        const circadian = Math.sin(((h - 10) / 24) * 2 * Math.PI) * 4;
        const hr = clamp(Math.round(basePulse + circadian + (r() - 0.5) * 5), 58, 82);
        const hrv = clamp(round(65 + (r() - 0.5) * 12, 1), 50, 85);
        const spo2 = clamp(round(98.1 + (r() - 0.5) * 0.8, 1), 96.5, 99.5);
        // Hourly radiation in mSv/h = daily dose / 24
        const hourlyRad = clamp(round((baseRadiation / 24) + (r() - 0.5) * 0.005, 4), 0.065, 0.085);

        vitalsToCreate.push({
          id: `base-bio-${userId}-${dateStr}-${h}`,
          userId,
          heartRate: hr,
          hrv,
          spo2,
          radiation: hourlyRad,
          synced: true,
          timestamp: new Date(dayStart + h * HOUR),
        });
      }
    }

    if (vitalsToCreate.length > 0) {
      await db.biometricRecord.createMany({
        data: vitalsToCreate,
        skipDuplicates: true,
      });
    }
  }
}
