import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, requireRole } from "@/lib/authz";
import { CODE_RE, optStr, str } from "@/lib/validate";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await requireRole(["SUPER_ADMIN"]);
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const group = await prisma.missionGroup.findUnique({ where: { id } });
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const name = body.name === undefined ? group.name : str(body.name);
  const code = body.code === undefined ? group.code : str(body.code, 16).toUpperCase();
  if (!name) return badRequest("Group name is required");
  if (!CODE_RE.test(code)) return badRequest("Code must be 1-16 letters, digits or dashes (e.g. MTV-3)");
  if (code !== group.code && (await prisma.missionGroup.findUnique({ where: { code } }))) {
    return NextResponse.json({ error: `Code ${code} is already used` }, { status: 409 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const g = await tx.missionGroup.update({
      where: { id },
      data: {
        name,
        code,
        description: body.description === undefined ? group.description : optStr(body.description),
        destination: body.destination === undefined ? group.destination : optStr(body.destination, 120),
      },
    });
    // The console groups crew by crewId, so members follow a code change.
    if (code !== group.code) await tx.user.updateMany({ where: { groupId: id }, data: { crewId: code } });
    return g;
  });
  await audit(auth.user, "group.update", { type: "group", id, label: `${updated.code} · ${updated.name}` },
    code !== group.code ? `code ${group.code} → ${code}` : undefined);
  return NextResponse.json({ group: updated });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const auth = await requireRole(["SUPER_ADMIN"]);
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const count = await prisma.user.count({ where: { groupId: id } });
  if (count > 0) {
    return NextResponse.json(
      { error: `Move this group's ${count} astronaut${count === 1 ? "" : "s"} to another group first` },
      { status: 409 }
    );
  }
  const group = await prisma.missionGroup.findUnique({ where: { id }, select: { code: true, name: true } });
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  await prisma.missionGroup.delete({ where: { id } });
  await audit(auth.user, "group.delete", { type: "group", id, label: `${group.code} · ${group.name}` });
  return NextResponse.json({ ok: true });
}
