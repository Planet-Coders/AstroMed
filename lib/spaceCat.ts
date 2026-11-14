/**
 * Space cat: a virtual pet fed with health-mission points.
 *
 * The cat never awards points itself. Earned points come from useHealthMissions; this file
 * keeps a separate per-user ledger of what was spent on food, so balance = earned - spent.
 * The pure functions here are unit tested; the storage helpers keep state in this browser.
 */

export const FEED_COST = 30;
/** Fullness gained per meal, out of 100. */
export const FEED_FULLNESS = 40;
/** Fullness lost per hour since the last meal. */
export const HUNGER_PER_HOUR = 4;

export type CatState = {
  /** Points spent on food so far. */
  spent: number;
  /** Total meals ever, drives the growth stage. */
  feeds: number;
  /** Fullness right after the last meal, 0-100. */
  fullnessAtLastFeed: number;
  /** Epoch ms of the last meal, or null if never fed. */
  lastFedAt: number | null;
};

export const EMPTY_CAT: CatState = { spent: 0, feeds: 0, fullnessAtLastFeed: 0, lastFedAt: null };

export type GrowthStage = "slim" | "plump" | "chonky";

export function growthStage(feeds: number): GrowthStage {
  if (feeds >= 7) return "chonky";
  if (feeds >= 3) return "plump";
  return "slim";
}

/** Body width multiplier per stage, used by the drawing. */
export const STAGE_WIDTH: Record<GrowthStage, number> = { slim: 1, plump: 1.18, chonky: 1.38 };

export const STAGE_LABEL: Record<GrowthStage, string> = { slim: "Slim", plump: "Plump", chonky: "Chonky" };

export function balance(earned: number, state: CatState) {
  return Math.max(0, earned - state.spent);
}

export function canFeed(earned: number, state: CatState) {
  return balance(earned, state) >= FEED_COST;
}

/** Fullness now, decaying from the last meal. */
export function fullness(state: CatState, now = Date.now()) {
  if (state.lastFedAt == null) return 0;
  const hours = Math.max(0, now - state.lastFedAt) / 3_600_000;
  return Math.max(0, Math.min(100, Math.round(state.fullnessAtLastFeed - hours * HUNGER_PER_HOUR)));
}

export function isHungry(state: CatState, now = Date.now()) {
  return fullness(state, now) < 40;
}

/** Returns the new state, or null if there are not enough points. */
export function feed(earned: number, state: CatState, now = Date.now()): CatState | null {
  if (!canFeed(earned, state)) return null;
  return {
    spent: state.spent + FEED_COST,
    feeds: state.feeds + 1,
    fullnessAtLastFeed: Math.min(100, fullness(state, now) + FEED_FULLNESS),
    lastFedAt: now,
  };
}

// ---- storage (per user, this browser) ----

const KEY = "astromed_space_cat";
const EVENT = "astromed-space-cat";

function readAll(): Record<string, CatState> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, CatState>) : {};
  } catch {
    return {};
  }
}

export function loadCat(userId: string): CatState {
  return { ...EMPTY_CAT, ...(readAll()[userId] ?? {}) };
}

export function saveCat(userId: string, state: CatState) {
  try {
    const all = readAll();
    all[userId] = state;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable: the cat forgets on reload */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeCat(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
