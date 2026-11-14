import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { currentUser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { SEND_LIMIT_PER_MIN, canUseCrewHotline, isEarthRole, validateCrewMessage } from "@/lib/hotline/rules";
import { crewThread, earthInbox, sentInLastMinute } from "@/lib/hotline/server";

/**
 * GET  astronaut: own thread (?peek=1 returns only the unread count, for the sidebar badge)
 *      Earth staff: inbox of the astronauts they may read, most urgent first
 * POST astronaut: send messages (also used by the offline queue), { messages: [...] }
 */
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user || user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    if (canUseCrewHotline(user)) {
      const peek = new URL(request.url).searchParams.get("peek") === "1";
      return NextResponse.json(await crewThread(user, { peek }));
    }
    if (isEarthRole(user)) return NextResponse.json(await earthInbox(user));
  } catch {
    return NextResponse.json({ error: "Hotline unavailable" }, { status: 503 });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user || user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseCrewHotline(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const raw = Array.isArray(body?.messages) ? body.messages.slice(0, 20) : [];
  const valid = raw.map((r: unknown) => validateCrewMessage(r)).filter(Boolean) as NonNullable<ReturnType<typeof validateCrewMessage>>[];
  if (!valid.length) return NextResponse.json({ error: "No valid messages" }, { status: 400 });

  try {
    // Already stored (a re-send from the offline queue) counts as saved.
    const existing = await prisma.hotlineMessage.findMany({
      where: { clientId: { in: valid.map((v) => v.clientId) }, memberId: user.id },
      select: { clientId: true },
    });
    const have = new Set(existing.map((e) => e.clientId));
    const fresh = valid.filter((v) => !have.has(v.clientId));
    const room = Math.max(0, SEND_LIMIT_PER_MIN - (await sentInLastMinute(user.id)));
    const allowed = fresh.slice(0, room);
    const now = Date.now();
    for (const m of allowed) {
      try {
        await prisma.hotlineMessage.create({
          data: {
            memberId: user.id,
            senderId: user.id,
            fromEarth: false,
            body: m.body,
            urgency: m.urgency,
            vitals: m.vitals ?? Prisma.JsonNull,
            clientId: m.clientId,
            // Transmitted now (even if it waited in the offline queue), arriving after the link delay.
            createdAt: new Date(now),
            deliverAt: new Date(now + m.delaySeconds * 1000),
          },
        });
        have.add(m.clientId);
      } catch (e) {
        // Unique clientId race: another request stored it first.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") have.add(m.clientId);
        else throw e;
      }
    }
    const limited = fresh.length > allowed.length;
    return NextResponse.json(
      { saved: [...have], limited },
      { status: limited && !allowed.length && !existing.length ? 429 : 200 }
    );
  } catch {
    return NextResponse.json({ error: "Could not send" }, { status: 503 });
  }
}
