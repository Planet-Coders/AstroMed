import type { RiskLevel } from "@/lib/risk";
import { getOutboxUser, queueHealth } from "@/lib/outbox";
import { CHECK_LIMITS, GLUCOSE_REF, GLUCOSE_CREW_AVG, GLUCOSE_LANDING_CHANGE } from "@/lib/selfCheckThresholds";

/**
 * Daily Self-Check: the indicators the crew measures themselves each morning, with
 * how-to steps, why each matters in spaceflight, and the ranges used to colour the
 * result. Ranges are demo guidance modelled on common clinical cut-offs and NASA HRP
 * evidence summaries, not medical advice.
 */

export type Mood = 1 | 2 | 3 | 4 | 5;

export type SelfCheckValues = {
  systolic: number | null;
  diastolic: number | null;
  glucose: number | null; // mg/dL
  temperature: number | null; // °C
  mood: Mood | null;
  sleepHours: number | null;
  fasting: boolean;
  /** Self-reported fluid in the last 24 hours, in mL. */
  fluidMl: number | null;
  /** Urine colour on the 8-shade chart: 1 pale straw … 8 dark brown. */
  urineColor: number | null;
};

export type ItemResult = {
  id: StepId;
  label: string;
  display: string;
  level: RiskLevel;
  advice: string;
};

export type StepId = "bp" | "glucose" | "temperature" | "mood" | "sleep" | "hydration";

export type StepInfo = {
  id: StepId;
  title: string;
  unit: string;
  howTo: string[];
  whySpace: string;
  normal: string;
  hazard: string;
};

export const STEPS: StepInfo[] = [
  {
    id: "bp",
    title: "Blood pressure",
    unit: "mmHg",
    howTo: [
      "Sit strapped in, feet on the floor rail, and rest 5 minutes without talking.",
      "Put the cuff on your bare left upper arm, at heart level, tube over the inner elbow.",
      "Press start and stay still. Enter the top (systolic) and bottom (diastolic) numbers.",
    ],
    whySpace:
      "Without gravity, blood and fluid shift toward the head. Blood pressure and heart workload change in the first weeks, and stress, radiation and inactivity raise long-term cardiovascular risk.",
    normal: "95 to under 130 systolic · 60 to under 85 diastolic (mmHg)",
    hazard: "Gravity · Hostile environment",
  },
  {
    id: "glucose",
    title: "Blood sugar",
    unit: "mg/dL",
    howTo: [
      "Wash and dry your hands. Wipe a fingertip with an alcohol pad.",
      "Insert a test strip into the meter, prick the side of the fingertip with the lancet.",
      "Touch the drop to the strip and read the number. Note if you have eaten in the last 8 hours.",
    ],
    whySpace:
      `Spaceflight reduces insulin sensitivity: muscles use less sugar when unloaded, and stress hormones and poor sleep add to it. In NASA OSDR data from the Inspiration4 crew, average glucose rose ${GLUCOSE_LANDING_CHANGE}% the day after landing (OSD-575).`,
    normal: `${GLUCOSE_REF[0]}–${GLUCOSE_REF[1]} mg/dL fasting (crew pre-flight avg ${GLUCOSE_CREW_AVG}) · below 140 after meals`,
    hazard: "Gravity · Hostile environment",
  },
  {
    id: "temperature",
    title: "Body temperature",
    unit: "°C",
    howTo: [
      "Wait 15 minutes after exercise, a hot drink or a meal.",
      "Place the thermometer under your tongue, toward the back, and close your lips.",
      "Wait for the beep and enter the reading.",
    ],
    whySpace:
      "Core body temperature runs about 1 °C higher in space, and exercise heats you more because sweat doesn't evaporate. The immune system also weakens in flight, so a fever matters sooner.",
    normal: "36.0 to under 37.6 °C",
    hazard: "Hostile environment · Isolation",
  },
  {
    id: "mood",
    title: "Mood",
    unit: "",
    howTo: [
      "Take one slow breath and think about the last 24 hours as a whole.",
      "Pick the face that matches how you feel. There is no wrong answer.",
    ],
    whySpace:
      "Isolation, confinement, a 20-minute delay to home and a heavy workload wear on mood. Tracking it daily catches a downward trend early, before it affects sleep, teamwork or safety.",
    normal: "3 (OK) or better",
    hazard: "Isolation · Distance",
  },
  {
    id: "sleep",
    title: "Sleep",
    unit: "hours",
    howTo: [
      "Check the hours from your sleep log (pre-filled), or enter them yourself.",
      "Count actual sleep, not time in the sleeping bag.",
    ],
    whySpace:
      "Light-dark cycles, noise and stress cut sleep in flight to about 6 hours on average. Sleep debt slows reaction time and raises error risk during critical tasks.",
    normal: "7 hours or more",
    hazard: "Isolation · Hostile environment",
  },
  {
    id: "hydration",
    title: "Hydration",
    unit: "mL",
    howTo: [
      "Add up what you drank in the last 24 hours. Drink bags, rehydrated food and coffee count.",
      "Compare your most recent urine colour with the 8-shade chart (1 pale straw … 8 dark).",
      "Enter either or both. You can log additional water from a low fluid intake alert in My monitoring.",
    ],
    whySpace:
      "Fluid shifts dull thirst in weightlessness, and calcium lost from bone raises kidney-stone risk. NASA's renal stone evidence report names relative dehydration as a main driver; a NASA study found crew producing over 2.5 L of urine a day appeared to minimise the risk (NTRS 20240012429, 20000020539).",
    normal: "2,000–2,500 mL or more · urine colour 1–3",
    hazard: "Gravity · Hostile environment",
  },
];

