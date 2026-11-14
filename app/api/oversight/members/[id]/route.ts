import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readableMember, requireRole } from "@/lib/authz";

type Ctx = { params: Promise<{ id: string }> };

/** One astronaut's full record history: vitals and every mirrored health log. */
export async function GET(_request: Request, { params }: Ctx) {
  const auth = await requireRole(["OVERSIGHT", "SUPER_ADMIN"]);
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const member = await readableMember(auth.user, id);
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  const [group, vitals, reports] = await Promise.all([
    prisma.missionGroup.findUnique({ where: { id: member.groupId! }, select: { id: true, code: true, name: true } }),
    prisma.biometricRecord.findMany({
      where: { userId: id },
      orderBy: { timestamp: "desc" },
      take: 200,
      select: { id: true, heartRate: true, hrv: true, spo2: true, radiation: true, timestamp: true },
    }),
    prisma.healthReport.findMany({
      where: { userId: id },
      orderBy: { recordedAt: "desc" },
      select: { kind: true, key: true, data: true, recordedAt: true },
    }),
  ]);

  return NextResponse.json({
    member: {
      id: member.id,
      name: member.name,
      email: member.email,
      callsign: member.callsign,
      crewId: member.crewId,
      createdAt: member.createdAt,
      synthetic: member.synthetic,
    },
    group,
    vitals,
    reports,
  });
}
