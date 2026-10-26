// Money is stored as integer kopecks (SPEC section 4). Conversions go through strings,
// never through float multiplication, so 5600.5 ₽ is exactly 560050 kopecks.

import type { Kopecks } from './model';
import { groupThousands } from './format';

const NBSP = ' ';

/**
 * Parses a ruble amount typed by a person or found in a document:
 * "5600", "5 600,50", "5600.5", "1 000,00 ₽", "-200". Returns kopecks or null if not a number.
 */
export function parseRubles(input: string | number | null | undefined): Kopecks | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? rublesNumberToKopecks(input) : null;

  const cleaned = input
    .replace(/[\s  ]/g, '')
    .replace(/(₽|руб\.?|р\.)$/i, '')
    .replace(',', '.');
  if (cleaned === '') return null;
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!m) return null;
  const sign = m[1] ? -1 : 1;
  const rub = Number(m[2]);
  const kop = Number((m[3] ?? '').padEnd(2, '0'));
  return sign * (rub * 100 + kop);
}

/** Converts a JSON number of rubles (draft format) to kopecks without float drift. */
export function rublesNumberToKopecks(rub: number): Kopecks {
  // toFixed(2) rounds the decimal representation: 0.1 + 0.2 → "0.30", 5600.5 → "5600.50".
  const [whole, frac] = Math.abs(rub).toFixed(2).split('.') as [string, string];
  const kop = Number(whole) * 100 + Number(frac);
  return rub < 0 ? -kop : kop;
}

/** Kopecks → "5 600 ₽" or "5 600,50 ₽". */
export function formatRub(kop: Kopecks | null | undefined): string {
  if (kop === null || kop === undefined) return '—';
  return `${formatRubPlain(kop)}${NBSP}₽`;
}

/** Kopecks → "5 600" or "5 600,50" (no currency sign; for inputs and tables). */
export function formatRubPlain(kop: Kopecks): string {
  const sign = kop < 0 ? '-' : '';
  const abs = Math.abs(kop);
  const rub = Math.trunc(abs / 100);
  const rest = abs % 100;
  return sign + groupThousands(rub) + (rest ? ',' + String(rest).padStart(2, '0') : '');
}

/** Kopecks → editable input text without grouping: 560050 → "5600,50". */
export function kopecksToInput(kop: Kopecks | null): string {
  if (kop === null) return '';
  const sign = kop < 0 ? '-' : '';
  const abs = Math.abs(kop);
  const rest = abs % 100;
  return sign + Math.trunc(abs / 100) + (rest ? ',' + String(rest).padStart(2, '0') : '');
}

/** Parses a quantity: "1", "4,5", "2.00". Null for empty or invalid input. */
export function parseQty(input: string): number | null {
  const cleaned = input.replace(/[\s ]/g, '').replace(',', '.');
  if (cleaned === '') return null;
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** Quantity for display/inputs: 4.5 → "4,5", 2 → "2". */
export function formatQty(qty: number | null): string {
  if (qty === null) return '';
  return String(Math.round(qty * 1000) / 1000).replace('.', ',');
}

/** qty × price in kopecks, rounded to whole kopecks. */
export function lineTotal(qty: number, price: Kopecks): Kopecks {
  return Math.round(qty * price);
}
