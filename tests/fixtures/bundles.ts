// Small builders for visit bundles in unit tests. The shop is fictional.

import type { VisitBundle } from '../../src/core/bundle';
import type { CarDocument, LineItem, LineKind, RegulationItem, Visit } from '../../src/core/model';

const base = { createdAt: '', updatedAt: '', deleted: false, deviceId: 'd' };

export const reg = (id: string, extra: Partial<RegulationItem> = {}): RegulationItem => ({
  ...base,
  id,
  name: id,
  componentId: null,
  action: 'replace',
  performer: 'service',
  intervalKm: 15000,
  intervalMonths: 12,
  severeIntervalKm: null,
  severeIntervalMonths: null,
  keywords: [],
  note: '',
  ...extra,
});

let n = 0;
export const line = (kind: LineKind, name: string, sum: number | null, extra: Partial<LineItem> = {}): LineItem => ({
  ...base,
  id: `l${++n}`,
  visitId: 'v',
  documentId: 'doc',
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

export const doc = (extra: Partial<CarDocument> = {}): CarDocument => ({
  ...base,
  id: `d${++n}`,
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

export const bundle = (date: string, documents: Array<{ document: CarDocument; lines: LineItem[] }>, extra: Partial<Visit> = {}): VisitBundle => ({
  visit: {
    ...base,
    id: `v-${date}-${++n}`,
    vehicleId: 'car',
    date,
    odometerKm: null,
    kind: 'service',
    shop: { name: 'Сервис «Пример»', inn: null, address: null, phone: null },
    notes: '',
    status: 'confirmed',
    ...extra,
  },
  documents,
  mileage: null,
});
