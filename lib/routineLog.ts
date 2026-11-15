"use client";

import { useCallback, useEffect, useState } from "react";
import { getOutboxUser, queueHealth } from "@/lib/outbox";

/**
 * Daily exercise and sleep log for the crew routine panel. Sessions come either from
 * the wearable (accelerometer + HRV confirmed, "sensor") or are typed in by the crew
 * ("manual"). Stored in localStorage per day so it survives reloads and works offline.
 */

export type ExerciseType = "resistance" | "treadmill" | "cycle";
export type EntrySource = "sensor" | "manual" | "demo";

export type ExerciseSession = {
  id: string;
  type: ExerciseType;
  minutes: number;
  /** Clock time the session started, "HH:MM". */
  at: string;
  source: EntrySource;
};

export type SleepEntry = {
  /** "HH:MM" bedtime (previous evening) and wake time. */
  bed: string;
  wake: string;
  source: EntrySource;
};

/** ISS-style daily prescription: about 2.5 h split across the three machines. */
export const EXERCISE_PLAN: Record<ExerciseType, { label: string; spoken: string; target: number }> = {
  resistance: { label: "Resistance (ARED)", spoken: "resistance machine", target: 60 },
  treadmill: { label: "Treadmill (T2)", spoken: "treadmill", target: 45 },
  cycle: { label: "Cycle (CEVIS)", spoken: "exercise bike", target: 45 },
};
export const EXERCISE_TARGET = 150;
export const SLEEP_TARGET = 8.5;

export type DayLog = { exercise: ExerciseSession[]; sleep: SleepEntry };
export type RoutineReport = Partial<DayLog> & { sleepHours?: number };

const DEFAULT_DAY: DayLog = {
  exercise: [
    { id: "s1", type: "resistance", minutes: 52, at: "07:10", source: "demo" },
    { id: "s2", type: "treadmill", minutes: 32, at: "13:05", source: "demo" },
    { id: "s3", type: "cycle", minutes: 20, at: "16:40", source: "demo" },
  ],
  sleep: { bed: "22:54", wake: "05:30", source: "demo" },
};

const today = () => new Date().toISOString().slice(0, 10);
const storageKey = (userId: string) => `aahms_routine:${userId}:${today()}`;

/** Today's log for this member, with examples until they save their own readings. */
export function getRoutineDay(userId: string): DayLog {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? (JSON.parse(raw) as DayLog) : DEFAULT_DAY;
  } catch {
    return DEFAULT_DAY;
  }
}

export function recordedRoutine(day: DayLog): RoutineReport {
  const exercise = day.exercise.filter((session) => session.source !== "demo");
  const sleep = day.sleep.source === "demo" ? undefined : day.sleep;
  return {
    exercise: day.exercise.length > 0 && exercise.length === 0 ? undefined : exercise,
    sleep,
    sleepHours: sleep && sleepDuration(sleep),
  };
}

/** Mirror the crew member's recorded entries to the server. */
export function reportRoutineDay(userId: string, day = getRoutineDay(userId)) {
  if (getOutboxUser()?.userId !== userId) return;
  const report = recordedRoutine(day);
  if (report.sleep || report.exercise) void queueHealth("routine", today(), report);
}

/** Hours between bedtime and wake time, crossing midnight when needed. */
export function sleepDuration(entry: SleepEntry): number {
  const [bh, bm] = entry.bed.split(":").map(Number);
  const [wh, wm] = entry.wake.split(":").map(Number);
  let mins = wh * 60 + wm - (bh * 60 + bm);
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
}

export function formatHours(h: number): string {
  // Round total minutes first so 6.999 h shows as 7h 00m, not 6h 60m.
  const total = Math.round(h * 60);
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, "0")}m`;
}

export function useRoutineLog(userId: string) {
  const [day, setDay] = useState<DayLog>(DEFAULT_DAY);

  // Read after mount so the server render and first client render match.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load this member's device log
    setDay(getRoutineDay(userId));
  }, [userId]);

  const save = useCallback((update: (d: DayLog) => DayLog) => {
    setDay((d) => {
      const next = update(d);
      try {
        localStorage.setItem(storageKey(userId), JSON.stringify(next));
      } catch {
        /* ignore */
      }
      reportRoutineDay(userId, next);
      return next;
    });
  }, [userId]);

  const addExercise = useCallback(
    (type: ExerciseType, minutes: number, at: string) =>
      save((d) => ({
        ...d,
        exercise: [...d.exercise.filter((session) => session.source !== "demo"), { id: crypto.randomUUID(), type, minutes, at, source: "manual" as const }].sort((a, b) =>
          a.at.localeCompare(b.at)
        ),
      })),
    [save]
  );

  const removeExercise = useCallback(
    (id: string) => save((d) => ({ ...d, exercise: d.exercise.filter((s) => s.id !== id) })),
    [save]
  );

  const setSleep = useCallback(
    (bed: string, wake: string) => save((d) => ({ ...d, sleep: { bed, wake, source: "manual" } })),
    [save]
  );

  const exerciseMinutes = day.exercise.reduce((sum, s) => sum + s.minutes, 0);
  const recorded = recordedRoutine(day);
  const byType = (Object.keys(EXERCISE_PLAN) as ExerciseType[]).map((type) => ({
    type,
    ...EXERCISE_PLAN[type],
    done: day.exercise.filter((s) => s.type === type).reduce((sum, s) => sum + s.minutes, 0),
  }));

  return {
    exercise: day.exercise,
    sleep: day.sleep,
    exerciseMinutes,
    sleepHours: sleepDuration(day.sleep),
    recordedSleepHours: recorded.sleepHours,
    recordedExerciseMinutes: recorded.exercise?.reduce((sum, session) => sum + session.minutes, 0),
    byType,
    addExercise,
    removeExercise,
    setSleep,
  };
}
