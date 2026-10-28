// Regulation table → regulation items (stage 9). Two shapes are understood:
//
//   list    one row per item: name, every N km, every N months, severe intervals, action, …
//           (headers recognised by words; the owner can reassign any column)
//   matrix  the service-book grid: one row per item, one column per mileage (15 000, 30 000, …),
//           marks in the cells: «З» replace, «П» inspect (also R / I)
//
// planImport() compares the parsed items with the current regulation: same name = same item,
// so its history, manual marks and line links stay.

import { suggestComponentId } from './components';
import { formatKm } from './format';
import type { Component, Id, Performer, RegulationAction, RegulationItem } from './model';
import { matchKey } from './normalize';
import type { Grid } from './table';

export interface ParsedItem {
  name: string;
  action: RegulationAction;
  performer: Performer;
  intervalKm: number | null;
  intervalMonths: number | null;
  severeIntervalKm: number | null;
  severeIntervalMonths: number | null;
  /** Keyword variants from the table; empty = keep the existing ones or derive from the name. */
  keywords: string[];
  componentName: string | null;
  note: string;
  /** 1-based row in the table, for messages. */
  row: number;
}

export type ColumnRole =
  | 'name'
  | 'km'
  | 'months'
  | 'interval'
  | 'severeKm'
  | 'severeMonths'
  | 'severeInterval'
  | 'action'
  | 'performer'
  | 'keywords'
  | 'component'
  | 'note'
  | 'skip';

export const COLUMN_ROLE_LABELS: Record<ColumnRole, string> = {
  name: 'Название',
  km: 'Каждые, км',
  months: 'Каждые, мес',
  interval: 'Интервал текстом',
  severeKm: 'Тяжёлые, км',
  severeMonths: 'Тяжёлые, мес',
  severeInterval: 'Тяжёлые, текстом',
  action: 'Замена / проверка',
  performer: 'Кто делает',
  keywords: 'Ключевые слова',
  component: 'Узел',
  note: 'Заметка',
  skip: '— не использовать —',
};

export interface ListLayout {
  kind: 'list';
  /** -1 when the table has no header row. */
  headerRow: number;
  roles: ColumnRole[];
}

export interface MatrixColumn {
  col: number;
  km: number | null;
  months: number | null;
}

export interface MatrixLayout {
  kind: 'matrix';
  headerRow: number;
  firstDataRow: number;
  nameCol: number;
  columns: MatrixColumn[];
}

export type TableLayout = ListLayout | MatrixLayout;

// --- numbers ----------------------------------------------------------------------------------