export const MOODS: { value: Mood; face: string; label: string }[] = [
  { value: 1, face: "😞", label: "Very low" },
  { value: 2, face: "🙁", label: "Low" },
  { value: 3, face: "😐", label: "OK" },
  { value: 4, face: "🙂", label: "Good" },
  { value: 5, face: "😄", label: "Great" },
];

export function assessBp(sys: number | null, dia: number | null): Omit<ItemResult, "id" | "label" | "display"> {
  const { systolicHigh, systolicLow, diastolicHigh, diastolicLow } = CHECK_LIMITS;
  const high = (limit: "amber" | "red") =>
    (sys != null && sys >= systolicHigh[limit]) || (dia != null && dia >= diastolicHigh[limit]);
  const low = (limit: "amber" | "red") =>
    (sys != null && sys < systolicLow[limit]) || (dia != null && dia < diastolicLow[limit]);
  if (high("red") || low("red")) {
    return { level: "RED", advice: "Blood pressure is outside the alert range. Recheck after resting and contact the CMO." };
  }
  if (high("amber") || low("amber")) {
    return { level: "YELLOW", advice: "Blood pressure is outside the target range. Recheck after 5 minutes of rest." };
  }
  if (sys == null || dia == null) {
    return { level: "GREEN", advice: "Enter both numbers to assess the full blood pressure reading." };
  }
  return { level: "GREEN", advice: "In range. Keep up hydration and daily exercise." };
}

export function assessGlucose(g: number, fasting: boolean): Omit<ItemResult, "id" | "label" | "display"> {
  if (g < GLUCOSE_REF[0])
    return {
      level: g < CHECK_LIMITS.glucoseLow.red ? "RED" : "YELLOW",
      advice: `Low. Take 15 g of fast sugar (juice pouch or glucose tabs), wait 15 minutes and recheck. Tell the CMO if it stays under ${GLUCOSE_REF[0]} or you feel shaky or confused.`,
    };
  const high = fasting ? CHECK_LIMITS.glucoseFastingHigh : CHECK_LIMITS.glucoseAfterMealHigh;
  if (g >= high.red)
    return {
      level: "RED",
      advice: "High. Drink water, recheck in 2 hours, and report to the CMO. Note recent meals and medicines.",
    };
  if (g >= high.amber)
    return {
      level: "YELLOW",
      advice: "Slightly high. Keep resistance exercise on plan (muscle use lowers sugar) and recheck tomorrow fasting.",
    };
  return {
    level: "GREEN",
    advice: `In range. Inspiration4 crew averaged ${GLUCOSE_CREW_AVG} mg/dL before flight (NASA OSDR).`,
  };
}

