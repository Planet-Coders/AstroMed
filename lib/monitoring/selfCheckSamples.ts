import type { StoredCheck } from "../selfCheck";
import { reading, READING_RANGES as RANGE } from "../selfCheckThresholds";
import type { MetricId } from "./catalog";
import { dayKey } from "./days";
import type { Sample } from "./engine";

type Report = { at: number; data: unknown };

/** Old checks stored formatted results for readings other than sleep and hydration. */
export function selfCheckSamples(reports: Report[]): Sample[] {
  const samples: Sample[] = [];
  const fluids = new Map<string, Sample>();
  const addedFluids = new Map<string, Sample>();

  for (const { at, data } of reports) {
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

    push("systolic", raw("systolic", bp ? Number(bp[1]) : null));
    push("diastolic", raw("diastolic", bp ? Number(bp[2]) : null));
    const sugar = raw("glucose", glucose ? Number(glucose[1]) : null);
    const fasting = values?.fasting ?? Boolean(glucose?.[2]);
    if (typeof fasting === "boolean") push(fasting ? "glucose_fasting" : "glucose_after_meal", sugar);
    push("temperature", raw("temperature", temperature ? Number(temperature[1]) : null));
    push("sleep", raw("sleepHours", sleep ? Number(sleep[1]) : null));
    const score = raw("mood", moodScore);
    const shade = raw("urineColor", urine ? Number(urine[1]) : null);
    if (Number.isInteger(score)) push("mood", score);
    if (Number.isInteger(shade)) push("urine_color", shade);

    const day = dayKey(at);
    if (values && "fluidAddedMl" in values) {
      const added = reading(values.fluidAddedMl, RANGE.fluidMl);
      if (added == null) continue;
      const current = addedFluids.get(day);
      addedFluids.set(day, {
        metric: "hydration", value: (current?.value ?? 0) + added,
        at: Math.max(at, current?.at ?? at), fromSelfCheck: true,
      });
    } else {
      const snapshot = raw("fluidMl", fluid ? Number(fluid[1]) : null);
      if (snapshot == null) continue;
      const current = fluids.get(day);
      if (!current || at > current.at) fluids.set(day, { metric: "hydration", value: snapshot, at, fromSelfCheck: true });
    }
  }

  // A legacy rolling 24-hour snapshot may overlap the portions entered for this UTC day.
  for (const [day, sample] of addedFluids) fluids.set(day, sample);
  return [...samples, ...fluids.values()];
}
