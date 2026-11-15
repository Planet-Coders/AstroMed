"use client";

import { useEffect, useState } from "react";
import { Card } from "./ui/Card";
import { useMissionTelemetry } from "@/components/MissionTelemetryProvider";
import { useCopilot } from "./CopilotProvider";
import { riskLabel, type RiskLevel } from "@/lib/risk";
import {
  MOODS,
  STEPS,
  URINE_COLORS,
  assessAll,
  bpInputError,
  overallLevel,
  stepStatus,
  type StepId,
  saveLatestCheck,
  type Mood,
  type SelfCheckValues,
} from "@/lib/selfCheck";
import { reading, READING_RANGES as RANGE } from "@/lib/selfCheckThresholds";

const TONE: Record<RiskLevel, { text: string; border: string; bg: string; dot: string }> = {
  GREEN: { text: "text-mc-green", border: "border-mc-green/40", bg: "bg-mc-green/10", dot: "bg-mc-green" },
  YELLOW: { text: "text-mc-amber", border: "border-mc-amber/50", bg: "bg-mc-amber/10", dot: "bg-mc-amber" },
  RED: { text: "text-mc-red", border: "border-mc-red/60", bg: "bg-mc-red/10", dot: "bg-mc-red" },
};

const inputCls =
  "w-full rounded-md border border-mc-line-strong bg-mc-inset px-3 py-2.5 font-mono text-xl text-foreground focus:border-mc-select focus:outline-none";

/** An unfinished check is kept on this device so leaving the page doesn't lose it (12 h). */
const DRAFT_TTL = 12 * 3600_000;
type Draft = {
  at: number;
  step: number;
  raw: { sys: string; dia: string; glucose: string; temp: string };
  fasting: boolean;
  mood: Mood | null;
  sleep: string;
  fluid: string;
  urine: number | null;
  skipped: StepId[];
};
const nowMs = () => Date.now();
const draftKey = (userId: string) => `astromed_selfcheck_draft:${userId}`;
function loadDraft(userId: string): Draft | null {
  try {
    const d = JSON.parse(localStorage.getItem(draftKey(userId)) ?? "null") as Draft | null;
    return d && Date.now() - d.at < DRAFT_TTL && d.step >= 0 ? d : null;
  } catch {
    return null;
  }
}
function clearDraft(userId: string) {
  try {
    localStorage.removeItem(draftKey(userId));
  } catch {
    /* unavailable */
  }
}

/** Parse a typed reading; values outside what a device can show count as typos. */
function num(s: string, range: readonly [number, number]): number | null {
  return s.trim() === "" ? null : reading(Number(s), range);
}

/**
 * Guided morning check: one indicator per step with how-to instructions, why it matters
 * in space, the normal range, and an instant colour as the value is entered. Ends with a
 * summary, advice per item, and a route to the CMO / ground surgeon when anything is red.
 */
