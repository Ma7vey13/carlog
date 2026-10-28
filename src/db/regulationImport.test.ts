import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ALL_PAGES } from '../../tests/fixtures/drafts';
import { draftToForm } from '../core/draftToForm';
import { mileagePoints } from '../core/mileage';
import { detectLayout, parseTable, planImport } from '../core/regulationTable';
import { scheduleItem } from '../core/schedule';
import { parseDelimited } from '../core/table';
import { CarlogDB } from './db';
import { resetDeviceIdCache } from './device';
import { loadManualEvents, loadRegulationItems, saveManualEvent, saveRegulationItem } from './regulation';
import { applyRegulationImport, lastRegulationImport, plannedLinks, undoRegulationImport } from './regulationImport';
import { ensureSeed } from './seed';
import { loadMileage, loadVisitBundles, saveVisitForm } from './visits';

let db: CarlogDB;
let n = 0;
beforeEach(async () => {
  resetDeviceIdCache();
  db = new CarlogDB(`carlog-regimport-test-${++n}`);
  await ensureSeed(db);
  for (const p of ALL_PAGES) await saveVisitForm(db, draftToForm(p), null);
});
afterEach(async () => {
  await db.delete();
});

async function plan(csv: string) {
  const grid = parseDelimited(csv);
  const parsed = parseTable(grid, detectLayout(grid)).items;
  return planImport(parsed, await db.regulationItems.toArray(), await db.components.toArray());
}

async function due(name: string, today = '2026-01-10') {
  const item = (await loadRegulationItems(db)).find((i) => i.name === name)!;
  return scheduleItem(item, {
    bundles: await loadVisitBundles(db),
    events: await loadManualEvents(db),
    points: mileagePoints(await loadMileage(db)),
    today,
    thresholds: { warnPercent: 10, warnKm: 1000, warnDays: 30, severeConditions: false },
  });
}

const RIGHT = [
  'Наименование;Пробег, км;Срок, мес;Ключевые слова',
  'Масло двигателя;15 000;12;замена масла двигатель | масло мот',
  'Свечи зажигания;60 000;48;свечи зажигания',
  'Антифриз;40 000;24;антифриз',
].join('\n');
const WRONG = ['Наименование;Пробег, км;Срок, мес', 'Масло двигателя;5 000;6', 'Ремень ГРМ;90 000;72'].join('\n');

