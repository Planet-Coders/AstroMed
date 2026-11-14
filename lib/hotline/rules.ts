/**
 * Hotline rules shared by the API and the UI: validation, who may see what, the Earth link
 * delay, and how the Earth inbox is ordered. Pure functions so they are unit tested.
 */

export const URGENCIES = ["ROUTINE", "URGENT", "EMERGENCY"] as const;
export type Urgency = (typeof URGENCIES)[number];

export const URGENCY_RANK: Record<Urgency, number> = { ROUTINE: 0, URGENT: 1, EMERGENCY: 2 };
export const URGENCY_LABEL: Record<Urgency, string> = { ROUTINE: "Routine", URGENT: "Urgent", EMERGENCY: "Emergency" };

export const MAX_BODY = 1000;
/** One-way Mars transit link delay shown in the console (20 m 04 s). */
export const SPACE_DELAY_S = 1204;
/** Shortened delay for demos, so a test message lands in seconds instead of 20 minutes. */
export const DEMO_DELAY_S = 20;
export const MAX_DELAY_S = 1500;
/** Sends allowed per astronaut per minute. */
export const SEND_LIMIT_PER_MIN = 8;

export const QUICK_MESSAGES: { label: string; body: string; urgency: Urgency }[] = [
  { label: "Medical emergency", body: "Medical emergency. I need help from the flight surgeon now.", urgency: "EMERGENCY" },
  { label: "Need a consult", body: "I need a medical consult. Please contact me as soon as you can.", urgency: "URGENT" },
  { label: "Medication question", body: "I have a question about my medication.", urgency: "ROUTINE" },
];

export type VitalsSnapshot = { heartRate?: number; spo2?: number; hrv?: number; radiation?: number; at?: number };

const VITAL_RANGES: Record<keyof Omit<VitalsSnapshot, "at">, [number, number]> = {
  heartRate: [20, 250],
  spo2: [50, 100],
  hrv: [0, 300],
  radiation: [0, 50],
};

/** Keeps only known, finite, plausible vitals fields; anything else is dropped. */
export function cleanVitals(v: unknown): VitalsSnapshot | null {
  if (!v || typeof v !== "object") return null;
  const src = v as Record<string, unknown>;
  const out: VitalsSnapshot = {};
  for (const [k, [lo, hi]] of Object.entries(VITAL_RANGES)) {
    const n = src[k];
    if (typeof n === "number" && Number.isFinite(n) && n >= lo && n <= hi) out[k as keyof typeof VITAL_RANGES] = Math.round(n * 10) / 10;
  }
  if (typeof src.at === "number" && Number.isFinite(src.at)) out.at = Math.round(src.at);
  return Object.keys(out).filter((k) => k !== "at").length ? out : null;
}

export function clampDelay(seconds: unknown): number {
  const n = typeof seconds === "number" && Number.isFinite(seconds) ? Math.round(seconds) : 0;
  return Math.max(0, Math.min(MAX_DELAY_S, n));
}

/** Normalises message text: trimmed, control characters removed (newlines kept). */
export function cleanBody(body: unknown): string | null {
  if (typeof body !== "string") return null;
  const text = body.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (!text || text.length > MAX_BODY) return null;
  return text;
}

export type CrewMessageInput = {
  clientId: string;
  body: string;
  urgency: Urgency;
  vitals: VitalsSnapshot | null;
  delaySeconds: number;
  createdAt: number;
};

/** Validates one message from the crew device (or its offline queue). Returns null if invalid. */
export function validateCrewMessage(raw: unknown, now = Date.now()): CrewMessageInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const body = cleanBody(r.body);
  if (!body) return null;
  if (typeof r.clientId !== "string" || !/^[A-Za-z0-9-]{8,64}$/.test(r.clientId)) return null;
  const urgency = (URGENCIES as readonly string[]).includes(r.urgency as string) ? (r.urgency as Urgency) : null;
  if (!urgency) return null;
  // Queued offline messages keep their original time, but never in the future or older than a week.
  let createdAt = typeof r.createdAt === "number" && Number.isFinite(r.createdAt) ? r.createdAt : now;
  if (createdAt > now || createdAt < now - 7 * 86_400_000) createdAt = now;
  return { clientId: r.clientId, body, urgency, vitals: cleanVitals(r.vitals), delaySeconds: clampDelay(r.delaySeconds), createdAt };
}

// ---- permissions ----

export type HotlineUser = { id: string; role: string; disabled?: boolean; groupId?: string | null };

/** Only astronauts own a hotline thread, and only their own. */
export function canUseCrewHotline(user: HotlineUser) {
  return user.role === "ASTRONAUT" && !user.disabled;
}

export function isEarthRole(user: HotlineUser) {
  return (user.role === "OVERSIGHT" || user.role === "SUPER_ADMIN") && !user.disabled;
}

/** Earth staff may read and answer an astronaut in one of the groups they can read. */
export function canEarthAccess(staff: HotlineUser, member: HotlineUser, readableGroupIds: string[]) {
  return isEarthRole(staff) && member.role === "ASTRONAUT" && !!member.groupId && readableGroupIds.includes(member.groupId);
}

// ---- delivery ----

export type DeliveryRow = { fromEarth: boolean; deliverAt: Date | string };

const t = (d: Date | string) => (typeof d === "string" ? Date.parse(d) : d.getTime());

/** The astronaut sees everything they sent, and Earth replies once they have arrived. */
export function visibleToCrew(m: DeliveryRow, now = Date.now()) {
  return !m.fromEarth || t(m.deliverAt) <= now;
}

/** Earth sees its own replies, and crew messages once they have arrived on Earth. */
export function visibleToEarth(m: DeliveryRow, now = Date.now()) {
  return m.fromEarth || t(m.deliverAt) <= now;
}

export type CrewStatus = "in-transit" | "delivered" | "seen" | "acknowledged" | "resolved";

export function crewStatus(
  m: { deliverAt: Date | string; readAt?: Date | string | null; acknowledgedAt?: Date | string | null; resolvedAt?: Date | string | null },
  now = Date.now()
): CrewStatus {
  if (m.resolvedAt) return "resolved";
  if (m.acknowledgedAt) return "acknowledged";
  if (m.readAt) return "seen";
  return t(m.deliverAt) <= now ? "delivered" : "in-transit";
}

// ---- Earth inbox ordering ----

export type ConversationSummary = {
  memberId: string;
  /** Highest urgency among this astronaut's open (unresolved) messages, or null if none open. */
  openUrgency: Urgency | null;
  unread: number;
  lastAt: string;
};

/** Open emergencies first, then urgent, then routine, then threads with nothing open; newest first within each. */
export function sortConversations<T extends ConversationSummary>(list: T[]): T[] {
  const rank = (c: ConversationSummary) => (c.openUrgency ? URGENCY_RANK[c.openUrgency] + 1 : 0);
  return [...list].sort((a, b) => rank(b) - rank(a) || b.unread - a.unread || Date.parse(b.lastAt) - Date.parse(a.lastAt));
}

/** Formats a countdown like "19:58" or "1:05". */
export function countdown(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
