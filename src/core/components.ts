// Starting component tree (SPEC section 4) and keyword-based component suggestions.
// The list is editable in the app; built-in entries have deterministic ids (see core/ids.ts).

import { seedId } from './ids';
import { detectPosition, matchKey } from './normalize';

const COMPONENT_SEED_BASE = 0x1000;

export const START_COMPONENT_NAMES = [
  'Двигатель',
  'Смазка двигателя',
  'ГРМ и приводные ремни',
  'Охлаждение',
  'Зажигание',
  'Топливная система',
  'Впуск и воздушный фильтр',
  'Выпуск',
  'АКПП',
  'Раздаточная коробка',
  'Задний редуктор',
  'Приводы, валы, ШРУСы',
  'Ступицы и подшипники',
  'Подвеска передняя',
  'Подвеска задняя',
  'Рулевое управление',
  'Тормоза передние',
  'Тормоза задние',
  'Тормозная жидкость',
  'Электрика и АКБ',
  'Климат и салонный фильтр',
  'Кузов',
  'Шины и колёса',
  'Прочее',
] as const;

export type StartComponentName = (typeof START_COMPONENT_NAMES)[number];

export const START_COMPONENTS: ReadonlyArray<{ id: string; name: StartComponentName; order: number }> =
  START_COMPONENT_NAMES.map((name, i) => ({ id: seedId(COMPONENT_SEED_BASE + i), name, order: (i + 1) * 10 }));

export function startComponentId(name: StartComponentName): string {
  return START_COMPONENTS.find((c) => c.name === name)!.id;
}

type Rule = { test: RegExp; component: StartComponentName | ((axle: 'front' | 'rear' | null) => StartComponentName | null) };

const byAxle =
  (front: StartComponentName, rear: StartComponentName) =>
  (axle: 'front' | 'rear' | null): StartComponentName | null =>
    axle === 'front' ? front : axle === 'rear' ? rear : null;

// Ordered: the first matching rule wins. Patterns run on `matchKey` text (lower case, ё → е, no punctuation).
const RULES: Rule[] = [
  { test: /тормозн\S* жидк|жидкост\S* тормоз|dot ?4/, component: 'Тормозная жидкость' },
  { test: /ступиц|подшипник/, component: 'Ступицы и подшипники' },
  { test: /шрус|привод|промеж\S* вал|вал промеж|кардан|полуос/, component: 'Приводы, валы, ШРУСы' },
  { test: /колодк|тормоз|суппорт/, component: byAxle('Тормоза передние', 'Тормоза задние') },
  { test: /акпп|atf/, component: 'АКПП' },
  { test: /раздаточн/, component: 'Раздаточная коробка' },
  { test: /редуктор/, component: 'Задний редуктор' },
  { test: /масл\S*( \S+){0,4} двигат|масло мот|мотор\S* масл|фильтр масл|масл\S* фильтр|насос масл/, component: 'Смазка двигателя' },
  { test: /воздушн\S* фильтр|фильтр воздушн|дроссел/, component: 'Впуск и воздушный фильтр' },
  { test: /салонн|кондиционер|климат|отопител/, component: 'Климат и салонный фильтр' },
  { test: /свеч|катушк|зажиган/, component: 'Зажигание' },
  { test: /антифриз|охлажд|радиатор|помп|термостат/, component: 'Охлаждение' },
  // "распедвал" is a real misspelling seen in service documents.
  { test: /грм|распредвал|распедвал|цеп[ьи]|натяжител|ремн|ремень|кол вала|коленвал/, component: 'ГРМ и приводные ремни' },
  { test: /выпуск|приемн\S* труб|глушител|катализатор/, component: 'Выпуск' },
  { test: /топлив|бензонасос|форсунк/, component: 'Топливная система' },
  { test: /рулев|гур|наконечник|рейк/, component: 'Рулевое управление' },
  { test: /амортизатор|рычаг|стойк|сайлентблок|шаров|пружин|стабилизатор|подвеск/, component: byAxle('Подвеска передняя', 'Подвеска задняя') },
  { test: /акб|аккумулятор|генератор|стартер|ламп|предохранител|проводк/, component: 'Электрика и АКБ' },
  { test: /шин|колес|диск\S* колес|балансир|шиномонтаж/, component: 'Шины и колёса' },
  { test: /защит\S* картер|бампер|кузов|стекл|зеркал/, component: 'Кузов' },
  { test: /двигател|гбц|блок цилиндр|прокладок|поршн|клапан|шлифовк/, component: 'Двигатель' },
];

/**
 * Suggests a starting component for a line name, or null when unsure.
 * Brake and suspension parts need front/rear in the name; otherwise there is no guess.
 *   "Колодки тормозные перед.(OEM) SFN" → Тормоза передние
 *   "ЗАМЕНА МАСЛА И ФИЛЬТРА В ДВИГАТЕЛЕ" → Смазка двигателя
 */
export function suggestComponentName(name: string): StartComponentName | null {
  const key = matchKey(name);
  if (!key) return null;
  const { axle } = detectPosition(name);
  for (const rule of RULES) {
    if (rule.test.test(key)) {
      return typeof rule.component === 'function' ? rule.component(axle) : rule.component;
    }
  }
  return null;
}

export function suggestComponentId(name: string): string | null {
  const suggested = suggestComponentName(name);
  return suggested ? startComponentId(suggested) : null;
}
