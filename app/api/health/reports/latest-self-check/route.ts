import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const report = await prisma.healthReport.findFirst({
    where: { userId: session.userId, kind: "SELF_CHECK" },
    // The 13-digit key is capture time, including reports uploaded after reconnecting.
    orderBy: { key: "desc" },
    select: { key: true, data: true },
  });
  return NextResponse.json({ userId: session.userId, report }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
