// Synthetic visits modelled on test pages 2 and 4 (SPEC section 11): same structure, names
// and amounts, but a fictional shop and no personal data. Used by unit and e2e tests.

import type { DocumentType, LineKind } from '../../src/core/model';

export interface FixtureLine {
  kind: LineKind;
  name: string;
  qty: string;
  price: string;
  sum: string;
}

export interface FixtureVisit {
  date: string;
  odometer: string;
  shopName: string;
  document: {
    type: DocumentType;
    number: string;
    date: string;
    relatedNumber: string;
    relatedDate: string;
    totalWorks: string;
    totalParts: string;
    totalAll: string;
  };
  lines: FixtureLine[];
}

export const FICTIONAL_SHOP = 'Автосервис «Пример»';

/** Like page 4: act to work order №25857, 12.03.2025, 293 000 km. Works 4 700, parts 18 500, total 23 200. */
export const BRAKES_FRONT_2025: FixtureVisit = {
  date: '2025-03-12',
  odometer: '293000',
  shopName: FICTIONAL_SHOP,
  document: {
    type: 'act',
    number: '1',
    date: '2025-03-12',
    relatedNumber: '25857',
    relatedDate: '2025-03-12',
    totalWorks: '4700',
    totalParts: '18500',
    totalAll: '23200',
  },
  lines: [
    { kind: 'work', name: 'ЗАМЕНА ПЕРЕДНИХ ТОРМОЗНЫХ КОЛОДОК (джип)', qty: '1', price: '2000', sum: '2000' },
    { kind: 'work', name: 'ЗАМЕНА ТОРМОЗНОГО СУППОРТА С/У', qty: '1', price: '2000', sum: '2000' },
    { kind: 'work', name: 'ПРОФИЛАКТИКА ТОРМОЗНОГО ДИСКА', qty: '2', price: '350', sum: '700' },
    { kind: 'part', name: 'Колодки тормозные перед.(OEM) SFN', qty: '1', price: '3600', sum: '3600' },
    { kind: 'part', name: 'Супорт тормозной перед.(лев.) SFN', qty: '1', price: '14500', sum: '14500' },
    { kind: 'part', name: 'Шайба медная тормозного шланга', qty: '2', price: '100', sum: '200' },
    { kind: 'material', name: 'Расходные материалы', qty: '1', price: '200', sum: '200' },
  ],
};

/** Like page 2: act to work order №26548, 22.07.2025, 298 000 km. Works 5 600, parts 21 700, total 27 300. */
export const DISCS_FRONT_2025: FixtureVisit = {
  date: '2025-07-22',
  odometer: '298000',
  shopName: FICTIONAL_SHOP,
  document: {
    type: 'act',
    number: '1',
    date: '2025-07-22',
    relatedNumber: '26548',
    relatedDate: '2025-07-22',
    totalWorks: '5600',
    totalParts: '21700',
    totalAll: '27300',
  },
  lines: [
    { kind: 'work', name: 'ЗАМЕНА (С/У) ПЕРЕД. ТОРМОЗНОГО ДИСКА (Джип/М-вен)', qty: '2', price: '2800', sum: '5600' },
    { kind: 'part', name: 'Диски тормозные перед.(OEM). SFN', qty: '2', price: '7500', sum: '15000' },
    { kind: 'part', name: 'Колодки тормозные перед.(OEM) SFN', qty: '1', price: '4600', sum: '4600' },
    { kind: 'part', name: 'Направляющая нижняя пер.суппорта SFN', qty: '1', price: '600', sum: '600' },
    { kind: 'part', name: 'Пыльник направляющей суппорта переднего SFN', qty: '2', price: '550', sum: '1100' },
    { kind: 'material', name: 'Расходные материалы', qty: '2', price: '200', sum: '400' },
  ],
};

/** Like page 1 (work order, engine oil change without engine oil among the parts). */
export const ORDER_OIL_2025: FixtureVisit = {
  date: '2025-10-30',
  odometer: '303700',
  shopName: FICTIONAL_SHOP,
  document: {
    type: 'work_order',
    number: '26999',
    date: '2025-10-30',
    relatedNumber: '',
    relatedDate: '',
    totalWorks: '14500',
    totalParts: '78600',
    totalAll: '93100',
  },
  lines: [
    { kind: 'work', name: 'ЗАМЕНА МАСЛА И ФИЛЬТРА В ДВИГАТЕЛЕ (джип/минивэн)', qty: '1', price: '1000', sum: '1000' },
    { kind: 'work', name: 'ЗАМЕНА СТУПИЦЫ ЗАД. (SFN/F/L/Sorento R)', qty: '1', price: '4200', sum: '4200' },
    { kind: 'work', name: 'ЗАМЕНА МАСЛА В АКПП (аппаратная)', qty: '1', price: '3000', sum: '3000' },
    { kind: 'work', name: 'ЗАМЕНА ПРОМЕЖ.ВАЛА И ПРИВОДА', qty: '1', price: '5800', sum: '5800' },
    { kind: 'work', name: 'СНЯТИЕ/УСТАНОВКА ЗАЩИТЫ КАРТЕРА ДВИГАТЕЛЯ', qty: '1', price: '500', sum: '500' },
    { kind: 'part', name: 'Фильтр масляннный SFN', qty: '1', price: '700', sum: '700' },
    { kind: 'part', name: 'Ступица колеса SFN', qty: '1', price: '11000', sum: '11000' },
    { kind: 'part', name: 'Вал промежуточный привода 2,7 SFN', qty: '1', price: '27000', sum: '27000' },
    { kind: 'part', name: 'ШРУС перед. внутр.(прав.) 2,7 SFN', qty: '1', price: '23000', sum: '23000' },
    { kind: 'part', name: 'Масло АКПП TOTACHI ATF SP-III', qty: '15', price: '1100', sum: '16500' },
    { kind: 'material', name: 'Расходные материалы', qty: '2', price: '200', sum: '400' },
  ],
};
