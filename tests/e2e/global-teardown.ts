import { PrismaClient } from "@prisma/client";
import { TEST_ACCOUNT } from "./testAccounts";

/** Deletes the guest accounts the tests created (their records cascade), so they never show on the crew grid. */
export default async function globalTeardown() {
  const prisma = new PrismaClient();
  try {
    const guests = await prisma.user.findMany({
      where: { callsign: "GUEST", email: { endsWith: "@aahms.demo" } },
      select: { id: true, email: true },
    });
    const ids = guests.filter((u) => TEST_ACCOUNT.test(u.email)).map((u) => u.id);
    if (ids.length) await prisma.user.deleteMany({ where: { id: { in: ids } } });
    console.log(`e2e teardown: removed ${ids.length} test account(s).`);
  } finally {
    await prisma.$disconnect();
  }
}
