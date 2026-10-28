import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ALL_PAGES, PAGE1_WORK_ORDER } from '../../tests/fixtures/drafts';
import { draftToForm } from '../core/draftToForm';
import { unlinkedMatchingLines } from '../core/keywords';
import { mileagePoints } from '../core/mileage';
import { scheduleItem } from '../core/schedule';
import { updateLine } from '../core/visitForm';
import { CarlogDB } from './db';
import { resetDeviceIdCache } from './device';
import {
  deleteManualEvent,
  deleteRegulationItem,
  linkLines,
  loadManualEvents,
  loadRegulationItems,
  loadSettings,
  saveManualEvent,
  saveRegulationItem,
  unlinkVisit,
  updateSettings,
  type RegulationItemInput,
} from './regulation';
import { ensureSeed } from './seed';
import { loadMileage, loadVisitBundles, saveVisitForm } from './visits';

let db: CarlogDB;
let n = 0;

beforeEach(async () => {
  resetDeviceIdCache();
  db = new CarlogDB(`carlog-reg-test-${++n}`);
  await ensureSeed(db);
});

afterEach(async () => {
  await db.delete();
});

const OIL: RegulationItemInput = {
  name: 'Масло двигателя',
  componentId: null,
  action: 'replace',
  performer: 'service',
  intervalKm: 10000,
  intervalMonths: 12,
  severeIntervalKm: null,
  severeIntervalMonths: null,
  keywords: ['замена масла двигатель', 'масло мот'],
  note: '',
};

async function schedule(itemId: string, today: string) {
  const item = (await loadRegulationItems(db)).find((i) => i.id === itemId)!;
  const settings = await loadSettings(db);
  return scheduleItem(item, {
    bundles: await loadVisitBundles(db),
    events: await loadManualEvents(db),
    points: mileagePoints(await loadMileage(db)),
    today,
    thresholds: settings,
  });
}

describe('regulation items', () => {
  it('stage 6 acceptance: oil 10 000 km / 12 months counts from the visit of 30.10.2025', async () => {
    for (const page of ALL_PAGES) await saveVisitForm(db, draftToForm(page), null);
    const id = await saveRegulationItem(db, null, OIL);
    const item = (await loadRegulationItems(db))[0]!;

    // history saved before the item existed → offered for linking
    const found = unlinkedMatchingLines(await loadVisitBundles(db), item);
    expect(found).toHaveLength(4);
    expect(await linkLines(db, id, found.map((f) => f.lineId))).toBe(4);
    expect(unlinkedMatchingLines(await loadVisitBundles(db), item)).toEqual([]);

    const s = await schedule(id, '2026-10-28');
    expect(s).toMatchObject({ dueKm: 313700, dueDate: '2026-10-30', status: 'red' });
    expect(s.last).toMatchObject({ date: '2025-10-30', km: 303700, source: 'visit' });
  });

  it('new lines get linked by keywords while being entered', async () => {
    const id = await saveRegulationItem(db, null, OIL);
    const regulation = await loadRegulationItems(db);
    const form = draftToForm(PAGE1_WORK_ORDER, { regulation });
    const oilLine = form.documents[0]!.lines[0]!;
    expect(oilLine.regulationItemIds).toEqual([id]);
    // the owner's choice wins over keywords
    const unlinked = updateLine(oilLine, { regulationItemIds: [] }, [], regulation);
    expect(updateLine(unlinked, { rawName: 'Замена масла в двигателе' }, [], regulation).regulationItemIds).toEqual([]);

    await saveVisitForm(db, form, null);
    expect((await schedule(id, '2026-01-10')).dueDate).toBe('2026-10-30');
  });

  it('unlinks a wrongly matched visit and deletes softly', async () => {
    const id = await saveRegulationItem(db, null, OIL);
    const visitId = await saveVisitForm(db, draftToForm(PAGE1_WORK_ORDER, { regulation: await loadRegulationItems(db) }), null);
    expect(await unlinkVisit(db, id, visitId)).toBe(1);
    expect((await schedule(id, '2026-01-10')).status).toBe('gray');

    await deleteRegulationItem(db, id);
    expect(await loadRegulationItems(db)).toEqual([]);
    expect((await db.regulationItems.get(id))?.deleted).toBe(true);
  });
});

describe('manual events and settings', () => {
  it('records "делалось примерно тогда" and deletes it softly', async () => {
    const id = await saveRegulationItem(db, null, OIL);
    const ev = await saveManualEvent(db, null, { date: '2025-12-01', km: null, approximate: true, regulationItemId: id, note: 'сам менял' });
    expect((await schedule(id, '2026-01-10')).dueDate).toBe('2026-12-01');
    await deleteManualEvent(db, ev);
    expect(await loadManualEvents(db)).toEqual([]);
    expect((await schedule(id, '2026-01-10')).status).toBe('gray');
  });

  it('switches to severe intervals from the synced settings record', async () => {
    const id = await saveRegulationItem(db, null, { ...OIL, severeIntervalKm: 7500, severeIntervalMonths: 6 });
    await saveManualEvent(db, null, { date: '2025-12-01', km: 300000, approximate: false, regulationItemId: id, note: '' });
    await updateSettings(db, { severeConditions: true });
    const settings = await loadSettings(db);
    expect(settings).toMatchObject({ severeConditions: true, warnKm: 1000 });
    expect(settings.updatedAt).not.toBe('2000-01-01T00:00:00.000Z');
    expect(await schedule(id, '2026-01-10')).toMatchObject({ dueKm: 307500, dueDate: '2026-06-01', severeUsed: true });
  });
});