describe('regulation table upload', () => {
  it('applies a table: the existing item keeps its manual mark, history gets linked, dues follow', async () => {
    const oil = await saveRegulationItem(db, null, {
      name: 'Масло двигателя',
      componentId: null,
      action: 'replace',
      performer: 'service',
      intervalKm: 10000,
      intervalMonths: 12,
      severeIntervalKm: null,
      severeIntervalMonths: null,
      keywords: [],
      note: '',
    });
    await saveManualEvent(db, null, { date: '2025-12-01', km: 306000, approximate: true, regulationItemId: oil, note: 'сам' });

    const p = await plan(RIGHT);
    expect(p.update.map((u) => u.existing.id)).toEqual([oil]);
    expect(p.create.map((c) => c.name)).toEqual(['Свечи зажигания', 'Антифриз']);
    const preview = plannedLinks(await loadVisitBundles(db), p);
    expect(preview.length).toBe(6); // oil: 4 lines, plugs: 1, coolant: 1

    const rec = await applyRegulationImport(db, p, 'регламент.csv');
    expect(rec.summary).toEqual({ created: 2, updated: 1, revived: 0, removed: 0, linked: 6 });
    const items = await loadRegulationItems(db);
    expect(items.map((i) => [i.name, i.origin])).toEqual([
      ['Антифриз', 'table'],
      ['Масло двигателя', 'table'],
      ['Свечи зажигания', 'table'],
    ]);
    // same item: the manual mark (01.12.2025) still counts, with the new interval
    expect(await due('Масло двигателя')).toMatchObject({ dueKm: 321000, dueDate: '2026-12-01' });
    expect(await due('Свечи зажигания')).toMatchObject({ dueKm: 310000, dueDate: '2025-10-06', status: 'red' });
  });

  it('a wrong table, then the right one; undo puts everything back', async () => {
    await applyRegulationImport(db, await plan(RIGHT), 'right.csv');
    const plugsId = (await loadRegulationItems(db)).find((i) => i.name === 'Свечи зажигания')!.id;

    // The wrong table: plugs and coolant disappear, a belt appears, oil changes.
    const wrongPlan = await plan(WRONG);
    expect(wrongPlan.remove.map((i) => i.name).sort()).toEqual(['Антифриз', 'Свечи зажигания']);
    const wrong = await applyRegulationImport(db, wrongPlan, 'wrong.csv');
    expect((await loadRegulationItems(db)).map((i) => i.name)).toEqual(['Масло двигателя', 'Ремень ГРМ']);
    expect((await lastRegulationImport(db))?.id).toBe(wrong.id);

    await undoRegulationImport(db, wrong.id);
    expect((await loadRegulationItems(db)).map((i) => [i.name, i.intervalKm])).toEqual([
      ['Антифриз', 40000],
      ['Масло двигателя', 15000],
      ['Свечи зажигания', 60000],
    ]);
    expect(await lastRegulationImport(db)).toBeNull();
    // the history links of the right table survived the round trip
    expect((await due('Свечи зажигания')).last?.date).toBe('2021-10-06');

    // Uploading the wrong table again and then the right one also works: removed items come back
    // with the same id, so their history and marks come back too.
    await applyRegulationImport(db, await plan(WRONG), 'wrong.csv');
    const back = await plan(RIGHT);
    expect(back.revive.map((r) => r.existing.id)).toContain(plugsId);
    await applyRegulationImport(db, back, 'right.csv');
    expect((await loadRegulationItems(db)).map((i) => i.name)).toEqual(['Антифриз', 'Масло двигателя', 'Свечи зажигания']);
    expect((await due('Свечи зажигания')).last?.date).toBe('2021-10-06');
  });

  it('undo removes the links it made and only the last upload can be undone', async () => {
    const first = await applyRegulationImport(db, await plan(RIGHT), 'a.csv');
    const second = await applyRegulationImport(db, await plan(WRONG), 'b.csv');
    await expect(undoRegulationImport(db, first.id)).rejects.toThrow('только последнюю');
    await undoRegulationImport(db, second.id);
    await expect(undoRegulationImport(db, first.id)).rejects.toThrow('только последнюю');

    const fresh = new CarlogDB(`carlog-regimport-fresh-${++n}`);
    await ensureSeed(fresh);
    for (const p of ALL_PAGES) await saveVisitForm(fresh, draftToForm(p), null);
    const g = parseDelimited(RIGHT);
    const rec = await applyRegulationImport(fresh, planImport(parseTable(g, detectLayout(g)).items, [], await fresh.components.toArray()), 'a.csv');
    await undoRegulationImport(fresh, rec.id);
    expect(await loadRegulationItems(fresh)).toEqual([]);
    const lines = await fresh.lineItems.toArray();
    expect(lines.every((l) => l.regulationItemIds.length === 0)).toBe(true);
    await fresh.delete();
  });
});

describe('the last upload', () => {
  it('is the newest by order, even with the same clock time', async () => {
    const realNow = Date.now;
    Date.now = () => Date.parse('2026-10-28T12:00:00.000Z');
    const RealDate = Date;
    // nowIso() uses new Date(): pin it too
    globalThis.Date = class extends RealDate {
      constructor(...args: ConstructorParameters<typeof Date>) {
        super(...(args.length ? args : [Date.now()]) as []);
      }
    } as DateConstructor;
    try {
      await applyRegulationImport(db, await plan(RIGHT), 'right.csv');
      const wrong = await applyRegulationImport(db, await plan(WRONG), 'wrong.csv');
      expect((await lastRegulationImport(db))?.id).toBe(wrong.id);
      await undoRegulationImport(db, wrong.id);
      expect((await loadRegulationItems(db)).map((i) => i.name)).toEqual(['Антифриз', 'Масло двигателя', 'Свечи зажигания']);
    } finally {
      globalThis.Date = RealDate;
      Date.now = realNow;
    }
  });
});
