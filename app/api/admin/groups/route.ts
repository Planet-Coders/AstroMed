import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, requireRole } from "@/lib/authz";
import { CODE_RE, optStr, str } from "@/lib/validate";
import { audit } from "@/lib/audit";

export async function GET() {
  const auth = await requireRole(["SUPER_ADMIN"]);
  if ("error" in auth) return auth.error;

  const groups = await prisma.missionGroup.findMany({
    orderBy: { code: "asc" },
    include: {
      _count: { select: { members: true } },
      overseers: { select: { id: true, name: true, email: true } },
    },
  });
  return NextResponse.json({ groups });
}

export async function POST(request: Request) {
  const auth = await requireRole(["SUPER_ADMIN"]);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const name = str(body.name);
  const code = str(body.code, 16).toUpperCase();
  if (!name) return badRequest("Group name is required");
  if (!CODE_RE.test(code)) return badRequest("Code must be 1-16 letters, digits or dashes (e.g. MTV-3)");
  if (await prisma.missionGroup.findUnique({ where: { code } })) {
    return NextResponse.json({ error: `Code ${code} is already used` }, { status: 409 });
  }

  const group = await prisma.missionGroup.create({
    data: { name, code, description: optStr(body.description), destination: optStr(body.destination, 120) },
  });
  await audit(auth.user, "group.create", { type: "group", id: group.id, label: `${group.code} · ${group.name}` });
  return NextResponse.json({ group }, { status: 201 });
}
