import { describe, expect, it } from 'vitest';
import { BRAKES_FRONT_2025, DISCS_FRONT_2025, ORDER_OIL_2025 } from '../../tests/fixtures/manualVisits';
import { fixtureToBundle } from '../../tests/helpers';
import { startComponentId, START_COMPONENTS } from './components';
import type { Component } from './model';
import { componentSubtree, filterVisits, searchStem } from './search';

const brakes = fixtureToBundle(BRAKES_FRONT_2025);
const discs = fixtureToBundle(DISCS_FRONT_2025);
const oil = fixtureToBundle(ORDER_OIL_2025);
const all = [brakes, discs, oil];

const names = (lines: { name: string }[]) => lines.map((l) => l.name);
const visitDates = (r: ReturnType<typeof filterVisits>) => r.map((m) => m.bundle.visit.date);

describe('filterVisits', () => {
  it('returns everything for an empty filter', () => {
    const r = filterVisits(all, { query: '', componentIds: null });
    expect(r).toHaveLength(3);
    expect(r.every((m) => m.matchedLines.length === 0)).toBe(true);
  });

  it('finds visits by "колодки" (stage 2 acceptance) and shows the matching lines', () => {
    const r = filterVisits(all, { query: 'колодки', componentIds: null });
    expect(visitDates(r)).toEqual(['2025-03-12', '2025-07-22']);
    expect(names(r[0]!.matchedLines)).toEqual(['Замена передних тормозных колодок (джип)', 'Колодки тормозные перед.(OEM) SFN']);
  });

  it('matches other grammatical forms', () => {
    expect(visitDates(filterVisits(all, { query: 'колодок', componentIds: null }))).toEqual(['2025-03-12', '2025-07-22']);
    expect(visitDates(filterVisits(all, { query: 'ступицы', componentIds: null }))).toEqual(['2025-10-30']);
    expect(visitDates(filterVisits(all, { query: 'масло', componentIds: null }))).toEqual(['2025-10-30']);
    expect(searchStem('колодки')).toBe('колод');
    expect(searchStem('диск')).toBe('диск');
    expect(searchStem('26999')).toBe('26999');
  });

  it('matches word starts, case, ё and the "Супорт" typo', () => {
    expect(visitDates(filterVisits(all, { query: 'КОЛОД', componentIds: null }))).toHaveLength(2);
    expect(names(filterVisits(all, { query: 'суппорт', componentIds: null })[0]!.matchedLines)).toContain('Суппорт тормозной перед.(лев.) SFN');
  });

  it('requires every word, across lines, shop and document numbers', () => {
    expect(visitDates(filterVisits(all, { query: 'диск пыльник', componentIds: null }))).toEqual(['2025-07-22']);
    expect(visitDates(filterVisits(all, { query: '26999', componentIds: null }))).toEqual(['2025-10-30']);
    expect(visitDates(filterVisits(all, { query: 'пример ступица', componentIds: null }))).toEqual(['2025-10-30']);
    expect(filterVisits(all, { query: 'колодки ступица', componentIds: null })).toEqual([]);
  });

  it('filters by component and lists the lines of that component', () => {
    const r = filterVisits(all, { query: '', componentIds: new Set([startComponentId('АКПП')]) });
    expect(visitDates(r)).toEqual(['2025-10-30']);
    expect(names(r[0]!.matchedLines)).toEqual(['Замена масла в АКПП (аппаратная)', 'Масло АКПП TOTACHI ATF SP-III']);
  });

  it('ignores deleted lines', () => {
    const copy = structuredClone(brakes);
    for (const l of copy.documents[0]!.lines) l.deleted = true;
    expect(filterVisits([copy], { query: 'колодки', componentIds: null })).toEqual([]);
  });
});

describe('componentSubtree', () => {
  it('includes nested children', () => {
    const base = START_COMPONENTS.map((c) => ({ ...c, parentId: null, createdAt: '', updatedAt: '', deleted: false, deviceId: '' })) as Component[];
    const root = startComponentId('Тормоза передние');
    const child: Component = { ...base[0]!, id: 'child', name: 'Суппорты', parentId: root };
    const grandchild: Component = { ...base[0]!, id: 'grandchild', name: 'Направляющие', parentId: 'child' };
    expect(componentSubtree(root, [...base, child, grandchild])).toEqual(new Set([root, 'child', 'grandchild']));
  });
});
