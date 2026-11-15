import { NextResponse } from "next/server";
import { COOKIE_NAME, createSessionToken, getSession, type SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ user: session });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const sex = body.sex === "female" ? "female" : "male";

  try {
    await prisma.user.update({
      where: { id: session.userId },
      data: { sex },
    });
  } catch {
    /* database offline or demo identity without row */
  }

  const updated: SessionUser = { ...session, sex };
  const token = await createSessionToken(updated);
  const res = NextResponse.json({ ok: true, user: updated });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
  return res;
}
