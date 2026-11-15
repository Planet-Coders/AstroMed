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

export type VoiceAttempt = { voice: SpeechSynthesisVoice | null; pitch: number; rate: number };

/**
 * Ordered attempts: the cute pick first, then an installed (local) English voice, then the browser
 * default with no voice set. Edge's "Online (Natural)" voices can fail silently and distort at
 * pitch 2, so online voices get a gentler pitch; local voices keep the full cartoon pitch.
 */
export function voiceAttempts(voices: SpeechSynthesisVoice[]): VoiceAttempt[] {
  const out: VoiceAttempt[] = [];
  const add = (v: SpeechSynthesisVoice | null) => {
    if (out.some((a) => a.voice === v)) return;
    out.push({ voice: v, pitch: v && !v.localService ? 1.5 : 2, rate: 1.1 });
  };
  const cute = pickCatVoice(voices);
  if (cute) add(cute);
  const local = pickCatVoice(voices.filter((v) => v.localService));
  if (local) add(local);
  add(null);
  return out;
}

/** Voices load asynchronously in Chromium; wait briefly for them. */
function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const now = window.speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", done);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener("voiceschanged", done);
    setTimeout(done, 1200);
  });
}

// ---- autoplay: speech and audio need a user gesture first ----
const BLOCKED_EVENT = "astromed-cat-sound-blocked";
let soundBlocked = false;
export function isSoundBlocked() {
  return soundBlocked;
}
export function subscribeSoundBlocked(cb: () => void) {
  window.addEventListener(BLOCKED_EVENT, cb);
  return () => window.removeEventListener(BLOCKED_EVENT, cb);
}
function setSoundBlocked(v: boolean) {
  if (soundBlocked === v) return;
  soundBlocked = v;
  window.dispatchEvent(new Event(BLOCKED_EVENT));
}
function hasGesture() {
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return ua ? ua.hasBeenActive : true;
}
// The line that was blocked, spoken as soon as the user taps anywhere.
let pending: { text: string; onEnd?: () => void } | null = null;
let unlockInstalled = false;
function installUnlock() {
  if (unlockInstalled || typeof window === "undefined") return;
  unlockInstalled = true;
  const unlock = () => {
    try {
      const ctx = audio();
      if (ctx && ctx.state === "suspended") void ctx.resume();
    } catch {
      /* ignore */
    }
    setSoundBlocked(false);
    if (pending) {
      const p = pending;
      pending = null;
      catSpeak(p.text, p.onEnd); // inside the gesture, so the browser allows it
    }
  };
  window.addEventListener("pointerdown", unlock, { capture: true });
  window.addEventListener("keydown", unlock, { capture: true });
}

/** A tiny synthesized "mew": a sine sweep 700 -> 1200 -> 900 Hz over 0.25 s. */
let audioCtx: AudioContext | null = null;
function audio() {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  audioCtx ??= new Ctx();
  return audioCtx;
}
export function mew(volume = 0.12) {
  try {
    const ctx = audio();
    if (!ctx) return;
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

// Keep the live utterance referenced: Chromium can garbage-collect it before it starts.
let current: SpeechSynthesisUtterance | null = null;
let token = 0;

// While the crew member talks to the cat ("Talk to me"), the cat stays quiet.
let paused = false;
export function isCatVoicePaused() {
  return paused;
}
/** Stop anything the cat is saying right now (reminder speech, queued or blocked lines). */
export function stopCatVoice() {
  token++; // invalidates in-flight retries and queued lines
  pending = null;
  current = null;
  try {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}
/** Pause or resume the cat's voice; reminders that come due while paused are skipped, the schedule keeps running. */
export function setCatVoicePaused(v: boolean) {
  paused = v;
  if (v) stopCatVoice();
}

/**
 * Speak in the cat's voice: a mew, then a high cartoon voice. If a voice errors, or nothing is
 * speaking ~3 s later, retry with an installed voice, then with the browser default.
 */
export function catSpeak(text: string, onEnd?: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || paused) {
    onEnd?.();
    return;
  }
  installUnlock();
  const synth = window.speechSynthesis;
  if (!hasGesture()) {
    // Autoplay policy: nothing will be heard until the user taps the page; remember the line.
    pending = { text };
    setSoundBlocked(true);
    onEnd?.();
    return;
  }
  mew();
  const my = ++token;
  // Chromium drops an utterance spoken right after cancel(); cancel only if needed, then wait.
  const busy = synth.speaking || synth.pending;
  if (busy) synth.cancel();
  void loadVoices().then((voices) => {
    const attempts = voiceAttempts(voices);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      onEnd?.();
    };
    const tryAt = (i: number) => {
      if (my !== token) return; // a newer line replaced this one
      if (i >= attempts.length) return finish();
      const a = attempts[i];
      const u = new SpeechSynthesisUtterance(text);
      if (a.voice) {
        u.voice = a.voice;
        u.lang = a.voice.lang;
      }
      u.pitch = a.pitch;
      u.rate = a.rate;
      let started = false;
      const watchdog = setTimeout(() => {
        if (!started && my === token && !synth.speaking) {
          synth.cancel();
          setTimeout(() => tryAt(i + 1), 120);
        }
      }, 3000);
      u.onstart = () => {
        started = true;
        clearTimeout(watchdog);
        setSoundBlocked(false);
      };
      u.onend = () => {
        clearTimeout(watchdog);
        finish();
      };
      u.onerror = (e) => {
        clearTimeout(watchdog);
        if (e.error === "interrupted" || e.error === "canceled") return finish();
        if (e.error === "not-allowed") {
          setSoundBlocked(true);
          return finish();
        }
        setTimeout(() => tryAt(i + 1), 120);
      };
      current = u;
      synth.resume(); // un-stick a paused queue
      synth.speak(u);
    };
    // Start just after the mew (and after any cancel has settled).
    setTimeout(() => tryAt(0), busy ? 300 : 260);
  });
}

/** For the "tap to turn sound on" chip: speak again from inside a click. */
export function unlockAndSpeak(text: string, onEnd?: () => void) {
  pending = null;
  setSoundBlocked(false);
  try {
    const ctx = audio();
    if (ctx && ctx.state === "suspended") void ctx.resume();
  } catch {
    /* ignore */
  }
  catSpeak(text, onEnd);
}

export function currentUtterance() {
  return current;
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
