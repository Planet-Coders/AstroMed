import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readableGroupIds, requireRole } from "@/lib/authz";
import { assessRisk } from "@/lib/risk";
import { loadRules, monitoringSummary } from "@/lib/monitoring/server";

type Ctx = { params: Promise<{ id: string }> };

/** Every astronaut in a group with their latest vitals, health logs and chat activity. */
export async function GET(_request: Request, { params }: Ctx) {
  const auth = await requireRole(["OVERSIGHT", "SUPER_ADMIN"]);
  if ("error" in auth) return auth.error;
  const { id } = await params;

  // Same answer for "not assigned" and "doesn't exist", so group ids can't be probed.
  if (!(await readableGroupIds(auth.user)).includes(id)) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  const group = await prisma.missionGroup.findUnique({
    where: { id },
    select: { id: true, code: true, name: true, destination: true, description: true },
  });
  const users = await prisma.user.findMany({
    where: { groupId: id, role: "ASTRONAUT" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, callsign: true, crewId: true, synthetic: true },
  });
  const rules = await loadRules();

  const members = await Promise.all(
    users.map(async (u) => {
      const [latest, reports, chatCount, lastChat, monitoring] = await Promise.all([
        prisma.biometricRecord.findFirst({ where: { userId: u.id }, orderBy: { timestamp: "desc" } }),
        prisma.healthReport.findMany({
          where: { userId: u.id },
          orderBy: { recordedAt: "desc" },
          distinct: ["kind"],
          select: { kind: true, key: true, data: true, recordedAt: true },
        }),
        prisma.chatMessage.count({ where: { userId: u.id } }),
        prisma.chatMessage.findFirst({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
        monitoringSummary(u.id, rules),
      ]);
      return {
        user: u,
        latest,
        risk: latest ? assessRisk({ heartRate: latest.heartRate, hrv: latest.hrv, spo2: latest.spo2, radiation: latest.radiation }) : null,
        reports,
        chatCount,
        lastChatAt: lastChat?.createdAt ?? null,
        monitoring,
      };
    })
  );

  return NextResponse.json({ group, members });
}
