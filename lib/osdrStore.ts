import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import snapshot from "@/lib/data/osdr-studies.json";
import {
  fetchAllStoredStudies,
  readStoredMetrics,
  resolveStoredStudies,
  type OsdrFile,
  type OsdrStudy,
  type StoredStudy,
} from "@/lib/osdr";

type SnapshotFile = { fetchedAt?: string; studies: StoredStudy[] };

const saved = snapshot as SnapshotFile;

function fromRow(row: {
  id: string;
  title: string;
  description: string;
  mission: string;
  organism: string;
  files: Prisma.JsonValue;
  metrics: Prisma.JsonValue;
}): StoredStudy {
  const files = Array.isArray(row.files) ? (row.files as OsdrFile[]) : [];
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    mission: row.mission,
    organism: row.organism,
    files,
    metrics: readStoredMetrics(row.metrics),
  };
}

/** Prefer database rows. An empty table or a database error serves the checked-in snapshot. */
export async function loadNasaStudies(): Promise<{ studies: OsdrStudy[]; source: "database" | "snapshot" }> {
  try {
    const rows = await prisma.nasaStudy.findMany();
    if (rows.length > 0) return resolveStoredStudies(rows.map(fromRow), saved.studies);
  } catch {
    // Database down: the console still has the last successful fetch.
  }
  return resolveStoredStudies(null, saved.studies);
}

/**
 * Refresh the three studies from OSDR and upsert them.
 * Throws when NASA cannot be reached so the caller can keep the previous rows and the snapshot.
 */
export async function refreshNasaStudies(db: PrismaClient = prisma): Promise<StoredStudy[]> {
  const studies = await fetchAllStoredStudies();
  for (const study of studies) {
    const data = {
      title: study.title,
      description: study.description,
      mission: study.mission,
      organism: study.organism,
      files: study.files as unknown as Prisma.InputJsonValue,
      metrics: study.metrics as unknown as Prisma.InputJsonValue,
    };
    await db.nasaStudy.upsert({
      where: { id: study.id },
      update: data,
      create: { id: study.id, ...data },
    });
  }
  return studies;
}
