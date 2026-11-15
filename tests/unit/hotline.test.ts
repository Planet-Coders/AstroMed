import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_BODY,
  canEarthAccess,
  canUseCrewHotline,
  clampDelay,
  cleanVitals,
  countdown,
  crewStatus,
  sortConversations,
  validateCrewMessage,
  visibleToCrew,
  visibleToEarth,
  type ConversationSummary,
} from "@/lib/hotline/rules";

const NOW = Date.parse("2026-11-14T12:00:00Z");
const base = { clientId: "abcdef12-3456", body: "Chest pain since 10 min", urgency: "URGENT", delaySeconds: 20 };

describe("hotline message validation", () => {
  it("accepts a well-formed crew message", () => {
    const m = validateCrewMessage({ ...base, vitals: { heartRate: 112, spo2: 95.44, junk: 1 } }, NOW)!;
    expect(m.body).toBe(base.body);
    expect(m.urgency).toBe("URGENT");
    expect(m.vitals).toEqual({ heartRate: 112, spo2: 95.4 });
  });

  it("rejects empty, too long, bad urgency or bad client ids", () => {
    expect(validateCrewMessage({ ...base, body: "   " }, NOW)).toBeNull();
    expect(validateCrewMessage({ ...base, body: "x".repeat(MAX_BODY + 1) }, NOW)).toBeNull();
    expect(validateCrewMessage({ ...base, urgency: "PANIC" }, NOW)).toBeNull();
    expect(validateCrewMessage({ ...base, clientId: "../../etc" }, NOW)).toBeNull();
    expect(validateCrewMessage(null, NOW)).toBeNull();
  });

  it("strips control characters but keeps newlines", () => {
    expect(validateCrewMessage({ ...base, body: "line1\nline2\u0007" }, NOW)!.body).toBe("line1\nline2");
  });

  it("clamps the link delay and drops implausible vitals", () => {
    expect(clampDelay(99999)).toBe(1500);
    expect(clampDelay(-5)).toBe(0);
    expect(clampDelay("20")).toBe(0);
    expect(cleanVitals({ heartRate: 999, spo2: Number.NaN })).toBeNull();
  });
});

describe("hotline permissions", () => {
  const astro = { id: "a1", role: "ASTRONAUT", groupId: "g1" };
  const other = { id: "a2", role: "ASTRONAUT", groupId: "g2" };
  const surgeon = { id: "s1", role: "OVERSIGHT" };
  const admin = { id: "x1", role: "SUPER_ADMIN" };

  it("only astronauts own a crew thread", () => {
    expect(canUseCrewHotline(astro)).toBe(true);
    expect(canUseCrewHotline({ ...astro, disabled: true })).toBe(false);
    expect(canUseCrewHotline(surgeon)).toBe(false);
    expect(canUseCrewHotline({ id: "c", role: "COMMANDER" })).toBe(false);
  });

  it("Earth staff only reach astronauts in groups they can read", () => {
    expect(canEarthAccess(surgeon, astro, ["g1"])).toBe(true);
    expect(canEarthAccess(surgeon, other, ["g1"])).toBe(false);
    expect(canEarthAccess(admin, other, ["g1", "g2"])).toBe(true);
    expect(canEarthAccess({ ...surgeon, disabled: true }, astro, ["g1"])).toBe(false);
    // an astronaut can never act as Earth, even on their own thread
    expect(canEarthAccess(astro, astro, ["g1"])).toBe(false);
    expect(canEarthAccess(surgeon, { id: "c", role: "COMMANDER", groupId: "g1" }, ["g1"])).toBe(false);
  });
});

