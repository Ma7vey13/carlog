// «Карта ТО»: the regulation laid on the service-book grid — one ТО every 15 000 km / 12 months —
// so it reads like the service's own table: at 15, 30, 45 … thousand km, what is replaced and what
// is checked. Counted from a new car, as service books do; the main screen counts from real history.

import type { RegulationItem, RegulationSource } from './model';

export const MAP_STEP_KM = 15000;
export const MAP_STEP_MONTHS = 12;
export const MAP_COLUMNS = 10;

export interface MapColumn {
  /** 1, 2, 3… */
  step: number;
  km: number;
  months: number;
}

export function mapColumns(count = MAP_COLUMNS): MapColumn[] {
  return Array.from({ length: count }, (_, i) => ({ step: i + 1, km: (i + 1) * MAP_STEP_KM, months: (i + 1) * MAP_STEP_MONTHS }));
}

/** ТО steps between two times of the item, whichever comes first (km or months); null = no interval. */
export function stepsBetween(item: Pick<RegulationItem, 'intervalKm' | 'intervalMonths'>): number | null {
  const byKm = item.intervalKm ? item.intervalKm / MAP_STEP_KM : null;
  const byMonths = item.intervalMonths ? item.intervalMonths / MAP_STEP_MONTHS : null;
  if (byKm && byMonths) return Math.min(byKm, byMonths);
  return byKm ?? byMonths;
}

/**
 * Steps (1-based) at which the item is done. An interval that does not fall on the grid
 * (40 000 km) goes to the ТО before it is due — done early rather than late.
 */
export function mapSteps(item: Pick<RegulationItem, 'intervalKm' | 'intervalMonths'>, count = MAP_COLUMNS): number[] {
  const u = stepsBetween(item);
  if (!u) return [];
  const out = new Set<number>();
  for (let k = 1; k * u <= count + 1e-9; k++) {
    const step = Math.floor(k * u + 1e-9);
    if (step >= 1) out.add(step);
  }
  return [...out];
}

export type MapGroupKey = RegulationSource | 'none';

export interface MapRow {
  item: RegulationItem;
  steps: number[];
}

export interface MapGroup {
  key: MapGroupKey;
  replace: MapRow[];
  inspect: MapRow[];
}

/**
 * Items by source — the service's first — then replacements before checks, the most frequent first.
 * Groups without items are left out.
 */
export function mapGroups(items: readonly RegulationItem[], count = MAP_COLUMNS): MapGroup[] {
  const order: MapGroupKey[] = ['service', 'instruction', 'none'];
  const rows = (list: RegulationItem[]) =>
    list
      .map((item) => ({ item, steps: mapSteps(item, count), u: stepsBetween(item) ?? Infinity }))
      .sort((a, b) => a.u - b.u || a.item.name.localeCompare(b.item.name, 'ru'))
      .map(({ item, steps }) => ({ item, steps }));
  return order
    .map((key) => {
      const own = items.filter((i) => !i.deleted && (i.source ?? 'none') === key);
      return { key, replace: rows(own.filter((i) => i.action === 'replace')), inspect: rows(own.filter((i) => i.action === 'inspect')) };
    })
    .filter((g) => g.replace.length + g.inspect.length > 0);
}

/** What one ТО (step) holds: names to replace and to check, the service's first. */
export function stepContents(groups: readonly MapGroup[], step: number): { replace: RegulationItem[]; inspect: RegulationItem[] } {
  const pick = (rows: MapRow[]) => rows.filter((r) => r.steps.includes(step)).map((r) => r.item);
  return {
    replace: groups.flatMap((g) => pick(g.replace)),
    inspect: groups.flatMap((g) => pick(g.inspect)),
  };
}
