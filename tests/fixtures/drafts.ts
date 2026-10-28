// Synthetic carlog.draft.v1 drafts modelled on test pages 1–6 (SPEC section 11): the same
// structure, line names, amounts and special cases, but a fictional shop and no personal data.
// Recognition of the real scans is compared against the reference table in stage 5.

import type { DraftV1 } from '../../src/core/draftSchema';

const SHOP = { name: 'Автосервис «Пример»', inn: '7700000000', address: null, phone: null };
const CAR = { model: 'Hyundai Santa Fe New', plate: null, vin: null };

type Line = DraftV1['lines'][number];
const L = (n: number, kind: Line['kind'], name: string, qty: number, price: number, sum: number, extra: Partial<Line> = {}): Line => ({
  n,
  kind,
  name,
  qty,
  unit: null,
  price,
  sum,
  brand: null,
  article: null,
  ...extra,
});

/** Page 1: work order №26999, oil change work but no engine oil among parts → "customer part?" check. */
export const PAGE1_WORK_ORDER: DraftV1 = {
  schema: 'carlog.draft.v1',
  document: {
    type: 'work_order',
    number: '26999',
    date: '2025-10-30',
    relatedOrder: null,
    shop: SHOP,
    vehicle: CAR,
    odometerKm: 303700,
    totals: { works: 14500, parts: 78600, total: 93100, discountPercent: null },
    pages: 1,
  },
  lines: [
    L(1, 'work', 'ЗАМЕНА МАСЛА И ФИЛЬТРА В ДВИГАТЕЛЕ (джип/минивэн)', 1, 1000, 1000),
    L(2, 'work', 'ЗАМЕНА СТУПИЦЫ ЗАД. (SFN/F/L/Sorento R)', 1, 4200, 4200),
    L(3, 'work', 'ЗАМЕНА МАСЛА В АКПП (аппаратная)', 1, 3000, 3000),
    L(4, 'work', 'ЗАМЕНА ПРОМЕЖ.ВАЛА И ПРИВОДА', 1, 5800, 5800),
    L(5, 'work', 'СНЯТИЕ/УСТАНОВКА ЗАЩИТЫ КАРТЕРА ДВИГАТЕЛЯ', 1, 500, 500),
    L(6, 'part', 'Фильтр масляннный SFN', 1, 700, 700, { brand: 'SFN' }),
    L(7, 'part', 'Ступица колеса SFN', 1, 11000, 11000, { brand: 'SFN' }),
    L(8, 'part', 'Вал промежуточный привода 2,7 SFN', 1, 27000, 27000, { brand: 'SFN' }),
    L(9, 'part', 'ШРУС перед. внутр.(прав.) 2,7 SFN', 1, 23000, 23000, { brand: 'SFN' }),
    L(10, 'part', 'Масло АКПП TOTACHI ATF SP-III', 15, 1100, 16500, { brand: 'TOTACHI' }),
    L(11, 'material', 'Расходные материалы', 2, 200, 400),
  ],
  notes: [],
};

/** Page 2: act №1 to work order №26548 (the example from SPEC section 5). */
export const PAGE2_ACT: DraftV1 = {
  schema: 'carlog.draft.v1',
  document: {
    type: 'act',
    number: '1',
    date: '2025-07-22',
    relatedOrder: { number: '26548', date: '2025-07-22' },
    shop: SHOP,
    vehicle: CAR,
    odometerKm: 298000,
    totals: { works: 5600, parts: 21700, total: 27300, discountPercent: null },
    pages: 1,
  },
  lines: [
    L(1, 'work', 'ЗАМЕНА (С/У) ПЕРЕД. ТОРМОЗНОГО ДИСКА (Джип/М-вен)', 2, 2800, 5600),
    L(2, 'part', 'Диски тормозные перед.(OEM). SFN', 2, 7500, 15000, { brand: 'SFN' }),
    L(3, 'part', 'Колодки тормозные перед.(OEM) SFN', 1, 4600, 4600, { brand: 'SFN' }),
    L(4, 'part', 'Направляющая нижняя пер.суппорта SFN', 1, 600, 600, { brand: 'SFN' }),
    L(5, 'part', 'Пыльник направляющей суппорта переднего SFN', 2, 550, 1100, { brand: 'SFN' }),
    L(6, 'material', 'Расходные материалы', 2, 200, 400),
  ],
  notes: [],
};

