// The encrypted snapshot data/snapshot.enc: every synced record, deletion markers included.

import { mergeTable } from '../core/merge';
import type { SyncFields } from '../core/model';
import { SYNCED_TABLES, type CarlogDB, type SyncedTable } from '../db/db';

export const SNAPSHOT_FORMAT = 'carlog.snapshot.v1';

export interface Snapshot {
  format: typeof SNAPSHOT_FORMAT;
  createdAt: string;
  deviceId: string;
  deviceName: string;
  tables: Partial<Record<SyncedTable, SyncFields[]>>;
}

export async function buildSnapshot(db: CarlogDB, deviceId: string, deviceName: string, now = new Date().toISOString()): Promise<Snapshot> {
  const tables: Snapshot['tables'] = {};
  for (const name of SYNCED_TABLES) tables[name] = (await db.table(name).toArray()) as SyncFields[];
  return { format: SNAPSHOT_FORMAT, createdAt: now, deviceId, deviceName, tables };
}

export function parseSnapshot(value: unknown): Snapshot {
  const s = value as Partial<Snapshot> | null;
  if (!s || s.format !== SNAPSHOT_FORMAT || typeof s.tables !== 'object' || s.tables === null) {
    throw new Error('Снимок данных в неизвестном формате — возможно, его записала более новая версия приложения');
  }
  return s as Snapshot;
}

export interface ApplyResult {
  /** Records written locally (new or newer on the other device). */
  received: number;
  /** Local records newer than in the snapshot (they go up with the next push). */
  newerHere: number;
}

/** Merges the snapshot into the local database in one transaction. Never deletes physically. */
export async function applySnapshot(db: CarlogDB, snapshot: Snapshot): Promise<ApplyResult> {
  return mergeTables(db, snapshot.tables);
}

/** Merges records by id (newer updatedAt wins) — for snapshots and backups alike. */
export async function mergeTables(db: CarlogDB, source: Snapshot['tables']): Promise<ApplyResult> {
  let received = 0;
  let newerHere = 0;
  const tables = SYNCED_TABLES.map((n) => db.table(n));
  await db.transaction('rw', tables, async () => {
    for (const name of SYNCED_TABLES) {
      const remote = (source[name] ?? []).filter((r): r is SyncFields => !!r && typeof r.id === 'string');
      if (!remote.length) continue;
      const local = (await db.table(name).toArray()) as SyncFields[];
      const { toLocal, localWins } = mergeTable(local, remote);
      if (toLocal.length) await db.table(name).bulkPut(toLocal);
      received += toLocal.length;
      newerHere += localWins;
    }
  });
  return { received, newerHere };
}

/** Records this device changed after `since` — the "неотправленные изменения" indicator. */
export async function countUnsent(db: CarlogDB, deviceId: string, since: string | null): Promise<number> {
  let n = 0;
  for (const name of SYNCED_TABLES) {
    const rows = (await db.table(name).toArray()) as SyncFields[];
    n += rows.filter((r) => r.deviceId === deviceId && (!since || r.updatedAt > since)).length;
  }
  return n;
}
