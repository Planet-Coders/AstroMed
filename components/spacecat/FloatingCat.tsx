"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
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
import { CatArt } from "./CatArt";
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

  // Say reminders while visible; the Space cat screen speaks them itself when it is open.
  const hiddenRef = useRef(hidden);
  useEffect(() => {
    hiddenRef.current = hidden;
  }, [hidden]);
  useEffect(
    () =>
      subscribeCatSay((t) => {
        if (!hiddenRef.current && getAutoEvery() > 0) say(t);
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

  if (!autoEvery || hidden || chatOpen) return null;

  return (
    <div className="pointer-events-none fixed bottom-20 right-4 z-40 flex max-w-[calc(100vw-2rem)] items-end gap-2 sm:right-6">
      {bubble && (
        <p
          className="spacecat-bubble pointer-events-auto mb-6 max-w-[min(260px,calc(100vw-7rem))] rounded-2xl rounded-br-sm border border-mc-line-strong bg-mc-panel px-3 py-2 text-xs leading-snug shadow-lg"
          role="status"
        >
          {bubble}
        </p>
      )}
      <button
        type="button"
        onClick={onOpen}
        className="spacecat-float pointer-events-auto relative flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-mc-select bg-mc-panel shadow-lg hover:scale-105"
        aria-label="Space cat voice reminder. Open the Space cat"
        title="Space cat"
      >
        <CatArt
          stage={growthStage(cat.feeds)}
          mood={isHungry(cat) ? "hungry" : "happy"}
          talking={talking}
          className="mt-5 w-[86px] max-w-none"
        />
        {talking && <span className="absolute right-1 top-1 h-2.5 w-2.5 animate-ping rounded-full bg-mc-green" aria-hidden />}
      </button>
    </div>
  );
}
