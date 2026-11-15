"use client";

import { db, type OutboxChat, type OutboxHealth, type OutboxHotline, type OutboxItem } from "@/lib/db";

/**
 * Sends co-pilot messages and health logs to the server for mission oversight. Everything
 * goes into the IndexedDB outbox first and is removed only after the server confirms it,
 * so the console keeps working offline and catches up when the link returns.
 */

type Reporter = { userId: string; name: string };
let reporter: Reporter | null = null;

/** Set by the console once the signed-in user is known; nothing is queued before that. */
export function setOutboxUser(user: Reporter | null) {
  reporter = user;
  if (user) void flushOutbox();
}

export function getOutboxUser() {
  return reporter;
}

export async function queueChat(message: Omit<OutboxChat, "id" | "createdAt">) {
  if (!reporter) return;
  const payload: OutboxChat = { ...message, id: crypto.randomUUID(), createdAt: Date.now() };
  try {
    await db.outbox.put({ id: `chat:${payload.id}`, userId: reporter.userId, type: "chat", createdAt: payload.createdAt, payload });
  } catch {
    return; // IndexedDB unavailable (private window): the chat still works, it just isn't saved.
  }
  void flushOutbox();
}

/**
 * Queues the latest copy of a health log. `subject` is the crew member the log belongs to
 * (logs are kept per name on the device); only the signed-in user's own logs are sent.
 */
export async function queueHealth(kind: OutboxHealth["kind"], key: string, data: unknown, subject?: string) {
  if (!reporter || (subject !== undefined && subject !== reporter.name)) return;
  const recordedAt = Date.now();
  // One pending copy per log: a newer edit replaces the older unsent one.
  const id = `health:${reporter.userId}:${kind}:${key}`;
  try {
    await db.outbox.put({ id, userId: reporter.userId, type: "health", createdAt: recordedAt, payload: { id, kind, key, data, recordedAt } });
  } catch {
    return;
  }
  void flushOutbox();
}

export const HOTLINE_OUTBOX_CHANGED = "astromed:hotline-outbox";

/** Queues a hotline message to Earth; it is sent at once when online, or on the next sync. */
export async function queueHotline(message: Omit<OutboxHotline, "id" | "clientId" | "createdAt">): Promise<OutboxHotline | null> {
  if (!reporter) return null;
  const clientId = crypto.randomUUID();
  const payload: OutboxHotline = { ...message, id: clientId, clientId, createdAt: Date.now() };
  try {
    await db.outbox.put({ id: `hotline:${clientId}`, userId: reporter.userId, type: "hotline", createdAt: payload.createdAt, payload });
  } catch {
    return null;
  }
  window.dispatchEvent(new Event(HOTLINE_OUTBOX_CHANGED));
  void flushOutbox();
  return payload;
}

/** Hotline messages still waiting in this device's queue (shown as "waiting to send"). */
export async function pendingHotline(): Promise<OutboxHotline[]> {
  try {
    if (!reporter) return [];
    const items = await db.outbox.where("userId").equals(reporter.userId).sortBy("createdAt");
    return items.filter((i): i is Extract<OutboxItem, { type: "hotline" }> => i.type === "hotline").map((i) => i.payload);
  } catch {
    return [];
  }
}

let flushing: Promise<void> | null = null;
let flushAgain = false;
export const HEALTH_REPORTS_SYNCED = "astromed:health-reports-synced";

export function flushOutbox(): Promise<void> {
  if (flushing) {
    flushAgain = true;
    return flushing;
  }
  flushing = (async () => {
    do {
      flushAgain = false;
      await doFlush();
    } while (flushAgain);
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

async function send<T extends OutboxItem>(items: T[], url: string, field: string) {
  if (!items.length) return;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ [field]: items.map((i) => i.payload) }),
  });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  const { saved = [] } = (await res.json()) as { saved?: string[] };
  const ok = new Set(saved);
  await db.transaction("rw", db.outbox, async () => {
    for (const item of items) {
      if (!ok.has(item.payload.id)) continue;
      // Leave a health log that was edited again while this request was in flight.
      const current = await db.outbox.get(item.id);
      if (current && current.createdAt === item.createdAt) await db.outbox.delete(item.id);
    }
  });
  if (field === "reports" && saved.length) window.dispatchEvent(new Event(HEALTH_REPORTS_SYNCED));
  if (url === "/api/hotline" && saved.length) window.dispatchEvent(new Event(HOTLINE_OUTBOX_CHANGED));
}

async function doFlush() {
  if (!reporter || typeof navigator === "undefined" || !navigator.onLine) return;
  try {
    // The server files everything under the signed-in session, so only send this user's items.
    const items = await db.outbox.where("userId").equals(reporter.userId).sortBy("createdAt");
    const chats = items.filter((i): i is Extract<OutboxItem, { type: "chat" }> => i.type === "chat");
    const health = items.filter((i): i is Extract<OutboxItem, { type: "health" }> => i.type === "health");
    const hotline = items.filter((i): i is Extract<OutboxItem, { type: "hotline" }> => i.type === "hotline");
    // Hotline first: an emergency should not wait behind a backlog of logs.
    for (let i = 0; i < hotline.length; i += 20) await send(hotline.slice(i, i + 20), "/api/hotline", "messages");
    for (let i = 0; i < chats.length; i += 100) await send(chats.slice(i, i + 100), "/api/chat/messages", "messages");
    for (let i = 0; i < health.length; i += 20) await send(health.slice(i, i + 20), "/api/health/reports", "reports");
  } catch {
    /* offline or server error: items stay queued for the next sync */
  }
}

export async function countOutbox(): Promise<number> {
  try {
    return reporter ? await db.outbox.where("userId").equals(reporter.userId).count() : 0;
  } catch {
    return 0;
  }
}