export function DailySelfCheck({ userId, userName, onDone, onReviewAlerts }: {
  userId: string;
  userName: string;
  onDone?: () => void;
  onReviewAlerts?: () => void;
}) {
  const { sleepHours } = useMissionTelemetry();
  const { setChatOpen, setInput } = useCopilot();
  const [step, setStep] = useState(-1); // -1 intro, 0..n-1 steps, n summary
  const [raw, setRaw] = useState({ sys: "", dia: "", glucose: "", temp: "" });
  const [fasting, setFasting] = useState(true);
  const [mood, setMood] = useState<Mood | null>(null);
  const [sleep, setSleep] = useState(sleepHours.toFixed(1));
  const [fluid, setFluid] = useState("");
  const [urine, setUrine] = useState<number | null>(null);
  const [savedResults, setSavedResults] = useState<ReturnType<typeof assessAll>>([]);
  const [skipped, setSkipped] = useState<StepId[]>([]);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [resumed, setResumed] = useState(false);

  // Resume an unfinished check (e.g. after leaving at step 2 for another page).
  useEffect(() => {
    const d = loadDraft(userId);
    if (!d) return;
    /* eslint-disable react-hooks/set-state-in-effect -- one-time restore from device storage */
    setRaw(d.raw);
    setFasting(d.fasting);
    setMood(d.mood);
    setSleep(d.sleep);
    setFluid(d.fluid);
    setUrine(d.urine);
    setSkipped(d.skipped ?? []);
    setStep(Math.min(d.step, STEPS.length - 1));
    setResumed(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [userId]);

  // Keep the draft up to date while a check is in progress.
  useEffect(() => {
    if (step < 0 || step >= STEPS.length) return;
    try {
      const d: Draft = { at: Date.now(), step, raw, fasting, mood, sleep, fluid, urine, skipped };
      localStorage.setItem(draftKey(userId), JSON.stringify(d));
    } catch {
      /* unavailable */
    }
  }, [userId, step, raw, fasting, mood, sleep, fluid, urine, skipped]);
  const values: SelfCheckValues = {
    systolic: num(raw.sys, RANGE.systolic),
    diastolic: num(raw.dia, RANGE.diastolic),
    glucose: num(raw.glucose, RANGE.glucose),
    temperature: num(raw.temp, RANGE.temperature),
    mood,
    sleepHours: num(sleep, RANGE.sleepHours),
    fasting,
    fluidMl: num(fluid, RANGE.fluidMl),
    urineColor: urine,
  };
  const results = step === STEPS.length ? savedResults : assessAll(values);
  const overall = overallLevel(results);
  const n = STEPS.length;

  const finish = (skipHydration = false) => {
    const at = nowMs();
    const skippedSteps: StepId[] = skipHydration ? [...new Set([...skipped, "hydration" as StepId])] : skipped;
    const completed = {
      ...values,
      fluidMl: skipHydration ? null : values.fluidMl,
      urineColor: skipHydration ? null : urine,
    };
    const items = assessAll(completed);
    if (Object.values(completed).some((value) => typeof value === "number")) {
      saveLatestCheck({ userId, at, items, values: completed, skipped: skippedSteps });
      setSavedAt(at);
    } else {
      setSavedAt(null);
    }
    clearDraft(userId);
    setSkipped(skippedSteps);
    setSavedResults(items);
    setStep(n);
  };

  const askCopilot = () => {
    const flagged = results.filter((r) => r.level !== "GREEN");
    setInput(
      flagged.length
        ? `My self-check today: ${flagged.map((r) => `${r.label} ${r.display}`).join(", ")}. What should I do?`
        : "Can you help me review the readings I entered in today's self-check?"
    );
    setChatOpen(true);
  };

  if (step === -1) {
    return (
      <Card title="Daily self-check">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xl font-semibold">Hello, {userName}.</p>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-mc-muted">
              Six quick measurements, about 2 minutes. Each step shows how to measure and why it matters up here.
              Results are coloured as you type: green is fine, amber means watch it, red means act now.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {STEPS.map((s) => (
                <span key={s.id} className="rounded-full border border-mc-line-strong px-3 py-1 text-xs text-mc-soft">
                  {s.title}
                </span>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setRaw({ sys: "", dia: "", glucose: "", temp: "" });
              setFasting(true);
              setMood(null);
              setSleep(sleepHours.toFixed(1));
              setFluid("");
              setUrine(null);
              setStep(0);
            }}
            className="min-h-12 shrink-0 rounded-md border border-mc-select bg-mc-select px-6 text-sm font-semibold text-mc-on-select"
          >
            Start check
          </button>
        </div>
      </Card>
    );
  }

  if (step === n) {
    const tone = TONE[overall];
    return (
      <Card title="Daily self-check · results">
        <div className={`rounded-lg border p-4 ${tone.border} ${tone.bg}`}>
          <p className="mc-label">Overall</p>
          <p className={`text-2xl font-semibold ${results.length ? tone.text : "text-mc-muted"}`}>
            {results.length ? riskLabel(overall) : "No measurements entered"}
          </p>
          <p className="mt-1 text-sm text-mc-soft">
            {results.length === 0
              ? "Start another check to log a reading."
              : overall === "GREEN"
              ? "The assessed readings are in range."
              : overall === "YELLOW"
                ? "Follow the guidance below and recheck as needed."
                : "Review the flagged readings and follow the guidance below."}
          </p>
        </div>
        {savedAt && (
          <p className="mt-3 rounded-md border border-mc-green/40 bg-mc-green/10 px-3 py-2 text-sm text-mc-green" role="status">
            ✓ Saved at {new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Kept on this device and queued to sync to Earth.
          </p>
        )}
        {skipped.length > 0 && (
          <p className="mt-2 text-xs text-mc-label">
            Skipped (not measured): {skipped.map((id) => STEPS.find((x) => x.id === id)?.title ?? id).join(", ")}.
          </p>
        )}
        <ul className="mt-4 divide-y divide-mc-line">
          {results.map((r) => (
            <li key={r.id} className="flex gap-3 py-3">
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${TONE[r.level].dot}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold">{r.label}</span>
                  <span className={`font-mono text-sm ${TONE[r.level].text}`}>
                    {r.display} · {riskLabel(r.level)}
                  </span>
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-mc-muted">{r.advice}</p>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          {overall !== "GREEN" && onReviewAlerts && (
            <button
              type="button"
              onClick={onReviewAlerts}
              className="min-h-11 rounded-md border border-mc-line-strong px-4 text-sm text-mc-soft"
            >
              Review in My monitoring
            </button>
          )}
          {results.length > 0 && (
            <button
              type="button"
              onClick={askCopilot}
              className="min-h-11 rounded-md border border-mc-select bg-mc-select px-4 text-sm font-semibold text-mc-on-select"
            >
              Ask the co-pilot about my results
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setStep(-1);
              setSkipped([]);
              setResumed(false);
              onDone?.();
            }}
            className="min-h-11 rounded-md border border-mc-line-strong px-4 text-sm text-mc-soft"
          >
            Done
          </button>
        </div>
      </Card>
    );
  }

  const info = STEPS[step];
  const result = results.find((r) => r.id === info.id);
  const level = result?.level;
  const status = stepStatus(info.id, values, { ...raw, sleep, fluid });
  const bpError = info.id === "bp" ? bpInputError(values.systolic, values.diastolic) : null;
  const bpHalf = info.id === "bp" && !bpError && (values.systolic == null) !== (values.diastolic == null);
  const typo = status === "invalid" && !bpError && !bpHalf;
  const next = () => {
    setSkipped((list) => list.filter((id) => id !== info.id));
    if (step === n - 1) finish();
    else setStep(step + 1);
  };

  function skipStep() {
    setSkipped((list) => (list.includes(info.id) ? list : [...list, info.id]));
    if (info.id === "hydration") return finish(true);
    if (info.id === "bp") setRaw({ ...raw, sys: "", dia: "" });
    if (info.id === "glucose") setRaw({ ...raw, glucose: "" });
    if (info.id === "temperature") setRaw({ ...raw, temp: "" });
    if (info.id === "mood") setMood(null);
    if (info.id === "sleep") setSleep("");
    setStep(step + 1);
  }

  return (
    <Card
      title={`Daily self-check · step ${step + 1} of ${n}`}
      action={
        <div className="flex gap-1" aria-hidden>
          {STEPS.map((s, i) => (
            <span key={s.id} className={`h-1.5 w-8 rounded-full ${i < step ? "bg-mc-select" : i === step ? "bg-white" : "bg-mc-line"}`} />
          ))}
        </div>
      }
    >
      {resumed && (
        <p className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-mc-line bg-mc-inset px-3 py-2 text-xs text-mc-soft" role="status">
          Picked up where you left off.
          <button type="button" onClick={() => setResumed(false)} className="text-mc-link underline">
            OK
          </button>
        </p>
      )}
      <div className="grid gap-6 md:grid-cols-2">
        {/* How and why */}
        <div>
          <h3 className="text-2xl font-semibold">{info.title}</h3>
          <p className="mt-1 font-mono text-xs text-mc-label">
            Normal: {info.normal} · Hazard: {info.hazard}
          </p>
          <p className="mc-label mt-4">How to measure</p>
          <ol className="mt-2 space-y-2">
            {info.howTo.map((t, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed text-mc-soft">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-mc-raised font-mono text-xs">
                  {i + 1}
                </span>
                {t}
              </li>
            ))}
          </ol>
          <details className="mt-4 rounded-md border border-mc-line bg-mc-inset px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-mc-link">Why this matters in space</summary>
            <p className="mt-2 text-[13px] leading-relaxed text-mc-muted">{info.whySpace}</p>
          </details>
        </div>

        {/* Input and instant result */}
        <div className="flex flex-col gap-3">
          {info.id === "bp" && (
            <div className="grid grid-cols-2 gap-3">
              <label className="mc-label">
                Systolic (top)
                <input inputMode="numeric" value={raw.sys} onChange={(e) => setRaw({ ...raw, sys: e.target.value })} placeholder="118" className={`${inputCls} mt-1.5`} autoFocus />
              </label>
              <label className="mc-label">
                Diastolic (bottom)
                <input inputMode="numeric" value={raw.dia} onChange={(e) => setRaw({ ...raw, dia: e.target.value })} placeholder="76" className={`${inputCls} mt-1.5`} />
              </label>
            </div>
          )}
          {info.id === "glucose" && (
            <>
              <label className="mc-label">
                Blood sugar (mg/dL)
                <input inputMode="numeric" value={raw.glucose} onChange={(e) => setRaw({ ...raw, glucose: e.target.value })} placeholder="92" className={`${inputCls} mt-1.5`} autoFocus />
              </label>
              <label className="flex items-center gap-2 text-sm text-mc-soft">
                <input type="checkbox" checked={fasting} onChange={(e) => setFasting(e.target.checked)} className="h-4 w-4 accent-mc-select" />
                Fasting (nothing eaten for 8 hours)
              </label>
            </>
          )}
          {info.id === "temperature" && (
            <label className="mc-label">
              Temperature (°C)
              <input inputMode="decimal" value={raw.temp} onChange={(e) => setRaw({ ...raw, temp: e.target.value })} placeholder="36.8" className={`${inputCls} mt-1.5`} autoFocus />
            </label>
          )}
          {info.id === "mood" && (
            <>
              <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Mood">
                {MOODS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    role="radio"
                    aria-checked={mood === m.value}
                    onClick={() => setMood(m.value)}
                    className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-lg border text-xs transition ${
                      mood === m.value ? "border-mc-select bg-mc-select text-mc-on-select" : "border-mc-line-strong text-mc-muted hover:text-foreground"
                    }`}
                  >
                    <span className="text-3xl" aria-hidden>
                      {m.face}
                    </span>
                    {m.label}
                  </button>
                ))}
              </div>
            </>
          )}
          {info.id === "hydration" && (
            <>
              <label className="mc-label">
                Fluid in the last 24 h (mL)
                <input inputMode="numeric" value={fluid} onChange={(e) => setFluid(e.target.value)} placeholder="2400" className={`${inputCls} mt-1.5`} autoFocus />
              </label>
              <div>
                <p className="mc-label">Most recent urine colour</p>
                <div className="mt-1.5 grid grid-cols-8 gap-1.5" role="radiogroup" aria-label="Urine colour">
                  {URINE_COLORS.map((c, i) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={urine === i + 1}
                      aria-label={`Shade ${i + 1} of 8`}
                      onClick={() => setUrine(i + 1)}
                      style={{ background: c }}
                      className={`h-10 rounded-md font-mono text-xs font-semibold text-black/70 ${urine === i + 1 ? "ring-2 ring-white ring-offset-2 ring-offset-mc-panel" : ""}`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-mc-label">1–3 well hydrated · 4–5 drink more · 6–8 dehydrated</p>
              </div>
            </>
          )}
          {info.id === "sleep" && (
            <label className="mc-label">
              Hours slept last night
              <input inputMode="decimal" value={sleep} onChange={(e) => setSleep(e.target.value)} className={`${inputCls} mt-1.5`} autoFocus />
              <span className="mt-1 block normal-case tracking-normal text-mc-label">Pre-filled from your sleep log.</span>
            </label>
          )}

          <div
            className={`min-h-24 rounded-lg border p-3 transition ${level ? `${TONE[level].border} ${TONE[level].bg}` : "border-mc-line bg-mc-inset"}`}
            aria-live="polite"
          >
            {bpError ? (
              <p className="text-[13px] text-mc-amber" role="alert">
                <strong>Invalid reading, please re-enter.</strong> {bpError}
              </p>
            ) : bpHalf ? (
              <p className="text-[13px] text-mc-label">Enter both the top and bottom numbers to continue.</p>
            ) : typo ? (
              <p className="text-[13px] text-mc-amber">That number looks off. Check the reading and re-enter it.</p>
            ) : level && result ? (
              <>
                <p className={`font-mono text-sm font-semibold ${TONE[level].text}`}>
                  {result.display} · {riskLabel(level)}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-mc-soft">{result.advice}</p>
              </>
            ) : (
              <p className="text-[13px] text-mc-label">Your result and what to do will appear here.</p>
            )}
          </div>

          <p className="mt-auto pt-2 text-[11px] text-mc-label">
            <strong>Next</strong> saves this reading. <strong>Skip</strong> leaves it out and records it as not measured.
          </p>
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => setStep(step - 1)} className="min-h-11 rounded-md px-3 text-sm text-mc-muted hover:text-foreground">
              ← Back
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={skipStep}
                className="min-h-11 rounded-md px-3 text-sm text-mc-label hover:text-foreground"
              >
                Skip
              </button>
              <button
                type="button"
                onClick={next}
                disabled={status !== "ready"}
                title={status === "ready" ? undefined : "Enter a valid value, or use Skip to leave this step out"}
                className="min-h-11 rounded-md border border-mc-select bg-mc-select px-5 text-sm font-semibold text-mc-on-select disabled:opacity-50"
              >
                {step === n - 1 ? "See results" : "Next →"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
