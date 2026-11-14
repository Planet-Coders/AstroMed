import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "aahms_session";

export type SessionUser = {
  userId: string;
  name: string;
  email: string;
  role: Role;
  crewId: string;
  callsign: string;
  sex?: "male" | "female";
};

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifySessionToken(
  token: string
): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session) return null;
  // A disabled account loses its open sessions at once. Offline demo identities have no
  // user row, and an unreachable database keeps the crew console working.
  const row = await prisma.user
    .findUnique({ where: { id: session.userId }, select: { disabled: true } })
    .catch(() => null);
  return row?.disabled ? null : session;
}

/** Where each role lands after sign-in. */
export function homeFor(role: Role): string {
  if (role === "SUPER_ADMIN") return "/admin";
  if (role === "OVERSIGHT") return "/oversight";
  return "/";
}

export { COOKIE_NAME };
