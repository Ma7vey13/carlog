// Calendar dates in the device's local time (DECISIONS.md, D-011): "today" must not
// jump to yesterday or tomorrow because of UTC.

import type { IsoDate } from './model';

/** Local date as `YYYY-MM-DD`. */
export function toIsoDate(d: Date): IsoDate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayIso(now: Date = new Date()): IsoDate {
  return toIsoDate(now);
}

/** True for a real calendar date in `YYYY-MM-DD` form (rejects 2025-02-30). */
export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d;
}

/** Parses an ISO date as a local Date at midnight. */
export function fromIsoDate(iso: IsoDate): Date {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

/** Whole days from `a` to `b` (positive if b is later). DST-safe. */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((utcDay(b) - utcDay(a)) / 86_400_000);
}

function utcDay(iso: IsoDate): number {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

/** Current timestamp for `createdAt` / `updatedAt`. */
export function nowIso(now: Date = new Date()): string {
  return now.toISOString();
}
