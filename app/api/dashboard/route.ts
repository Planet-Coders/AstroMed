import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assessRisk, type RiskLevel } from "@/lib/risk";
import { defaultSexFor } from "@/lib/crewProfiles";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Read the signed-in user's crew and callsign from the database, not the cookie.
  const meRow = await prisma.user
    .findUnique({ where: { id: session.userId }, select: { crewId: true, callsign: true } })
    .catch(() => null);
  const isCrewCommander = session.role === "ASTRONAUT" && meRow?.callsign === "CDR";

  const users = await prisma.user.findMany({
    // Ground control sees every crew, a crew commander (CDR) sees their own crew,
    // and every other astronaut only ever gets their own record.
    // Guest accounts (made by demo sign-in with an unknown email) never appear in a
    // crew view; a guest still sees their own record.
    where:
      session.role === "COMMANDER"
        ? { role: "ASTRONAUT", NOT: { callsign: "GUEST" } }
        : isCrewCommander && meRow
          ? { role: "ASTRONAUT", crewId: meRow.crewId, NOT: { callsign: "GUEST" } }
          : { role: "ASTRONAUT", id: session.userId },
    orderBy: [{ crewId: "asc" }, { name: "asc" }],
  });

  const userIds = users.map((u) => u.id);
  // Batch queries in small chunks of 4 to avoid overwhelming database connection poolers.
  async function chunked<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const out: R[] = [];
    for (let i = 0; i < items.length; i += size) {
      out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
    }
    return out;
  }

  const records = (
    await chunked(userIds, 4, (userId) =>
      prisma.biometricRecord.findFirst({
        where: { userId },
        orderBy: { timestamp: "desc" },
      })
    )
  )
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  // Each person's own normal: the average of their previous readings (excluding the
  // newest), so the co-pilot can say "128 bpm, well above Cho's usual 72".
  const baselines = new Map(
    await chunked(userIds, 4, async (userId) => {
      const agg = await prisma.biometricRecord.aggregate({
        where: { userId },
        orderBy: { timestamp: "desc" },
        skip: 1,
        take: 300,
        _avg: { heartRate: true, hrv: true, spo2: true },
        _count: true,
      });
      return [
        userId,
        agg._count >= 5
          ? { heartRate: agg._avg.heartRate, hrv: agg._avg.hrv, spo2: agg._avg.spo2, samples: agg._count }
          : null,
      ] as const;
    })
  );

  const latestByUser = new Map<string, (typeof records)[0]>();
  for (const r of records) {
    if (!latestByUser.has(r.userId)) latestByUser.set(r.userId, r);
  }

  const crewMap = new Map<
    string,
    Array<{
      user: {
        id: string;
        name: string;
        email: string;
        callsign: string;
        crewId: string;
        sex: "male" | "female";
      };
      latest: (typeof records)[0] | null;
      baseline: ReturnType<typeof baselines.get> | null;
      risk: RiskLevel;
    }>
  >();

  for (const u of users) {
    const latest = latestByUser.get(u.id) ?? null;
    const risk = latest
      ? assessRisk({
          heartRate: latest.heartRate,
          hrv: latest.hrv,
          spo2: latest.spo2,
          radiation: latest.radiation,
        })
      : "GREEN";

    const list = crewMap.get(u.crewId) ?? [];
    list.push({
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        callsign: u.callsign,
        crewId: u.crewId,
        sex: ((u as { sex?: string }).sex as "male" | "female") || defaultSexFor(u.name),
      },
      latest,
      baseline: baselines.get(u.id) ?? null,
      risk,
    });
    crewMap.set(u.crewId, list);
  }

  const crews = Array.from(crewMap.entries()).map(([crewId, members]) => ({
    crewId,
    members,
  }));

  // The signed-in astronaut's own mission group, for the console header.
  const me = await prisma.user
    .findUnique({ where: { id: session.userId }, select: { group: { select: { code: true, name: true, destination: true } } } })
    .catch(() => null);

  const lastRecord = records[0];
  return NextResponse.json({
    group: me?.group ?? null,
    syncStatus: {
      lastSyncAt: lastRecord?.timestamp.toISOString() ?? null,
      pendingEstimate: 0,
    },
    crews,
  });
}
