import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readableGroupIds, requireRole } from "@/lib/authz";

/** The mission groups the signed-in oversight user (or super admin) may read. */
export async function GET() {
  const auth = await requireRole(["OVERSIGHT", "SUPER_ADMIN"]);
  if ("error" in auth) return auth.error;

  const ids = await readableGroupIds(auth.user);
  const groups = await prisma.missionGroup.findMany({
    where: { id: { in: ids } },
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      destination: true,
      description: true,
      _count: { select: { members: { where: { role: "ASTRONAUT" } } } },
    },
  });
  return NextResponse.json({ groups });
}
