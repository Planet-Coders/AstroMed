import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { USER_SELECT, badRequest, requireRole } from "@/lib/authz";
import { EMAIL_RE, idList, str } from "@/lib/validate";
import { audit } from "@/lib/audit";
import { defaultSexFor } from "@/lib/crewProfiles";

export async function GET() {
  const auth = await requireRole(["SUPER_ADMIN"]);
  if ("error" in auth) return auth.error;

  const users = await prisma.user.findMany({
    select: USER_SELECT,
    orderBy: [{ role: "asc" }, { crewId: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ users });
}

/** Creates an astronaut inside a group, or an oversight account with its groups. */
export async function POST(request: Request) {
  const auth = await requireRole(["SUPER_ADMIN"]);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const role = body.role === "OVERSIGHT" ? "OVERSIGHT" : body.role === "ASTRONAUT" ? "ASTRONAUT" : null;
  const name = str(body.name);
  const email = str(body.email, 200).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const sex = body.sex === "female" ? "female" : (body.sex === "male" ? "male" : defaultSexFor(name));
  if (!role) return badRequest("Role must be ASTRONAUT or OVERSIGHT");
  if (!name) return badRequest("Name is required");
  if (!EMAIL_RE.test(email)) return badRequest("A valid email is required");
  if (password.length < 8) return badRequest("Temporary password must be at least 8 characters");
  if (await prisma.user.findUnique({ where: { email } })) {
    return NextResponse.json({ error: `${email} already has an account` }, { status: 409 });
  }
  const hash = await bcrypt.hash(password, 10);

  if (role === "ASTRONAUT") {
    const group = await prisma.missionGroup.findUnique({ where: { id: str(body.groupId, 60) } });
    if (!group) return badRequest("Pick the astronaut's mission group");
    const callsign = str(body.callsign, 12).toUpperCase() || "CREW";
    const user = await prisma.user.create({
      data: { name, email, password: hash, role, callsign, crewId: group.code, groupId: group.id, sex },
      select: USER_SELECT,
    });
    await audit(auth.user, "user.create", { type: "user", id: user.id, label: `${name} <${email}>` }, `astronaut in ${group.code}`);
    return NextResponse.json({ user }, { status: 201 });
  }

  const groupIds = idList(body.groupIds);
  const found = await prisma.missionGroup.findMany({ where: { id: { in: groupIds } }, select: { id: true } });
  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hash,
      role,
      callsign: str(body.callsign, 12).toUpperCase() || "SURGEON",
      crewId: "HQ",
      sex,
      overseenGroups: { connect: found },
    },
    select: USER_SELECT,
  });
  await audit(auth.user, "user.create", { type: "user", id: user.id, label: `${name} <${email}>` },
    `oversight reading ${user.overseenGroups.map((g) => g.code).join(", ") || "no groups"}`);
  return NextResponse.json({ user }, { status: 201 });
}
