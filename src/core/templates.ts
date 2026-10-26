// Quick templates for manual entry (SPEC section 6В). Built in; the owner edits lines after inserting.

import type { LineKind } from './model';

export interface TemplateLine {
  kind: LineKind;
  name: string;
  qty?: number;
}

export interface VisitTemplate {
  id: string;
  title: string;
  lines: TemplateLine[];
}

export const VISIT_TEMPLATES: readonly VisitTemplate[] = [
  {
    id: 'engine-oil',
    title: 'ТО двигателя',
    lines: [
      { kind: 'work', name: 'Замена масла и фильтра в двигателе', qty: 1 },
      { kind: 'part', name: 'Масло моторное' },
      { kind: 'part', name: 'Фильтр масляный', qty: 1 },
    ],
  },
  {
    id: 'front-brakes',
    title: 'Тормоза передние',
    lines: [
      { kind: 'work', name: 'Замена передних тормозных колодок', qty: 1 },
      { kind: 'part', name: 'Колодки тормозные передние', qty: 1 },
    ],
  },
  {
    id: 'rear-brakes',
    title: 'Тормоза задние',
    lines: [
      { kind: 'work', name: 'Замена задних тормозных колодок', qty: 1 },
      { kind: 'part', name: 'Колодки тормозные задние', qty: 1 },
    ],
  },
  {
    id: 'air-filter',
    title: 'Воздушный фильтр',
    lines: [
      { kind: 'work', name: 'Замена воздушного фильтра', qty: 1 },
      { kind: 'part', name: 'Фильтр воздушный', qty: 1 },
    ],
  },
  {
    id: 'cabin-filter',
    title: 'Салонный фильтр',
    lines: [
      { kind: 'work', name: 'Замена салонного фильтра', qty: 1 },
      { kind: 'part', name: 'Фильтр салонный', qty: 1 },
    ],
  },
  {
    id: 'atf',
    title: 'Масло АКПП',
    lines: [
      { kind: 'work', name: 'Замена масла в АКПП', qty: 1 },
      { kind: 'part', name: 'Масло АКПП' },
    ],
  },
];
