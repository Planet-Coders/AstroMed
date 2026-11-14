/**
 * Shared voice reminder setting and the cat's voice.
 *
 * The "Auto" interval used to live inside the Habitat card, so the timer stopped when you
 * left that tab. It now lives here so one scheduler (the floating cat) keeps running on
 * every dashboard section, and the Habitat card just edits the setting.
 */

const KEY = "astromed_voice_reminder_every";
const EVENT = "astromed-voice-reminder";
const SAY_EVENT = "astromed-cat-say";

export function getAutoEvery(): number {
  try {
    return Number(localStorage.getItem(KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

export function setAutoEvery(minutes: number) {
  try {
    localStorage.setItem(KEY, String(minutes));
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeAutoEvery(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** Next scheduled reminder time ("HH:MM"), published by the scheduler for the Habitat card. */
let nextAt: string | null = null;
const NEXT_EVENT = "astromed-voice-reminder-next";
export function getNextAt() {
  return nextAt;
}
export function setNextAt(v: string | null) {
  nextAt = v;
  window.dispatchEvent(new Event(NEXT_EVENT));
}
export function subscribeNextAt(cb: () => void) {
  window.addEventListener(NEXT_EVENT, cb);
  return () => window.removeEventListener(NEXT_EVENT, cb);
}

/** Speak in the cat's voice: higher pitch, a little quicker. */
export function catSpeak(text: string, onEnd?: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    onEnd?.();
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.pitch = 1.8;
  u.rate = 1.05;
  if (onEnd) {
    u.onend = onEnd;
    u.onerror = onEnd;
  }
  window.speechSynthesis.speak(u);
}

/** Ask whichever cat is on screen to say something (bubble + voice). */
export function requestCatSay(text: string) {
  window.dispatchEvent(new CustomEvent<string>(SAY_EVENT, { detail: text }));
}

export function subscribeCatSay(cb: (text: string) => void) {
  const h = (e: Event) => cb((e as CustomEvent<string>).detail);
  window.addEventListener(SAY_EVENT, h);
  return () => window.removeEventListener(SAY_EVENT, h);
}
