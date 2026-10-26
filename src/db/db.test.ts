import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BRAKES_FRONT_2025, DISCS_FRONT_2025 } from '../../tests/fixtures/manualVisits';
import { fixtureToForm } from '../../tests/helpers';
import { startComponentId } from '../core/components';
import { filterVisits } from '../core/search';
import { bundleToForm, updateLine } from '../core/visitForm';
import { addComponent, componentUsage, deleteComponent, renameComponent } from './components';
import { CarlogDB, SYNCED_TABLES } from './db';
import { getDeviceId, resetDeviceIdCache } from './device';
import { ensureSeed, VEHICLE_ID } from './seed';
import { addManualMileage, deleteMileage, deleteVisit, loadMileage, loadVisitBundle, loadVisitBundles, saveVisitForm } from './visits';

let db: CarlogDB;
let n = 0;

beforeEach(async () => {
  resetDeviceIdCache();
  db = new CarlogDB(`carlog-test-${++n}`);
  await ensureSeed(db);
});

afterEach(async () => {
  await db.delete();
});

describe('seed', () => {
  it('creates the car, settings and 24 components once', async () => {
    await ensureSeed(db);
    expect(await db.vehicles.count()).toBe(1);
    expect(await db.settings.count()).toBe(1);
    expect(await db.components.count()).toBe(24);
    expect((await db.vehicles.get(VEHICLE_ID))?.model).toBe('Santa Fe New');
  });

  it('does not overwrite a component the owner renamed', async () => {
    const id = startComponentId('Прочее');
    await db.components.update(id, { name: 'Разное', updatedAt: '2026-01-01T00:00:00.000Z' });
    await ensureSeed(db);
    expect((await db.components.get(id))?.name).toBe('Разное');
  });

  it('every synced record carries the service fields', async () => {
    for (const table of SYNCED_TABLES) {
      for (const row of await db.table(table).toArray()) {
        expect(row).toEqual(expect.objectContaining({ id: expect.any(String), createdAt: expect.any(String), updatedAt: expect.any(String), deleted: false, deviceId: expect.any(String) }));
      }
    }
  });
});

describe('device id', () => {
  it('is generated once and kept', async () => {
    const first = await getDeviceId(db);
    resetDeviceIdCache();
    expect(await getDeviceId(db)).toBe(first);
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('visits (stage 2 acceptance flow)', () => {
  it('saves, finds by "колодки", edits and deletes a visit', async () => {
    const id = await saveVisitForm(db, fixtureToForm(BRAKES_FRONT_2025), null);
    await saveVisitForm(db, fixtureToForm(DISCS_FRONT_2025), null);

    // Saved with lines, totals and a mileage mark.
    const saved = await loadVisitBundle(db, id);
    expect(saved?.documents[0]?.lines).toHaveLength(7);
    expect(saved?.mileage?.km).toBe(293000);

    // Found by search; newest first.
    const all = await loadVisitBundles(db);
    expect(all.map((b) => b.visit.date)).toEqual(['2025-07-22', '2025-03-12']);
    expect(filterVisits(all, { query: 'колодки', componentIds: null })).toHaveLength(2);

    // Edit: change a price and drop a line.
    const form = bundleToForm(saved!);
    form.documents[0]!.lines[3] = updateLine(form.documents[0]!.lines[3]!, { price: '3700' });
    form.documents[0]!.lines.pop();
    await saveVisitForm(db, form, saved);
    const edited = await loadVisitBundle(db, id);
    expect(edited?.documents[0]?.lines).toHaveLength(6);
    expect(edited?.documents[0]?.lines[3]).toMatchObject({ price: 370000, sum: 370000 });
    expect(await db.lineItems.where('visitId').equals(id).count()).toBe(7); // removed line kept as a marker

    // Delete: hidden everywhere, but kept as markers for sync.
    await deleteVisit(db, id);
    expect(await loadVisitBundle(db, id)).toBeNull();
    expect((await loadVisitBundles(db)).map((b) => b.visit.id)).not.toContain(id);
    expect((await db.visits.get(id))?.deleted).toBe(true);
    expect((await db.lineItems.where('visitId').equals(id).toArray()).every((l) => l.deleted)).toBe(true);
    expect((await loadMileage(db)).map((m) => m.km)).toEqual([298000]);
  });
});

describe('component tree editing', () => {
  it('adds nested components, renames and deletes with children moving up', async () => {
    const brakes = startComponentId('Тормоза передние');
    const calipers = await addComponent(db, '  Суппорты ', brakes);
    const guides = await addComponent(db, 'Направляющие', calipers);
    expect(await db.components.get(calipers)).toMatchObject({ name: 'Суппорты', parentId: brakes, deleted: false });

    await renameComponent(db, calipers, 'Суппорты и скобы');
    expect((await db.components.get(calipers))?.name).toBe('Суппорты и скобы');

    await deleteComponent(db, calipers);
    expect((await db.components.get(calipers))?.deleted).toBe(true);
    expect((await db.components.get(guides))?.parentId).toBe(brakes);
  });

  it('counts lines that use a component', async () => {
    await saveVisitForm(db, fixtureToForm(BRAKES_FRONT_2025), null);
    // Front pads work, front pads, front caliper. Lines without front/rear get no component.
    expect(await componentUsage(db, startComponentId('Тормоза передние'))).toBe(3);
    expect(await componentUsage(db, startComponentId('АКПП'))).toBe(0);
  });
});

describe('manual mileage', () => {
  it('adds and deletes marks', async () => {
    const id = await addManualMileage(db, '2026-01-10', 310500);
    expect(await loadMileage(db)).toMatchObject([{ km: 310500, source: 'manual', visitId: null }]);
    await deleteMileage(db, id);
    expect(await loadMileage(db)).toEqual([]);
    expect((await db.mileageEntries.get(id))?.deleted).toBe(true);
  });
});
