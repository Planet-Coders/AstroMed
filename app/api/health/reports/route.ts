import { NextResponse } from "next/server";
import type { HealthReportKind, Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { OutboxHealth } from "@/lib/db";
import { ingestHealthReport } from "@/lib/monitoring/server";

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
  const reports = (Array.isArray(body.reports) ? body.reports : []).slice(0, 50) as OutboxHealth[];
  const valid = reports.filter(
    (r) =>
      typeof r.id === "string" &&
      r.kind in KINDS &&
      typeof r.key === "string" &&
      r.key.length <= 64 &&
      Number.isFinite(r.recordedAt) &&
      // Injury photos are small JPEGs, but cap the payload anyway.
      JSON.stringify(r.data ?? null).length <= 1_000_000
  );
  if (!valid.length) return NextResponse.json({ saved: [] });

  try {
    for (const r of valid) {
      const kind = KINDS[r.kind];
      const fields = { data: r.data as Prisma.InputJsonValue, recordedAt: new Date(r.recordedAt) };
      const where = { userId_kind_key: { userId: session.userId, kind, key: r.key } };
      // A copy that waited longer in an offline queue must not overwrite a newer one.
      const existing = await prisma.healthReport.findUnique({ where, select: { recordedAt: true } });
      if (existing && existing.recordedAt > fields.recordedAt) continue;
      await prisma.healthReport.upsert({
        where,
        update: fields,
        create: { userId: session.userId, kind, key: r.key, ...fields },
      });
      // Sleep, exercise and fluid intake also feed the monitoring time series.
      await ingestHealthReport(session.userId, kind, r.key, r.data, fields.recordedAt);
    }
  } catch {
    return NextResponse.json({ error: "Could not save reports" }, { status: 503 });
  }
  return NextResponse.json({ saved: valid.map((r) => r.id) });
}
