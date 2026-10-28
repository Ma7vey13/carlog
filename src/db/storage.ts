// "Ещё → Хранилище": what takes space on this device, and freeing it safely.

import type { CarlogDB } from './db';

export interface StorageStats {
  visits: number;
  documents: number;
  lines: number;
  drafts: number;
  /** Distinct live scan files. */
  scans: number;
  /** Of them, with the file on this device. */
  scansHere: number;
  scansHereBytes: number;
  /** Live scans without the file here (opened on demand from GitHub). */
  scansOnlyRemote: number;
  /** Local files that can be removed: already on GitHub, or no longer used by any record. */
  freeable: number;
  freeableBytes: number;
}

/**
 * Local scan files that are safe to drop: no live scan uses them (deleted documents), or every
 * scan that uses them is uploaded and GitHub has the file (`scanIndex` from the last sync).
 */
async function freeableBlobs(db: CarlogDB, scanIndex: Record<string, string>): Promise<Array<{ sha256: string; size: number }>> {
  const scans = await db.scans.toArray();
  const live = new Map<string, boolean>(); // sha256 → every live scan of it is on GitHub
  for (const s of scans) {
    if (s.deleted) continue;
    const onGitHub = s.uploaded && !!scanIndex[s.sha256];
    live.set(s.sha256, (live.get(s.sha256) ?? true) && onGitHub);
  }
  const out: Array<{ sha256: string; size: number }> = [];
  await db.scanBlobs.each((b) => {
    const state = live.get(b.sha256);
    if (state === undefined || state) out.push({ sha256: b.sha256, size: b.blob.size });
  });
  return out;
}

export async function storageStats(db: CarlogDB, scanIndex: Record<string, string>): Promise<StorageStats> {
  const count = async (table: 'visits' | 'documents' | 'lineItems' | 'drafts') => (await db.table(table).toArray()).filter((r: { deleted: boolean }) => !r.deleted).length;
  const liveHashes = [...new Set((await db.scans.toArray()).filter((s) => !s.deleted).map((s) => s.sha256))];
  const blobs = await db.scanBlobs.bulkGet(liveHashes);
  const here = blobs.filter((b): b is NonNullable<typeof b> => !!b);
  const freeable = await freeableBlobs(db, scanIndex);
  return {
    visits: await count('visits'),
    documents: await count('documents'),
    lines: await count('lineItems'),
    drafts: await count('drafts'),
    scans: liveHashes.length,
    scansHere: here.length,
    scansHereBytes: here.reduce((n, b) => n + b.blob.size, 0),
    scansOnlyRemote: liveHashes.length - here.length,
    freeable: freeable.length,
    freeableBytes: freeable.reduce((n, b) => n + b.size, 0),
  };
}

/** Removes local copies that GitHub has (or nothing uses). Records are never touched. */
export async function freeScanSpace(db: CarlogDB, scanIndex: Record<string, string>): Promise<{ files: number; bytes: number }> {
  const list = await freeableBlobs(db, scanIndex);
  await db.scanBlobs.bulkDelete(list.map((b) => b.sha256));
  return { files: list.length, bytes: list.reduce((n, b) => n + b.size, 0) };
}
