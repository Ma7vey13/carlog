// Mileage forecast (SPEC section 9): last real reading + average daily mileage × days since.
// The average uses readings of the last 12 months, or the whole history if that is too little.

import { addMonths, daysBetween } from './dates';
import type { IsoDate, MileageEntry } from './model';

export interface MileagePoint {
  date: IsoDate;
  km: number;
}

export interface MileageForecast {
  /** Forecast for the requested date (equals lastKm when there is no average). */
  km: number;
  lastDate: IsoDate;
  lastKm: number;
  /** km per day; null when fewer than two readings on different dates. */
  dailyAvg: number | null;
}

const WINDOW_DAYS = 365;

/** Live readings sorted by date, then km. */
export function mileagePoints(entries: readonly MileageEntry[]): MileagePoint[] {
  return entries
    .filter((e) => !e.deleted)
    .map((e) => ({ date: e.date, km: e.km }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.km - b.km);
}

/** Average km per day over the readings, preferring the last 12 months before `last`. */
export function dailyAverage(points: readonly MileagePoint[]): number | null {
  if (points.length < 2) return null;
  const last = points[points.length - 1]!;
  const inWindow = points.filter((p) => daysBetween(p.date, last.date) <= WINDOW_DAYS);
  const pick = (ps: readonly MileagePoint[]) => {
    const first = ps[0]!;
    const days = daysBetween(first.date, last.date);
    return days > 0 && last.km >= first.km ? (last.km - first.km) / days : null;
  };
  return (inWindow.length >= 2 ? pick(inWindow) : null) ?? pick(points);
}

/** Forecast for `at` from readings up to that date; null when there are none. */
export function forecastKm(points: readonly MileagePoint[], at: IsoDate): MileageForecast | null {
  const before = points.filter((p) => p.date <= at);
  if (before.length === 0) return null;
  const last = before[before.length - 1]!;
  const avg = dailyAverage(before);
  const days = Math.max(0, daysBetween(last.date, at));
  return {
    km: avg === null ? last.km : Math.round(last.km + avg * days),
    lastDate: last.date,
    lastKm: last.km,
    dailyAvg: avg,
  };
}

/** The last reading is a month old or older (D-096): the main screen asks for a fresh one. */
export function isMileageStale(lastDate: IsoDate, today: IsoDate): boolean {
  return addMonths(lastDate, 1) <= today;
}
