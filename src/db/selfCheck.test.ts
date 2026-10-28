import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SEED_SELF_CHECK_ITEMS, selfCheckAll } from '../core/selfCheck';
import { termStatuses } from '../core/termDocs';
import { CarlogDB } from './db';
import { resetDeviceIdCache } from './device';
import { storeScans } from './scans';
import { ensureSeed } from './seed';
import {
  addTermDocumentScans,
  clearTermDocumentScans,
  deleteSelfCheckItem,
  deleteSelfCheckLog,
  deleteTermDocument,
  loadSelfCheckItems,
  loadSelfCheckLogs,
  loadTermDocuments,
  logSelfCheck,
  saveSelfCheckItem,
  saveTermDocument,
  type TermDocumentInput,
} from './selfCheck';

let db: CarlogDB;
let n = 0;

beforeEach(async () => {
  resetDeviceIdCache();
  db = new CarlogDB(`carlog-selfcheck-test-${++n}`);
  await ensureSeed(db);
});

afterEach(async () => {
  await db.delete();
});

const OSAGO: TermDocumentInput = {
  kind: 'osago',
  title: null,
  number: 'XXX 0000000000',
  company: 'Страховая «Пример»',
  startDate: '2025-11-20',
  endDate: '2026-11-19',
  remindDaysBefore: 30,
};

describe('self-check in the database', () => {
  it('seeds the starting list once and keeps the owner’s edits', async () => {
    expect(await loadSelfCheckItems(db)).toHaveLength(11);
    const first = SEED_SELF_CHECK_ITEMS[0]!;
    await saveSelfCheckItem(db, first.id, { name: first.name, periodDays: 7, howTo: first.howTo });
    await deleteSelfCheckItem(db, SEED_SELF_CHECK_ITEMS[10]!.id);
    await ensureSeed(db);
    const items = await loadSelfCheckItems(db);
    expect(items).toHaveLength(10);
    expect(items[0]!.periodDays).toBe(7);
  });

  it('adds new items to the end of the list', async () => {
    const id = await saveSelfCheckItem(db, null, { name: 'Ремни безопасности', periodDays: 180, howTo: 'Ремень вытягивается и защёлкивается.' });
    expect((await loadSelfCheckItems(db)).at(-1)!.id).toBe(id);
  });

  it('journals "В норме" and "Нужно внимание" with a note', async () => {
    const coolant = SEED_SELF_CHECK_ITEMS[1]!.id;
    await logSelfCheck(db, coolant, 'attention', '  уровень у MIN ', '2026-10-20');
    let s = selfCheckAll(await loadSelfCheckItems(db), await loadSelfCheckLogs(db), '2026-10-28');
    expect(s[0]).toMatchObject({ state: 'attention', last: { note: 'уровень у MIN' } });

    const ok = await logSelfCheck(db, coolant, 'ok', '', '2026-10-28');
    s = selfCheckAll(await loadSelfCheckItems(db), await loadSelfCheckLogs(db), '2026-10-28');
    expect(s.find((x) => x.item.id === coolant)!.state).toBe('ok');

    await deleteSelfCheckLog(db, ok);
    s = selfCheckAll(await loadSelfCheckItems(db), await loadSelfCheckLogs(db), '2026-10-28');
    expect(s.find((x) => x.item.id === coolant)!.state).toBe('attention');
  });
});

describe('documents with an end date in the database', () => {
  const page = (sha: string) => ({ blob: new Blob(['x']), mime: 'image/jpeg', width: 10, height: 10, sha256: sha.padEnd(64, '0') });

  it('saves a policy, attaches and clears scans, deletes softly', async () => {
    const id = await saveTermDocument(db, null, OSAGO);
    expect(termStatuses(await loadTermDocuments(db), '2026-10-28')[0]).toMatchObject({ state: 'soon', daysLeft: 22 });

    const scanIds = await storeScans(db, [page('a1'), page('b2')]);
    await addTermDocumentScans(db, id, scanIds);
    expect((await loadTermDocuments(db))[0]!.scanIds).toEqual(scanIds);

    // editing the fields keeps the scans
    await saveTermDocument(db, id, { ...OSAGO, company: 'Другая страховая' });
    expect((await loadTermDocuments(db))[0]).toMatchObject({ company: 'Другая страховая', scanIds });

    await clearTermDocumentScans(db, id);
    expect((await loadTermDocuments(db))[0]!.scanIds).toEqual([]);
    expect((await db.scans.bulkGet(scanIds)).every((s) => s?.deleted)).toBe(true);

    await deleteTermDocument(db, id);
    expect(await loadTermDocuments(db)).toEqual([]);
    expect((await db.termDocuments.get(id))?.deleted).toBe(true);
  });
});
