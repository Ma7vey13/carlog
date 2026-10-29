import { describe, expect, it } from 'vitest';
import { bundle, doc, line, reg } from '../../tests/fixtures/bundles';
import { visitTotal } from './bundle';
import { allExpenses, expenseYears, kmInPeriod, summarize, visitExpense } from './expenses';
import { regulationById } from './purpose';

const REGULATION = regulationById([reg('oil')]);

const totals = (total: number | null) => ({ works: null, parts: null, total, discountPercent: null });

describe('Расходы', () => {
  const oilChange = bundle('2026-03-12', [
    {
      document: doc({ totals: totals(450000) }), // 10 % off 5 000 ₽ of lines
      lines: [
        line('work', 'Замена масла', 100000, { regulationItemIds: ['oil'], componentId: 'lube' }),
        line('part', 'Масло моторное', 300000, { componentId: 'lube' }),
        line('work', 'Замена колодок', 100000, { componentId: 'brakes' }),
      ],
    },
  ]);
  const purchase = bundle('2026-03-20', [{ document: doc({ purchaseOnly: true }), lines: [line('part', 'Колодки задние', 200000, { componentId: 'brakes' })] }]);
  const totalOnly = bundle('2025-11-05', [{ document: doc({ totals: totals(150000) }), lines: [] }]);
  const free = bundle('2026-05-01', [{ document: doc(), lines: [line('work', 'Осмотр', 0)] }]);

  it('spreads a document total over its lines, so ТО, ремонт and other add up to the visit total', () => {
    const e = visitExpense(oilChange, REGULATION);
    expect(e.total).toBe(visitTotal(oilChange));
    expect(e.byKind).toEqual({ maintenance: 360000, repair: 90000, other: 0 });
    expect(Object.fromEntries(e.byNode)).toEqual({ lube: 360000, brakes: 90000 });
  });

  it('counts a purchase without installation and a total without lines as other', () => {
    expect(visitExpense(purchase, REGULATION).byKind).toEqual({ maintenance: 0, repair: 0, other: 200000 });
    expect(visitExpense(purchase, REGULATION).byNode.get('brakes')).toBe(200000);
    const e = visitExpense(totalOnly, REGULATION);
    expect(e.byKind.other).toBe(150000);
    expect(e.byNode.get(null)).toBe(150000);
  });

  it('sums a year by month and the whole history by year', () => {
    const all = allExpenses([oilChange, purchase, totalOnly, free], REGULATION);
    expect(all.map((e) => e.date)).toEqual(['2026-03-20', '2026-03-12', '2025-11-05']);
    expect(expenseYears(all)).toEqual([2026, 2025]);

    const points = [
      { date: '2025-06-01', km: 290000 },
      { date: '2025-12-20', km: 296000 },
      { date: '2026-03-12', km: 299000 },
      { date: '2026-10-01', km: 306000 },
    ];
    const year = summarize(all, 2026, points);
    expect(year).toMatchObject({ total: 650000, byKind: { maintenance: 360000, repair: 90000, other: 200000 }, visits: 2, km: 10000, perKm: 65 });
    expect(year.buckets).toHaveLength(12);
    expect(year.buckets[2]).toMatchObject({ key: '2026-03', total: 650000 });
    expect(year.byNode).toEqual([
      { componentId: 'lube', total: 360000 },
      { componentId: 'brakes', total: 290000 },
    ]);
    expect(year.top.map((e) => e.total)).toEqual([450000, 200000]);

    const everything = summarize(all, 'all', points);
    expect(everything.buckets.map((b) => [b.key, b.total])).toEqual([
      ['2025', 150000],
      ['2026', 650000],
    ]);
    expect(everything).toMatchObject({ total: 800000, km: 16000, perKm: 50 });
  });

  it('knows the km of a period only from readings around it', () => {
    const points = [
      { date: '2026-02-01', km: 300000 },
      { date: '2026-02-20', km: 300300 },
    ];
    // the first year: from its first reading
    expect(kmInPeriod(points, 2026)).toBe(300);
    // too few km for a rate
    expect(summarize([], 2026, points)).toMatchObject({ total: 0, km: 300, perKm: null });
    expect(kmInPeriod(points, 2025)).toBeNull();
    expect(kmInPeriod([points[0]!], 'all')).toBeNull();
  });
});
