// Test-only regulation (SPEC stage 6): never shipped in the app. The real table comes from
// the owner in stage 9. Intervals are picked so that the history of test pages 1–6 gives
// every status at TODAY.

import { seedId } from '../../src/core/ids';
import type { RegulationItem } from '../../src/core/model';

export const TODAY = '2026-03-01';
/** The odometer read on TODAY (there is no forecast, D-088): the statuses are computed from it. */
export const TODAY_KM = 309327;

const T = '2026-01-01T00:00:00.000Z';
let next = 900;
const item = (name: string, intervalKm: number | null, intervalMonths: number | null, keywords: string[], extra: Partial<RegulationItem> = {}): RegulationItem => ({
  id: seedId(next++),
  createdAt: T,
  updatedAt: T,
  deleted: false,
  deviceId: 'device-test',
  name,
  componentId: null,
  action: 'replace',
  performer: 'service',
  intervalKm,
  intervalMonths,
  severeIntervalKm: null,
  severeIntervalMonths: null,
  keywords,
  note: '',
  ...extra,
});

export const OIL = item('Масло двигателя', 10000, 12, ['замена масла двигатель', 'масло мот'], { severeIntervalKm: 7500, severeIntervalMonths: 6 });
export const REAR_PADS = item('Колодки задние', 30000, null, ['колодки зад']);
export const AIR_FILTER = item('Воздушный фильтр', 20000, 24, ['воздушный фильтр']);
export const CABIN_FILTER = item('Салонный фильтр', 20000, 11, ['салонный фильтр']);
export const TRANSFER_OIL = item('Масло раздаточной коробки', 15000, null, ['масла раздаточной']);
export const PLUGS = item('Свечи зажигания', 60000, 48, ['свечи зажигания']);
export const COOLANT = item('Антифриз', 40000, 24, ['антифриз']);
export const ALT_BELT = item('Ремень генератора', 60000, 48, ['ремень генератора']);
export const HOSES = item('Тормозные шланги', null, null, [], { action: 'inspect' });

export const FIXTURE_REGULATION: readonly RegulationItem[] = [OIL, REAR_PADS, AIR_FILTER, CABIN_FILTER, TRANSFER_OIL, PLUGS, COOLANT, ALT_BELT, HOSES];
