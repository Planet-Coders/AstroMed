import { assessAll, describeCheck, getLatestCheck, STEPS, type ItemResult, type SelfCheckValues, type StepId, type StoredCheck } from "@/lib/selfCheck";
import { reading, READING_RANGES } from "@/lib/selfCheckThresholds";

const CHECK_TOPIC = /\b(?:daily (?:self[- ]?)?check|(?:last|latest|most recent) check)\b/i;
const STEP_TOPICS: Record<StepId, RegExp> = {
  bp: /\b(?:blood pressure|systolic|diastolic|top number|bottom number|bp)\b/i,
  glucose: /\b(?:glucose|blood sugar|fasting)\b/i,
  temperature: /\b(?:temperature|fever)\b/i,
  mood: /\b(?:mood|stress|anxious|anxiety)\b/i,
  sleep: /\b(?:sleep|fatigue|tired|eva)\b/i,
  hydration: /\b(?:hydration|dehydration|water|fluid|urine|kidney)\b/i,
};

export function isDailyCheckQuestion(question: string) {
  return CHECK_TOPIC.test(question);
}

export function isDailyCheckLookup(question: string) {
  return isDailyCheckQuestion(question)
    && /\b(?:last|latest|most recent|my|show|record(?:ed|s)?|results?|readings?)\b/i.test(question)
    && !/\b(?:why|should|interpret|explain|means?|compare|trend|improve|next|concern|worried)\b/i.test(question);
}

/** Rebuild older synced reports that only contain raw values. */
function reportItems(data: Partial<StoredCheck>): ItemResult[] {
  const items = Array.isArray(data.items) ? data.items.filter((item) =>
    item && Object.hasOwn(STEP_TOPICS, item.id) && typeof item.label === "string" &&
    typeof item.display === "string" && ["GREEN", "YELLOW", "RED"].includes(item.level)
  ) : [];
  if (items.length || !data.values) return items;

  const values = Object.fromEntries(Object.entries(READING_RANGES).map(([key, range]) => [
    key, reading(data.values?.[key as keyof typeof READING_RANGES], range),
  ])) as Omit<SelfCheckValues, "fasting">;
  return assessAll({
    ...values,
    fasting: data.values.fasting === true,
    mood: Number.isInteger(values.mood) ? values.mood : null,
    urineColor: Number.isInteger(values.urineColor) ? values.urineColor : null,
  });
}

/** The device summary can combine several saves, each with its own capture time. */
function latestLocalRecord(userId: string): StoredCheck | null {
  const check = getLatestCheck(userId);
  if (!check || !Number.isFinite(check.at) || !Array.isArray(check.items)) return null;
  if (!check.merged || !check.recordedItems) return check;
  const items = check.items.flatMap((item) => {
    const actual = check.recordedItems?.[item.id];
    return actual?.at === check.at ? [{ ...item, display: actual.display, level: actual.level }] : [];
  });
  return { ...check, items, skipped: [], partial: true };
}

export async function loadCopilotDailyCheck(userId: string, topic: string, signal: AbortSignal) {
  if (!isDailyCheckQuestion(topic) && !Object.values(STEP_TOPICS).some((pattern) => pattern.test(topic))) return null;
  const local = latestLocalRecord(userId);
  if (!isDailyCheckQuestion(topic) || signal.aborted) return local;

  try {
    const res = await fetch("/api/health/reports/latest-self-check", {
      signal: AbortSignal.any([signal, AbortSignal.timeout(local ? 1500 : 4000)]),
      cache: "no-store",
    });
    if (res.ok) {
      const body = await res.json() as { userId: string; report: { key: string; data: Partial<StoredCheck> | null } | null };
      const at = Number(body.report?.key);
      const data = body.report?.data;
      if (body.userId === userId && data && /^\d{13}$/.test(body.report?.key ?? "") && (!local || at >= local.at)) {
        return { userId, at, items: reportItems(data), skipped: Array.isArray(data.skipped) ? data.skipped : [], partial: data.partial === true };
      }
    }
  } catch {
    // The latest device record is still available while the server is unreachable.
  }
  return local;
}

export function describeCopilotDailyCheck(check: StoredCheck | null, topic: string) {
  if (!check) return undefined;
  const requested = STEPS.filter(({ id }) => STEP_TOPICS[id].test(topic));
  const items = requested.length ? check.items.filter((item) => requested.some(({ id }) => id === item.id)) : check.items;
  if (!items.length && !isDailyCheckQuestion(topic)) return undefined;
  const missing = (requested.length ? requested : STEPS.filter(({ id }) => check.skipped?.includes(id)))
    .filter(({ id }) => !items.some((item) => item.id === id))
    .map(({ title }) => title);
  const note = missing.length ? `No reading recorded for ${missing.join(", ")}.` : items.length ? "" : "This report has no saved measurements.";
  return [describeCheck({ ...check, items }), note]
    .filter(Boolean).join("\n");
}
