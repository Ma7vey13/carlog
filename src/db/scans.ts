// Scan files: metadata in `scans` (synced), bytes in `scanBlobs` by content hash (local only;
// uploaded to carlog-data/scans/<sha256>.enc in stage 4).

import { nowIso } from '../core/dates';
import { newId } from '../core/ids';
import type { Id, Scan } from '../core/model';
import type { CarlogDB } from './db';
import { getDeviceId } from './device';

/** A compressed page ready to store (see src/scan/process.ts). */
export interface ProcessedPage {
  blob: Blob;
  mime: string;
  width: number;
  height: number;
  sha256: string;
}

/** Stores pages as scans in the given order. Identical files share one blob. */
export async function storeScans(db: CarlogDB, pages: readonly ProcessedPage[]): Promise<Id[]> {
  const deviceId = await getDeviceId(db);
  const now = nowIso();
  const scans: Scan[] = pages.map((p, i) => ({
    id: newId(),
    createdAt: now,
    updatedAt: now,
    deleted: false,
    deviceId,
    mime: p.mime,
    size: p.blob.size,
    sha256: p.sha256,
    width: p.width,
    height: p.height,
    rotation: 0,
    page: i + 1,
    uploaded: false,
  }));
  await db.transaction('rw', [db.scans, db.scanBlobs], async () => {
    for (const p of pages) {
      if (!(await db.scanBlobs.get(p.sha256))) await db.scanBlobs.put({ sha256: p.sha256, blob: p.blob });
    }
    await db.scans.bulkAdd(scans);
  });
  return scans.map((s) => s.id);
}

export async function loadScans(db: CarlogDB, ids: readonly Id[]): Promise<Scan[]> {
  const rows = await db.scans.bulkGet([...ids]);
  return rows.filter((s): s is Scan => !!s && !s.deleted);
}

export async function loadScanBlob(db: CarlogDB, sha256: string): Promise<Blob | null> {
  return (await db.scanBlobs.get(sha256))?.blob ?? null;
}

/** Display rotation, clockwise. Pixels stay as they are. */
export async function rotateScan(db: CarlogDB, id: Id, rotation: Scan['rotation']): Promise<void> {
  const deviceId = await getDeviceId(db);
  await db.scans.update(id, { rotation, updatedAt: nowIso(), deviceId });
}
