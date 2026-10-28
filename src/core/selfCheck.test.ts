import { describe, expect, it } from 'vitest';
import type { SelfCheckItem, SelfCheckLog } from './model';
import { SEED_SELF_CHECK_ITEMS, selfCheckAll, selfCheckStatus, selfCheckText } from './selfCheck';

const item = (i: number): SelfCheckItem => SEED_SELF_CHECK_ITEMS[i]!;
const OIL = item(0);
const COOLANT = item(1);
const WASHER = item(4);

const log = (itemId: string, date: string, result: SelfCheckLog['result'], note = '', createdAt = `${date}T10:00:00.000Z`): SelfCheckLog => ({
  id: `${itemId}-${createdAt}`,
  createdAt,
  updatedAt: createdAt,
  deleted: false,
  deviceId: 'd',
  itemId,
  date,
  result,
  note,
});

describe('self-check', () => {
  it('starts with the 11 items of SPEC section 10, each with a "how to check"', () => {
    expect(SEED_SELF_CHECK_ITEMS).toHaveLength(11);
    expect(SEED_SELF_CHECK_ITEMS.map((i) => i.periodDays)).toEqual([14, 30, 30, 30, 14, 30, 30, 30, 60, 30, 90]);
    expect(SEED_SELF_CHECK_ITEMS.every((i) => i.howTo.length > 20)).toBe(true);
    expect(new Set(SEED_SELF_CHECK_ITEMS.map((i) => i.id)).size).toBe(11);
  });

  it('is due when never checked or when the period has passed', () => {
    expect(selfCheckStatus(OIL, [], '2026-10-28')).toMatchObject({ state: 'due', last: null, nextDate: null });
    const logs = [log(OIL.id, '2026-10-20', 'ok')];
    expect(selfCheckStatus(OIL, logs, '2026-10-28')).toMatchObject({ state: 'ok', nextDate: '2026-11-03', daysLeft: 6 });
    expect(selfCheckStatus(OIL, logs, '2026-11-03')).toMatchObject({ state: 'due', daysLeft: 0 });
  });

  it('keeps "Нужно внимание" until the next "В норме"', () => {
    const attention = [log(COOLANT.id, '2026-10-01', 'ok'), log(COOLANT.id, '2026-10-20', 'attention', 'уровень у MIN')];
    const s = selfCheckStatus(COOLANT, attention, '2026-10-28');
    expect(s.state).toBe('attention');
    expect(selfCheckText(s)).toBe('нужно внимание с 20.10.2026: уровень у MIN');
    // still attention long after the period
    expect(selfCheckStatus(COOLANT, attention, '2027-03-01').state).toBe('attention');
    // same day: the later entry wins
    const fixed = [...attention, log(COOLANT.id, '2026-10-20', 'ok', 'долил', '2026-10-20T18:00:00.000Z')];
    expect(selfCheckStatus(COOLANT, fixed, '2026-10-28').state).toBe('ok');
  });

  it('ignores deleted entries and sorts attention, due, ok', () => {
    const logs = [log(OIL.id, '2026-10-27', 'ok'), { ...log(WASHER.id, '2026-10-27', 'ok'), deleted: true }, log(COOLANT.id, '2026-10-26', 'attention')];
    const all = selfCheckAll(SEED_SELF_CHECK_ITEMS, logs, '2026-10-28');
    expect(all[0]!.item.id).toBe(COOLANT.id);
    expect(all.at(-1)!.item.id).toBe(OIL.id);
    expect(all.filter((s) => s.state === 'due')).toHaveLength(9);
    expect(selfCheckText(all.at(-1)!)).toBe('в норме 27.10.2026, следующая проверка 10.11.2026');
    expect(selfCheckText(all.find((s) => s.item.id === WASHER.id)!)).toBe('ещё не проверяли');
  });
});
