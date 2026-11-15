"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HotlineClientMessage as Msg } from "@/lib/hotline/server";
import { Card } from "../ui/Card";
import { MAX_BODY, countdown, type Urgency } from "@/lib/hotline/rules";
import type { HotlineClientMessage } from "@/lib/hotline/server";
import { UrgencyBadge, VitalsLine, hotlineTime } from "./shared";

type Conversation = {
  memberId: string;
  name: string;
  callsign: string;
  group: string | null;
  openUrgency: Urgency | null;
  unread: number;
  lastAt: string;
  preview: string;
  previewFromEarth: boolean;
};
type Inbox = { conversations: Conversation[]; alert: { memberId: string; name: string; urgency: Urgency } | null };
type Thread = { member: { id: string; name: string; callsign: string; group: string | null }; messages: HotlineClientMessage[] };

/** Two short tones for an incoming urgent hotline message (best effort: browsers may block audio). */
function chime(emergency: boolean) {
  try {
    const ctx = new AudioContext();
    const tones = emergency ? [880, 660, 880, 660] : [740, 990];
    tones.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const t = ctx.currentTime + i * 0.22;
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.15, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.21);
    });
    setTimeout(() => void ctx.close(), 1500);
  } catch {
    /* audio unavailable */
  }
}

/** Earth side of the hotline for flight surgeons / mission control. */
export function EarthHotline() {
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const lastAlert = useRef<string>("");
  // Replies shown at once while they are being sent; removed when the server copy is loaded.
  const [outgoing, setOutgoing] = useState<Msg[]>([]);
  const listRef = useRef<HTMLOListElement>(null);
  const atBottom = useRef(true);

  const loadInbox = useCallback(async () => {
    try {
      const r = await fetch("/api/hotline", { cache: "no-store" });
      if (!r.ok) throw new Error(r.status === 503 ? "Hotline server unavailable" : `Hotline error ${r.status}`);
      const d = (await r.json()) as Inbox;
      setInbox(d);
      setError(null);
      const key = d.alert ? `${d.alert.memberId}:${d.alert.urgency}:${d.conversations.find((c) => c.memberId === d.alert!.memberId)?.lastAt}` : "";
      if (key && key !== lastAlert.current) chime(d.alert!.urgency === "EMERGENCY");
      lastAlert.current = key;
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const loadThread = useCallback(async (id: string) => {
    const r = await fetch(`/api/hotline/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (r.ok) setThread((await r.json()) as Thread);
  }, []);

  useEffect(() => {
    const first = setTimeout(loadInbox, 0);
    const id = setInterval(() => {
      void loadInbox();
      setNow(Date.now());
    }, 4000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [loadInbox]);

  useEffect(() => {
    if (!openId) return;
    const first = setTimeout(() => void loadThread(openId), 0);
    const id = setInterval(() => void loadThread(openId), 4000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [openId, loadThread]);

  const threadCount = (thread?.messages.length ?? 0) + outgoing.length;
  useEffect(() => {
    const el = listRef.current;
    if (el && atBottom.current) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [threadCount, openId]);

  const post = async (payload: object) => {
    if (!openId) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/hotline/${encodeURIComponent(openId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `Error ${r.status}`);
      else setError(null);
      await Promise.all([loadThread(openId), loadInbox()]);
    } finally {
      setBusy(false);
    }
  };

  const alert = inbox?.alert;
  const totalUnread = inbox?.conversations.reduce((n, c) => n + c.unread, 0) ?? 0;

  return (
    <section className="flex flex-col gap-3" aria-label="Hotline">
      {alert && (
        <button
          type="button"
          onClick={() => setOpenId(alert.memberId)}
          className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm font-semibold shadow ${
            alert.urgency === "EMERGENCY" ? "animate-pulse border-mc-red bg-mc-red text-white" : "border-mc-amber bg-mc-amber/20"
          }`}
          role="alert"
        >
          <span className="text-xl" aria-hidden>
            {alert.urgency === "EMERGENCY" ? "🚨" : "⚠️"}
          </span>
          Hotline {alert.urgency === "EMERGENCY" ? "EMERGENCY" : "urgent message"} from {alert.name}. Open the conversation →
        </button>
      )}

      <Card title={`Hotline${totalUnread ? ` · ${totalUnread} unread` : ""}`}>
        {error && <p className="mb-3 text-xs text-mc-amber">{error}</p>}
        {!inbox ? (
          <p className="text-sm text-mc-muted">Loading hotline…</p>
        ) : !inbox.conversations.length ? (
          <p className="text-sm text-mc-muted">No hotline messages from your crews yet.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            <ul className="divide-y divide-mc-line rounded-md border border-mc-line" aria-label="Hotline conversations">
              {inbox.conversations.map((c) => (
                <li key={c.memberId}>
                  <button
                    type="button"
                    onClick={() => setOpenId(c.memberId)}
                    className={`flex w-full flex-col gap-1 px-3 py-2.5 text-left hover:bg-mc-raised ${openId === c.memberId ? "bg-mc-raised" : ""}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="flex-1 truncate text-sm font-semibold">
                        {c.name} <span className="font-mono text-[11px] text-mc-label">{c.callsign}{c.group ? ` · ${c.group}` : ""}</span>
                      </span>
                      {c.openUrgency && <UrgencyBadge urgency={c.openUrgency} />}
                      {c.unread > 0 && (
                        <span className="rounded-full bg-mc-red px-1.5 font-mono text-[10px] font-bold text-white">{c.unread}</span>
                      )}
                    </span>
                    <span className="truncate text-xs text-mc-muted">
                      {c.previewFromEarth ? "You: " : ""}
                      {c.preview}
                    </span>
                    <span className="font-mono text-[10px] text-mc-label">{hotlineTime(c.lastAt)}</span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="min-w-0">
              {!thread || thread.member.id !== openId ? (
                <p className="text-sm text-mc-muted">Choose a conversation.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">
                      {thread.member.name} <span className="font-mono text-xs text-mc-label">{thread.member.callsign}</span>
                    </h3>
                    <div className="flex gap-2">
                      <button type="button" disabled={busy} onClick={() => void post({ action: "acknowledge" })} className="min-h-9 rounded-md border border-mc-line-strong px-3 text-xs font-semibold hover:bg-mc-raised">
                        Acknowledge
                      </button>
                      <button type="button" disabled={busy} onClick={() => void post({ action: "resolve" })} className="min-h-9 rounded-md border border-mc-green px-3 text-xs font-semibold text-mc-green hover:bg-mc-green/10">
                        Mark resolved
                      </button>
                    </div>
                  </div>
                  <ol
                    ref={listRef}
                    onScroll={(e) => {
                      const el = e.currentTarget;
                      atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
                    }}
                    className="flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1"
                  >
                    {[...thread.messages, ...outgoing].map((m) => {
                      const toCrewLeft = Date.parse(m.deliverAt) - now;
                      return (
                        <li
                          key={m.id}
                          className={`chat-in max-w-[85%] rounded-xl border px-3 py-2 ${
                            m.fromEarth
                              ? "ml-auto border-mc-cyan/50 bg-mc-inset"
                              : m.urgency === "EMERGENCY"
                                ? "mr-auto border-mc-red bg-mc-red/10"
                                : "mr-auto border-mc-line-strong bg-mc-raised"
                          }`}
                        >
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            {m.fromEarth ? (
                              <span className="text-xs font-semibold text-mc-link">🌍 {m.senderName ?? "Earth"}</span>
                            ) : (
                              <UrgencyBadge urgency={m.urgency} />
                            )}
                            <span className="font-mono text-[10px] text-mc-label">{hotlineTime(m.createdAt)}</span>
                            {!m.fromEarth && m.resolvedAt && <span className="font-mono text-[10px] text-mc-green">RESOLVED</span>}
                            {!m.fromEarth && !m.resolvedAt && m.acknowledgedAt && <span className="font-mono text-[10px] text-mc-green">ACK</span>}
                          </div>
                          <p className="whitespace-pre-wrap text-sm">{m.body}</p>
                          {!m.fromEarth && m.vitals ? <VitalsLine vitals={m.vitals as Record<string, number>} className="mt-1 block" /> : null}
                          {m.fromEarth && (
                            <p className="mt-1 font-mono text-[11px] text-mc-muted">
                              {m.id.startsWith("sending:")
                                ? "⏳ Sending…"
                                : toCrewLeft > 0
                                  ? `📡 Reaches the crew in ${countdown(toCrewLeft)}`
                                  : m.readAt
                                    ? "✓✓ Read by crew"
                                    : "✓ Delivered to crew"}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                  <form
                    className="flex flex-col gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const text = reply.trim();
                      if (!text) return;
                      // Show the reply straight away and clear the box; the server copy replaces it.
                      const temp: Msg = {
                        id: `sending:${Date.now()}`, clientId: null, fromEarth: true, senderName: "You", body: text,
                        urgency: "ROUTINE", vitals: null, createdAt: new Date().toISOString(), deliverAt: new Date().toISOString(),
                        readAt: null, acknowledgedAt: null, resolvedAt: null, status: null,
                      };
                      atBottom.current = true;
                      setOutgoing((o) => [...o, temp]);
                      setReply("");
                      void post({ body: text }).finally(() => setOutgoing((o) => o.filter((x) => x.id !== temp.id)));
                    }}
                  >
                    <textarea
                      value={reply}
                      onChange={(e) => setReply(e.target.value.slice(0, MAX_BODY))}
                      rows={3}
                      maxLength={MAX_BODY}
                      placeholder={`Reply to ${thread.member.name}…`}
                      className="w-full rounded-md border border-mc-line-strong bg-mc-inset px-3 py-2 text-sm"
                      aria-label="Reply to crew"
                    />
                    <div className="flex justify-end">
                      <button type="submit" disabled={busy || !reply.trim()} className="min-h-10 rounded-lg bg-mc-select px-4 text-sm font-semibold text-mc-on-select disabled:opacity-50">
                        Send reply
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}
