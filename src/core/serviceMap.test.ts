import { describe, expect, it } from 'vitest';
import type { RegulationItem } from './model';
import { mapColumns, mapGroups, mapSteps, stepContents, stepsBetween } from './serviceMap';

const item = (name: string, km: number | null, months: number | null, patch: Partial<RegulationItem> = {}): RegulationItem => ({
  id: name,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deleted: false,
  deviceId: 'd',
  name,
  componentId: null,
  action: 'replace',
  performer: 'service',
  intervalKm: km,
  intervalMonths: months,
  severeIntervalKm: null,
  severeIntervalMonths: null,
  keywords: [],
  note: '',
  origin: 'table',
  ...patch,
});

describe('«Карта ТО»', () => {
  it('columns are 15 000 km / 12 months apart, up to 150 000', () => {
    const cols = mapColumns();
    expect(cols).toHaveLength(10);
    expect(cols[0]).toEqual({ step: 1, km: 15000, months: 12 });
    expect(cols[9]).toEqual({ step: 10, km: 150000, months: 120 });
  });

  it('an interval on the grid gives every n-th ТО, like the service table', () => {
    expect(mapSteps(item('Масло', 15000, 12))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(mapSteps(item('Свечи', 60000, 48))).toEqual([4, 8]);
    expect(mapSteps(item('Раздатка', 45000, 36))).toEqual([3, 6, 9]);
    expect(mapSteps(item('Тормозная жидкость', 30000, 24))).toEqual([2, 4, 6, 8, 10]);
  });

  it('whichever comes first: 40 000 km or 24 months → every second ТО', () => {
    expect(stepsBetween(item('Антифриз', 40000, 24))).toBe(2);
    expect(mapSteps(item('Антифриз', 40000, 24))).toEqual([2, 4, 6, 8, 10]);
  });

  it('an interval off the grid goes to the ТО before it is due', () => {
    // 40 000, 80 000, 120 000 km → at 30, 75 and 120 thousand
    expect(mapSteps(item('Антифриз', 40000, null))).toEqual([2, 5, 8]);
    // more often than every ТО → every ТО
    expect(mapSteps(item('Масло', 7500, 6))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('rarer than the grid or without an interval → no marks', () => {
    expect(mapSteps(item('Свечи', 160000, null))).toEqual([]);
    expect(mapSteps(item('Шланги', null, null))).toEqual([]);
  });

  it('groups: service first, then the manual, then items without a source; replacements before checks, most frequent first', () => {
    const items = [
      item('Зазор клапанов', 96000, 48, { action: 'inspect', source: 'instruction' }),
      item('Свечи', 60000, 48, { source: 'service' }),
      item('Масло', 15000, 12, { source: 'service' }),
      item('Ходовая', 15000, 12, { action: 'inspect', source: 'service' }),
      item('Свой пункт', 10000, null, { origin: 'manual' }),
      item('Удалён', 15000, 12, { source: 'service', deleted: true }),
    ];
    const groups = mapGroups(items);
    expect(groups.map((g) => g.key)).toEqual(['service', 'instruction', 'none']);
    expect(groups[0]!.replace.map((r) => r.item.name)).toEqual(['Масло', 'Свечи']);
    expect(groups[0]!.inspect.map((r) => r.item.name)).toEqual(['Ходовая']);
    const at60 = stepContents(groups, 4);
    expect(at60.replace.map((i) => i.name)).toEqual(['Масло', 'Свечи', 'Свой пункт']);
    expect(at60.inspect.map((i) => i.name)).toEqual(['Ходовая', 'Зазор клапанов']);
  });
});
