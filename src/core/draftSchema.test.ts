import { describe, expect, it } from 'vitest';
import { ALL_PAGES, PAGE2_ACT, REFERENCE } from '../../tests/fixtures/drafts';
import { buildChatPrompt, PROMPT_EXAMPLE, schemaFieldLines } from './draftPrompt';
import { draftSchemaV1, extractJson, parseDraftText, validateDraft } from './draftSchema';
import { rublesNumberToKopecks } from './money';

const clone = <T>(v: T): T => structuredClone(v);

describe('fixtures match the SPEC reference table', () => {
  it.each(REFERENCE.map((r, i) => [r.page, r, ALL_PAGES[i]!] as const))('page %i', (_p, ref, draft) => {
    expect(validateDraft(draft).ok).toBe(true);
    expect(draft.document.date).toBe(ref.date);
    expect(draft.document.odometerKm).toBe(ref.km);
    const works = draft.lines.filter((l) => l.kind === 'work');
    const parts = draft.lines.filter((l) => l.kind !== 'work');
    const sum = (ls: typeof draft.lines) => ls.reduce((s, l) => s + rublesNumberToKopecks(l.sum ?? 0), 0) / 100;
    expect([works.length, sum(works)]).toEqual([...ref.works]);
    expect([parts.length, sum(parts)]).toEqual([...ref.parts]);
    expect(draft.document.totals.total).toBe(ref.total);
  });
});

describe('validateDraft', () => {
  it('accepts the example from the prompt', () => {
    expect(validateDraft(PROMPT_EXAMPLE).ok).toBe(true);
  });

  it('converts lenient values: "5 600,00", "22.07.25", numeric document numbers', () => {
    const raw = clone(PAGE2_ACT) as unknown as Record<string, any>;
    raw.document.date = '22.07.25';
    raw.document.number = 1;
    raw.document.relatedOrder.date = '22.07.2025';
    raw.document.totals.total = '27 300,00';
    raw.lines[0].sum = '5 600,00 ₽';
    delete raw.notes;
    const r = validateDraft(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.document.date).toBe('2025-07-22');
    expect(r.draft.document.number).toBe('1');
    expect(r.draft.document.relatedOrder?.date).toBe('2025-07-22');
    expect(r.draft.document.totals.total).toBe(27300);
    expect(r.draft.lines[0]!.sum).toBe(5600);
    expect(r.draft.notes).toEqual([]);
  });

  it('explains problems in Russian, naming the document line', () => {
    const raw = clone(PAGE2_ACT) as unknown as Record<string, any>;
    delete raw.lines[3].sum; // line n=4
    raw.lines[1].kind = 'запчасть';
    raw.lines[2].price = 'четыре тысячи';
    raw.document.date = '2025-02-30';
    raw.document.odometerKm = 298000.5;
    const r = validateDraft(raw);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual(
      expect.arrayContaining([
        'Строка 4: нет суммы (если не читается — пишите null)',
        'Строка 2: вид строки — недопустимое значение, можно: work, part, material',
        'Строка 3: цена — должно быть числом',
        'Документ: дата — нужна дата в формате ГГГГ-ММ-ДД',
      ]),
    );
    expect(r.errors.some((e) => e.startsWith('Документ: пробег'))).toBe(true);
  });

  it('rejects other schemas and empty line lists', () => {
    const wrong = { ...clone(PAGE2_ACT), schema: 'something' };
    expect(validateDraft(wrong)).toEqual({ ok: false, errors: ['Поле schema должно быть "carlog.draft.v1"'] });
    const empty = { ...clone(PAGE2_ACT), lines: [] };
    expect(validateDraft(empty)).toEqual({ ok: false, errors: ['Нет ни одной строки документа'] });
  });
});

describe('extractJson / parseDraftText', () => {
  const json = JSON.stringify(PAGE2_ACT, null, 2);

  it('finds a ```json block inside chat prose', () => {
    const answer = `Вот результат распознавания:\n\n\`\`\`json\n${json}\n\`\`\`\n\nПроверьте строку 4.`;
    const r = parseDraftText(answer);
    expect(r.ok && r.draft.lines).toHaveLength(6);
  });

  it('finds bare JSON surrounded by text and tolerates trailing commas', () => {
    const sloppy = json.replace('"notes": []', '"notes": [],');
    expect(parseDraftText(`Готово! ${sloppy} Если что — спрашивайте.`).ok).toBe(true);
  });

  it('ignores braces inside strings', () => {
    expect(extractJson('text {"a": "x } y", "b": {"c": 1}} tail')).toEqual({ ok: true, value: { a: 'x } y', b: { c: 1 } } });
  });

  it('reports a missing or broken JSON clearly', () => {
    expect(parseDraftText('')).toEqual({ ok: false, errors: ['Вставьте ответ чата: в нём должен быть JSON'] });
    expect(parseDraftText('Не могу распознать изображение')).toEqual({
      ok: false,
      errors: ['В ответе не найден JSON. Попросите чат ответить одним блоком ```json'],
    });
    const broken = parseDraftText('```json\n{"schema": "carlog.draft.v1", "document": }\n```');
    expect(broken.ok).toBe(false);
    expect(!broken.ok && broken.errors[0]).toMatch(/^JSON с ошибкой/);
  });
});

describe('chat prompt is generated from the schema', () => {
  const prompt = buildChatPrompt();

  it('lists every schema field', () => {
    const shape = draftSchemaV1.shape.document.shape;
    for (const key of Object.keys(shape)) expect(prompt).toContain(`- document.${key} —`);
    for (const key of Object.keys(draftSchemaV1.shape.lines.element.shape)) expect(prompt).toContain(`- lines[].${key} —`);
    expect(schemaFieldLines().length).toBeGreaterThan(30);
  });

  it('contains the format rules and asks for a single json block', () => {
    expect(prompt).toContain('Ответь ОДНИМ блоком ```json');
    expect(prompt).toContain('Год из двух цифр (22.07.25) раскрывай как 20XX');
    expect(prompt).toContain('null, а не догадка');
    expect(prompt).toContain('"work_order" | "act" | "invoice" | "receipt" | "other"');
  });

  it('round-trips: the example embedded in the prompt parses back', () => {
    const r = parseDraftText(prompt.slice(prompt.indexOf('```json')));
    expect(r.ok).toBe(true);
  });
});
