"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { EMPTY_CAT, growthStage, isHungry, loadCat, subscribeCat, type CatState } from "@/lib/spaceCat";
import {
  getAutoEvery,
  requestCatSay,
  setNextAt,
  subscribeAutoEvery,
  subscribeCatSay,
} from "@/lib/voiceReminder";
import { useReminderText } from "../ExerciseSleep";
import { useCopilot } from "../CopilotProvider";
import { CatModel } from "./CatModel";
import { useCatVoice } from "./useCatVoice";

/**
 * Floating space cat. Runs the voice reminder schedule (the Habitat "Auto" setting) on every
 * dashboard section, and while Auto is on shows a bobbing cat button that says each reminder.
 * Clicking it opens the Space cat section. With Auto off it renders nothing.
 */
export function FloatingCat({ userId, hidden, onOpen }: { userId: string; hidden: boolean; onOpen: () => void }) {
  const autoEvery = useSyncExternalStore(subscribeAutoEvery, getAutoEvery, () => 0);
  const { text, exerciseDone } = useReminderText();
  const { chatOpen } = useCopilot();
  const raw = useSyncExternalStore(subscribeCat, () => JSON.stringify(loadCat(userId)), () => JSON.stringify(EMPTY_CAT));
  const cat = useMemo(() => JSON.parse(raw) as CatState, [raw]);
  const { bubble, talking, say } = useCatVoice();

  // The single reminder timer (it used to live in the Habitat card and stopped when you left it).
  const textRef = useRef(text);
  useEffect(() => {
    textRef.current = text;
  }, [text]);
  useEffect(() => {
    if (!autoEvery || exerciseDone) {
      setNextAt(null);
      return;
    }
    const ms = autoEvery * 60_000;
    const schedule = () => setNextAt(new Date(Date.now() + ms).toTimeString().slice(0, 5));
    schedule();
    const id = setInterval(() => {
      requestCatSay(textRef.current());
      schedule();
    }, ms);
    return () => {
      clearInterval(id);
      setNextAt(null);
    };
  }, [autoEvery, exerciseDone]);

  // "×" hides the cat until the next reminder.
  const [dismissed, setDismissed] = useState(false);

  // Say reminders while visible; the Space cat screen speaks them itself when it is open.
  const hiddenRef = useRef(hidden);
  useEffect(() => {
    hiddenRef.current = hidden;
  }, [hidden]);
  useEffect(
    () =>
      subscribeCatSay((t) => {
        if (!hiddenRef.current && getAutoEvery() > 0) {
          setDismissed(false); // a new reminder brings a hidden cat back
          say(t);
        }
      }),
    [say]
  );

  // A short hello when Auto is switched on.
  const prevAuto = useRef(autoEvery);
  useEffect(() => {
    if (autoEvery > 0 && prevAuto.current === 0 && !hiddenRef.current) {
      say(`I'm on reminder duty! I'll talk to you every ${autoEvery === 60 ? "hour" : `${autoEvery} minute${autoEvery === 1 ? "" : "s"}`}.`, {
        voice: false,
      });
    }
    prevAuto.current = autoEvery;
  }, [autoEvery, say]);

  if (!autoEvery || hidden || chatOpen || dismissed) return null;

  return (
    <div className="pointer-events-none fixed bottom-[72px] right-2 z-40 flex max-w-[calc(100vw-1rem)] items-end gap-1 sm:bottom-20 sm:right-4">
      {bubble && (
        <p
          className="spacecat-bubble pointer-events-auto mb-16 max-w-[min(240px,calc(100vw-9.5rem))] rounded-2xl rounded-br-sm border border-mc-line-strong bg-mc-panel px-3 py-2 text-xs leading-snug shadow-lg sm:mb-24"
          role="status"
        >
          {bubble}
        </p>
      )}
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={onOpen}
          className="pointer-events-auto block h-[130px] w-[110px] cursor-pointer sm:h-[210px] sm:w-[180px]"
          aria-label="Space cat voice reminder. Open the Space cat"
          title="Open Space cat"
        >
          {/* same full-body 3D cat as the Space cat page; the canvas ignores clicks so the button gets them */}
          <CatModel
            stage={growthStage(cat.feeds)}
            mood={isHungry(cat) ? "hungry" : "happy"}
            talking={talking}
            className="pointer-events-none h-full w-full"
            fallbackClassName="h-full w-full"
          />
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="pointer-events-auto absolute right-0 top-0 flex h-6 w-6 items-center justify-center rounded-full border border-mc-line-strong bg-mc-panel text-xs text-mc-muted shadow hover:bg-mc-raised hover:text-foreground"
          aria-label="Hide the space cat until the next reminder"
          title="Hide until the next reminder"
        >
          ×
        </button>
      </div>
    </div>
  );
}
