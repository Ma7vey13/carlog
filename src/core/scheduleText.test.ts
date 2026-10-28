import { describe, expect, it } from 'vitest';
import { ALL_PAGES } from '../../tests/fixtures/drafts';
import { CABIN_FILTER, COOLANT, FIXTURE_REGULATION, HOSES, OIL, PLUGS, TODAY } from '../../tests/fixtures/regulation';
import { draftToBundle } from '../../tests/helpers';
import { suggestRegulationIds } from './keywords';
import { mileagePoints } from './mileage';
import { actualIntervals, DEFAULT_THRESHOLDS, scheduleItem } from './schedule';
import { dueAtText, dueText, executionText, itemIntervalText, spanText, stepText } from './scheduleText';

const S = (t: string) => t.replace(/\u00a0/g, ' ');

const bundles = ALL_PAGES.map((p) => {
  const b = draftToBundle(p);
  return { ...b, documents: b.documents.map((d) => ({ ...d, lines: d.lines.map((l) => ({ ...l, regulationItemIds: suggestRegulationIds(l.rawName, FIXTURE_REGULATION) })) })) };
});
const ctx = { bundles, events: [], points: mileagePoints(bundles.flatMap((b) => (b.mileage ? [b.mileage] : []))), today: TODAY, thresholds: DEFAULT_THRESHOLDS };

describe('schedule wording', () => {
  it('says what is left, as in SPEC: "через 1 200 км или до 15.03.2027"', () => {
    expect(S(dueText(scheduleItem(OIL, ctx)))).toBe('через 4 373 км или до 30.10.2026');
    expect(S(dueText(scheduleItem(CABIN_FILTER, ctx)))).toBe('через 5 673 км или до 11.03.2026');
    expect(S(dueAtText(scheduleItem(OIL, ctx)))).toBe('313 700 км / 30.10.2026');
  });

  it('says what is overdue', () => {
    expect(S(dueText(scheduleItem(COOLANT, ctx)))).toBe('просрочено на 19 327 км, срок прошёл 06.10.2023');
    expect(S(dueText(scheduleItem(PLUGS, ctx)))).toBe('срок прошёл 06.10.2025');
    expect(dueText(scheduleItem(HOSES, ctx))).toBe('интервал не задан');
  });

  it('describes intervals and executions', () => {
    expect(S(itemIntervalText(OIL))).toBe('10 000 км / 12 мес (тяжёлые условия: 7 500 км / 6 мес)');
    const s = scheduleItem(OIL, ctx);
    expect(S(executionText(s.executions[0]!))).toBe('30.10.2025, 303 700 км');
    expect(S(executionText({ ...s.executions[0]!, approximate: true, km: null }))).toBe('≈ 30.10.2025');
    expect(actualIntervals(s.executions).map((i) => S(stepText(i)))).toEqual(['06.10.21 → 11.04.25, 45 000 км, 3,5 года', '11.04.25 → 30.10.25, 8 700 км, 7 мес']);
  });

  it('spells spans of time', () => {
    expect(S(spanText(1))).toBe('1 день');
    expect(S(spanText(22))).toBe('22 дня');
    expect(S(spanText(132))).toBe('4 мес');
    expect(S(spanText(731))).toBe('2 года');
    expect(S(spanText(1826))).toBe('5 лет');
  });
});
