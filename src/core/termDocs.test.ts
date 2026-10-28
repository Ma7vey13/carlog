import { describe, expect, it } from 'vitest';
import type { TermDocument } from './model';
import { termDueText, termStatuses, termTitle } from './termDocs';

const S = (t: string) => t.replace(/ /g, ' ');

// Fictional policy: no real numbers or companies in tests.
const doc = (id: string, patch: Partial<TermDocument>): TermDocument => ({
  id,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deleted: false,
  deviceId: 'd',
  kind: 'osago',
  title: null,
  number: 'XXX 0000000000',
  company: 'Страховая «Пример»',
  startDate: '2025-11-20',
  endDate: '2026-11-19',
  remindDaysBefore: 30,
  scanIds: [],
  ...patch,
});

describe('documents with an end date', () => {
  it('turns yellow within the reminder period and red after the end date', () => {
    const d = doc('a', {});
    expect(termStatuses([d], '2026-10-19')[0]).toMatchObject({ state: 'ok', daysLeft: 31 });
    const soon = termStatuses([d], '2026-10-28')[0]!;
    expect(soon).toMatchObject({ state: 'soon', daysLeft: 22 });
    expect(S(termDueText(soon, '2026-10-28'))).toBe('до 19.11.2026, осталось 22 дня');
    // the end date itself is still valid
    expect(termDueText(termStatuses([d], '2026-11-19')[0]!, '2026-11-19')).toBe('последний день — 19.11.2026');
    const expired = termStatuses([d], '2026-11-20')[0]!;
    expect(expired.state).toBe('expired');
    expect(termDueText(expired, '2026-11-20')).toBe('закончился 19.11.2026');
  });

  it('a renewed policy replaces the old one, so the old one stops reminding', () => {
    const old = doc('old', {});
    const renewed = doc('new', { startDate: '2026-11-20', endDate: '2027-11-19', createdAt: '2026-11-10T00:00:00.000Z' });
    expect(termStatuses([old, renewed], '2026-11-25').map((s) => [s.doc.id, s.state])).toEqual([
      ['new', 'ok'],
      ['old', 'replaced'],
    ]);
    // bought in advance: the new one is current already, with its start date shown
    const ahead = termStatuses([old, renewed], '2026-11-10').find((s) => s.doc.id === 'new')!;
    expect(ahead.state).toBe('ok');
    expect(termDueText(ahead, '2026-11-10')).toBe('с 20.11.2026 до 19.11.2027');
  });

  it('keeps different kinds and differently named "other" documents apart', () => {
    const kit = doc('kit', { kind: 'first_aid', number: null, endDate: '2026-11-01' });
    const card = doc('o1', { kind: 'other', title: 'Диагностическая карта', number: null, endDate: '2026-10-01' });
    const pass = doc('o2', { kind: 'other', title: 'Пропуск', number: null, endDate: '2027-01-01' });
    expect(termStatuses([doc('a', {}), kit, card, pass], '2026-10-28').map((s) => [termTitle(s.doc), s.state])).toEqual([
      ['Диагностическая карта', 'expired'],
      ['Аптечка', 'soon'],
      ['ОСАГО XXX 0000000000', 'soon'],
      ['Пропуск', 'ok'],
    ]);
    expect(termStatuses([{ ...kit, deleted: true }], '2026-10-28')).toEqual([]);
  });
});