/** Page 3: act to work order №26007; "Супорт" must be normalised to "Суппорт". */
export const PAGE3_ACT: DraftV1 = {
  schema: 'carlog.draft.v1',
  document: {
    type: 'act',
    number: '1',
    date: '2025-04-11',
    relatedOrder: { number: '26007', date: '2025-04-11' },
    shop: SHOP,
    vehicle: CAR,
    odometerKm: 295000,
    totals: { works: 7900, parts: 23650, total: 31550, discountPercent: null },
    pages: 1,
  },
  lines: [
    L(1, 'work', 'ЗАМЕНА ВОЗДУШНОГО ФИЛЬТРА', 1, 400, 400),
    L(2, 'work', 'ЗАМЕНА МАСЛА И ФИЛЬТРА В ДВИГАТЕЛЕ', 1, 1000, 1000),
    L(3, 'work', 'ЗАМЕНА МАСЛА В РАЗДАТОЧНОЙ КОРОБКЕ', 1, 1000, 1000),
    L(4, 'work', 'ЗАМЕНА МАСЛА В РЕДУКТОРЕ ЗАДНЕМ', 1, 1000, 1000),
    L(5, 'work', 'ЗАМЕНА ЗАДНИХ ТОРМОЗНЫХ КОЛОДОК (диск-джип)', 1, 2000, 2000),
    L(6, 'work', 'ЗАМЕНА ТОРМОЗНОГО СУППОРТА С/У', 1, 1500, 1500),
    L(7, 'work', 'СНЯТИЕ/УСТАНОВКА ЗАЩИТЫ КАРТЕРА ДВИГАТЕЛЯ', 1, 500, 500),
    L(8, 'work', 'ЗАМЕНА САЛОННОГО ФИЛЬТРА', 1, 500, 500),
    L(9, 'part', 'Фильтр воздушный OEM SFN', 1, 1000, 1000, { brand: 'SFN' }),
    L(10, 'part', 'Фильтр масляннный SFN', 1, 700, 700, { brand: 'SFN' }),
    L(11, 'part', 'Колодки тормозные зад.(OEM) SFN', 1, 2900, 2900, { brand: 'SFN' }),
    L(12, 'part', 'Супорт тормозной зад.(лев.) SFN', 1, 10500, 10500, { brand: 'SFN' }),
    L(13, 'part', 'Шайба медная тормозного шланга', 2, 100, 200),
    L(14, 'part', 'Масло мот.Micking EVO1 5W30 SN/CF C2/C3', 4.5, 1100, 4950, { brand: 'Micking' }),
    L(15, 'part', 'Масло трансм. синт. Micking Gear Oil 75W90 GL5', 2, 1100, 2200, { brand: 'Micking' }),
    L(16, 'material', 'Расходные материалы', 1, 200, 200),
    L(17, 'part', 'Фильтр салонный SFN.', 1, 1000, 1000, { brand: 'SFN' }),
  ],
  notes: [],
};

/** Page 4: act to work order №25857 (stage 2 acceptance visit). */
export const PAGE4_ACT: DraftV1 = {
  schema: 'carlog.draft.v1',
  document: {
    type: 'act',
    number: '1',
    date: '2025-03-12',
    relatedOrder: { number: '25857', date: '2025-03-12' },
    shop: SHOP,
    vehicle: CAR,
    odometerKm: 293000,
    totals: { works: 4700, parts: 18500, total: 23200, discountPercent: null },
    pages: 1,
  },
  lines: [
    L(1, 'work', 'ЗАМЕНА ПЕРЕДНИХ ТОРМОЗНЫХ КОЛОДОК (джип)', 1, 2000, 2000),
    L(2, 'work', 'ЗАМЕНА ТОРМОЗНОГО СУППОРТА С/У', 1, 2000, 2000),
    L(3, 'work', 'ПРОФИЛАКТИКА ТОРМОЗНОГО ДИСКА', 2, 350, 700),
    L(4, 'part', 'Колодки тормозные перед.(OEM) SFN', 1, 3600, 3600, { brand: 'SFN' }),
    L(5, 'part', 'Супорт тормозной перед.(лев.) SFN', 1, 14500, 14500, { brand: 'SFN' }),
    L(6, 'part', 'Шайба медная тормозного шланга', 2, 100, 200),
    L(7, 'material', 'Расходные материалы', 1, 200, 200),
  ],
  notes: [],
};

/**
 * Page 5: act dated 06.10.2021 to work order №19963 of 19.09.2021 — the visit is dated by the act.
 * Works carry "в т.ч. скидка 10,00 %": the discount is already inside the sums (62 190 is final).
 */
