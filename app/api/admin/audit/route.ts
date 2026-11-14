import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";

/** The newest 300 super admin actions. */
export async function GET() {
  const auth = await requireRole(["SUPER_ADMIN"]);
  if ("error" in auth) return auth.error;

  const entries = await prisma.adminAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: 300 });
  return NextResponse.json({ entries });
}
