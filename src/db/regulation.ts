// Regulation items, "Отметить, когда делалось" (ManualEvent) and schedule settings (SPEC section 9).

import { nowIso } from '../core/dates';
import { newId } from '../core/ids';
import type { Id, ManualEvent, RegulationItem, Settings } from '../core/model';
import type { CarlogDB } from './db';
import { getDeviceId } from './device';
import { SEED_SETTINGS, SETTINGS_ID, VEHICLE_ID } from './seed';

export type RegulationItemInput = Pick<
  RegulationItem,
  'name' | 'componentId' | 'action' | 'performer' | 'intervalKm' | 'intervalMonths' | 'severeIntervalKm' | 'severeIntervalMonths' | 'keywords' | 'note'
>;

export async function loadRegulationItems(db: CarlogDB): Promise<RegulationItem[]> {
  return (await db.regulationItems.toArray()).filter((r) => !r.deleted).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

export async function saveRegulationItem(db: CarlogDB, id: Id | null, input: RegulationItemInput): Promise<Id> {
  const deviceId = await getDeviceId(db);
  const now = nowIso();
  const prev = id ? await db.regulationItems.get(id) : undefined;
  const item: RegulationItem = {
    id: prev?.id ?? newId(),
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
    deleted: false,
    deviceId,
    ...input,
    origin: prev?.origin ?? 'manual',
  };
  await db.regulationItems.put(item);
  return item.id;
}

/** Soft delete. Lines keep the id; the schedule ignores deleted items. */
export async function deleteRegulationItem(db: CarlogDB, id: Id): Promise<void> {
  const deviceId = await getDeviceId(db);
  await db.regulationItems.update(id, { deleted: true, updatedAt: nowIso(), deviceId });
}

/** Links history lines to an item ("Найдено N строк — привязать?"). Each line syncs as an edit. */
export async function linkLines(db: CarlogDB, itemId: Id, lineIds: readonly Id[]): Promise<number> {
  const deviceId = await getDeviceId(db);
  const now = nowIso();
  let changed = 0;
  await db.transaction('rw', db.lineItems, async () => {
    for (const line of await db.lineItems.bulkGet([...lineIds])) {
      if (!line || line.deleted || line.regulationItemIds.includes(itemId)) continue;
      await db.lineItems.put({ ...line, regulationItemIds: [...line.regulationItemIds, itemId], updatedAt: now, deviceId });
      changed++;
    }
  });
  return changed;
}

/** Removes the link of one visit's lines to an item (a wrong keyword match). */
export async function unlinkVisit(db: CarlogDB, itemId: Id, visitId: Id): Promise<number> {
  const deviceId = await getDeviceId(db);
  const now = nowIso();
  let changed = 0;
  await db.transaction('rw', db.lineItems, async () => {
    const lines = await db.lineItems.where('visitId').equals(visitId).toArray();
    for (const line of lines) {
      if (line.deleted || !line.regulationItemIds.includes(itemId)) continue;
      await db.lineItems.put({ ...line, regulationItemIds: line.regulationItemIds.filter((x) => x !== itemId), updatedAt: now, deviceId });
      changed++;
    }
  });
  return changed;
}

// ---------------------------------------------------------------------------------------------
// Manual events

export type ManualEventInput = Pick<ManualEvent, 'date' | 'km' | 'approximate' | 'regulationItemId' | 'note'>;

export async function loadManualEvents(db: CarlogDB): Promise<ManualEvent[]> {
  return (await db.manualEvents.toArray()).filter((e) => !e.deleted).sort((a, b) => b.date.localeCompare(a.date));
}

export async function saveManualEvent(db: CarlogDB, id: Id | null, input: ManualEventInput): Promise<Id> {
  const deviceId = await getDeviceId(db);
  const now = nowIso();
  const prev = id ? await db.manualEvents.get(id) : undefined;
  const event: ManualEvent = {
    id: prev?.id ?? newId(),
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
    deleted: false,
    deviceId,
    vehicleId: VEHICLE_ID,
    ...input,
  };
  await db.manualEvents.put(event);
  return event.id;
}

export async function deleteManualEvent(db: CarlogDB, id: Id): Promise<void> {
  const deviceId = await getDeviceId(db);
  await db.manualEvents.update(id, { deleted: true, updatedAt: nowIso(), deviceId });
}

// ---------------------------------------------------------------------------------------------
// Settings (one synced record)

export async function loadSettings(db: CarlogDB): Promise<Settings> {
  return (await db.settings.get(SETTINGS_ID)) ?? SEED_SETTINGS;
}

export type SettingsPatch = Partial<Pick<Settings, 'severeConditions' | 'warnPercent' | 'warnKm' | 'warnDays'>>;

export async function updateSettings(db: CarlogDB, patch: SettingsPatch): Promise<void> {
  const deviceId = await getDeviceId(db);
  const current = await loadSettings(db);
  await db.settings.put({ ...current, ...patch, updatedAt: nowIso(), deviceId });
}
