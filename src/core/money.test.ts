import { describe, expect, it } from 'vitest';
import { formatQty, formatRub, kopecksToInput, lineTotal, parseQty, parseRubles, rublesNumberToKopecks } from './money';

const NBSP = ' ';

describe('parseRubles', () => {
  it.each([
    ['5600', 560000],
    ['5 600', 560000],
    ['5 600,50', 560050],
    ['5600.5', 560050],
    ['1 000,00 ₽', 100000],
    ['148500.00', 14850000],
    ['0,99', 99],
    ['-200', -20000],
  ])('%s → %i kopecks', (input, expected) => {
    expect(parseRubles(input)).toBe(expected);
  });

  it.each(['', ' ', 'abc', '1,2,3', '5600.555', '12р50'])('rejects %j', (input) => {
    expect(parseRubles(input)).toBeNull();
  });

  it('accepts JSON numbers from drafts without float drift', () => {
    expect(parseRubles(5600.5)).toBe(560050);
    expect(rublesNumberToKopecks(0.1 + 0.2)).toBe(30);
    expect(rublesNumberToKopecks(1100.1)).toBe(110010);
    expect(rublesNumberToKopecks(-0.5)).toBe(-50);
    expect(parseRubles(Number.NaN)).toBeNull();
    expect(parseRubles(null)).toBeNull();
  });
});

describe('formatting', () => {
  it('formats kopecks as rubles', () => {
    expect(formatRub(560000)).toBe(`5${NBSP}600${NBSP}₽`);
    expect(formatRub(560050)).toBe(`5${NBSP}600,50${NBSP}₽`);
    expect(formatRub(5)).toBe(`0,05${NBSP}₽`);
    expect(formatRub(null)).toBe('—');
  });
  it('round-trips through the input format', () => {
    for (const kop of [0, 5, 560000, 560050, 14850000]) {
      expect(parseRubles(kopecksToInput(kop))).toBe(kop);
    }
    expect(kopecksToInput(null)).toBe('');
  });
});

describe('quantity', () => {
  it('parses and formats', () => {
    expect(parseQty('4,5')).toBe(4.5);
    expect(parseQty('2.00')).toBe(2);
    expect(parseQty('')).toBeNull();
    expect(parseQty('-1')).toBeNull();
    expect(parseQty('x')).toBeNull();
    expect(formatQty(4.5)).toBe('4,5');
    expect(formatQty(15)).toBe('15');
    expect(formatQty(null)).toBe('');
  });
  it('computes line totals in whole kopecks', () => {
    expect(lineTotal(4.5, 110000)).toBe(495000);
    expect(lineTotal(15, 110000)).toBe(1650000);
    expect(lineTotal(0.333, 100)).toBe(33);
  });
});
