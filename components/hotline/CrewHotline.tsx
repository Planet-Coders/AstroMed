"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Card } from "../ui/Card";
import { useMissionMode } from "../MissionModeContext";
import { HOTLINE_OUTBOX_CHANGED, flushOutbox, pendingHotline, queueHotline } from "@/lib/outbox";
import type { OutboxHotline } from "@/lib/db";
import {
  DEMO_DELAY_S,
  MAX_BODY,
  QUICK_MESSAGES,
  SPACE_DELAY_S,
  URGENCIES,
  URGENCY_LABEL,
  countdown,
  mergeWithPending,
  type Urgency,
} from "@/lib/hotline/rules";
import type { HotlineClientMessage } from "@/lib/hotline/server";
import { UrgencyBadge, VitalsLine, hotlineTime } from "./shared";

const DEMO_KEY = "astromed_hotline_demo_delay";
const stampVitals = <T extends object>(v: T) => ({ ...v, at: Date.now() });
const noop = () => () => {};

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** Crew side of the hotline: one thread with the Earth medical team. */
export function CrewHotline({
  vitals,
}: {
  vitals: { heartRate: number; spo2: number; hrv: number; radiation: number } | null;
}) {
  const { mode } = useMissionMode();
  const [messages, setMessages] = useState<HotlineClientMessage[]>([]);
  const [pending, setPending] = useState<OutboxHotline[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("URGENT");
  const [attach, setAttach] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const now = useNow();

  // Demo setting: shorten the 20-minute Mars link delay to 20 s so a test lands quickly.
  const demoStored = useSyncExternalStore(
    noop,
    () => {
      try {
        return localStorage.getItem(DEMO_KEY) !== "0";
      } catch {
        return true;
      }
    },
    () => true
  );
  const [demo, setDemoState] = useState<boolean | null>(null);
  const demoFast = demo ?? demoStored;
  const setDemo = (v: boolean) => {
    setDemoState(v);
    try {
      localStorage.setItem(DEMO_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  };
  const delaySeconds = mode === "space" ? (demoFast ? DEMO_DELAY_S : SPACE_DELAY_S) : 0;

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/hotline", { cache: "no-store" });
      if (!r.ok) throw new Error(r.status === 503 ? "Hotline server unavailable" : `Hotline error ${r.status}`);
      const d = (await r.json()) as { messages: HotlineClientMessage[] };
      setMessages(d.messages);
      setLoadError(null);
    } catch (e) {
      setLoadError(navigator.onLine ? (e as Error).message : "Offline: messages will send when the link returns.");
    }
    setPending(await pendingHotline());
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const id = setInterval(load, 4000);
    const onQueue = () => void load();
    window.addEventListener(HOTLINE_OUTBOX_CHANGED, onQueue);
    window.addEventListener("online", onQueue);
    return () => {
      clearTimeout(first);
      clearInterval(id);
      window.removeEventListener(HOTLINE_OUTBOX_CHANGED, onQueue);
      window.removeEventListener("online", onQueue);
    };
  }, [load]);

  const send = async (text: string, level: Urgency) => {
    const queued = await queueHotline({
      body: text,
      urgency: level,
      vitals: attach && vitals ? stampVitals(vitals) : null,
      delaySeconds,
    });
    if (!queued) {
      setNotice("Could not queue the message on this device. Check that site storage is allowed.");
      return;
    }
    // Show it in the conversation at once; the server copy replaces it when it arrives.
    setPending((list) => (list.some((p) => p.clientId === queued.clientId) ? list : [...list, queued]));
    setBody("");
    setNotice(
      level === "EMERGENCY"
        ? "Emergency sent. Follow your emergency checklist while Earth receives it."
        : delaySeconds
          ? `Sent. It reaches Earth in ${countdown(delaySeconds * 1000)}.`
          : "Sent."
    );
    void load();
  };

  const submit = (text: string, level: Urgency) => {
    if (!text.trim()) return;
    if (level === "EMERGENCY") {
      setBody(text);
      setUrgency("EMERGENCY");
      setConfirming(true);
      return;
    }
    void send(text.trim(), level);
  };

  const { sent, waiting } = mergeWithPending(messages, pending);

  // Follow new messages smoothly, unless the reader has scrolled up to older ones.
  const listRef = useRef<HTMLOListElement>(null);
  const atBottom = useRef(true);
  const total = sent.length + waiting.length;
  useEffect(() => {
    const el = listRef.current;
    if (el && atBottom.current) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [total]);

  return (
    <div className="flex flex-col gap-5">
      <Card title="Hotline to Earth medical team">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-mc-muted">
            Direct line to the flight surgeon on duty.{" "}
            {mode === "space" ? (
              <>
                Messages take <strong className="text-foreground">{demoFast ? `${DEMO_DELAY_S} s (demo)` : "20 m 04 s"}</strong> to reach Earth.
              </>
            ) : (
              <>Ground link: messages arrive instantly.</>
            )}
          </p>
          {mode === "space" && (
            <label className="flex items-center gap-2 text-xs text-mc-muted">
              <input type="checkbox" checked={demoFast} onChange={(e) => setDemo(e.target.checked)} />
              Demo: shorten link delay to {DEMO_DELAY_S} s
            </label>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {QUICK_MESSAGES.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => submit(q.body, q.urgency)}
              className={`min-h-10 rounded-lg border px-3 text-sm font-semibold ${
                q.urgency === "EMERGENCY"
                  ? "border-mc-red bg-mc-red text-white hover:brightness-110"
                  : "border-mc-line-strong bg-mc-inset hover:bg-mc-raised"
              }`}
            >
              {q.urgency === "EMERGENCY" ? "🚨 " : q.urgency === "URGENT" ? "⚠️ " : "💊 "}
              {q.label}
            </button>
          ))}
        </div>

        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit(body, urgency);
          }}
        >
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Urgency">
            {URGENCIES.map((u) => (
              <button
                key={u}
                type="button"
                role="radio"
                aria-checked={urgency === u}
                onClick={() => setUrgency(u)}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
                  urgency === u
                    ? u === "EMERGENCY"
                      ? "border-mc-red bg-mc-red text-white"
                      : u === "URGENT"
                        ? "border-mc-amber bg-mc-amber/20 text-foreground"
                        : "border-mc-select bg-mc-select text-mc-on-select"
                    : "border-mc-line-strong text-mc-muted hover:bg-mc-raised"
                }`}
              >
                {URGENCY_LABEL[u]}
              </button>
            ))}
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
            rows={3}
            maxLength={MAX_BODY}
            placeholder="Describe what's happening: symptoms, when it started, what you've tried…"
            className={`w-full rounded-md border bg-mc-inset px-3 py-2 text-sm ${urgency === "EMERGENCY" ? "border-mc-red" : "border-mc-line-strong"}`}
            aria-label="Message to Earth"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-mc-muted">
              <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} disabled={!vitals} />
              Attach my latest vitals
              {vitals && attach && <VitalsLine vitals={vitals} />}
            </label>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[11px] text-mc-label">
                {body.length}/{MAX_BODY}
              </span>
              <button
                type="submit"
                disabled={!body.trim()}
                className={`min-h-10 rounded-lg px-4 text-sm font-semibold disabled:opacity-50 ${
                  urgency === "EMERGENCY" ? "bg-mc-red text-white" : "bg-mc-select text-mc-on-select"
                }`}
              >
                {urgency === "EMERGENCY" ? "Send emergency…" : "Send to Earth"}
              </button>
            </div>
          </div>
        </form>
        {notice && <p className="mt-3 rounded-md border border-mc-line bg-mc-inset px-3 py-2 text-xs text-mc-soft" role="status">{notice}</p>}
        {loadError && <p className="mt-3 text-xs text-mc-amber">{loadError}</p>}
      </Card>

      <Card title="Conversation">
        {!sent.length && !waiting.length ? (
          <p className="text-sm text-mc-muted">No messages yet. The Earth medical team answers here.</p>
        ) : (
          <ol
            ref={listRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
            }}
            className="flex max-h-[480px] flex-col gap-3 overflow-y-auto pr-1"
            aria-live="polite"
          >
            {sent.map((m) => (
              <Bubble key={m.id} m={m} now={now} />
            ))}
            {waiting.map((p) => (
              <li key={p.clientId} className="chat-in ml-auto max-w-[85%] rounded-xl border border-dashed border-mc-line-strong bg-mc-inset px-3 py-2">
                <div className="mb-1 flex items-center gap-2">
                  <UrgencyBadge urgency={p.urgency} />
                  <span className="font-mono text-[10px] text-mc-label">{hotlineTime(p.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm">{p.body}</p>
                <p className="mt-1 font-mono text-[11px] text-mc-amber">
                  {typeof navigator !== "undefined" && navigator.onLine ? "⏳ Sending…" : "⏳ Waiting to send · goes out with the next sync"}
                </p>
              </li>
            ))}
          </ol>
        )}
        {waiting.length > 0 && (
          <button type="button" onClick={() => void flushOutbox().then(load)} className="mt-3 text-xs font-semibold text-mc-link underline">
            Try sending now
          </button>
        )}
      </Card>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="hotline-confirm">
          <div className="w-full max-w-md rounded-xl border border-mc-red bg-mc-panel p-5 shadow-2xl">
            <h2 id="hotline-confirm" className="text-lg font-bold text-mc-red">
              🚨 Send an EMERGENCY to Earth?
            </h2>
            <p className="mt-2 text-sm text-mc-muted">
              The flight surgeon is alerted at once when it arrives
              {delaySeconds ? ` (in ${countdown(delaySeconds * 1000)})` : ""}. Start your onboard emergency checklist now; do not wait for the reply.
            </p>
            <p className="mt-3 whitespace-pre-wrap rounded-md border border-mc-line bg-mc-inset px-3 py-2 text-sm">{body}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirming(false)} className="min-h-10 rounded-lg border border-mc-line-strong px-4 text-sm">
                Cancel
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => {
                  setConfirming(false);
                  void send(body.trim(), "EMERGENCY");
                }}
                className="min-h-10 rounded-lg bg-mc-red px-4 text-sm font-bold text-white"
              >
                Send emergency
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Bubble({ m, now }: { m: HotlineClientMessage; now: number }) {
  const mine = !m.fromEarth;
  const left = Date.parse(m.deliverAt) - now;
  return (
    <li
      className={`chat-in max-w-[85%] rounded-xl border px-3 py-2 ${
        mine
          ? `ml-auto ${m.urgency === "EMERGENCY" ? "border-mc-red bg-mc-red/10" : "border-mc-line-strong bg-mc-raised"}`
          : "mr-auto border-mc-cyan/50 bg-mc-inset"
      }`}
    >
      <div className="mb-1 flex flex-wrap items-center gap-2">
        {mine ? <UrgencyBadge urgency={m.urgency} /> : <span className="text-xs font-semibold text-mc-link">🌍 {m.senderName ?? "Earth"}</span>}
        <span className="font-mono text-[10px] text-mc-label">{hotlineTime(m.createdAt)}</span>
      </div>
      <p className="whitespace-pre-wrap text-sm">{m.body}</p>
      {mine && m.vitals ? <VitalsLine vitals={m.vitals as Record<string, number>} className="mt-1" /> : null}
      {mine && (
        <p className="mt-1 font-mono text-[11px]">
          {left > 0 ? (
            <span className="text-mc-amber">📡 Sent · arrives on Earth in {countdown(left)}</span>
          ) : m.status === "resolved" ? (
            <span className="text-mc-green">✓✓ Resolved by Earth</span>
          ) : m.status === "acknowledged" ? (
            <span className="text-mc-green">✓✓ Acknowledged by Earth</span>
          ) : m.status === "seen" ? (
            <span className="text-mc-link">✓✓ Seen by Earth</span>
          ) : (
            <span className="text-mc-muted">✓ Delivered to Earth</span>
          )}
        </p>
      )}
    </li>
  );
}
