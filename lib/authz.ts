import { NextResponse } from "next/server";
import type { Role, User } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Server-side role checks for the admin and oversight APIs. The role is read from the
 * database, not the cookie, so a demoted or deleted account loses access at once.
 */

export const PRIVILEGED_ROLES: Role[] = ["SUPER_ADMIN", "OVERSIGHT"];

export async function currentUser(): Promise<User | null> {
  const session = await getSession();
  if (!session) return null;
  return prisma.user.findUnique({ where: { id: session.userId } }).catch(() => null);
}

/** The signed-in user if their role is allowed, otherwise a 401/403 response to return. */
export async function requireRole(roles: Role[]): Promise<{ user: User } | { error: NextResponse }> {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const user = await currentUser();
  if (!user || user.disabled || !roles.includes(user.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}

/** Mission groups this user may read: all for a super admin, the assigned ones for oversight. */
export async function readableGroupIds(user: User): Promise<string[]> {
  if (user.role === "SUPER_ADMIN") {
    return (await prisma.missionGroup.findMany({ select: { id: true } })).map((g) => g.id);
  }
  if (user.role === "OVERSIGHT") {
    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: { overseenGroups: { select: { id: true } } },
    });
    return row?.overseenGroups.map((g) => g.id) ?? [];
  }
  return [];
}

/** An astronaut the user may read, or null (callers answer 404 so ids can't be probed). */
export async function readableMember(user: User, memberId: string) {
  const member = await prisma.user.findUnique({ where: { id: memberId } });
  if (!member || member.role !== "ASTRONAUT" || !member.groupId) return null;
  const groups = await readableGroupIds(user);
  return groups.includes(member.groupId) ? member : null;
}

/** Account fields the admin console shows; never the password hash. */
export const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  callsign: true,
  crewId: true,
  sex: true,
  disabled: true,
  groupId: true,
  createdAt: true,
  group: { select: { id: true, code: true, name: true } },
  overseenGroups: { select: { id: true, code: true, name: true } },
} as const;

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}
