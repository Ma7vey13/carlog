import { describe, expect, it } from 'vitest';
import type { VisitBundle } from './bundle';
import type { CarDocument, LineItem, LineKind, RegulationItem } from './model';
import { regulationById, visitPurpose } from './purpose';

const base = { createdAt: '', updatedAt: '', deleted: false, deviceId: 'd' };

const reg = (id: string, action: RegulationItem['action']): RegulationItem => ({
  ...base,
  id,
  name: id,
  componentId: null,
  action,
  performer: 'service',
  intervalKm: 15000,
  intervalMonths: 12,
  severeIntervalKm: null,
  severeIntervalMonths: null,
  keywords: [],
  note: '',
});

const OIL = reg('oil', 'replace');
const BRAKES = reg('brakes', 'inspect');
const REGULATION = regulationById([OIL, BRAKES]);

let n = 0;
const line = (kind: LineKind, name: string, sum: number, extra: Partial<LineItem> = {}): LineItem => ({
  ...base,
  id: `l${++n}`,
  visitId: 'v',
  documentId: 'doc1',
  n,
  kind,
  rawName: name,
  name,
  qty: 1,
  unit: null,
  price: sum,
  sum,
  brand: null,
  article: null,
  position: { axle: null, side: null },
  customerPart: false,
  componentId: null,
  regulationItemIds: [],
  ...extra,
});

const doc = (id: string, extra: Partial<CarDocument> = {}): CarDocument => ({
  ...base,
  id,
  visitId: 'v',
  type: 'act',
  number: null,
  date: null,
  relatedOrder: null,
  totals: { works: null, parts: null, total: null, discountPercent: null },
  purchaseOnly: false,
  scanIds: [],
  ...extra,
});

const visit = (...documents: Array<{ document: CarDocument; lines: LineItem[] }>): VisitBundle => ({
  visit: { ...base, id: 'v', vehicleId: 'car', date: '2026-01-10', odometerKm: 300000, kind: 'service', shop: { name: null, inn: null, address: null, phone: null }, notes: '', status: 'confirmed' },
  documents,
  mileage: null,
});

describe('ТО or ремонт', () => {
  it('an oil change is ТО, parts included even when they are not linked', () => {
    const work = line('work', 'Замена масла в двигателе', 1000, { regulationItemIds: ['oil'] });
    const oil = line('part', 'Масло моторное 5W-30', 4000);
    const filter = line('part', 'Фильтр масляный', 800, { regulationItemIds: ['oil'] });
    const p = visitPurpose(visit({ document: doc('d1'), lines: [work, oil, filter] }), REGULATION);
    expect(p).toMatchObject({ maintenance: true, repair: false, maintenanceSum: 5800, repairSum: 0, purchaseOnly: false });
    expect(p.byLine.get(oil.id)).toBe('maintenance');
  });

  it('an inspection is ТО, a replacement found on it is ремонт', () => {
    const check = line('work', 'Диагностика ходовой части', 500, { regulationItemIds: ['brakes'] });
    const pads = line('work', 'Замена передних тормозных колодок', 1200, { regulationItemIds: ['brakes'], componentId: 'c-brakes' });
    const padsPart = line('part', 'Колодки тормозные передние', 3000, { regulationItemIds: ['brakes'], componentId: 'c-brakes' });
    const p = visitPurpose(visit({ document: doc('d1'), lines: [check, pads, padsPart] }), REGULATION);
    expect(p.byLine.get(check.id)).toBe('maintenance');
    expect(p.byLine.get(pads.id)).toBe('repair');
    // the part goes with the work on the same node
    expect(p.byLine.get(padsPart.id)).toBe('repair');
    expect(p).toMatchObject({ maintenance: true, repair: true, maintenanceSum: 500, repairSum: 4200 });
  });

  it('a part with works of both kinds takes the purpose of its own node; otherwise it is not told', () => {
    const oilWork = line('work', 'Замена масла', 1000, { regulationItemIds: ['oil'], componentId: 'engine' });
    const pump = line('work', 'Замена помпы', 3000, { componentId: 'cooling' });
    const pumpPart = line('part', 'Помпа', 9000, { componentId: 'cooling' });
    const cleaner = line('material', 'Очиститель', 300);
    const p = visitPurpose(visit({ document: doc('d1'), lines: [oilWork, pump, pumpPart, cleaner] }), REGULATION);
    expect(p.byLine.get(pumpPart.id)).toBe('repair');
    expect(p.byLine.get(cleaner.id)).toBeNull();
    expect(p).toMatchObject({ maintenanceSum: 1000, repairSum: 12000 });
  });

  it('works with no regulation link are ремонт; a purchase without installation is neither', () => {
    expect(visitPurpose(visit({ document: doc('d1'), lines: [line('work', 'Замена лампы', 300)] }), REGULATION)).toMatchObject({ maintenance: false, repair: true });
    const bought = visitPurpose(visit({ document: doc('d1', { purchaseOnly: true }), lines: [line('part', 'Фильтр масляный', 800, { regulationItemIds: ['oil'] })] }), REGULATION);
    expect(bought).toMatchObject({ maintenance: false, repair: false, purchaseOnly: true });
    expect(bought.byLine.size).toBe(0);
  });

  it('ignores deleted regulation items and deleted lines', () => {
    const gone = regulationById([{ ...OIL, deleted: true }]);
    const work = line('work', 'Замена масла', 1000, { regulationItemIds: ['oil'] });
    expect(visitPurpose(visit({ document: doc('d1'), lines: [work] }), gone)).toMatchObject({ maintenance: false, repair: true });
    const deleted = line('work', 'Замена помпы', 3000, { deleted: true });
    expect(visitPurpose(visit({ document: doc('d1'), lines: [work, deleted] }), REGULATION)).toMatchObject({ maintenance: true, repair: false });
  });
});
