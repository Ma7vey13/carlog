import { describe, expect, it } from 'vitest';
import { startComponentId, START_COMPONENTS } from './components';
import type { Component, RegulationItem } from './model';
import {
  detectLayout,
  keywordsFromName,
  markOf,
  parseIntervalText,
  parseKmValue,
  parseMonthsValue,
  parseTable,
  planImport,
  type ParsedItem,
} from './regulationTable';
import { parseDelimited } from './table';

const COMPONENTS: Component[] = START_COMPONENTS.map((c) => ({ ...c, parentId: null, createdAt: '', updatedAt: '', deleted: false, deviceId: 'seed' }));

describe('numbers and marks', () => {
  it('reads km, months and interval texts', () => {
    expect(parseKmValue('10 000')).toBe(10000);
    expect(parseKmValue('15 тыс. км')).toBe(15000);
    expect(parseKmValue('60', true)).toBe(60000);
    expect(parseKmValue('10.000')).toBe(10000);
    expect(parseKmValue('—')).toBeNull();
    expect(parseMonthsValue('12 мес')).toBe(12);
    expect(parseMonthsValue('2 года')).toBe(24);
    expect(parseMonthsValue('1,5 года')).toBe(18);
    expect(parseIntervalText('Каждые 15 000 км или 12 месяцев')).toEqual({ km: 15000, months: 12 });
    expect(parseIntervalText('60 тыс. км / 4 года')).toEqual({ km: 60000, months: 48 });
    expect(parseIntervalText('40000/24')).toEqual({ km: 40000, months: 24 });
    expect(parseIntervalText('2 года')).toEqual({ km: null, months: 24 });
  });

  it('reads service-book marks', () => {
    expect(markOf('З')).toBe('replace');
    expect(markOf('R')).toBe('replace');
    expect(markOf('П')).toBe('inspect');
    expect(markOf('I')).toBe('inspect');
    expect(markOf('✓')).toBe('mark');
    expect(markOf('')).toBeNull();
    expect(markOf('—')).toBeNull();
  });
});

describe('list tables', () => {
  const csv = [
    'Наименование работ;Пробег, км;Срок, мес;Тяжёлые условия, км;Тяжёлые условия, мес;Ключевые слова;Примечание',
    'Двигатель;;;;;;',
    'Масло моторное и фильтр;10 000;12;7 500;6;замена масла двигатель | масло мот;',
    'Проверка ремня генератора;30 000;24;;;;',
    'Свечи зажигания (платиновые);60 000;48;;;;с V6 — снятие впускного коллектора',
    ';;;;;;',
    'Охлаждающая жидкость;45 тыс. км;2 года;;;;',
  ].join('\n');

  it('recognises the columns by their headers and reads every item', () => {
    const grid = parseDelimited(csv);
    const layout = detectLayout(grid);
    expect(layout).toMatchObject({ kind: 'list', headerRow: 0, roles: ['name', 'km', 'months', 'severeKm', 'severeMonths', 'keywords', 'note'] });
    const { items, skipped } = parseTable(grid, layout);
    expect(skipped).toEqual([]);
    expect(items.map((i) => [i.name, i.action, i.intervalKm, i.intervalMonths])).toEqual([
      ['Масло моторное и фильтр', 'replace', 10000, 12],
      ['Проверка ремня генератора', 'inspect', 30000, 24],
      ['Свечи зажигания (платиновые)', 'replace', 60000, 48],
      ['Охлаждающая жидкость', 'replace', 45000, 24],
    ]);
    expect(items[0]).toMatchObject({ severeIntervalKm: 7500, severeIntervalMonths: 6, keywords: ['замена масла двигатель', 'масло мот'], componentName: 'Двигатель' });
    expect(items[2]!.note).toBe('с V6 — снятие впускного коллектора');
  });

  it('reads an interval written as text in one column', () => {
    const grid = parseDelimited('Операция\tПериодичность\nТормозная жидкость\tкаждые 2 года\nВоздушный фильтр\t15 000 км или 12 мес');
    const { items } = parseTable(grid, detectLayout(grid));
    expect(items.map((i) => [i.name, i.intervalKm, i.intervalMonths])).toEqual([
      ['Тормозная жидкость', null, 24],
      ['Воздушный фильтр', 15000, 12],
    ]);
  });

  it('guesses columns of a table without headers', () => {
    const grid = parseDelimited('Масло двигателя;10000;12\nАнтифриз;40000;24');
    expect(detectLayout(grid)).toEqual({ kind: 'list', headerRow: -1, roles: ['name', 'km', 'months'] });
  });
});