/** "10 000", "10.000", "10,5" → number; null if there is no number. */
function parseNumber(text: string): number | null {
  const m = /\d[\d\s.,]*/.exec(text);
  if (!m) return null;
  let s = m[0].replace(/\s/g, '').replace(/[.,]$/, '');
  // "10.000" / "10,000" with exactly three digits after → thousands separator
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');
  else s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** A km cell: "10 000", "10000 км", "15 тыс." (×1000), "60" under a "тыс. км" header. */
export function parseKmValue(text: string, thousandsHint = false): number | null {
  const t = text.toLowerCase();
  const n = parseNumber(t);
  if (n === null || n <= 0) return null;
  const km = /тыс|т\.\s?км|\bk\b|000\s*$/.test(t) && n < 1000 ? n * 1000 : thousandsHint && n < 1000 ? n * 1000 : n;
  return Math.round(km);
}

/** A months cell: "12", "12 мес", "1 год", "2 года", "1,5 года". */
export function parseMonthsValue(text: string): number | null {
  const t = text.toLowerCase();
  const n = parseNumber(t);
  if (n === null || n <= 0) return null;
  return Math.round(/год|лет|\bг\.?\b|year/.test(t) ? n * 12 : n);
}

/** "Каждые 15 000 км или 12 месяцев", "60 тыс. км / 4 года", "2 года" → km and months. */
export function parseIntervalText(text: string): { km: number | null; months: number | null } {
  const t = text.toLowerCase().replace(/ /g, ' ');
  const kmMatch = /(\d[\d\s.,]*)\s*(тыс\.?\s*)?(км|km)/.exec(t);
  const monthsMatch = /(\d+(?:[.,]\d+)?)\s*(мес|месяц|месяца|месяцев|month)/.exec(t);
  const yearsMatch = /(\d+(?:[.,]\d+)?)\s*(год|года|лет|year)/.exec(t);
  let km = kmMatch ? parseKmValue(kmMatch[0]) : null;
  if (km === null) {
    // "40000/24" without units
    const pair = /^(\d[\d\s.]*)\s*\/\s*(\d+)$/.exec(t.trim());
    if (pair) return { km: parseKmValue(pair[1]!), months: Number(pair[2]) };
    const lone = parseNumber(t);
    if (lone !== null && lone >= 1000 && !monthsMatch && !yearsMatch) km = Math.round(lone);
  }
  const months = monthsMatch ? Math.round(Number(monthsMatch[1]!.replace(',', '.'))) : yearsMatch ? Math.round(Number(yearsMatch[1]!.replace(',', '.')) * 12) : null;
  return { km, months };
}

// --- marks in a service-book grid ---------------------------------------------------------------

/** «З» / R → replace, «П» / I → inspect, ✓ / + / • → a mark of unknown kind. */
export function markOf(cell: string): RegulationAction | 'mark' | null {
  // A short mark ("З", "П*", "R") or a whole word — not a sentence that starts with "Проверка…".
  const t = cell.trim().toLowerCase().replace(/[*.\s]+$/, '');
  if (!t || t === '-' || t === '—') return null;
  if (/^(з|r|z|зам|замен|замена|заменить)$/.test(t)) return 'replace';
  if (/^(п|i|к|о|р|провер|проверка|проверить|осмотр|осмотреть|контроль|регулировка|диагностика)$/.test(t)) return 'inspect';
  if (/^[✓✔+•●xх]$|^v$|^да$/.test(t)) return 'mark';
  return null;
}

/** Action from the name: "Проверка …" / "Осмотр …" → inspect, otherwise replace. */
function actionFromName(name: string): RegulationAction {
  return /^(провер|осмотр|контрол|диагност|регулир)/i.test(name.trim()) ? 'inspect' : 'replace';
}

/** A header cell of a grid column: "15 000", "15 тыс. км", "15 000 км / 12 мес", "1 год". */
function gridHeader(cell: string, thousandsHint: boolean): { km: number | null; months: number | null } | null {
  const t = cell.toLowerCase();
  if (!/\d/.test(t)) return null;
  const parsed = parseIntervalText(t);
  if (parsed.km || parsed.months) return parsed;
  const n = parseNumber(t);
  if (n === null || /[a-zа-яё]{4,}/.test(t)) return null;
  if (n >= 1000) return { km: Math.round(n), months: null };
  if (thousandsHint && n > 0 && n <= 500) return { km: Math.round(n * 1000), months: null };
  return null;
}

// --- layout -------------------------------------------------------------------------------------

export function roleFromHeader(header: string, nameTaken: boolean): ColumnRole {
  const h = header.toLowerCase();
  if (!h) return 'skip';
  if (/ключ/.test(h)) return 'keywords';
  if (/примеч|замет|коммент/.test(h)) return 'note';
  if (/кто|исполн/.test(h)) return 'performer';
  if (/тяж|особ/.test(h)) return /км|пробег|тыс/.test(h) ? 'severeKm' : /мес|год|врем|срок/.test(h) ? 'severeMonths' : 'severeInterval';
  if (/действ|что делать|замена\s*\/\s*провер|тип\s*работ/.test(h)) return 'action';
  if (!nameTaken && /наимен|назван|операц|работ|пункт|деталь|что/.test(h)) return 'name';
  if (/узел|систем|агрегат|раздел/.test(h)) return nameTaken ? 'component' : 'name';
  if (/интервал|периодич|кажд/.test(h) && !/км|мес/.test(h)) return 'interval';
  if (/км|пробег|тыс/.test(h)) return 'km';
  if (/мес|год|срок|врем/.test(h)) return 'months';
  return 'skip';
}

function looksLikeHeader(row: string[]): boolean {
  return row.some((c) => /наимен|назван|операц|работ|пункт|интервал|пробег|км|мес/i.test(c)) && !row.some((c) => markOf(c) && c.length <= 2);
}

/** Guesses the shape of the table; the owner can correct the column roles on the screen. */
export function detectLayout(grid: Grid): TableLayout {
  const thousands = grid.slice(0, 6).some((r) => r.some((c) => /тыс/i.test(c)));
  // Matrix: a row with at least three mileage headers, and marks under them.
  for (let r = 0; r < Math.min(grid.length, 6); r++) {
    const heads = grid[r]!.map((c, col) => ({ col, h: gridHeader(c, thousands) })).filter((x) => x.h && (x.h.km || x.h.months));
    if (heads.length < 3) continue;
    // A service-book header grows left to right (15 000, 30 000, 45 000…); a data row with numbers does not.
    const kms = heads.map((x) => x.h!.km ?? x.h!.months ?? 0);
    if (!kms.every((v, i) => i === 0 || v > kms[i - 1]!)) continue;
    const body = grid.slice(r + 1);
    const marks = body.reduce((n, row) => n + heads.filter((x) => markOf(row[x.col] ?? '')).length, 0);
    if (marks < 2) continue;
    let columns: MatrixColumn[] = heads.map((x) => ({ col: x.col, km: x.h!.km, months: x.h!.months }));
    let firstDataRow = r + 1;
    // A second header row with the months for the same columns ("12", "24" or "1 год").
    const next = grid[r + 1];
    if (next && columns.filter((c) => parseMonthsValue(next[c.col] ?? '') !== null && !markOf(next[c.col] ?? '')).length >= 3) {
      columns = columns.map((c) => ({ ...c, months: c.months ?? parseMonthsValue(next[c.col] ?? '') }));
      firstDataRow = r + 2;
    }
    const firstHead = Math.min(...columns.map((c) => c.col));
    // The name column: the one left of the mileage columns with the most text.
    let nameCol = 0;
    let best = -1;
    for (let col = 0; col < firstHead; col++) {
      const filled = grid.slice(firstDataRow).filter((row) => /[a-zа-яё]{3,}/i.test(row[col] ?? '')).length;
      if (filled > best) {
        best = filled;
        nameCol = col;
      }
    }
    return { kind: 'matrix', headerRow: r, firstDataRow, nameCol, columns };
  }

  const headerRow = grid.slice(0, 5).findIndex(looksLikeHeader);
  if (headerRow >= 0) {
    let nameTaken = false;
    const roles = grid[headerRow]!.map((h) => {
      const role = roleFromHeader(h, nameTaken);
      if (role === 'name') nameTaken = true;
      return role;
    });
    if (!nameTaken) roles[roles.findIndex((x) => x === 'skip') >= 0 ? roles.findIndex((x) => x === 'skip') : 0] = 'name';
    return { kind: 'list', headerRow, roles };
  }

  // No header: the column with the most text is the name; numbers ≥ 1000 are km, small ones months.
  const width = grid[0]?.length ?? 0;
  const cols = Array.from({ length: width }, (_, c) => grid.map((r) => r[c] ?? ''));
  const textScore = cols.map((cells) => cells.filter((v) => /[a-zа-яё]{3,}/i.test(v)).length);
  const nameCol = textScore.indexOf(Math.max(...textScore));
  const roles: ColumnRole[] = cols.map((cells, c) => {
    if (c === nameCol) return 'name';
    const nums = cells.map((v) => parseNumber(v)).filter((n): n is number => n !== null);
    if (nums.length < cells.length / 2) return 'skip';
    return nums.every((n) => n >= 500) ? 'km' : nums.every((n) => n <= 240) ? 'months' : 'skip';
  });
  return { kind: 'list', headerRow: -1, roles };
}

// --- items --------------------------------------------------------------------------------------

export interface ParseResult {
  items: ParsedItem[];
  /** Rows that were not taken, with the reason. */
  skipped: Array<{ row: number; text: string; reason: string }>;
}

function splitKeywords(cell: string): string[] {
  return cell
    .split(/[|;\n]/)
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
}

export function parseTable(grid: Grid, layout: TableLayout): ParseResult {
  return layout.kind === 'matrix' ? parseMatrix(grid, layout) : parseList(grid, layout);
}

function parseList(grid: Grid, layout: ListLayout): ParseResult {
  const items: ParsedItem[] = [];
  const skipped: ParseResult['skipped'] = [];
  const thousands = layout.headerRow >= 0 && grid[layout.headerRow]!.some((h) => /тыс/i.test(h));
  let section: string | null = null;
  for (let r = layout.headerRow + 1; r < grid.length; r++) {
    const row = grid[r]!;
    const get = (role: ColumnRole) => row[layout.roles.indexOf(role)] ?? '';
    const name = get('name');
    // Any other filled cell, even in an unused column: only a row with the name alone is a section title.
    const others = row.filter((c, i) => c && layout.roles[i] !== 'name');
    if (!name) {
      if (row.some(Boolean)) skipped.push({ row: r + 1, text: row.filter(Boolean).join(' · '), reason: 'нет названия' });
      continue;
    }
    if (!others.length) {
      // A lone name between items is a section title ("Двигатель"): a hint for the component.
      section = name;
      continue;
    }
    const interval = parseIntervalText(get('interval'));
    const severe = parseIntervalText(get('severeInterval'));
    const actionCell = get('action');
    const mark = markOf(actionCell);
    const performerCell = get('performer').toLowerCase();
    items.push({
      name,
      action: mark === 'replace' || mark === 'inspect' ? mark : actionFromName(name),
      performer: /сам|влад/.test(performerCell) ? 'self' : 'service',
      intervalKm: parseKmValue(get('km'), thousands) ?? interval.km,
      intervalMonths: parseMonthsValue(get('months')) ?? interval.months,
      severeIntervalKm: parseKmValue(get('severeKm'), thousands) ?? severe.km,
      severeIntervalMonths: parseMonthsValue(get('severeMonths')) ?? severe.months,
      keywords: splitKeywords(get('keywords')),
      componentName: get('component') || section,
      note: get('note'),
      row: r + 1,
    });
  }
  return { items, skipped };
}

/** The repeat step of marks: the smallest gap between marked columns, or the first mark. */
function stepOf(values: Array<number | null>): number | null {
  const v = [...new Set(values.filter((x): x is number => x !== null && x > 0))].sort((a, b) => a - b);
  if (!v.length) return null;
  let step = v[0]!;
  for (let i = 1; i < v.length; i++) step = Math.min(step, v[i]! - v[i - 1]!);
  return step;
}

function parseMatrix(grid: Grid, layout: MatrixLayout): ParseResult {
  const items: ParsedItem[] = [];
  const skipped: ParseResult['skipped'] = [];
  let section: string | null = null;
  for (let r = layout.firstDataRow; r < grid.length; r++) {
    const row = grid[r]!;
    const name = row[layout.nameCol] ?? '';
    const marks = layout.columns.map((c) => ({ c, mark: markOf(row[c.col] ?? '') })).filter((x) => x.mark);
    if (!name) {
      if (marks.length) skipped.push({ row: r + 1, text: row.filter(Boolean).join(' · '), reason: 'нет названия' });
      continue;
    }
    if (!marks.length) {
      section = name;
      continue;
    }
    const byAction = new Map<RegulationAction, typeof marks>();
    for (const m of marks) {
      const action = m.mark === 'mark' ? actionFromName(name) : (m.mark as RegulationAction);
      byAction.set(action, [...(byAction.get(action) ?? []), m]);
    }
    const both = byAction.size > 1;
    for (const [action, ms] of byAction) {
      items.push({
        name: both ? `${name} — ${action === 'replace' ? 'замена' : 'проверка'}` : name,
        action,
        performer: 'service',
        intervalKm: stepOf(ms.map((m) => m.c.km)),
        intervalMonths: stepOf(ms.map((m) => m.c.months)),
        severeIntervalKm: null,
        severeIntervalMonths: null,
        keywords: [],
        componentName: section,
        note: '',
        row: r + 1,
      });
    }
  }
  return { items, skipped };
}

// --- keywords -----------------------------------------------------------------------------------

const STOP = new Set([
  'и', 'или', 'в', 'во', 'на', 'с', 'со', 'для', 'по', 'от', 'до', 'из', 'при', 'без', 'а', 'также',
  'необходимости', 'замена', 'заменить', 'проверка', 'проверить', 'осмотр', 'регулировка', 'отрегулировать',
  'контроль', 'состояния', 'состояние', 'всех', 'всё', 'все',
]);

/** A keyword variant from the name: its meaningful words ("Замена масла в АКПП" → "масла акпп"). */
export function keywordsFromName(name: string): string[] {
  const words = matchKey(name.replace(/\(.*?\)/g, ' '))
    .split(' ')
    .filter((w) => w.length >= 3 && !STOP.has(w));
  return words.length ? [words.slice(0, 3).join(' ')] : [];
}

// --- plan ---------------------------------------------------------------------------------------

export type ItemInput = Pick<
  RegulationItem,
  'name' | 'componentId' | 'action' | 'performer' | 'intervalKm' | 'intervalMonths' | 'severeIntervalKm' | 'severeIntervalMonths' | 'keywords' | 'note'
>;

export interface ImportPlan {
  create: ItemInput[];
  update: Array<{ existing: RegulationItem; input: ItemInput; changes: string[] }>;
  /** Items removed by an earlier table, back now: their history and marks come back too. */
  revive: Array<{ existing: RegulationItem; input: ItemInput }>;
  unchanged: RegulationItem[];
  /** Items of the previous table that the new one does not have. */
  remove: RegulationItem[];
  /** Items added by hand that the table does not mention: kept as they are. */
  keepManual: RegulationItem[];
  /** Names that appear twice in the table (the first row is taken). */
  duplicates: string[];
}

/** The table's component (column or section title); else the item keeps its own; a new one gets a guess. */
function componentIdFor(item: ParsedItem, components: readonly Component[], existing: RegulationItem | undefined): Id | null {
  if (item.componentName) {
    const key = matchKey(item.componentName);
    const found = components.find((c) => !c.deleted && matchKey(c.name) === key) ?? components.find((c) => !c.deleted && key && (matchKey(c.name).startsWith(key) || key.startsWith(matchKey(c.name))));
    if (found) return found.id;
  }
  return existing ? existing.componentId : suggestComponentId(item.name);
}

export function toItemInput(p: ParsedItem, existing: RegulationItem | undefined, components: readonly Component[]): ItemInput {
  return {
    name: p.name,
    componentId: componentIdFor(p, components, existing),
    action: p.action,
    performer: p.performer,
    intervalKm: p.intervalKm,
    intervalMonths: p.intervalMonths,
    severeIntervalKm: p.severeIntervalKm,
    severeIntervalMonths: p.severeIntervalMonths,
    // Keywords the owner tuned survive a table without its own keywords.
    keywords: p.keywords.length ? p.keywords : existing?.keywords.length ? existing.keywords : keywordsFromName(p.name),
    note: p.note || existing?.note || '',
  };
}

const intervalText = (km: number | null, months: number | null) => [km ? formatKm(km) : '', months ? `${months} мес` : ''].filter(Boolean).join(' / ') || 'без интервала';

/** What changes for an existing item, in words. */
export function describeChanges(a: ItemInput, b: ItemInput): string[] {
  const out: string[] = [];
  if (a.intervalKm !== b.intervalKm || a.intervalMonths !== b.intervalMonths) out.push(`интервал: ${intervalText(a.intervalKm, a.intervalMonths)} → ${intervalText(b.intervalKm, b.intervalMonths)}`);
  if (a.severeIntervalKm !== b.severeIntervalKm || a.severeIntervalMonths !== b.severeIntervalMonths) {
    out.push(`тяжёлые условия: ${intervalText(a.severeIntervalKm, a.severeIntervalMonths)} → ${intervalText(b.severeIntervalKm, b.severeIntervalMonths)}`);
  }
  if (a.action !== b.action) out.push(b.action === 'replace' ? 'теперь замена' : 'теперь проверка');
  if (a.performer !== b.performer) out.push(b.performer === 'self' ? 'делаете сами' : 'делает сервис');
  if (a.keywords.join('|') !== b.keywords.join('|')) out.push('ключевые слова');
  if (a.componentId !== b.componentId) out.push('узел');
  if (a.note !== b.note) out.push('заметка');
  return out;
}

/**
 * The new table against the current regulation. Matching is by name (normalised): a live item of
 * any origin with the same name is updated; a removed one is revived; the rest are created.
 * Previous-table items the new table lacks are removed; hand-made items are kept.
 */
export function planImport(parsed: readonly ParsedItem[], existing: readonly RegulationItem[], components: readonly Component[]): ImportPlan {
  const plan: ImportPlan = { create: [], update: [], revive: [], unchanged: [], remove: [], keepManual: [], duplicates: [] };
  const live = new Map<string, RegulationItem>();
  const removed = new Map<string, RegulationItem>();
  for (const item of existing) {
    const key = matchKey(item.name);
    if (!item.deleted) live.set(key, item);
    else if (!removed.has(key) || removed.get(key)!.updatedAt < item.updatedAt) removed.set(key, item);
  }

  const seen = new Set<string>();
  for (const p of parsed) {
    const key = matchKey(p.name);
    if (!key) continue;
    if (seen.has(key)) {
      plan.duplicates.push(p.name);
      continue;
    }
    seen.add(key);
    const current = live.get(key);
    if (current) {
      const input = toItemInput(p, current, components);
      const changes = describeChanges(current, input);
      if (changes.length || current.origin !== 'table' || current.name !== input.name) plan.update.push({ existing: current, input, changes });
      else plan.unchanged.push(current);
      continue;
    }
    const old = removed.get(key);
    if (old) plan.revive.push({ existing: old, input: toItemInput(p, old, components) });
    else plan.create.push(toItemInput(p, undefined, components));
  }

  for (const [key, item] of live) {
    if (seen.has(key)) continue;
    if (item.origin === 'table') plan.remove.push(item);
    else plan.keepManual.push(item);
  }
  return plan;
}

/** Items whose history links should be (re)computed: new, revived, or with new keywords. */
export function itemsToLink(plan: ImportPlan, createdIds: readonly Id[]): Array<Pick<RegulationItem, 'id' | 'keywords'>> {
  return [
    ...plan.create.map((c, i) => ({ id: createdIds[i]!, keywords: c.keywords })),
    ...plan.revive.map((r) => ({ id: r.existing.id, keywords: r.input.keywords })),
    ...plan.update.filter((u) => u.existing.keywords.join('|') !== u.input.keywords.join('|')).map((u) => ({ id: u.existing.id, keywords: u.input.keywords })),
  ];
}
