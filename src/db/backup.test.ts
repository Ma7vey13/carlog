import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ALL_PAGES } from '../../tests/fixtures/drafts';
import { draftToForm } from '../core/draftToForm';
import { createZip, readZip } from '../core/zip';
import { backupFileName, BACKUP_FORMAT, buildBackup, importBackup, missingScanHashes } from './backup';
import { CarlogDB } from './db';
import { resetDeviceIdCache } from './device';
import { storeScans } from './scans';
import { ensureSeed } from './seed';
import { logSelfCheck, saveTermDocument } from './selfCheck';
import { SEED_SELF_CHECK_ITEMS } from '../core/selfCheck';
import { deleteVisit, loadVisitBundles, saveVisitForm } from './visits';

const dbs: CarlogDB[] = [];
let n = 0;
async function freshDb(): Promise<CarlogDB> {
  resetDeviceIdCache();
  const db = new CarlogDB(`carlog-backup-test-${++n}`);
  dbs.push(db);
  await ensureSeed(db);
  return db;
}

beforeEach(() => {
  dbs.length = 0;
});
afterEach(async () => {
  for (const db of dbs) await db.delete();
});

async function sha(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const page = async (text: string) => ({ blob: new Blob([text], { type: 'image/jpeg' }), mime: 'image/jpeg', width: 10, height: 10, sha256: await sha(text) });

describe('backup', () => {
  it('restores everything on an empty device: visits, deletions, scans, self-check, documents', async () => {
    const a = await freshDb();
    for (const p of ALL_PAGES) await saveVisitForm(a, draftToForm(p), null);
    const gone = (await loadVisitBundles(a)).find((b) => b.visit.date === '2021-09-30')!;
    await deleteVisit(a, gone.visit.id);
    const scanIds = await storeScans(a, [await page('scan one'), await page('scan two')]);
    const docId = await saveTermDocument(a, null, { kind: 'osago', title: null, number: 'XXX 0000000000', company: null, startDate: null, endDate: '2026-11-19', remindDaysBefore: 30 });
    await a.termDocuments.update(docId, { scanIds });
    await logSelfCheck(a, SEED_SELF_CHECK_ITEMS[0]!.id, 'attention', 'уровень у MIN', '2026-10-20');

    const backup = await buildBackup(a, '1.0.0', new Date('2026-10-28T12:00:00'));
    expect(backup).toMatchObject({ scans: 2, missingScans: 0 });
    const names = (await readZip(backup.zip)).map((e) => e.name);
    expect(names[0]).toBe('backup.json');
    expect(names.filter((x) => x.startsWith('scans/'))).toHaveLength(2);

    const b = await freshDb();
    const r = await importBackup(b, backup.zip);
    expect(r).toMatchObject({ scansAdded: 2, scansDamaged: 0 });
    expect(r.received).toBeGreaterThan(50);
    expect((await loadVisitBundles(b)).map((x) => x.visit.date).sort()).toEqual(['2021-10-06', '2025-03-12', '2025-04-11', '2025-07-22', '2025-10-30']);
    // the deletion marker came along, so the deleted visit stays deleted
    expect((await b.visits.get(gone.visit.id))?.deleted).toBe(true);
    expect((await b.termDocuments.get(docId))?.scanIds).toEqual(scanIds);
    expect(await missingScanHashes(b)).toEqual([]);
    expect((await b.selfCheckLogs.toArray())[0]).toMatchObject({ result: 'attention', note: 'уровень у MIN' });

    // importing twice changes nothing
    expect(await importBackup(b, backup.zip)).toMatchObject({ received: 0, scansAdded: 0 });
  });

  it('merges instead of overwriting: newer records here are kept', async () => {
    const a = await freshDb();
    const visitId = await saveVisitForm(a, draftToForm(ALL_PAGES[0]!), null);
    const backup = await buildBackup(a, '1.0.0');

    // Later on this device: the visit is edited.
    await a.visits.update(visitId, { notes: 'исправлено после копии', updatedAt: '2999-01-01T00:00:00.000Z' });
    const r = await importBackup(a, backup.zip);
    expect(r.newerHere).toBeGreaterThan(0);
    expect((await a.visits.get(visitId))?.notes).toBe('исправлено после копии');
  });

  it('lists scans that are only on GitHub and skips damaged scan files', async () => {
    const a = await freshDb();
    const [id] = await storeScans(a, [await page('only remote')]);
    const scan = (await a.scans.get(id!))!;
    await a.scanBlobs.delete(scan.sha256);
    expect(await missingScanHashes(a)).toEqual([scan.sha256]);
    const backup = await buildBackup(a, '1.0.0');
    expect(backup).toMatchObject({ scans: 0, missingScans: 1 });

    const bad = createZip([
      { name: 'backup.json', data: new TextEncoder().encode(JSON.stringify({ format: BACKUP_FORMAT, createdAt: '', appVersion: '', tables: {}, missingScans: [] })) },
      { name: `scans/${'0'.repeat(64)}.jpg`, data: new TextEncoder().encode('not that file') },
    ]);
    expect(await importBackup(await freshDb(), bad)).toMatchObject({ scansAdded: 0, scansDamaged: 1 });
  });

  it('refuses foreign files with a clear message', async () => {
    const db = await freshDb();
    await expect(importBackup(db, new TextEncoder().encode('hello'))).rejects.toThrow('Это не ZIP-архив');
    await expect(importBackup(db, createZip([{ name: 'other.txt', data: new Uint8Array([1]) }]))).rejects.toThrow('нет backup.json');
    await expect(importBackup(db, createZip([{ name: 'backup.json', data: new TextEncoder().encode('{"format":"x"}') }]))).rejects.toThrow('неизвестном формате');
  });

  it('names the file by date', () => {
    expect(backupFileName(new Date('2026-03-05T10:00:00'))).toBe('carlog-backup-2026-03-05.zip');
  });
});
