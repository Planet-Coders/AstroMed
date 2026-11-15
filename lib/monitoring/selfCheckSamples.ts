import type { StoredCheck } from "../selfCheck";
import { bpInputError, reading, READING_RANGES as RANGE } from "../selfCheckThresholds";
import type { MetricId } from "./catalog";
import { dayKey } from "./days";
import type { Sample } from "./engine";

type Report = { at: number; data: unknown };

const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Turns stored Daily Check records into samples. Old checks stored formatted results for
 * readings other than sleep and hydration.
 *
 * Sleep and fluid add up through the day: a record with `sleepAddedHours` or `fluidAddedMl`
 * adds to that day's running total (5 h, then 2 h more = 7 h), while a plain reading sets
 * the total. The newest total is what the "latest" rules check, so reaching the limit
 * resolves the alert.
 */
export function selfCheckSamples(reports: Report[]): Sample[] {
  const samples: Sample[] = [];
  const totals = { sleep: new Map<string, number>(), hydration: new Map<string, number>() };

  for (const { at, data } of [...reports].sort((a, b) => a.at - b.at)) {
    const check = data as Partial<StoredCheck> | null;
    const values = check?.values && typeof check.values === "object" ? check.values : undefined;
    const items = Array.isArray(check?.items) ? check.items : [];
    const display = (id: string) => {
      const value = items.find((item) => item?.id === id)?.display;
      return typeof value === "string" ? value : "";
    };
    const bp = /^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?) mmHg$/.exec(display("bp"));
    const glucose = /^(\d+(?:\.\d+)?) mg\/dL( fasting)?$/.exec(display("glucose"));
    const temperature = /^(\d+(?:\.\d+)?) °C$/.exec(display("temperature"));
    const sleep = /^(\d+(?:\.\d+)?) h$/.exec(display("sleep"));
    const mood = / (Very low|Low|OK|Good|Great)$/.exec(display("mood"));
    const hydration = display("hydration");
    const fluid = /^(\d+(?:\.\d+)?) mL/.exec(hydration);
    const urine = /urine ([1-8])\/8$/.exec(hydration);
    const moodScore = mood ? ["Very low", "Low", "OK", "Good", "Great"].indexOf(mood[1]) + 1 : null;

    const push = (metric: MetricId, value: number | null) => {
      if (value != null) samples.push({ metric, value, at, fromSelfCheck: true });
    };
    const raw = (key: keyof typeof RANGE, legacy: number | null) =>
      reading(values && key in values ? values[key] : legacy, RANGE[key]);

    // A swapped or impossible pair (e.g. 80/120) is an input error, not a reading: never alert on it.
    const sys = raw("systolic", bp ? Number(bp[1]) : null);
    const dia = raw("diastolic", bp ? Number(bp[2]) : null);
    if (!bpInputError(sys, dia)) {
      push("systolic", sys);
      push("diastolic", dia);
    }
    const sugar = raw("glucose", glucose ? Number(glucose[1]) : null);
    const fasting = values?.fasting ?? Boolean(glucose?.[2]);
    if (typeof fasting === "boolean") push(fasting ? "glucose_fasting" : "glucose_after_meal", sugar);
    push("temperature", raw("temperature", temperature ? Number(temperature[1]) : null));
    const score = raw("mood", moodScore);
    const shade = raw("urineColor", urine ? Number(urine[1]) : null);
    if (Number.isInteger(score)) push("mood", score);
    if (Number.isInteger(shade)) push("urine_color", shade);

    const day = dayKey(at);
    const running = (metric: "sleep" | "hydration", addedKey: "sleepAddedHours" | "fluidAddedMl", key: "sleepHours" | "fluidMl", legacy: number | null) => {
      const range = RANGE[key];
      const dayTotals = totals[metric];
      if (values && addedKey in values) {
        const added = reading((values as Record<string, unknown>)[addedKey], range);
        if (added == null) return;
        const total = round1(Math.min(range[1], (dayTotals.get(day) ?? 0) + added));
        dayTotals.set(day, total);
        samples.push({ metric, value: total, at, fromSelfCheck: true, cumulative: true });
        return;
      }
      const value = raw(key, legacy);
      if (value == null) return;
      dayTotals.set(day, value);
      push(metric, value);
    };
    running("sleep", "sleepAddedHours", "sleepHours", sleep ? Number(sleep[1]) : null);
    running("hydration", "fluidAddedMl", "fluidMl", fluid ? Number(fluid[1]) : null);
  }
  return samples;
}

/** A new 24-hour snapshot already accounts for water logged before it. */
export function addLoggedWater(snapshots: Sample[], portions: { at: number; value: number }[]): Sample[] {
  const events = [
    ...snapshots.map((s) => ({ at: s.at, snapshot: s })),
    ...portions.map((p) => ({ at: p.at, portion: p.value })),
  ].sort((a, b) => a.at - b.at || Number("snapshot" in a) - Number("snapshot" in b));
  const history = new Map<number, Sample>();
  const window = 86_400_000;
  let baseline: Sample | undefined;
  const water: typeof portions = [];
  let head = 0;
  let total = 0;
  for (const event of events) {
    if ("snapshot" in event) {
      baseline = event.snapshot;
      water.length = 0;
      head = 0;
      total = 0;
      history.set(event.at, baseline);
      continue;
    }
    const cutoff = event.at - window;
    while (head < water.length && water[head].at <= cutoff) total -= water[head++].value;
    water.push({ at: event.at, value: event.portion });
    total += event.portion;
    const reported = baseline && baseline.at > cutoff ? baseline.value : 0;
    history.set(event.at, { metric: "hydration", at: event.at, value: reported + total });
  }
  return [...history.values()];
}
