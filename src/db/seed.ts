// Built-in records: the car, the starting component tree and default settings.
// Deterministic ids and an old timestamp (core/ids.ts), so devices never duplicate them
// and any edit by the owner wins a merge.

import { START_COMPONENTS } from '../core/components';
import { SEED_EXPECTED_PART_RULES } from '../core/expectedParts';
import { SEED_TIMESTAMP, seedId } from '../core/ids';
import type { Component, Settings, SyncFields, Vehicle } from '../core/model';
import type { CarlogDB } from './db';

export const VEHICLE_ID = seedId(1);
export const SETTINGS_ID = seedId(2);

const seedFields = (id: string): SyncFields => ({
  id,
  createdAt: SEED_TIMESTAMP,
  updatedAt: SEED_TIMESTAMP,
  deleted: false,
  deviceId: 'seed',
});

export const SEED_VEHICLE: Vehicle = {
  ...seedFields(VEHICLE_ID),
  make: 'Hyundai',
  model: 'Santa Fe New',
  engine: '2.7 V6, бензин',
  year: null,
  vin: null,
  plate: null,
};

export const SEED_SETTINGS: Settings = {
  ...seedFields(SETTINGS_ID),
  severeConditions: false,
  warnPercent: 10,
  warnKm: 1000,
  warnDays: 30,
};

export const SEED_COMPONENTS: Component[] = START_COMPONENTS.map((c) => ({
  ...seedFields(c.id),
  name: c.name,
  parentId: null,
  order: c.order,
}));

/**
 * Adds built-in records that are missing. Never overwrites: a renamed or deleted
 * (marked) component stays as the owner left it. Safe to run on every start.
 */
export async function ensureSeed(db: CarlogDB): Promise<void> {
  await db.transaction('rw', [db.vehicles, db.settings, db.components, db.expectedPartRules], async () => {
    if (!(await db.vehicles.get(VEHICLE_ID))) await db.vehicles.add(SEED_VEHICLE);
    if (!(await db.settings.get(SETTINGS_ID))) await db.settings.add(SEED_SETTINGS);
    const components = await db.components.bulkGet(SEED_COMPONENTS.map((c) => c.id));
    const missingComponents = SEED_COMPONENTS.filter((_, i) => !components[i]);
    if (missingComponents.length) await db.components.bulkAdd(missingComponents);

    const rules = await db.expectedPartRules.bulkGet(SEED_EXPECTED_PART_RULES.map((r) => r.id));
    const missingRules = SEED_EXPECTED_PART_RULES.filter((_, i) => !rules[i]);
    if (missingRules.length) await db.expectedPartRules.bulkAdd(missingRules);
  });
}
