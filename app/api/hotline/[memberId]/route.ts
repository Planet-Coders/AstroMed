import { NextResponse } from "next/server";
import { currentUser, readableGroupIds } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { canEarthAccess, cleanBody, isEarthRole } from "@/lib/hotline/rules";
import { earthThread, replyDelayMs, sentInLastMinute } from "@/lib/hotline/server";

const REPLY_LIMIT_PER_MIN = 20;

/** Earth staff only, and only for astronauts in groups they may read (404 otherwise, so ids can't be probed). */
async function authorise(memberId: string) {
  const user = await currentUser();
  if (!user || user.disabled) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!isEarthRole(user)) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  const member = await prisma.user.findUnique({
    where: { id: memberId },
    select: { id: true, name: true, callsign: true, role: true, groupId: true, disabled: true, group: { select: { code: true } } },
  });
  if (!member || !canEarthAccess(user, member, await readableGroupIds(user))) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  return { user, member };
}

export async function GET(_request: Request, { params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params;
  const auth = await authorise(memberId);
  if ("error" in auth) return auth.error;
  try {
    const messages = await earthThread(memberId);
    const { member } = auth;
    return NextResponse.json({
      member: { id: member.id, name: member.name, callsign: member.callsign, group: member.group?.code ?? null },
      messages,
    });
  } catch {
    return NextResponse.json({ error: "Hotline unavailable" }, { status: 503 });
  }
}

/** { body } sends a reply; { action: "acknowledge" | "resolve" } updates the astronaut's arrived messages. */
export async function POST(request: Request, { params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params;
  const auth = await authorise(memberId);
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const input = await request.json().catch(() => ({}));
  const now = new Date();

  try {
    if (input?.action === "acknowledge" || input?.action === "resolve") {
      const arrived = { memberId, fromEarth: false, deliverAt: { lte: now } };
      await prisma.hotlineMessage.updateMany({
        where: { ...arrived, acknowledgedAt: null },
        data: { acknowledgedAt: now, acknowledgedBy: user.name, readAt: now },
      });
      if (input.action === "resolve") {
        await prisma.hotlineMessage.updateMany({ where: { ...arrived, resolvedAt: null }, data: { resolvedAt: now, resolvedBy: user.name } });
      }
      return NextResponse.json({ ok: true });
    }

    const body = cleanBody(input?.body);
    if (!body) return NextResponse.json({ error: "Write a message (up to 1000 characters)" }, { status: 400 });
    if ((await sentInLastMinute(user.id)) >= REPLY_LIMIT_PER_MIN) {
      return NextResponse.json({ error: "Too many replies, wait a moment" }, { status: 429 });
    }
    const delay = await replyDelayMs(memberId);
    await prisma.hotlineMessage.create({
      data: {
        memberId,
        senderId: user.id,
        fromEarth: true,
        body,
        urgency: "ROUTINE",
        createdAt: now,
        deliverAt: new Date(now.getTime() + delay),
      },
    });
    // Replying also acknowledges what the astronaut sent.
    await prisma.hotlineMessage.updateMany({
      where: { memberId, fromEarth: false, deliverAt: { lte: now }, acknowledgedAt: null },
      data: { acknowledgedAt: now, acknowledgedBy: user.name, readAt: now },
    });
    return NextResponse.json({ ok: true, deliverAt: new Date(now.getTime() + delay).toISOString() });
  } catch {
    return NextResponse.json({ error: "Could not send" }, { status: 503 });
  }
}
