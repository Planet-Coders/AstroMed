import Dexie, { type Table } from "dexie";

export interface VitalRecord {
  id: string;
  userId: string;
  heartRate: number;
  hrv: number;
  spo2: number;
  radiation: number;
  /** True once Earth's server has stored the record and confirmed it. */
  synced: boolean;
  timestamp: number;
  /** When the record was last transmitted (it stays unsynced until Earth confirms). */
  sentAt?: number;
  /** When Earth confirmed it was received and stored. */
  confirmedAt?: number;
}

export type DeliveryState = "queued" | "sending" | "sent" | "confirmed";

/** Queued → sent (transmitted, no reply yet) → confirmed (Earth stored it). */
export function deliveryState(r: Pick<VitalRecord, "synced" | "sentAt">, syncing: boolean): DeliveryState {
  if (r.synced) return "confirmed";
  if (r.sentAt) return syncing ? "sending" : "sent";
  return "queued";
}

/** One co-pilot message waiting to be saved on the server for mission oversight. */
export interface OutboxChat {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode: "webllm" | "basic";
  createdAt: number;
}

/** Latest copy of a device-side health log waiting to be mirrored to the server. */
export interface OutboxHealth {
  id: string;
  kind: "selfCheck" | "routine" | "injuries" | "periods";
  key: string;
  data: unknown;
  recordedAt: number;
}

/** A hotline message to Earth waiting to be sent (id doubles as the server's clientId). */
export interface OutboxHotline {
  id: string;
  clientId: string;
  body: string;
  urgency: "ROUTINE" | "URGENT" | "EMERGENCY";
  vitals: unknown;
  delaySeconds: number;
  createdAt: number;
}

/**
 * Store-and-forward queue for things other than vitals. Items are written here first and
 * removed once the server confirms them, so nothing is lost offline or on a failed request.
 */
export type OutboxItem =
  | { id: string; userId: string; type: "chat"; createdAt: number; payload: OutboxChat }
  | { id: string; userId: string; type: "health"; createdAt: number; payload: OutboxHealth }
  | { id: string; userId: string; type: "hotline"; createdAt: number; payload: OutboxHotline };

export class AAHMSDatabase extends Dexie {
  vitals!: Table<VitalRecord, string>;
  outbox!: Table<OutboxItem, string>;

  constructor() {
    super("aahms_vitals");
    this.version(1).stores({
      vitals: "id, userId, synced, timestamp",
    });
    this.version(2).stores({
      outbox: "id, userId, type, createdAt",
    });
  }
}

export const db = new AAHMSDatabase();

export async function addVital(
  record: Omit<VitalRecord, "synced"> & { synced?: boolean }
): Promise<void> {
  await db.vitals.put({
    ...record,
    synced: record.synced ?? false,
  });
}

export async function getUnsyncedVitals(): Promise<VitalRecord[]> {
  return db.vitals.filter((r) => !r.synced).toArray();
}

export async function markSynced(ids: string[]): Promise<void> {
  const at = Date.now();
  await db.transaction("rw", db.vitals, async () => {
    for (const id of ids) {
      const row = await db.vitals.get(id);
      if (row) await db.vitals.put({ ...row, synced: true, confirmedAt: at });
    }
  });
}

/** Records the moment a batch was transmitted, before Earth answers. */
export async function markSent(ids: string[]): Promise<void> {
  const at = Date.now();
  await db.transaction("rw", db.vitals, async () => {
    for (const id of ids) {
      const row = await db.vitals.get(id);
      if (row && !row.synced) await db.vitals.put({ ...row, sentAt: at });
    }
  });
}

export async function getLatestForUser(
  userId: string
): Promise<VitalRecord | undefined> {
  return db.vitals
    .where("userId")
    .equals(userId)
    .reverse()
    .sortBy("timestamp")
    .then((rows) => rows[0]);
}

export async function getRecentForUser(
  userId: string,
  limit: number
): Promise<VitalRecord[]> {
  const rows = await db.vitals
    .where("userId")
    .equals(userId)
    .reverse()
    .sortBy("timestamp");
  return rows.slice(0, limit);
}

export async function getAllVitals(): Promise<VitalRecord[]> {
  return db.vitals.orderBy("timestamp").reverse().toArray();
}

export async function countUnsynced(): Promise<number> {
  return db.vitals.filter((r) => !r.synced).count();
}
