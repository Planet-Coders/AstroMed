"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const SECONDS = 3;
const noop = () => () => {};

/**
 * "Talk to me": records a few seconds from the mic and plays it back sped up and pitched up,
 * so the cat repeats you in a squeaky voice. Audio stays in this tab and is never uploaded.
 */
export function TalkBack({ onStart }: { onStart?: () => void }) {
  const [state, setState] = useState<"idle" | "recording" | "playing" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    []
  );

  const supported = useSyncExternalStore(
    noop,
    () => "MediaRecorder" in window && !!navigator.mediaDevices?.getUserMedia,
    () => false
  );

  const start = async () => {
    setError(null);
    onStart?.();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone blocked. Allow the mic for this site to talk to the cat.");
      setState("error");
      return;
    }
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType }));
      urlRef.current = url;
      const audio = new Audio(url);
      audio.preservesPitch = false;
      audio.playbackRate = 1.5;
      audio.onended = () => setState("idle");
      audio.onerror = () => setState("idle");
      setState("playing");
      audio.play().catch(() => setState("idle"));
    };
    rec.start();
    setState("recording");
    setTimeout(() => rec.state === "recording" && rec.stop(), SECONDS * 1000);
  };

  if (!supported) return null;

  return (
    <div className="mt-4 border-t border-mc-line pt-3">
      <button
        type="button"
        onClick={start}
        disabled={state === "recording" || state === "playing"}
        className="min-h-9 rounded-md border border-mc-line-strong bg-mc-inset px-3.5 text-[13px] font-medium hover:bg-mc-raised disabled:opacity-60"
      >
        {state === "recording" ? `🎙️ Listening for ${SECONDS} s…` : state === "playing" ? "🐱 Repeating…" : "🎙️ Talk to me"}
      </button>
      <p className="mt-1.5 text-[11px] text-mc-label">
        Say something and the cat repeats it in a squeaky voice. Recorded in this tab only, never uploaded.
      </p>
      {error && <p className="mt-1 text-[11px] text-mc-red">{error}</p>}
    </div>
  );
}
