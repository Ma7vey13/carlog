// Self-check (SPEC section 10): what the owner checks without a service, with a period in days.
// "Нужно внимание" stays on the main screen until the item is checked again as "В норме".

import { addDays, daysBetween } from './dates';
import { formatDate } from './format';
import { SEED_TIMESTAMP, seedId } from './ids';
import type { IsoDate, SelfCheckItem, SelfCheckLog } from './model';

const SELF_CHECK_SEED_BASE = 0x3000;

const DEFAULT_ITEMS: ReadonlyArray<Pick<SelfCheckItem, 'name' | 'periodDays' | 'howTo'>> = [
  {
    name: 'Уровень моторного масла (на холодном, на ровном месте)',
    periodDays: 14,
    howTo: 'Машина на ровном месте, двигатель холодный или заглушен минут 10. Достаньте щуп, вытрите, вставьте до упора и достаньте снова: уровень между метками MIN и MAX.',
  },
  {
    name: 'Уровень охлаждающей жидкости в расширительном бачке',
    periodDays: 30,
    howTo: 'Только на холодном двигателе — горячий бачок не открывать. Уровень между отметками MIN и MAX (L и F) на бачке.',
  },
  {
    name: 'Уровень тормозной жидкости',
    periodDays: 30,
    howTo: 'Бачок над главным тормозным цилиндром. Уровень между MIN и MAX. Если заметно упал — проверьте колодки и нет ли подтёков.',
  },
  {
    name: 'Жидкость ГУР',
    periodDays: 30,
    howTo: 'Бачок гидроусилителя руля: уровень по отметкам на бачке или на щупе в крышке (HOT/COLD), на шлангах нет подтёков.',
  },
  { name: 'Жидкость омывателя', periodDays: 14, howTo: 'Долейте, если бачок наполовину пуст. В холода — незамерзающую.' },
  {
    name: 'Давление в шинах, включая запаску',
    periodDays: 30,
    howTo: 'На холодных шинах, манометром. Нормы — на табличке в проёме водительской двери. Не забудьте запаску.',
  },
  {
    name: 'Износ и повреждения шин',
    periodDays: 30,
    howTo: 'Остаток протектора (летние — не меньше 1,6 мм, зимние — 4 мм), порезы и грыжи на боковинах, неравномерный износ.',
  },
  {
    name: 'Световые приборы',
    periodDays: 30,
    howTo: 'Ближний и дальний, габариты, поворотники, аварийка, стоп-сигналы, задний ход, подсветка номера. Стоп-сигналы — с помощником или по отражению в витрине.',
  },
  { name: 'Щётки стеклоочистителя', periodDays: 60, howTo: 'Резинка без трещин, стекло чистится без полос и скрипа.' },
  {
    name: 'Подтёки под машиной после стоянки',
    periodDays: 30,
    howTo: 'Пятна под машиной после ночи: масло (тёмное), антифриз (цветной, сладковатый запах), тормозная жидкость или жидкость ГУР. Капли воды от кондиционера — норма.',
  },
  { name: 'Аккумулятор: клеммы, крепление', periodDays: 90, howTo: 'Клеммы затянуты и без белого налёта, аккумулятор не болтается, корпус без трещин и подтёков.' },
];

export const SEED_SELF_CHECK_ITEMS: SelfCheckItem[] = DEFAULT_ITEMS.map((item, i) => ({
  ...item,
  id: seedId(SELF_CHECK_SEED_BASE + i),
  createdAt: SEED_TIMESTAMP,
  updatedAt: SEED_TIMESTAMP,
  deleted: false,
  deviceId: 'seed',
  order: (i + 1) * 10,
}));

export type SelfCheckState = 'attention' | 'due' | 'ok';

export interface SelfCheckStatus {
  item: SelfCheckItem;
  state: SelfCheckState;
  /** The latest log entry; its result decides "attention". */
  last: SelfCheckLog | null;
  /** Date of the next check; null if never checked. */
  nextDate: IsoDate | null;
  /** Days until the next check (negative: overdue); null if never checked. */
  daysLeft: number | null;
  /** Live log entries, newest first. */
  logs: SelfCheckLog[];
}

const newestFirst = (a: SelfCheckLog, b: SelfCheckLog) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);

export function selfCheckStatus(item: SelfCheckItem, logs: readonly SelfCheckLog[], today: IsoDate): SelfCheckStatus {
  const own = logs.filter((l) => !l.deleted && l.itemId === item.id).sort(newestFirst);
  const last = own[0] ?? null;
  if (!last) return { item, state: 'due', last, nextDate: null, daysLeft: null, logs: own };
  const nextDate = addDays(last.date, item.periodDays);
  const daysLeft = daysBetween(today, nextDate);
  const state: SelfCheckState = last.result === 'attention' ? 'attention' : daysLeft <= 0 ? 'due' : 'ok';
  return { item, state, last, nextDate, daysLeft, logs: own };
}

const ORDER: Record<SelfCheckState, number> = { attention: 0, due: 1, ok: 2 };

/** All live items: "attention" first, then due (never checked first, then most overdue), then ok by next date. */
export function selfCheckAll(items: readonly SelfCheckItem[], logs: readonly SelfCheckLog[], today: IsoDate): SelfCheckStatus[] {
  return items
    .filter((i) => !i.deleted)
    .map((i) => selfCheckStatus(i, logs, today))
    .sort(
      (a, b) =>
        ORDER[a.state] - ORDER[b.state] ||
        (a.daysLeft ?? -Infinity) - (b.daysLeft ?? -Infinity) ||
        a.item.order - b.item.order ||
        a.item.name.localeCompare(b.item.name, 'ru'),
    );
}

/** One line under the item: what is known and when to check next. */
export function selfCheckText(s: SelfCheckStatus): string {
  if (!s.last) return 'ещё не проверяли';
  const lastDate = formatDate(s.last.date);
  if (s.state === 'attention') return `нужно внимание с ${lastDate}${s.last.note ? `: ${s.last.note}` : ''}`;
  if (s.state === 'due') return `пора проверить — последний раз ${lastDate}`;
  return `в норме ${lastDate}, следующая проверка ${formatDate(s.nextDate)}`;
}
