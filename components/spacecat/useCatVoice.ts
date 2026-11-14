"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { catSpeak, isSoundBlocked } from "@/lib/voiceReminder";

/** Speech bubble + cat voice. The bubble stays a few seconds after speech ends. */
export function useCatVoice() {
  const [bubble, setBubble] = useState<string | null>(null);
  const [talking, setTalking] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const talkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = useCallback((text: string, { voice = true }: { voice?: boolean } = {}) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (talkTimer.current) clearTimeout(talkTimer.current);
    setBubble(text);
    setTalking(true);
    // Fallback in case speech never fires onend (muted or unsupported): ~70 ms per character.
    const estimate = Math.min(12_000, 900 + text.length * 70);
    const finish = () => {
      if (talkTimer.current) clearTimeout(talkTimer.current);
      setTalking(false);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      // While the browser blocks sound, keep the bubble so its "tap to turn sound on" chip stays reachable.
      if (voice && isSoundBlocked()) return;
      hideTimer.current = setTimeout(() => setBubble(null), 4000);
    };
    talkTimer.current = setTimeout(finish, estimate);
    if (voice) catSpeak(text, finish);
  }, []);

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (talkTimer.current) clearTimeout(talkTimer.current);
    },
    []
  );

  return { bubble, talking, say };
}