describe('service-book grid', () => {
  const grid = parseDelimited(
    [
      'Операция\t15 000\t30 000\t45 000\t60 000\t75 000\t90 000',
      'месяцы\t12\t24\t36\t48\t60\t72',
      'Двигатель\t\t\t\t\t\t',
      'Моторное масло и фильтр\tЗ\tЗ\tЗ\tЗ\tЗ\tЗ',
      'Ремень привода агрегатов\tП\tП\tП\tЗ\tП\tП',
      'Свечи зажигания\t\t\t\tЗ\t\t',
      'Воздушный фильтр\tП\tЗ\tП\tЗ\tП\tЗ',
    ].join('\n'),
  );

  it('finds the mileage columns and the months row', () => {
    const layout = detectLayout(grid);
    expect(layout).toMatchObject({ kind: 'matrix', headerRow: 0, firstDataRow: 2, nameCol: 0 });
    if (layout.kind !== 'matrix') throw new Error();
    expect(layout.columns[0]).toEqual({ col: 1, km: 15000, months: 12 });
  });

  it('turns marks into intervals; a row with both marks gives two items', () => {
    const { items } = parseTable(grid, detectLayout(grid));
    expect(items.map((i) => [i.name, i.action, i.intervalKm, i.intervalMonths])).toEqual([
      ['Моторное масло и фильтр', 'replace', 15000, 12],
      ['Ремень привода агрегатов — проверка', 'inspect', 15000, 12],
      ['Ремень привода агрегатов — замена', 'replace', 60000, 48],
      ['Свечи зажигания', 'replace', 60000, 48],
      ['Воздушный фильтр — проверка', 'inspect', 15000, 12], // every 15 000 km counting from the last check or replacement
      ['Воздушный фильтр — замена', 'replace', 30000, 24],
    ]);
    expect(items[0]!.componentName).toBe('Двигатель');
  });

  it('understands "тыс. км" headers', () => {
    const g = parseDelimited('Работа;15;30;45\nтыс. км;;;\nМасло;З;З;З');
    const layout = detectLayout(parseDelimited('Работа, тыс. км;15;30;45\nМасло;З;З;З'));
    expect(layout.kind).toBe('matrix');
    expect(parseTable(parseDelimited('Работа, тыс. км;15;30;45\nМасло;З;З;З'), layout).items[0]!.intervalKm).toBe(15000);
  });
});

describe('keywords from the name', () => {
  it('keeps the meaningful words', () => {
    expect(keywordsFromName('Замена масла в АКПП')).toEqual(['масла акпп']);
    expect(keywordsFromName('Свечи зажигания (платиновые)')).toEqual(['свечи зажигания']);
    expect(keywordsFromName('и в')).toEqual([]);
  });
});

describe('plan of a new table', () => {
  const item = (id: string, name: string, patch: Partial<RegulationItem> = {}): RegulationItem => ({
    id,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deleted: false,
    deviceId: 'd',
    name,
    componentId: null,
    action: 'replace',
    performer: 'service',
    intervalKm: 10000,
    intervalMonths: 12,
    severeIntervalKm: null,
    severeIntervalMonths: null,
    keywords: ['ключ ' + id],
    note: '',
    origin: 'table',
    ...patch,
  });
  const parsed = (name: string, km: number | null, months: number | null, patch: Partial<ParsedItem> = {}): ParsedItem => ({
    name,
    action: 'replace',
    performer: 'service',
    intervalKm: km,
    intervalMonths: months,
    severeIntervalKm: null,
    severeIntervalMonths: null,
    keywords: [],
    componentName: null,
    note: '',
    row: 1,
    ...patch,
  });

  it('updates by name, revives, removes the old table’s items and keeps hand-made ones', () => {
    const existing = [
      item('oil', 'Масло двигателя'),
      item('plugs', 'Свечи зажигания', { intervalKm: 60000, intervalMonths: 48 }),
      item('belt', 'Ремень ГРМ'),
      item('gone', 'Антифриз', { deleted: true }),
      item('mine', 'Мойка радиатора', { origin: 'manual' }),
      item('hand-oil', 'Масло АКПП', { origin: undefined }),
    ];
    const plan = planImport(
      [
        parsed('масло  двигателя', 15000, 12),
        parsed('Свечи зажигания', 60000, 48),
        parsed('Антифриз', 40000, 24),
        parsed('Масло АКПП', 60000, null),
        parsed('Тормозная жидкость', null, 24),
        parsed('Масло двигателя', 1, 1),
      ],
      existing,
      COMPONENTS,
    );
    expect(plan.update.map((u) => [u.existing.id, u.changes.map((c) => c.replace(/ /g, ' '))])).toEqual([
      ['oil', ['интервал: 10 000 км / 12 мес → 15 000 км / 12 мес']],
      ['hand-oil', ['интервал: 10 000 км / 12 мес → 60 000 км']],
    ]);
    // the owner's keywords survive a table without keywords
    expect(plan.update[0]!.input.keywords).toEqual(['ключ oil']);
    expect(plan.unchanged.map((i) => i.id)).toEqual(['plugs']);
    expect(plan.revive.map((r) => r.existing.id)).toEqual(['gone']);
    expect(plan.create.map((c) => [c.name, c.keywords, c.componentId])).toEqual([['Тормозная жидкость', ['тормозная жидкость'], startComponentId('Тормозная жидкость')]]);
    expect(plan.remove.map((i) => i.id)).toEqual(['belt']);
    expect(plan.keepManual.map((i) => i.id)).toEqual(['mine']);
    expect(plan.duplicates).toEqual(['Масло двигателя']);
  });

  it('maps the section or component column to a component', () => {
    const plan = planImport([parsed('Колодки', 30000, null, { componentName: 'Тормоза задние' })], [], COMPONENTS);
    expect(plan.create[0]!.componentId).toBe(startComponentId('Тормоза задние'));
  });
});
