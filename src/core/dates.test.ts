import { describe, expect, it } from 'vitest';
import { daysBetween, fromIsoDate, isIsoDate, toIsoDate, todayIso } from './dates';

describe('dates', () => {
  it('uses local calendar date, not UTC', () => {
    // 23:30 local time must still be the same calendar day.
    expect(toIsoDate(new Date(2025, 9, 30, 23, 30))).toBe('2025-10-30');
    expect(todayIso(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01');
  });

  it('validates real calendar dates only', () => {
    expect(isIsoDate('2025-07-22')).toBe(true);
    expect(isIsoDate('2024-02-29')).toBe(true);
    expect(isIsoDate('2025-02-29')).toBe(false);
    expect(isIsoDate('2025-13-01')).toBe(false);
    expect(isIsoDate('22.07.2025')).toBe(false);
    expect(isIsoDate(20250722)).toBe(false);
  });

  it('counts days across month ends, years and DST changes', () => {
    expect(daysBetween('2025-01-31', '2025-02-01')).toBe(1);
    expect(daysBetween('2025-07-22', '2025-10-30')).toBe(100);
    expect(daysBetween('2025-10-30', '2025-07-22')).toBe(-100);
    expect(daysBetween('2024-12-31', '2025-01-01')).toBe(1);
    expect(daysBetween('2021-03-27', '2021-03-29')).toBe(2);
  });

  it('parses ISO dates as local midnight', () => {
    const d = fromIsoDate('2025-03-12');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2025, 2, 12, 0]);
  });
});
