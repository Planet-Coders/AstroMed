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

/**
 * Pick the cutest installed voice. Browser voices can't be cloned from a recording, so this picks
 * a light female or child voice and pitches it up (the reference cartoon voice sits around 390 Hz).
 */
const PREFERRED = ["ana", "aria", "jenny", "zira", "child", "kid"];
let cachedVoice: SpeechSynthesisVoice | null | undefined;
export function pickCatVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  for (const key of PREFERRED) {
    const v = voices.find((x) => x.name.toLowerCase().includes(key) && x.lang.toLowerCase().startsWith("en"));
    if (v) return v;
  }
  const female = voices.find(
    (x) => x.lang.toLowerCase() === "en-us" && /female|woman|girl|samantha|susan|hazel|libby|sonia|emma|michelle/i.test(x.name)
  );
  return female ?? voices.find((x) => x.lang.toLowerCase().startsWith("en")) ?? null;
}
function catVoice() {
  if (cachedVoice) return cachedVoice;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null; // still loading; try again next line
  cachedVoice = pickCatVoice(voices);
  return cachedVoice;
}

/** A tiny synthesized "mew": a sine sweep 700 -> 1200 -> 900 Hz over 0.25 s. */
let audioCtx: AudioContext | null = null;
export function mew(volume = 0.12) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioCtx ??= new Ctx();
    const ctx = audioCtx;
    if (ctx.state === "suspended") void ctx.resume();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(700, t);
    osc.frequency.exponentialRampToValueAtTime(1200, t + 0.1);
    osc.frequency.exponentialRampToValueAtTime(900, t + 0.25);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.28);
  } catch {
    /* audio unavailable */
  }
}

/** Speak in the cat's voice: a mew, then a high, quick cartoon voice. */
export function catSpeak(text: string, onEnd?: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    onEnd?.();
    return;
  }
  mew();
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = catVoice();
  if (v) {
    u.voice = v;
    u.lang = v.lang;
  }
  u.pitch = 2;
  u.rate = 1.15;
  if (onEnd) {
    u.onend = onEnd;
    u.onerror = onEnd;
  }
  // Start just after the mew so they don't overlap.
  setTimeout(() => window.speechSynthesis.speak(u), 260);
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
