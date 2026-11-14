"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Card } from "../ui/Card";
import { useHealthMissions } from "@/lib/missions";
import {
  EMPTY_CAT,
  FEED_COST,
  STAGE_LABEL,
  balance,
  canFeed,
  feed,
  fullness,
  growthStage,
  isHungry,
  loadCat,
  saveCat,
  subscribeCat,
  type CatState,
} from "@/lib/spaceCat";
import { subscribeCatSay } from "@/lib/voiceReminder";
import { useReminderText } from "../ExerciseSleep";
import { CatArt, type CatMood } from "./CatArt";
import { useCatVoice } from "./useCatVoice";
import { TalkBack } from "./TalkBack";

const POKE_LINES = ["Hee hee, that tickles!", "Meow! Boop!", "Hey, I'm floating here!", "Again! Again!", "Mrrrow?"];
const PURR_LINES = ["Purrrr…", "Mmm, purrrr. That's nice.", "Prrrrt!"];

export function SpaceCatView({
  userId,
  name,
  heartRate,
  onGo,
}: {
  userId: string;
  name: string;
  heartRate?: number;
  onGo: (tab: string) => void;
}) {
  const { tasks, points: earned, streak } = useHealthMissions(userId);
  const raw = useSyncExternalStore(
    subscribeCat,
    () => JSON.stringify(loadCat(userId)),
    () => JSON.stringify(EMPTY_CAT)
  );
  const cat = useMemo(() => JSON.parse(raw) as CatState, [raw]);

  // Re-evaluate hunger every 30 s.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const stage = growthStage(cat.feeds);
  const full = fullness(cat, now);
  const hungry = isHungry(cat, now);
  const pts = balance(earned, cat);
  const fedToday = cat.lastFedAt != null && new Date(cat.lastFedAt).toDateString() === new Date(now).toDateString();
  const affordable = canFeed(earned, cat);

  const selfcheck = tasks.find((t) => t.id === "selfcheck");
  const pvt = tasks.find((t) => t.id === "pvt");
  const due = [selfcheck && !selfcheck.done ? "checkup" : null, pvt && !pvt.done ? "PVT" : null].filter(Boolean);

  const { bubble, talking, say } = useCatVoice();
  const reminder = useReminderText();
  const [action, setAction] = useState<"pour" | "eating" | "giggle" | "purr" | null>(null);
  const [wobble, setWobble] = useState(0);
  const actionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runAction = useCallback((a: typeof action, ms: number, then?: () => void) => {
    if (actionTimer.current) clearTimeout(actionTimer.current);
    setAction(a);
    actionTimer.current = setTimeout(() => {
      setAction(null);
      then?.();
    }, ms);
  }, []);
  useEffect(() => () => {
    if (actionTimer.current) clearTimeout(actionTimer.current);
  }, []);

  // Reminders from the Habitat card or the scheduler, while this screen is open.
  useEffect(() => subscribeCatSay((t) => say(t)), [say]);

  const contextLine = useCallback(() => {
    const first = name.split(" ")[0];
    if (due.length === 2) return `${first}! Checkup and PVT are due. Do them and I get dinner!`;
    if (due.length === 1) return `Your ${due[0] === "checkup" ? "daily checkup" : "PVT reaction test"} is still due. You can do it!`;
    if (hungry && !affordable) return "My tummy is rumbling, but we need more points. Missions earn points!";
    if (hungry) return `I'm hungry! You have ${pts} points. One meal is ${FEED_COST}.`;
    if (heartRate && heartRate >= 50 && heartRate <= 100)
      return `Your heart rate looks great today, ${Math.round(heartRate)} beats per minute. Purr-fect!`;
    if (streak >= 2) return `A ${streak} day streak! You're a star, ${first}.`;
    return "All missions done. Want to give me a little snack?";
  }, [name, due, hungry, affordable, pts, heartRate, streak]);

  const greeted = useRef(false);
  useEffect(() => {
    if (greeted.current) return;
    greeted.current = true;
    // Bubble only on arrival; speech needs a tap first in most browsers.
    say(contextLine(), { voice: false });
  }, [say, contextLine]);

  const onFeed = () => {
    const next = feed(earned, cat);
    if (!next) {
      say(`Not enough points yet. I need ${FEED_COST}, you have ${pts}. Try a daily checkup or the PVT game!`);
      return;
    }
    saveCat(userId, next);
    const grew = growthStage(next.feeds) !== stage;
    runAction("pour", 1100, () =>
      runAction("eating", 1700, () =>
        say(grew ? `Yum! Look, I'm getting ${STAGE_LABEL[growthStage(next.feeds)].toLowerCase()}!` : "Nom nom! Thanks for the food!")
      )
    );
  };

  const onPoke = () => {
    if (action === "pour" || action === "eating") return;
    setWobble((w) => w + 1);
    runAction("giggle", 1200);
    say(POKE_LINES[Math.floor(Math.random() * POKE_LINES.length)]);
  };

  // Stroking: enough pointer movement across the cat makes it purr (with a cooldown).
  const strokeDist = useRef(0);
  const lastPurr = useRef(0);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const onStroke = (e: React.PointerEvent) => {
    if (e.pointerType === "touch" && e.buttons === 0) return;
    const p = { x: e.clientX, y: e.clientY };
    if (lastPos.current) strokeDist.current += Math.hypot(p.x - lastPos.current.x, p.y - lastPos.current.y);
    lastPos.current = p;
    if (strokeDist.current > 600 && Date.now() - lastPurr.current > 8000 && !action) {
      strokeDist.current = 0;
      lastPurr.current = Date.now();
      runAction("purr", 2200);
      say(PURR_LINES[Math.floor(Math.random() * PURR_LINES.length)]);
    }
  };

  const mood: CatMood =
    action === "eating" ? "eating" : action === "giggle" ? "giggle" : action === "purr" ? "purr" : hungry || (due.length && !fedToday) ? "hungry" : "happy";

  return (
    <div className="flex flex-col gap-5">
      <Card title="Space cat" className="overflow-hidden">
        <div className="spacecat-cabin relative isolate -mx-1 overflow-hidden rounded-xl border border-mc-line">
          {/* portholes */}
          <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-center gap-[12%]" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span key={i} className="spacecat-porthole" />
            ))}
          </div>

          {/* top bar */}
          <div className="relative z-10 flex items-start justify-between gap-2 p-3">
            <button
              type="button"
              onClick={() => say(`${contextLine()} ${reminder.text()}`)}
              className="flex min-h-9 items-center gap-1.5 rounded-lg border border-mc-line-strong bg-mc-panel/90 px-3 text-xs font-semibold shadow-xs hover:bg-mc-raised"
            >
              🔊 Voice reminder
            </button>
            <div className="flex items-center gap-1.5 rounded-lg border border-mc-amber/60 bg-mc-panel/90 px-3 py-1.5 font-mono text-sm font-bold shadow-xs" aria-live="polite">
              <span aria-hidden>⭐</span> {pts} PTS
            </div>
          </div>

          {/* speech bubble */}
          <div className="relative z-10 flex min-h-16 justify-center px-4">
            {bubble && (
              <p className="spacecat-bubble max-w-sm rounded-2xl border border-mc-line-strong bg-mc-panel px-4 py-2 text-center text-sm font-medium shadow-md" role="status">
                {bubble}
              </p>
            )}
          </div>

          {/* the cat */}
          <div className="relative z-0 flex justify-center">
            <button
              type="button"
              key={wobble}
              onClick={onPoke}
              onPointerMove={onStroke}
              onPointerLeave={() => (lastPos.current = null)}
              className={`spacecat-float relative w-[min(62vw,250px)] cursor-pointer touch-none rounded-full focus-visible:outline-2 focus-visible:outline-mc-cyan ${wobble ? "spacecat-wobble" : ""}`}
              aria-label="Poke the cat. Move the pointer back and forth over it to stroke it."
            >
              <CatArt stage={stage} mood={mood} talking={talking} className="w-full drop-shadow-md" />
            </button>
          </div>

          {/* bottom controls */}
          <div className="relative z-10 grid grid-cols-[1fr_auto_1fr] items-end gap-2 p-3 pt-0">
            <button
              type="button"
              onClick={() => onGo("check")}
              className="justify-self-start rounded-lg border border-mc-line-strong bg-mc-panel/90 px-3 py-2 text-left text-xs font-semibold shadow-xs hover:bg-mc-raised"
            >
              <span aria-hidden>❤️ </span>Daily checkup
              <span className="block font-mono text-[11px] text-mc-link">
                {selfcheck?.done ? "done today ✓" : `+${selfcheck?.points ?? 30} pts`}
              </span>
            </button>

            <div className="flex flex-col items-center">
              <div className="relative h-8 w-20" aria-hidden>
                {action === "pour" &&
                  Array.from({ length: 7 }).map((_, i) => (
                    <span key={i} className="spacecat-kibble" style={{ left: `${30 + (i % 4) * 9}%`, animationDelay: `${i * 0.11}s` }} />
                  ))}
                <svg viewBox="0 0 80 32" className="absolute bottom-0 h-8 w-20">
                  <ellipse cx="40" cy="12" rx="34" ry="7" fill="#7c5a3a" opacity={cat.lastFedAt && !hungry ? 1 : 0.25} />
                  <path d="M4 12 Q8 30 40 30 Q72 30 76 12 Z" fill="#3e6fb0" stroke="#2a4f82" strokeWidth="2" />
                  <ellipse cx="40" cy="12" rx="36" ry="6" fill="none" stroke="#2a4f82" strokeWidth="2" />
                </svg>
              </div>
              <button
                type="button"
                onClick={onFeed}
                disabled={action === "pour" || action === "eating"}
                aria-disabled={!affordable}
                className={`mt-1 flex h-20 w-20 flex-col items-center justify-center rounded-full border-2 text-center font-bold shadow-lg transition ${
                  affordable
                    ? "border-mc-select bg-mc-select text-mc-on-select hover:scale-105 active:scale-95"
                    : "border-mc-line-strong bg-mc-raised text-mc-label"
                }`}
              >
                <span className="text-sm leading-tight">FEED CAT</span>
                <span className="font-mono text-[10px]">−{FEED_COST} PTS</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => onGo("pvt")}
              className="justify-self-end rounded-lg border border-mc-line-strong bg-mc-panel/90 px-3 py-2 text-right text-xs font-semibold shadow-xs hover:bg-mc-raised"
            >
              <span aria-hidden>⚡ </span>PVT game
              <span className="block font-mono text-[11px] text-mc-link">
                {pvt?.done ? "done today ✓" : `+${pvt?.points ?? 20} pts`}
              </span>
            </button>
          </div>
        </div>
        {!affordable && (
          <p className="mt-3 text-xs text-mc-muted">
            You need {FEED_COST - pts} more point{FEED_COST - pts === 1 ? "" : "s"} to feed the cat. Health missions earn points.
          </p>
        )}
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Cat status">
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs">
                <span className="text-mc-soft">Fullness</span>
                <span className="font-mono text-mc-muted">{full}%</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-mc-line" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={full} aria-label="Fullness">
                <div
                  className={`h-full rounded-full transition-[width] duration-700 ${hungry ? "bg-mc-amber" : "bg-mc-green"}`}
                  style={{ width: `${full}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-mc-label">{hungry ? "Hungry. Fullness drops a little every hour." : "Happy and full."}</p>
            </div>
            <div>
              <p className="mc-label mb-2">Growth</p>
              <ol className="flex items-end justify-between gap-2">
                {(["slim", "plump", "chonky"] as const).map((s, i) => (
                  <li key={s} className={`flex flex-1 flex-col items-center gap-1 rounded-lg border p-2 ${stage === s ? "border-mc-select bg-mc-raised" : "border-mc-line opacity-60"}`}>
                    <span className="font-mono text-xl" aria-hidden style={{ transform: `scaleX(${1 + i * 0.25})` }}>
                      🐱
                    </span>
                    <span className="text-xs font-semibold">{STAGE_LABEL[s]}</span>
                    <span className="font-mono text-[10px] text-mc-label">{["0–2", "3–6", "7+"][i]} meals</span>
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-[11px] text-mc-label">
                {cat.feeds} meal{cat.feeds === 1 ? "" : "s"} so far · {earned} points earned, {cat.spent} spent
              </p>
            </div>
          </div>
        </Card>

        <Card title="Play">
          <ul className="space-y-2 text-sm text-mc-soft">
            <li>👆 Tap the cat to poke it.</li>
            <li>🤚 Move the pointer back and forth over it to stroke it and hear it purr.</li>
            <li>🔊 Voice reminder makes it read today&apos;s plan. Turn on Auto in Habitat &amp; routine and it floats on every screen.</li>
          </ul>
          <TalkBack onStart={() => setAction(null)} />
        </Card>
      </div>
    </div>
  );
}
