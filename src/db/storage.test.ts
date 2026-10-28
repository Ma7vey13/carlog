import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CarlogDB } from './db';
import { resetDeviceIdCache } from './device';
import { storeScans } from './scans';
import { ensureSeed } from './seed';
import { freeScanSpace, storageStats } from './storage';

let db: CarlogDB;
let n = 0;
beforeEach(async () => {
  resetDeviceIdCache();
  db = new CarlogDB(`carlog-storage-test-${++n}`);
  await ensureSeed(db);
});
afterEach(async () => {
  await db.delete();
});

const page = (ch: string, size: number) => ({ blob: new Blob([ch.repeat(size)]), mime: 'image/jpeg', width: 1, height: 1, sha256: ch.repeat(64) });

describe('storage', () => {
  it('frees only local copies that GitHub has, or that nothing uses', async () => {
    const [uploaded, local, deleted] = await storeScans(db, [page('a', 100), page('b', 200), page('c', 300)]);
    await db.scans.update(uploaded!, { uploaded: true });
    await db.scans.update(deleted!, { deleted: true });
    // "b" was never sent; "a" is on GitHub; "c" belongs to a deleted record.
    const index = { ['a'.repeat(64)]: 'blob-a' };

    expect(await storageStats(db, index)).toMatchObject({ scans: 2, scansHere: 2, scansHereBytes: 300, scansOnlyRemote: 0, freeable: 2, freeableBytes: 400 });
    expect(await freeScanSpace(db, index)).toEqual({ files: 2, bytes: 400 });
    expect((await db.scanBlobs.toArray()).map((b) => b.sha256)).toEqual(['b'.repeat(64)]);
    expect(await storageStats(db, index)).toMatchObject({ scansHere: 1, scansOnlyRemote: 1, freeable: 0 });
    expect(await db.scans.count()).toBe(3); // records are never touched
    void local;
  });

  it('keeps a file marked uploaded if the last sync did not see it on GitHub', async () => {
    const [id] = await storeScans(db, [page('d', 10)]);
    await db.scans.update(id!, { uploaded: true });
    expect(await freeScanSpace(db, {})).toEqual({ files: 0, bytes: 0 });
  });
});
