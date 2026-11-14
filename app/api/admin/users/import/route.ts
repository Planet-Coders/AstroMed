import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomInt } from "crypto";
import { prisma } from "@/lib/prisma";
import { badRequest, requireRole } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { EMAIL_RE, str } from "@/lib/validate";

const CHARS = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
const tempPassword = () => Array.from({ length: 12 }, () => CHARS[randomInt(CHARS.length)]).join("");

type Row = { name?: unknown; email?: unknown; callsign?: unknown };

/**
 * Creates several astronauts in one group from pasted CSV rows. Each gets its own
 * temporary password, returned once so the admin can hand them out.
 */
export async function POST(request: Request) {
  const auth = await requireRole(["SUPER_ADMIN"]);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const group = await prisma.missionGroup.findUnique({ where: { id: str(body.groupId, 60) } });
  if (!group) return badRequest("Pick the mission group to import into");
  const rows = (Array.isArray(body.rows) ? body.rows : []).slice(0, 200) as Row[];
  if (!rows.length) return badRequest("No rows to import");

  const results: { line: number; email: string; ok: boolean; password?: string; error?: string }[] = [];
  const seen = new Set<string>();
  for (const [i, row] of rows.entries()) {
    const name = str(row.name);
    const email = str(row.email, 200).toLowerCase();
    const callsign = str(row.callsign, 12).toUpperCase() || "CREW";
    const fail = (error: string) => results.push({ line: i + 1, email, ok: false, error });
    if (!name) { fail("missing name"); continue; }
    if (!EMAIL_RE.test(email)) { fail("invalid email"); continue; }
    if (seen.has(email) || (await prisma.user.findUnique({ where: { email }, select: { id: true } }))) {
      fail("email already has an account");
      continue;
    }
    seen.add(email);
    const password = tempPassword();
    await prisma.user.create({
      data: { name, email, callsign, password: await bcrypt.hash(password, 10), role: "ASTRONAUT", crewId: group.code, groupId: group.id },
    });
    results.push({ line: i + 1, email, ok: true, password });
  }

  const created = results.filter((r) => r.ok).length;
  if (created) {
    await audit(auth.user, "user.import", { type: "group", id: group.id, label: `${group.code} · ${group.name}` },
      `${created} astronaut${created === 1 ? "" : "s"}: ${results.filter((r) => r.ok).map((r) => r.email).join(", ")}`);
  }
  return NextResponse.json({ created, results });
}
