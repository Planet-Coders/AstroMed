import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { monitoringFor } from "@/lib/monitoring/server";
import { parseDays } from "@/lib/monitoring/days";

/** The signed-in crew member's own monitoring time series and alerts. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true } }).catch(() => null);
  if (!user) return NextResponse.json({ error: "No stored profile for this account" }, { status: 404 });
  return NextResponse.json(await monitoringFor(user.id, parseDays(request.url)));
}
