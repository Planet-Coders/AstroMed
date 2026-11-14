import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "aahms2025";
// Privileged accounts need their real password even in DEMO_MODE, so set these for any
// deployment other people can reach.
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "admin-aahms-2026";
const OVERSIGHT_PASSWORD = process.env.SEED_OVERSIGHT_PASSWORD ?? "surgeon-aahms-2026";

const groups = [
  {
    code: "MTV-1",
    name: "Mars Transit Vehicle 1",
    destination: "Mars transit",
    description: "Primary crew: commander, both EVA leads and the crew medical officer.",
  },
  {
    code: "MTV-2",
    name: "Mars Transit Vehicle 2",
    destination: "Mars transit",
    description: "Second vehicle: EVA and science crew.",
  },
];

type SeedUser = {
  name: string;
  email: string;
  role: Role;
  callsign: string;
  crewId: string;
  password?: string;
  /** OVERSIGHT only: group codes this user may read. */
  oversees?: string[];
  vitals?: { heartRate: number; hrv: number; spo2: number; radiation: number };
};

const users: SeedUser[] = [
  {
    name: "Mission Admin",
    email: "admin@aahms.demo",
    role: Role.SUPER_ADMIN,
    callsign: "ADMIN",
    crewId: "HQ",
    password: ADMIN_PASSWORD,
  },
  {
    name: "Dr. Amara Lewis",
    email: "surgeon@aahms.demo",
    role: Role.OVERSIGHT,
    callsign: "SURGEON",
    crewId: "HQ",
    password: OVERSIGHT_PASSWORD,
    oversees: ["MTV-1"],
  },
  {
    name: "Ground Control",
    email: "ground@aahms.demo",
    role: Role.COMMANDER,
    callsign: "FLIGHT",
    crewId: "HQ",
  },
  {
    name: "Vance",
    email: "vance@aahms.demo",
    role: Role.ASTRONAUT,
    callsign: "CDR",
    crewId: "MTV-1",
    vitals: { heartRate: 64, hrv: 71, spo2: 98, radiation: 0.021 },
  },
  {
    name: "John",
    email: "john@aahms.demo",
    role: Role.ASTRONAUT,
    callsign: "EV1",
    crewId: "MTV-1",
    vitals: { heartRate: 78, hrv: 62, spo2: 98, radiation: 0.021 },
  },
  {
    name: "Cho",
    email: "cho@aahms.demo",
    role: Role.ASTRONAUT,
    callsign: "FE",
    crewId: "MTV-1",
    vitals: { heartRate: 70, hrv: 58, spo2: 97, radiation: 0.021 },
  },
  {
    name: "Silva",
    email: "silva@aahms.demo",
    role: Role.ASTRONAUT,
    callsign: "CMO",
    crewId: "MTV-1",
    vitals: { heartRate: 61, hrv: 80, spo2: 99, radiation: 0.021 },
  },
  {
    name: "Reyes",
    email: "reyes@aahms.demo",
    role: Role.ASTRONAUT,
    callsign: "EV2",
    crewId: "MTV-2",
    vitals: { heartRate: 72, hrv: 55, spo2: 97, radiation: 0.019 },
  },
  {
    name: "Park",
    email: "park@aahms.demo",
    role: Role.ASTRONAUT,
    callsign: "MS1",
    crewId: "MTV-2",
    vitals: { heartRate: 68, hrv: 63, spo2: 98, radiation: 0.02 },
  },
  {
    name: "Okonkwo",
    email: "okonkwo@aahms.demo",
    role: Role.ASTRONAUT,
    callsign: "MS2",
    crewId: "MTV-2",
    vitals: { heartRate: 75, hrv: 49, spo2: 96, radiation: 0.022 },
  },
];

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const groupIds = new Map<string, string>();
  for (const g of groups) {
    const group = await prisma.missionGroup.upsert({ where: { code: g.code }, update: g, create: g });
    groupIds.set(g.code, group.id);
  }

  for (const u of users) {
    const password = u.password ? await bcrypt.hash(u.password, 10) : passwordHash;
    const groupId = u.role === Role.ASTRONAUT ? (groupIds.get(u.crewId) ?? null) : null;
    const overseenGroups = { set: (u.oversees ?? []).map((code) => ({ id: groupIds.get(code)! })) };
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        password,
        role: u.role,
        callsign: u.callsign,
        crewId: u.crewId,
        groupId,
        overseenGroups,
      },
      create: {
        name: u.name,
        email: u.email,
        password,
        role: u.role,
        callsign: u.callsign,
        crewId: u.crewId,
        groupId,
        overseenGroups: { connect: overseenGroups.set },
      },
    });

    if (u.vitals) {
      const existing = await prisma.biometricRecord.findFirst({
        where: { userId: user.id },
      });
      if (!existing) {
        const now = new Date();
        for (let i = 0; i < 12; i++) {
          await prisma.biometricRecord.create({
            data: {
              id: `seed-${user.id}-${i}`,
              userId: user.id,
              heartRate: u.vitals.heartRate + Math.floor(Math.random() * 6 - 3),
              hrv: u.vitals.hrv + Math.random() * 4 - 2,
              spo2: u.vitals.spo2,
              radiation: u.vitals.radiation,
              synced: true,
              timestamp: new Date(now.getTime() - i * 3600_000),
            },
          });
        }
      }
    }
  }

  // Astronauts created before groups existed (e.g. demo sign-ins) join the group matching their crew code.
  for (const [code, id] of groupIds) {
    await prisma.user.updateMany({ where: { role: Role.ASTRONAUT, crewId: code, groupId: null }, data: { groupId: id } });
  }

  console.log("Seed complete. Crew password:", DEMO_PASSWORD);
  console.log("Super admin: admin@aahms.demo / (SEED_ADMIN_PASSWORD or the default in prisma/seed.ts)");
  console.log("Oversight (MTV-1 only): surgeon@aahms.demo / (SEED_OVERSIGHT_PASSWORD or the default in prisma/seed.ts)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