export function assessTemperature(t: number): Omit<ItemResult, "id" | "label" | "display"> {
  if (t >= CHECK_LIMITS.temperatureHigh.red || t < CHECK_LIMITS.temperatureLow.red)
    return {
      level: "RED",
      advice:
        t < CHECK_LIMITS.temperatureLow.red
          ? "Too low. Recheck the reading, warm up with layers and a warm drink, and call the CMO if it stays below 35 °C."
          : "Fever. Rest, hydrate, take paracetamol if not allergic, isolate from crew if possible and call the CMO.",
    };
  if (t >= CHECK_LIMITS.temperatureHigh.amber || t < CHECK_LIMITS.temperatureLow.amber)
    return {
      level: "YELLOW",
      advice:
        t < CHECK_LIMITS.temperatureLow.amber
          ? "A bit low. Recheck after 15 minutes."
          : "Slightly raised. Normal right after exercise in space; recheck after 30 minutes of rest.",
    };
  return { level: "GREEN", advice: "In range." };
}

export function assessMood(m: Mood): Omit<ItemResult, "id" | "label" | "display"> {
  if (m < CHECK_LIMITS.moodLow.red)
    return {
      level: "RED",
      advice:
        "Thank you for being honest. Talk to the CMO today, and book a private conference with the ground psychologist. You are not alone out here.",
    };
  if (m < CHECK_LIMITS.moodLow.amber)
    return {
      level: "YELLOW",
      advice:
        "Plan something restorative today: a call or video from home, Earth-gazing, music, or a meal with the crew. Check in again tomorrow.",
    };
  return { level: "GREEN", advice: "Good. Keep protecting off-duty time." };
}

export function assessSleep(h: number): Omit<ItemResult, "id" | "label" | "display"> {
  if (h < CHECK_LIMITS.sleepLow.red)
    return {
      level: "RED",
      advice:
        "Severe sleep debt. Avoid EVA and critical tasks today if possible, take a 20-minute nap, and talk to the CMO about tonight's sleep plan.",
    };
  if (h < CHECK_LIMITS.sleepLow.amber)
    return {
      level: "YELLOW",
      advice: "Short sleep. No caffeine after midday, dim the lights 1 hour before bed, and use eye mask and earplugs.",
    };
  return { level: "GREEN", advice: "Well rested." };
}

export const URINE_COLORS = ["#f8f4c4", "#f4ec9c", "#efe07a", "#e8cf55", "#dcb83b", "#c99a2a", "#ad7a1f", "#86571a"];

