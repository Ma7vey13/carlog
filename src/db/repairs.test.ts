import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { doneRepairs, openRepairs } from '../core/repairs';
import { buildSnapshot, mergeTables } from '../sync/snapshot';
import { CarlogDB } from './db';
import { resetDeviceIdCache } from './device';
import { deleteRepair, loadRepairs, markRepairDone, reopenRepair, saveRepair } from './repairs';
import { ensureSeed } from './seed';

let db: CarlogDB;
let n = 0;

beforeEach(async () => {
  resetDeviceIdCache();
  db = new CarlogDB(`carlog-repairs-${++n}`);
  await ensureSeed(db);
});
afterEach(async () => {
  await db.delete();
});

const input = (title: string, urgency: 'urgent' | 'soon' | 'later' = 'soon') => ({ title: `  ${title} `, note: '', urgency, componentId: null });

describe('Нужно отремонтировать', () => {
  it('keeps open repairs by urgency, then the oldest first', async () => {
    const later = await saveRepair(db, null, input('Скрип двери', 'later'));
    const cv = await saveRepair(db, null, input('ШРУС передний левый'));
    const urgent = await saveRepair(db, null, input('Течь антифриза', 'urgent'));
    const repairs = await loadRepairs(db);
    expect(openRepairs(repairs).map((r) => r.id)).toEqual([urgent, cv, later]);
    expect(repairs.find((r) => r.id === cv)).toMatchObject({ title: 'ШРУС передний левый', doneDate: null, visitId: null });
  });

  it('done, back to the list, deleted', async () => {
    const id = await saveRepair(db, null, input('ШРУС'));
    await markRepairDone(db, id, '2026-10-20', 'visit-1');
    let repairs = await loadRepairs(db);
    expect(openRepairs(repairs)).toEqual([]);
    expect(doneRepairs(repairs)[0]).toMatchObject({ id, doneDate: '2026-10-20', visitId: 'visit-1' });

    // editing a done repair keeps it done
    await saveRepair(db, id, { ...input('ШРУС наружный'), note: 'заменён' });
    expect((await loadRepairs(db))[0]).toMatchObject({ title: 'ШРУС наружный', doneDate: '2026-10-20' });

    await reopenRepair(db, id);
    repairs = await loadRepairs(db);
    expect(openRepairs(repairs).map((r) => r.id)).toEqual([id]);

    await deleteRepair(db, id);
    expect(await loadRepairs(db)).toEqual([]);
    expect((await db.repairs.get(id))?.deleted).toBe(true);
  });

  it('goes to the other device with the snapshot', async () => {
    await saveRepair(db, null, input('ШРУС'));
    const snapshot = await buildSnapshot(db, 'phone', 'Телефон');
    const other = new CarlogDB(`carlog-repairs-other-${n}`);
    try {
      await mergeTables(other, snapshot.tables);
      expect((await loadRepairs(other)).map((r) => r.title)).toEqual(['ШРУС']);
    } finally {
      await other.delete();
    }
  });
});
