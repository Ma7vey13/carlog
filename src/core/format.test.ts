import { describe, expect, it } from 'vitest';
import { formatBytes, formatDate, formatKm, groupThousands } from './format';

const NBSP = ' ';

describe('formatDate', () => {
  it('converts ISO date to DD.MM.YYYY', () => {
    expect(formatDate('2025-10-30')).toBe('30.10.2025');
  });
  it('ignores the time part of an ISO timestamp', () => {
    expect(formatDate('2025-07-22T10:00:00Z')).toBe('22.07.2025');
  });
  it('returns empty string for empty or malformed input', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate('')).toBe('');
    expect(formatDate('22.07.25')).toBe('');
  });
});

describe('groupThousands / formatKm', () => {
  it('groups digits by three', () => {
    expect(groupThousands(303700)).toBe(`303${NBSP}700`);
    expect(groupThousands(1000000)).toBe(`1${NBSP}000${NBSP}000`);
    expect(groupThousands(950)).toBe('950');
    expect(groupThousands(-1200)).toBe(`-1${NBSP}200`);
  });
  it('adds the unit', () => {
    expect(formatKm(298000)).toBe(`298${NBSP}000${NBSP}км`);
  });
});

describe('formatBytes', () => {
  it('picks a readable unit', () => {
    expect(formatBytes(512)).toBe(`512${NBSP}Б`);
    expect(formatBytes(1536)).toBe(`1,5${NBSP}КБ`);
    expect(formatBytes(25 * 1024 * 1024)).toBe(`25${NBSP}МБ`);
  });
  it('handles bad input', () => {
    expect(formatBytes(Number.NaN)).toBe('—');
    expect(formatBytes(-1)).toBe('—');
  });
});