export function assessHydration(fluidMl: number | null, urineColor: number | null): Omit<ItemResult, "id" | "label" | "display"> {
  const lowRed = fluidMl != null && fluidMl < CHECK_LIMITS.hydrationLow.red;
  const darkRed = urineColor != null && urineColor >= CHECK_LIMITS.urineDark.red;
  if (lowRed || darkRed)
    return {
      level: "RED",
      advice: darkRed
        ? "Urine colour is outside the alert range. Follow your hydration plan and contact the CMO."
        : "Your reported fluid intake is below target. Follow your hydration plan and log additional water in My monitoring.",
    };
  if ((fluidMl != null && fluidMl < CHECK_LIMITS.hydrationLow.amber) || (urineColor != null && urineColor >= CHECK_LIMITS.urineDark.amber))
    return {
      level: "YELLOW",
      advice: "Below target. Keep a drink bag in reach and aim for at least 2,000–2,500 mL today; recheck urine colour this evening.",
    };
  return { level: "GREEN", advice: "In range for the values entered." };
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

/** Steps a check can record; a skipped step is stored so "not measured" is explicit. */
export type StepStatus = "ready" | "empty" | "invalid";

/** Whether Next may continue: it needs a complete, valid value. Skip is for leaving a step blank. */
export function stepStatus(id: StepId, v: SelfCheckValues, raw: { sys: string; dia: string; glucose: string; temp: string; sleep: string; fluid: string }): StepStatus {
  switch (id) {
    case "bp":
      if ((raw.sys && v.systolic == null) || (raw.dia && v.diastolic == null)) return "invalid";
      if (v.systolic == null || v.diastolic == null) return raw.sys || raw.dia ? "invalid" : "empty";
      return bpInputError(v.systolic, v.diastolic) ? "invalid" : "ready";
    case "glucose":
      return v.glucose != null ? "ready" : raw.glucose ? "invalid" : "empty";
    case "temperature":
      return v.temperature != null ? "ready" : raw.temp ? "invalid" : "empty";
    case "mood":
      return v.mood != null ? "ready" : "empty";
    case "sleep":
      return v.sleepHours != null ? "ready" : raw.sleep ? "invalid" : "empty";
    case "hydration":
      if (raw.fluid && v.fluidMl == null) return "invalid";
      return v.fluidMl != null || v.urineColor != null ? "ready" : "empty";
  }
}

export function assessAll(v: SelfCheckValues): ItemResult[] {
  const out: ItemResult[] = [];
  if ((v.systolic != null || v.diastolic != null) && !bpInputError(v.systolic, v.diastolic)) {
    const assessment = assessBp(v.systolic, v.diastolic);
    const complete = v.systolic != null && v.diastolic != null;
    if (complete || assessment.level !== "GREEN") {
      const display = complete
        ? `${v.systolic}/${v.diastolic} mmHg`
        : v.systolic != null ? `${v.systolic} mmHg systolic` : `${v.diastolic} mmHg diastolic`;
      out.push({ id: "bp", label: "Blood pressure", display, ...assessment });
    }
  }
  if (v.glucose != null)
    out.push({
      id: "glucose",
      label: "Blood sugar",
      display: `${v.glucose} mg/dL${v.fasting ? " fasting" : ""}`,
      ...assessGlucose(v.glucose, v.fasting),
    });
  if (v.temperature != null)
    out.push({ id: "temperature", label: "Temperature", display: `${v.temperature.toFixed(1)} °C`, ...assessTemperature(v.temperature) });
  if (v.mood != null)
    out.push({
      id: "mood",
      label: "Mood",
      display: `${MOODS[v.mood - 1].face} ${MOODS[v.mood - 1].label}`,
      ...assessMood(v.mood),
    });
  if (v.sleepHours != null)
    out.push({ id: "sleep", label: "Sleep", display: `${v.sleepHours.toFixed(1)} h`, ...assessSleep(v.sleepHours) });
  if (v.fluidMl != null || v.urineColor != null)
    out.push({
      id: "hydration",
      label: "Hydration",
      display: [v.fluidMl != null ? `${v.fluidMl} mL` : null, v.urineColor != null ? `urine ${v.urineColor}/8` : null].filter(Boolean).join(", "),
      ...assessHydration(v.fluidMl, v.urineColor),
    });
  return out;
}

export function overallLevel(items: ItemResult[]): RiskLevel {
  if (items.some((i) => i.level === "RED")) return "RED";
  if (items.some((i) => i.level === "YELLOW")) return "YELLOW";
  return "GREEN";
}

// --- Persistence: the latest check per user is cached for the co-pilot prompt.

const KEY = "aahms_selfcheck_latest";

export type StoredCheck = {
  userId: string;
  at: number;
  items: ItemResult[];
  /** Steps the crew member chose to skip (not measured), so missing data is explicit. */
  skipped?: StepId[];
  values?: Partial<SelfCheckValues> & {
    /** Additional fluid recorded by the previous version of Daily Check. */
    fluidAddedMl?: number | null;
  };
};

export function saveLatestCheck(check: StoredCheck) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, StoredCheck>;
    all[check.userId] = check;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable */
  }
  // Each check is kept on the server as its own record, so oversight sees the history.
  if (getOutboxUser()?.userId === check.userId) void queueHealth("selfCheck", String(check.at), check);
}

export function getLatestCheck(userId: string): StoredCheck | null {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, StoredCheck>;
    return all[userId] ?? null;
  } catch {
    return null;
  }
}

export function isToday(ts: number) {
  return new Date(ts).toDateString() === new Date().toDateString();
}

/** One line for the co-pilot prompt. */
export function describeCheck(check: StoredCheck | null): string {
  if (!check) return "Daily self-check: not done yet.";
  const when = isToday(check.at) ? "today" : new Date(check.at).toLocaleDateString();
  return `Daily self-check (${when}): ${check.items
    .map((i) => `${i.label} ${i.display}${i.level === "GREEN" ? " (normal)" : i.level === "YELLOW" ? " (watch)" : " (ALERT)"}`)
    .join(", ")}.`;
}
