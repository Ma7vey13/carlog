// Recognition draft format carlog.draft.v1 (SPEC section 5): the only contract between any
// recogniser (Claude Code, a chat AI, a person) and the app. One JSON = one document.
// The chat prompt's field list is generated from this schema, so the two never drift apart.

import { z } from 'zod';
import { isIsoDate } from './dates';

export const DRAFT_SCHEMA_ID = 'carlog.draft.v1';

// --- Lenient scalar parsers ----------------------------------------------------------------
// Chats sometimes return "5 600,00" or "22.07.25" despite the rules. Such values are converted
// silently; anything that cannot be converted is reported as an error.

const NBSP_RE = /[\s  ]/g;

function toNumberish(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  const s = v.replace(NBSP_RE, '').replace(/(₽|руб\.?|р\.)$/i, '').replace(',', '.');
  if (s === '') return null;
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : v;
}

function toIsoDateish(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  const s = v.trim();
  if (s === '') return null;
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const year = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
    return `${year}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  }
  return s;
}

function toText(v: unknown): unknown {
  if (typeof v === 'number') return String(v);
  if (typeof v !== 'string') return v;
  const s = v.trim();
  return s === '' ? null : s;
}

const money = (description: string) => z.preprocess(toNumberish, z.number().nullable()).describe(description);
const count = (description: string) => z.preprocess(toNumberish, z.number().nonnegative().nullable()).describe(description);
const km = (description: string) => z.preprocess(toNumberish, z.number().int().nonnegative().nullable()).describe(description);
const text = (description: string) => z.preprocess(toText, z.string().nullable()).describe(description);
const isoDate = (description: string) =>
  z
    .preprocess(toIsoDateish, z.string().refine(isIsoDate, { message: 'bad_date' }).nullable())
    .describe(`${description} (YYYY-MM-DD)`);

// --- Schema --------------------------------------------------------------------------------

export const DOCUMENT_TYPES = ['work_order', 'act', 'invoice', 'receipt', 'other'] as const;
export const LINE_KINDS = ['work', 'part', 'material'] as const;

export const draftLineSchema = z.object({
  n: z.preprocess(toNumberish, z.number().int().positive()).describe('номер строки, как в документе'),
  kind: z.enum(LINE_KINDS).describe('work — работа, part — запчасть, material — расходные материалы'),
  name: z.string().trim().min(1).describe('название как в документе, без исправлений'),
  qty: count('количество'),
  unit: text('единица измерения, если указана'),
  price: money('цена за единицу, рубли'),
  sum: money('сумма строки, рубли'),
  brand: text('бренд или производитель, если виден в названии'),
  article: text('артикул, если указан'),
  hint: text('необязательная подсказка распознавателя').optional(),
});

export const draftSchemaV1 = z.object({
  schema: z.literal(DRAFT_SCHEMA_ID).describe(`всегда "${DRAFT_SCHEMA_ID}"`),
  document: z.object({
    type: z.enum(DOCUMENT_TYPES).describe('work_order — заказ-наряд, act — акт выполненных работ, invoice — товарная накладная (ТОРГ-12), receipt — чек, other — другое'),
    number: text('номер документа, как напечатан'),
    date: isoDate('дата документа'),
    relatedOrder: z
      .object({
        number: text('номер заказ-наряда'),
        date: isoDate('дата заказ-наряда'),
      })
      .nullable()
      .describe('заказ-наряд, к которому относится документ («к заказу-наряду № … от …»); null, если ссылки нет'),
    shop: z
      .object({
        name: text('название сервиса'),
        inn: text('ИНН'),
        address: text('адрес'),
        phone: text('телефон'),
      })
      .nullable()
      .describe('сервис или продавец'),
    vehicle: z
      .object({
        model: text('марка и модель'),
        plate: text('госномер — можно null'),
        vin: text('VIN — можно null'),
      })
      .nullable()
      .describe('автомобиль'),
    odometerKm: km('пробег, км; null, если в документе нет'),
    totals: z
      .object({
        works: money('итог по работам'),
        parts: money('итог по запчастям, включая расходные материалы'),
        total: money('итог «Всего»'),
        discountPercent: count('скидка в процентах, если указана («в т.ч. скидка 10%»)'),
      })
      .describe('итоги, как напечатаны в документе'),
    pages: z.preprocess(toNumberish, z.number().int().positive().nullable()).describe('сколько страниц у документа'),
  }),
  lines: z.array(draftLineSchema).min(1).describe('все строки документа по порядку'),
  notes: z.array(z.string()).default([]).describe('сомнения распознавателя, с указанием строки'),
});

export type DraftV1 = z.output<typeof draftSchemaV1>;
export type DraftLineV1 = z.output<typeof draftLineSchema>;

// --- Russian error messages ----------------------------------------------------------------

/** Field names: [nominative, genitive] — "сумма — не число", "нет суммы". */
const FIELD_NAMES: Record<string, [string, string]> = {
  schema: ['поле schema', 'поля schema'],
  document: ['раздел document', 'раздела document'],
  type: ['тип документа', 'типа документа'],
  number: ['номер', 'номера'],
  date: ['дата', 'даты'],
  relatedOrder: ['связанный заказ-наряд', 'связанного заказ-наряда'],
  shop: ['сервис', 'сервиса'],
  name: ['название', 'названия'],
  inn: ['ИНН', 'ИНН'],
  address: ['адрес', 'адреса'],
  phone: ['телефон', 'телефона'],
  vehicle: ['автомобиль', 'автомобиля'],
  model: ['модель', 'модели'],
  plate: ['госномер', 'госномера'],
  vin: ['VIN', 'VIN'],
  odometerKm: ['пробег', 'пробега'],
  totals: ['итоги', 'итогов'],
  works: ['итог по работам', 'итога по работам'],
  parts: ['итог по запчастям', 'итога по запчастям'],
  total: ['итог «всего»', 'итога «всего»'],
  discountPercent: ['скидка', 'скидки'],
  pages: ['число страниц', 'числа страниц'],
  lines: ['строки', 'строк'],
  notes: ['заметки', 'заметок'],
  n: ['номер строки', 'номера строки'],
  kind: ['вид строки', 'вида строки'],
  qty: ['количество', 'количества'],
  unit: ['единица', 'единицы'],
  price: ['цена', 'цены'],
  sum: ['сумма', 'суммы'],
  brand: ['бренд', 'бренда'],
  article: ['артикул', 'артикула'],
  hint: ['подсказка', 'подсказки'],
};

const EXPECTED: Record<string, string> = {
  number: 'должно быть числом',
  string: 'должно быть текстом',
  object: 'должно быть объектом { … }',
  array: 'должно быть списком [ … ]',
};

function where(path: PropertyKey[], data: unknown): string {
  if (path[0] === 'lines' && typeof path[1] === 'number') {
    const line = Array.isArray((data as { lines?: unknown })?.lines) ? (data as { lines: unknown[] }).lines[path[1]] : undefined;
    const n = typeof (line as { n?: unknown })?.n === 'number' ? (line as { n: number }).n : path[1] + 1;
    return `Строка ${n}`;
  }
  if (path[0] === 'document') return 'Документ';
  return 'Черновик';
}

function fieldKey(path: PropertyKey[]): string {
  for (let i = path.length - 1; i >= 0; i--) if (typeof path[i] === 'string') return path[i] as string;
  return '';
}

/** One readable Russian sentence per problem: "Строка 4: нет суммы (если не читается — null)". */
export function describeIssues(issues: readonly z.core.$ZodIssue[], data: unknown): string[] {
  return issues.map((issue) => {
    const prefix = where(issue.path, data);
    const key = fieldKey(issue.path);
    const [nom, gen] = FIELD_NAMES[key] ?? [key || 'значение', key || 'значения'];

    if (issue.path.length === 1 && issue.path[0] === 'lines' && issue.code === 'too_small') return 'Нет ни одной строки документа';
    if (issue.path[0] === 'schema') return `Поле schema должно быть "${DRAFT_SCHEMA_ID}"`;

    switch (issue.code) {
      case 'invalid_type': {
        if ((issue as { input?: unknown }).input === undefined) return `${prefix}: нет ${gen} (если не читается — пишите null)`;
        return `${prefix}: ${nom} — ${EXPECTED[issue.expected] ?? 'неверный тип'}`;
      }
      case 'invalid_value':
        return `${prefix}: ${nom} — недопустимое значение, можно: ${issue.values.map(String).join(', ')}`;
      case 'custom':
        return issue.message === 'bad_date' ? `${prefix}: ${nom} — нужна дата в формате ГГГГ-ММ-ДД` : `${prefix}: ${nom} — ${issue.message}`;
      case 'too_small':
        return issue.origin === 'string' ? `${prefix}: пустое ${nom}` : `${prefix}: ${nom} — слишком маленькое значение`;
      default:
        return `${prefix}: ${nom} — ${issue.message}`;
    }
  });
}

// --- Parsing chat answers ------------------------------------------------------------------

export type ParseResult = { ok: true; draft: DraftV1 } | { ok: false; errors: string[] };

/**
 * Finds the JSON object in a chat answer: a ```json fenced block, any fenced block,
 * or the outermost {...} in the text. Tolerates trailing commas and typographic quotes.
 */
export function extractJson(input: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const text = input.replace(/^﻿/, '').trim();
  if (!text) return { ok: false, error: 'Вставьте ответ чата: в нём должен быть JSON' };

  const candidates: string[] = [];
  for (const m of text.matchAll(/```[a-zA-Z]*\s*\n?([\s\S]*?)```/g)) candidates.push(m[1]!.trim());
  const braced = outermostObject(text);
  if (braced) candidates.push(braced);
  if (!candidates.length) return { ok: false, error: 'В ответе не найден JSON. Попросите чат ответить одним блоком ```json' };

  let lastError = '';
  for (const candidate of candidates) {
    for (const variant of [candidate, relax(candidate)]) {
      try {
        return { ok: true, value: JSON.parse(variant) };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }
  }
  return { ok: false, error: `JSON с ошибкой и не читается: ${lastError}` };
}

/** Second attempt for slightly broken JSON: “typographic” quotes → ", no trailing commas. «» are left alone. */
function relax(json: string): string {
  return json.replace(/[“”„]/g, '"').replace(/,(\s*[}\]])/g, '$1');
}

/** The first balanced {...} block, respecting strings. */
function outermostObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/** Validates an already parsed value. */
export function validateDraft(value: unknown): ParseResult {
  const result = draftSchemaV1.safeParse(value, { reportInput: true });
  if (result.success) return { ok: true, draft: result.data };
  return { ok: false, errors: describeIssues(result.error.issues, value) };
}

/** Chat answer or file text → validated draft, or readable errors. */
export function parseDraftText(input: string): ParseResult {
  const extracted = extractJson(input);
  if (!extracted.ok) return { ok: false, errors: [extracted.error] };
  return validateDraft(extracted.value);
}
