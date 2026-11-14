import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import type { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { USER_SELECT, badRequest, requireRole } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { idList, str } from "@/lib/validate";

type Ctx = { params: Promise<{ id: string }> };

const ROLES: Role[] = ["SUPER_ADMIN", "OVERSIGHT", "COMMANDER", "ASTRONAUT"];

/** Active super admins other than `exceptId`; the console must always keep at least one. */
function otherActiveAdmins(exceptId: string) {
  return prisma.user.count({ where: { role: "SUPER_ADMIN", disabled: false, id: { not: exceptId } } });
}

/**
 * Edits an account: name, callsign, a password reset, enabling / disabling it, changing
 * its role, moving an astronaut to another group, or the groups an oversight user reads.
 */
export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await requireRole(["SUPER_ADMIN"]);
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const data: Prisma.UserUpdateInput = {};
  const changes: string[] = [];
  const self = id === auth.user.id;

  if (body.name !== undefined) {
    const name = str(body.name);
    if (!name) return badRequest("Name is required");
    if (name !== user.name) changes.push(`name → ${name}`);
    data.name = name;
  }
  if (body.callsign !== undefined) {
    const callsign = str(body.callsign, 12).toUpperCase() || user.callsign;
    if (callsign !== user.callsign) changes.push(`callsign → ${callsign}`);
    data.callsign = callsign;
  }
  if (body.sex !== undefined) {
    const sex = body.sex === "female" ? "female" : "male";
    if (sex !== user.sex) changes.push(`sex → ${sex}`);
    data.sex = sex;
  }
  if (body.password !== undefined) {
    if (typeof body.password !== "string" || body.password.length < 8) {
      return badRequest("Temporary password must be at least 8 characters");
    }
    data.password = await bcrypt.hash(body.password, 10);
    changes.push("password reset");
  }

  if (body.disabled !== undefined) {
    const disabled = body.disabled === true;
    if (disabled && self) return badRequest("You can't disable your own account");
    if (disabled && user.role === "SUPER_ADMIN" && (await otherActiveAdmins(id)) === 0) {
      return badRequest("This is the last active super admin");
    }
    if (disabled !== user.disabled) changes.push(disabled ? "disabled" : "enabled");
    data.disabled = disabled;
  }

  // Role change. The fields that depend on the role (group, crew id, oversight groups) follow it.
  if (body.role !== undefined && !ROLES.includes(body.role)) return badRequest("Unknown role");
  const role: Role = body.role ?? user.role;
  if (role !== user.role) {
    if (self) return badRequest("You can't change your own role");
    if (user.role === "SUPER_ADMIN" && (await otherActiveAdmins(id)) === 0) {
      return badRequest("This is the last active super admin");
    }
    data.role = role;
    changes.push(`role ${user.role} → ${role}`);
    if (user.role === "OVERSIGHT") data.overseenGroups = { set: [] };
    if (role !== "ASTRONAUT") {
      data.group = { disconnect: true };
      data.crewId = "HQ";
    } else if (body.groupId === undefined && !user.groupId) {
      return badRequest("Pick a mission group for the new astronaut");
    }
  }

  if (body.groupId !== undefined) {
    if (role !== "ASTRONAUT") return badRequest("Only astronauts belong to a group");
    const group = await prisma.missionGroup.findUnique({ where: { id: str(body.groupId, 60) } });
    if (!group) return badRequest("Group not found");
    data.group = { connect: { id: group.id } };
    data.crewId = group.code;
    if (group.id !== user.groupId) changes.push(`moved to ${group.code}`);
  }

  if (body.groupIds !== undefined) {
    if (role !== "OVERSIGHT") return badRequest("Only oversight users are assigned groups to read");
    const found = await prisma.missionGroup.findMany({
      where: { id: { in: idList(body.groupIds) } },
      select: { id: true, code: true },
    });
    data.overseenGroups = { set: found.map((g) => ({ id: g.id })) };
    changes.push(`reads ${found.map((g) => g.code).join(", ") || "no groups"}`);
  }

  const updated = await prisma.user.update({ where: { id }, data, select: USER_SELECT });
  if (changes.length) {
    await audit(auth.user, "user.update", { type: "user", id, label: `${user.name} <${user.email}>` }, changes.join("; "));
  }
  return NextResponse.json({ user: updated });
}

/**
 * Permanently deletes an account and, through the cascade, its vitals, health logs and AI
 * chats. Disabling keeps them, so the console offers that first.
 */
export async function DELETE(_request: Request, { params }: Ctx) {
  const auth = await requireRole(["SUPER_ADMIN"]);
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const user = await prisma.user.findUnique({ where: { id }, select: { name: true, email: true, role: true } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (id === auth.user.id) return badRequest("You can't delete your own account");
  if (user.role === "SUPER_ADMIN" && (await otherActiveAdmins(id)) === 0) {
    return badRequest("This is the last active super admin");
  }

  await prisma.user.delete({ where: { id } });
  await audit(auth.user, "user.delete", { type: "user", id, label: `${user.name} <${user.email}>` }, `role ${user.role}`);
  return NextResponse.json({ ok: true });
}
