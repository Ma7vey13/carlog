import { describe, expect, it } from 'vitest';
import { bundle, doc, line, reg } from '../../tests/fixtures/bundles';
import { installedFor } from './installed';

describe('Что ставили', () => {
  const OIL = reg('oil', { componentId: 'lube' });

  it('finds the parts of each visit where the item was done, newest first', () => {
    const v1 = bundle('2025-03-12', [
      {
        document: doc(),
        lines: [
          line('work', 'Замена масла и фильтра', 100000, { regulationItemIds: ['oil'], componentId: 'lube' }),
          line('part', 'Масло моторное', 450000, { componentId: 'lube', brand: 'Brand', article: 'A-1', qty: 5, price: 90000 }),
          line('part', 'Фильтр масляный', 80000, { regulationItemIds: ['oil'] }),
          // another node, and a part linked to another item on the same node
          line('part', 'Колодки тормозные', 300000, { componentId: 'brakes' }),
          line('part', 'Фильтр воздушный', 90000, { componentId: 'lube', regulationItemIds: ['air'] }),
        ],
      },
    ], { odometerKm: 293000 });
    const v2 = bundle('2025-10-30', [
      { document: doc(), lines: [line('work', 'Замена масла', 120000, { regulationItemIds: ['oil'] }), line('part', 'Масло моторное', 520000, { componentId: 'lube' })] },
    ]);
    const other = bundle('2025-05-01', [{ document: doc(), lines: [line('work', 'Замена колодок', 150000)] }]);

    const found = installedFor(OIL, [v1, other, v2]);
    expect(found.map((v) => v.date)).toEqual(['2025-10-30', '2025-03-12']);
    // the item's own node counts even when the linked work has none
    expect(found[0]!.parts.map((p) => p.name)).toEqual(['Масло моторное']);
    expect(found[1]).toMatchObject({ km: 293000, worksSum: 100000 });
    expect(found[1]!.parts.map((p) => [p.name, p.brand, p.article])).toEqual([
      ['Масло моторное', 'Brand', 'A-1'],
      ['Фильтр масляный', null, null],
    ]);
  });

  it('leaves out purchases without installation, deleted lines and unconfirmed visits', () => {
    const bought = bundle('2026-01-10', [{ document: doc({ purchaseOnly: true }), lines: [line('part', 'Масло моторное', 500000, { regulationItemIds: ['oil'] })] }]);
    const draft = bundle('2026-02-10', [{ document: doc(), lines: [line('work', 'Замена масла', 1, { regulationItemIds: ['oil'] })] }], { status: 'draft' });
    const deleted = bundle('2026-03-10', [{ document: doc(), lines: [line('work', 'Замена масла', 1, { regulationItemIds: ['oil'], deleted: true })] }]);
    expect(installedFor(OIL, [bought, draft, deleted])).toEqual([]);
  });

  it('a job without priced works has no work sum', () => {
    const self = bundle('2026-04-01', [{ document: doc(), lines: [line('work', 'Замена масла', null, { regulationItemIds: ['oil'] })] }], { kind: 'self' });
    expect(installedFor(OIL, [self])[0]).toMatchObject({ self: true, worksSum: null, parts: [] });
  });
});