describe("hotline delivery timing", () => {
  const inTransit = { fromEarth: false, deliverAt: new Date(NOW + 5000) };
  const arrived = { fromEarth: false, deliverAt: new Date(NOW - 1) };
  const replyInTransit = { fromEarth: true, deliverAt: new Date(NOW + 5000) };

  it("each side sees its own messages at once and the other side's after the delay", () => {
    expect(visibleToCrew(inTransit, NOW)).toBe(true);
    expect(visibleToEarth(inTransit, NOW)).toBe(false);
    expect(visibleToEarth(arrived, NOW)).toBe(true);
    expect(visibleToEarth(replyInTransit, NOW)).toBe(true);
    expect(visibleToCrew(replyInTransit, NOW)).toBe(false);
  });

  it("crew status goes in-transit, delivered, seen, acknowledged, resolved", () => {
    expect(crewStatus({ deliverAt: new Date(NOW + 1) }, NOW)).toBe("in-transit");
    expect(crewStatus({ deliverAt: new Date(NOW - 1) }, NOW)).toBe("delivered");
    expect(crewStatus({ deliverAt: new Date(NOW - 1), readAt: new Date(NOW) }, NOW)).toBe("seen");
    expect(crewStatus({ deliverAt: new Date(NOW - 1), readAt: new Date(NOW), acknowledgedAt: new Date(NOW) }, NOW)).toBe("acknowledged");
    expect(crewStatus({ deliverAt: new Date(NOW - 1), acknowledgedAt: new Date(NOW), resolvedAt: new Date(NOW) }, NOW)).toBe("resolved");
    expect(countdown(1204_000)).toBe("20:04");
    expect(countdown(65_400)).toBe("1:06");
  });
});

describe("Earth inbox ordering", () => {
  const c = (memberId: string, openUrgency: ConversationSummary["openUrgency"], unread: number, lastAt: string): ConversationSummary => ({
    memberId,
    openUrgency,
    unread,
    lastAt,
  });

  it("puts open emergencies first, then urgent, then routine, then closed; newest first within a level", () => {
    const sorted = sortConversations([
      c("closed", null, 0, "2026-11-14T11:59:00Z"),
      c("routine", "ROUTINE", 1, "2026-11-14T11:58:00Z"),
      c("urgent-old", "URGENT", 1, "2026-11-14T10:00:00Z"),
      c("emergency", "EMERGENCY", 1, "2026-11-14T09:00:00Z"),
      c("urgent-new", "URGENT", 1, "2026-11-14T11:00:00Z"),
    ]);
    expect(sorted.map((x) => x.memberId)).toEqual(["emergency", "urgent-new", "urgent-old", "routine", "closed"]);
  });
});

// ---- offline queue: hotline messages wait in the outbox and are sent first on sync ----

type Row = { id: string; userId: string; type: string; createdAt: number; payload: { id: string } };
const store = new Map<string, Row>();
vi.mock("@/lib/db", () => ({
  db: {
    outbox: {
      put: async (row: Row) => void store.set(row.id, row),
      get: async (id: string) => store.get(id),
      delete: async (id: string) => void store.delete(id),
      where: () => ({
        equals: (userId: string) => ({
          sortBy: async () => [...store.values()].filter((r) => r.userId === userId).sort((a, b) => a.createdAt - b.createdAt),
          count: async () => [...store.values()].filter((r) => r.userId === userId).length,
        }),
      }),
    },
    transaction: async (_mode: string, _table: unknown, fn: () => Promise<void>) => fn(),
  },
}));

describe("hotline offline queue", () => {
  let online = false;
  const calls: { url: string; body: { messages?: { clientId: string }[] } }[] = [];

  beforeEach(() => {
    store.clear();
    calls.length = 0;
    vi.stubGlobal("window", { dispatchEvent: () => true });
    vi.stubGlobal("navigator", {
      get onLine() {
        return online;
      },
    });
    vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      calls.push({ url, body });
      const saved = (body.messages ?? body.reports ?? []).map((m: { clientId?: string; id: string }) => m.clientId ?? m.id);
      return { ok: true, json: async () => ({ saved }) };
    });
  });

  it("keeps messages queued while offline and sends them, hotline first, when back online", async () => {
    const outbox = await import("@/lib/outbox");
    online = false;
    outbox.setOutboxUser({ userId: "a1", name: "Nova" });
    await outbox.queueHealth("routine", "2026-11-14", { minutes: 10 });
    expect(await outbox.queueHotline({ body: "Need a consult", urgency: "URGENT", vitals: null, delaySeconds: 20 })).toBeTruthy();
    await outbox.flushOutbox();
    expect(calls).toHaveLength(0);
    const waiting = await outbox.pendingHotline();
    expect(waiting).toHaveLength(1);
    expect(waiting[0].clientId).toBe(waiting[0].id);

    online = true;
    await outbox.flushOutbox();
    expect(calls.map((c) => c.url)).toEqual(["/api/hotline", "/api/health/reports"]);
    expect(calls[0].body.messages?.[0].clientId).toBe(waiting[0].clientId);
    expect(await outbox.pendingHotline()).toHaveLength(0);
    outbox.setOutboxUser(null);
  });
});
