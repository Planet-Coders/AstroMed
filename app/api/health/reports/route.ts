import { NextResponse } from "next/server";
import type { HealthReportKind, Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { OutboxHealth } from "@/lib/db";
import { ingestRoutineLog } from "@/lib/monitoring/server";

const KINDS: Record<OutboxHealth["kind"], HealthReportKind> = {
  selfCheck: "SELF_CHECK",
  routine: "ROUTINE",
  injuries: "INJURIES",
  periods: "PERIODS",
};

/** Mirrors the signed-in user's device-side health logs (latest copy per kind and key). */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const reports = (Array.isArray(body?.reports) ? body.reports : []).slice(0, 50) as OutboxHealth[];
  const valid = reports.filter(
    (r) =>
      typeof r?.id === "string" &&
      Object.hasOwn(KINDS, r.kind) &&
      typeof r.key === "string" &&
      r.key.length <= 64 &&
      Number.isFinite(r.recordedAt) &&
      r.recordedAt >= 0 &&
      r.recordedAt <= Date.now() + 86_400_000 &&
      (r.kind !== "selfCheck" || /^\d{13}$/.test(r.key)) &&
      // Injury photos are small JPEGs, but cap the payload anyway.
      JSON.stringify(r.data ?? null).length <= 1_000_000
  );
  if (!valid.length) return NextResponse.json({ saved: [] });

  try {
    await prisma.$transaction(async (db) => {
      await db.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${session.userId} FOR NO KEY UPDATE`;
      for (const r of valid) {
        const kind = KINDS[r.kind];
        const fields = { data: r.data as Prisma.InputJsonValue, recordedAt: new Date(r.recordedAt) };
        const where = { userId_kind_key: { userId: session.userId, kind, key: r.key } };
        // Daily checks are immutable. Routine edits are ordered by their original edit time.
        const existing = await db.healthReport.findUnique({ where, select: { recordedAt: true } });
        if (existing && (kind === "SELF_CHECK" || existing.recordedAt >= fields.recordedAt)) continue;
        await db.healthReport.upsert({
          where,
          update: fields,
          create: {
            userId: session.userId, kind, key: r.key, ...fields,
            recordedAt: kind === "SELF_CHECK" ? new Date(Number(r.key)) : fields.recordedAt,
          },
        });
        if (kind === "ROUTINE") await ingestRoutineLog(db, session.userId, r.key, r.data, fields.recordedAt);
      }
    }, { timeout: 15_000 });
  } catch {
    return NextResponse.json({ error: "Could not save reports" }, { status: 503 });
  }
  return NextResponse.json({ saved: valid.map((r) => r.id) });
}
