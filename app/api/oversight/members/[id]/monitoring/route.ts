import { NextResponse } from "next/server";
import { readableMember, requireRole } from "@/lib/authz";
import { monitoringFor } from "@/lib/monitoring/server";
import { parseDays } from "@/lib/monitoring/days";

type Ctx = { params: Promise<{ id: string }> };

/** One astronaut's monitoring time series and alerts, for oversight of their group. */
export async function GET(request: Request, { params }: Ctx) {
  const auth = await requireRole(["OVERSIGHT", "SUPER_ADMIN"]);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const member = await readableMember(auth.user, id);
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });
  return NextResponse.json(await monitoringFor(member.id, parseDays(request.url)));
}
