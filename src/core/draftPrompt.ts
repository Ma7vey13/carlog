// Prompt for recognition through any chat AI (SPEC section 6Б) and for /parse-scans (stage 5).
// The field list is generated from draftSchemaV1, so the prompt always matches validation.

import { z } from 'zod';
import { DRAFT_SCHEMA_ID, draftSchemaV1 } from './draftSchema';

type JsonSchema = {
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  description?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  anyOf?: JsonSchema[];
};

function typeLabel(s: JsonSchema): string {
  if (s.const !== undefined) return JSON.stringify(s.const);
  if (s.enum) return s.enum.map((v) => JSON.stringify(v)).join(' | ');
  const variants = s.anyOf ?? [s];
  const types = new Set<string>();
  for (const v of variants) {
    for (const t of Array.isArray(v.type) ? v.type : v.type ? [v.type] : []) types.add(t);
  }
  const names: Record<string, string> = { number: 'число', integer: 'целое число', string: 'текст', null: 'null', object: 'объект', array: 'список', boolean: 'да/нет' };
  return [...types].map((t) => names[t] ?? t).join(' или ');
}

function objectOf(s: JsonSchema): JsonSchema | undefined {
  if (s.properties) return s;
  return s.anyOf?.find((v) => v.properties);
}

/** Flattens the schema into "- path — type: description" lines. */
export function schemaFieldLines(schema: JsonSchema = z.toJSONSchema(draftSchemaV1, { io: 'output' }) as JsonSchema, prefix = ''): string[] {
  const out: string[] = [];
  for (const [key, child] of Object.entries(schema.properties ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    const nested = objectOf(child);
    const desc = child.description ?? nested?.description ?? '';
    if (nested) {
      out.push(`- ${path} — объект${typeLabel(child).includes('null') ? ' или null' : ''}${desc ? `: ${desc}` : ''}`);
      out.push(...schemaFieldLines(nested, path));
    } else if (child.type === 'array' && child.items && objectOf(child.items)) {
      out.push(`- ${path} — список объектов${desc ? `: ${desc}` : ''}`);
      out.push(...schemaFieldLines(objectOf(child.items)!, `${path}[]`));
    } else {
      out.push(`- ${path} — ${typeLabel(child)}${desc ? `: ${desc}` : ''}`);
    }
  }
  return out;
}

/** Short example with a fictional shop (no real details in the public repo). */
export const PROMPT_EXAMPLE = {
  schema: DRAFT_SCHEMA_ID,
  document: {
    type: 'act',
    number: '1',
    date: '2025-07-22',
    relatedOrder: { number: '26548', date: '2025-07-22' },
    shop: { name: 'Автосервис «Пример»', inn: null, address: null, phone: null },
    vehicle: { model: 'Hyundai Santa Fe New', plate: null, vin: null },
    odometerKm: 298000,
    totals: { works: 5600, parts: 21700, total: 27300, discountPercent: null },
    pages: 1,
  },
  lines: [
    { n: 1, kind: 'work', name: 'ЗАМЕНА (С/У) ПЕРЕД. ТОРМОЗНОГО ДИСКА (Джип/М-вен)', qty: 2, unit: null, price: 2800, sum: 5600, brand: null, article: null },
    { n: 2, kind: 'part', name: 'Диски тормозные перед.(OEM). SFN', qty: 2, unit: null, price: 7500, sum: 15000, brand: 'SFN', article: null },
    { n: 6, kind: 'material', name: 'Расходные материалы', qty: 2, unit: null, price: 200, sum: 400, brand: null, article: null },
  ],
  notes: [],
};

export const FORMAT_RULES = [
  'Суммы — в рублях числом (5600 или 5600.5), без пробелов, кавычек и знака ₽.',
  'Даты — YYYY-MM-DD. Год из двух цифр (22.07.25) раскрывай как 20XX (2025-07-22).',
  'Нечитаемое или отсутствующее поле — null, а не догадка. Сомнения — в notes с указанием номера строки.',
  'Строки — все, в порядке документа, с исходной нумерацией n. Названия — как в документе, без исправлений опечаток.',
  'Работы — kind "work", запчасти — "part", строки «Расходные материалы» — "material".',
  'Скидку вида «в т.ч. скидка 10%» запиши в totals.discountPercent; суммы не пересчитывай.',
  'У акта выполненных работ «к заказу-наряду № … от …» — это relatedOrder; дата акта — document.date.',
  'Узел автомобиля и пункты регламента не назначай: это сделает приложение.',
  'Госномер и VIN можно не указывать (null).',
];

/** The prompt the owner copies into a chat together with the scan. */
export function buildChatPrompt(): string {
  return [
    'Распознай прикреплённый скан документа автосервиса (заказ-наряд, акт выполненных работ, товарная накладная или чек). Это один документ, возможно на нескольких страницах.',
    '',
    `Ответь ОДНИМ блоком \`\`\`json без пояснений до и после. Формат — ${DRAFT_SCHEMA_ID}.`,
    '',
    'Правила:',
    ...FORMAT_RULES.map((r) => `- ${r}`),
    '',
    'Поля:',
    ...schemaFieldLines(),
    '',
    'Пример (строки 3–5 опущены ради краткости; в ответе нужны все строки):',
    '```json',
    JSON.stringify(PROMPT_EXAMPLE, null, 2),
    '```',
  ].join('\n');
}
