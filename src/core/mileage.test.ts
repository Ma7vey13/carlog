import { describe, expect, it } from 'vitest';
import { dailyAverage, forecastKm, isMileageStale, mileagePoints } from './mileage';
import type { MileageEntry } from './model';

const entry = (date: string, km: number, deleted = false): MileageEntry => ({
  id: date,
  createdAt: '',
  updatedAt: '',
  deleted,
  deviceId: 'd',
  vehicleId: 'v',
  date,
  km,
  source: 'manual',
  visitId: null,
});

describe('mileage forecast', () => {
  const points = mileagePoints([entry('2025-07-22', 298000), entry('2025-03-12', 293000), entry('2025-10-30', 303700), entry('2025-05-01', 1, true)]);

  it('sorts live readings by date', () => {
    expect(points.map((p) => p.km)).toEqual([293000, 298000, 303700]);
  });

  it('averages over the last 12 months', () => {
    // 10 700 km over 232 days
    expect(dailyAverage(points)).toBeCloseTo(10700 / 232, 6);
  });

  it('forecasts from the last reading', () => {
    const f = forecastKm(points, '2026-10-26')!;
    expect(f.lastKm).toBe(303700);
    expect(f.lastDate).toBe('2025-10-30');
    expect(f.km).toBe(Math.round(303700 + (10700 / 232) * 361));
  });

  it('uses whole history when the last year has a single reading', () => {
    const sparse = mileagePoints([entry('2021-10-06', 250000), entry('2025-10-30', 303700)]);
    expect(dailyAverage(sparse)).toBeCloseTo(53700 / 1485, 6);
  });

  it('has no average with one reading and nothing before the date', () => {
    expect(forecastKm(mileagePoints([entry('2025-10-30', 303700)]), '2026-01-01')).toEqual({ km: 303700, lastDate: '2025-10-30', lastKm: 303700, dailyAvg: null });
    expect(forecastKm(points, '2020-01-01')).toBeNull();
  });
});

describe('stale mileage', () => {
  it('asks for a reading a month after the last one', () => {
    expect(isMileageStale('2026-09-29', '2026-10-28')).toBe(false);
    expect(isMileageStale('2026-09-29', '2026-10-29')).toBe(true);
    // the end of a short month
    expect(isMileageStale('2026-01-31', '2026-02-27')).toBe(false);
    expect(isMileageStale('2026-01-31', '2026-02-28')).toBe(true);
  });
});
