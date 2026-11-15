import type { HotlineMessage, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readableGroupIds } from "@/lib/authz";
import {
  URGENCY_RANK,
  crewStatus,
  sortConversations,
  visibleToCrew,
  visibleToEarth,
  type ConversationSummary,
  type Urgency,
} from "./rules";

/** What the browser gets for one message; never internal ids of other staff beyond a display name. */
export function toClient(m: HotlineMessage & { sender?: { name: string; role: string } | null }, now = Date.now()) {
  return {
    id: m.id,
    clientId: m.clientId,
    fromEarth: m.fromEarth,
    senderName: m.sender?.name ?? null,
    body: m.body,
    urgency: m.urgency as Urgency,
    vitals: m.vitals,
    createdAt: m.createdAt.toISOString(),
    deliverAt: m.deliverAt.toISOString(),
    readAt: m.readAt?.toISOString() ?? null,
    acknowledgedAt: m.acknowledgedAt?.toISOString() ?? null,
    resolvedAt: m.resolvedAt?.toISOString() ?? null,
    status: m.fromEarth ? null : crewStatus(m, now),
  };
}
export type HotlineClientMessage = ReturnType<typeof toClient>;

const THREAD_LIMIT = 200;

async function loadThread(memberId: string) {
  const rows = await prisma.hotlineMessage.findMany({
    where: { memberId },
    orderBy: { createdAt: "desc" },
    take: THREAD_LIMIT,
    include: { sender: { select: { name: true, role: true } } },
  });
  return rows.reverse();
}

/** The astronaut's own thread; marks arrived Earth replies as read unless peeking. */
export async function crewThread(user: User, { peek = false } = {}) {
  const now = Date.now();
  const rows = (await loadThread(user.id)).filter((m) => visibleToCrew(m, now));
  const unread = rows.filter((m) => m.fromEarth && !m.readAt).length;
  if (!peek && unread) {
    await prisma.hotlineMessage.updateMany({
      where: { memberId: user.id, fromEarth: true, readAt: null, deliverAt: { lte: new Date(now) } },
      data: { readAt: new Date(now) },
    });
  }
  return { unread, messages: peek ? [] : rows.map((m) => toClient(m, now)) };
}

/** Earth inbox: one row per astronaut the staff member can read who has hotline messages. */
export async function earthInbox(staff: User) {
  const now = new Date();
  const groups = await readableGroupIds(staff);
  const members = await prisma.user.findMany({
    where: { role: "ASTRONAUT", groupId: { in: groups } },
    select: { id: true, name: true, callsign: true, group: { select: { code: true } } },
  });
  if (!members.length) return { conversations: [], alert: null };
  const ids = members.map((m) => m.id);
  const rows = await prisma.hotlineMessage.findMany({
    where: { memberId: { in: ids }, OR: [{ fromEarth: true }, { deliverAt: { lte: now } }] },
    orderBy: { createdAt: "desc" },
    take: 2000,
    select: { memberId: true, fromEarth: true, urgency: true, readAt: true, resolvedAt: true, createdAt: true, body: true, deliverAt: true },
  });
  const byMember = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!visibleToEarth(r, now.getTime())) continue;
    const list = byMember.get(r.memberId) ?? [];
    list.push(r);
    byMember.set(r.memberId, list);
  }
  const conversations = sortConversations(
    members
      .filter((m) => byMember.has(m.id))
      .map((m) => {
        const list = byMember.get(m.id)!;
        const crew = list.filter((r) => !r.fromEarth);
        const open = crew.filter((r) => !r.resolvedAt);
        const openUrgency = open.reduce<Urgency | null>(
          (top, r) => (!top || URGENCY_RANK[r.urgency as Urgency] > URGENCY_RANK[top] ? (r.urgency as Urgency) : top),
          null
        );
        const summary: ConversationSummary & { name: string; callsign: string; group: string | null; preview: string; previewFromEarth: boolean } = {
          memberId: m.id,
          name: m.name,
          callsign: m.callsign,
          group: m.group?.code ?? null,
          openUrgency,
          unread: crew.filter((r) => !r.readAt).length,
          lastAt: list[0].createdAt.toISOString(),
          preview: list[0].body.slice(0, 120),
          previewFromEarth: list[0].fromEarth,
        };
        return summary;
      })
  );
  // Banner: the most serious unread message across the inbox.
  const top = conversations.find((c) => c.unread > 0 && (c.openUrgency === "EMERGENCY" || c.openUrgency === "URGENT"));
  return { conversations, alert: top ? { memberId: top.memberId, name: top.name, urgency: top.openUrgency } : null };
}

/** One astronaut's thread for Earth staff; marks arrived crew messages as seen. */
export async function earthThread(memberId: string) {
  const now = Date.now();
  const rows = (await loadThread(memberId)).filter((m) => visibleToEarth(m, now));
  await prisma.hotlineMessage.updateMany({
    where: { memberId, fromEarth: false, readAt: null, deliverAt: { lte: new Date(now) } },
    data: { readAt: new Date(now) },
  });
  return rows.map((m) => toClient(m, now));
}

/** Earth replies travel back with the same link delay the astronaut's latest message used. */
export async function replyDelayMs(memberId: string) {
  const last = await prisma.hotlineMessage.findFirst({
    where: { memberId, fromEarth: false },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, deliverAt: true },
  });
  return last ? Math.max(0, last.deliverAt.getTime() - last.createdAt.getTime()) : 0;
}

export async function sentInLastMinute(senderId: string) {
  return prisma.hotlineMessage.count({ where: { senderId, createdAt: { gte: new Date(Date.now() - 60_000) } } });
}