export const PAGE5_ACT: DraftV1 = {
  schema: 'carlog.draft.v1',
  document: {
    type: 'act',
    number: '1',
    date: '2021-10-06',
    relatedOrder: { number: '19963', date: '2021-09-19' },
    shop: SHOP,
    vehicle: CAR,
    odometerKm: 250000,
    totals: { works: 62190, parts: 63290, total: 125480, discountPercent: 10 },
    pages: 1,
  },
  lines: [
    L(1, 'work', 'КАП.РЕМОНТ ДВИГАТЕЛЯ V-6 (с/у, переборка)', 1, 58500, 58500),
    L(2, 'work', 'ШЛИФОВКА ПЛОСКОСТИ ГБЦ И ОПРЕССОВКА', 1, 3690, 3690),
    L(3, 'part', 'Гидронатяжитель ремня ГРМ SFN 2,7', 1, 3800, 3800),
    L(4, 'part', 'Гидронатяжитель цепи р\\вала SFN 2,7', 2, 3600, 7200),
    L(5, 'part', 'Комплект прокладок SFN 2,7', 1, 16300, 16300),
    L(6, 'part', 'Насос масла SFN 2,7', 1, 6800, 6800),
    L(7, 'part', 'Фильтр масляннный SF F/L', 1, 450, 450),
    L(8, 'part', 'Цепь распедвала  SFN 2,7', 2, 3200, 6400),
    L(9, 'part', 'Шестерня кол.вала SFN 2,7', 1, 1000, 1000),
    L(10, 'part', 'Шпонка кол.вала SFN 2,7', 1, 100, 100),
    L(11, 'part', 'Катушка зажигания. SFN (2-х контакт.)', 3, 2800, 8400),
    L(12, 'part', 'Свечи зажигания платин. SFN', 6, 850, 5100),
    L(13, 'part', 'Гайка выпуск. коллектора SFN', 14, 125, 1750),
    L(14, 'part', 'Гайка приемной трубы  SFN', 2, 170, 340),
    L(15, 'part', 'Шпилька выпуск. коллектора', 1, 150, 150),
    L(16, 'part', 'Масло мот. Eneos Premium TOURING SN 5W-30', 5, 580, 2900),
    L(17, 'part', 'Антифриз TOTACHI LLC GREEN G-11', 8, 250, 2000),
    L(18, 'material', 'Расходные материалы', 4, 150, 600),
  ],
  notes: [],
};

/**
 * Page 6: goods invoice №20052 of 30.09.2021, scanned rotated by 90°, no mileage.
 * Its date lies between work order №19963 (19.09.2021) and its act (06.10.2021):
 * the app must offer to attach it to that visit.
 */
export const PAGE6_INVOICE: DraftV1 = {
  schema: 'carlog.draft.v1',
  document: {
    type: 'invoice',
    number: '20052',
    date: '2021-09-30',
    relatedOrder: null,
    shop: SHOP,
    vehicle: null,
    odometerKm: null,
    totals: { works: null, parts: 148500, total: 148500, discountPercent: null },
    pages: 1,
  },
  lines: [L(1, 'part', 'Блок цилиндров в сборе G6EAHR90307', 1, 148500, 148500, { article: 'G6EAHR90307' })],
  notes: [],
};

export const ALL_PAGES = [PAGE1_WORK_ORDER, PAGE2_ACT, PAGE3_ACT, PAGE4_ACT, PAGE5_ACT, PAGE6_INVOICE] as const;

/** Reference table of SPEC section 11 (works/parts: line count / rubles). */
export const REFERENCE = [
  { page: 1, doc: 'Заказ-наряд №26999', type: 'work_order', number: '26999', order: null, date: '2025-10-30', km: 303700, works: [5, 14500], parts: [6, 78600], total: 93100 },
  { page: 2, doc: 'Акт к з/н №26548 от 22.07.2025', type: 'act', number: '1', order: { number: '26548', date: '2025-07-22' }, date: '2025-07-22', km: 298000, works: [1, 5600], parts: [5, 21700], total: 27300 },
  { page: 3, doc: 'Акт к з/н №26007 от 11.04.2025', type: 'act', number: '1', order: { number: '26007', date: '2025-04-11' }, date: '2025-04-11', km: 295000, works: [8, 7900], parts: [9, 23650], total: 31550 },
  { page: 4, doc: 'Акт к з/н №25857 от 12.03.2025', type: 'act', number: '1', order: { number: '25857', date: '2025-03-12' }, date: '2025-03-12', km: 293000, works: [3, 4700], parts: [4, 18500], total: 23200 },
  { page: 5, doc: 'Акт к з/н №19963 от 19.09.2021', type: 'act', number: '1', order: { number: '19963', date: '2021-09-19' }, date: '2021-10-06', km: 250000, works: [2, 62190], parts: [16, 63290], total: 125480 },
  { page: 6, doc: 'Товарная накладная №20052', type: 'invoice', number: '20052', order: null, date: '2021-09-30', km: null, works: [0, 0], parts: [1, 148500], total: 148500 },
] as const;
