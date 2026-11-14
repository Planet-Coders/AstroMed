import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { COOKIE_NAME, createSessionToken, homeFor, type SessionUser } from "@/lib/auth";
import { PRIVILEGED_ROLES } from "@/lib/authz";

const DEMO_EMAIL = "john@aahms.demo";

/** Any email/password signs in. On by default outside production; set DEMO_MODE=false to disable. */
function isDemoMode() {
  if (process.env.DEMO_MODE) return process.env.DEMO_MODE === "true";
  return process.env.NODE_ENV !== "production";
}

function nameFromEmail(email: string) {
  const local = email.split("@")[0].replace(/[._-]+/g, " ").trim() || "Guest";
  return local.replace(/\b\w/g, (c) => c.toUpperCase());
}

class PrivilegedLoginError extends Error {}
class DisabledAccountError extends Error {}

async function demoSignIn(email: string, password: string): Promise<SessionUser> {
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    // Demo mode lets crew in with any password, but never admin or oversight accounts:
    // they can read every astronaut's data, so they always need their real password.
    if (existing && PRIVILEGED_ROLES.includes(existing.role) && !(await bcrypt.compare(password, existing.password))) {
      throw new PrivilegedLoginError();
    }
    if (existing?.disabled) throw new DisabledAccountError();
    const defaultGroup = existing ? null : await prisma.missionGroup.findUnique({ where: { code: "MTV-1" } });
    const user =
      existing ??
      (await prisma.user.create({
        data: {
          email,
          name: nameFromEmail(email),
          password: await bcrypt.hash(password || "demo", 10),
          // Unknown emails always become astronauts; privileged roles are only created by a super admin.
          role: "ASTRONAUT",
          callsign: "GUEST",
          crewId: "MTV-1",
          groupId: defaultGroup?.id ?? null,
        },
      }));
    return {
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      crewId: user.crewId,
      callsign: user.callsign,
    };
  } catch (err) {
    if (err instanceof PrivilegedLoginError || err instanceof DisabledAccountError) throw err;
    // Database unreachable or not migrated yet: still let the demo in with a stable offline identity.
    console.warn("Demo sign-in without database:", err instanceof Error ? err.message.split("\n").pop() : err);
    return {
      userId: `demo-${createHash("sha256").update(email).digest("hex").slice(0, 16)}`,
      name: nameFromEmail(email),
      email,
      role: "ASTRONAUT",
      crewId: "MTV-1",
      callsign: "GUEST",
    };
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const demo = isDemoMode();
  const email = String(body.demo ? DEMO_EMAIL : (body.email ?? "")).toLowerCase().trim();
  const password = String(body.password ?? "");

  let sessionUser: SessionUser;

  if (demo) {
    try {
      sessionUser = await demoSignIn(email || DEMO_EMAIL, password);
    } catch (err) {
      if (err instanceof PrivilegedLoginError) {
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
      }
      if (err instanceof DisabledAccountError) {
        return NextResponse.json({ error: "This account is disabled. Contact the mission admin." }, { status: 403 });
      }
      throw err;
    }
  } else {
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
    if (user.disabled) {
      return NextResponse.json({ error: "This account is disabled. Contact the mission admin." }, { status: 403 });
    }
    sessionUser = {
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      crewId: user.crewId,
      callsign: user.callsign,
    };
  }

  const token = await createSessionToken(sessionUser);
  const response = NextResponse.json({ user: sessionUser, home: homeFor(sessionUser.role) });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
