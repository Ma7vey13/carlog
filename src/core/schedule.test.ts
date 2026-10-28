import { describe, expect, it } from 'vitest';
import { ALL_PAGES } from '../../tests/fixtures/drafts';
import { AIR_FILTER, ALT_BELT, CABIN_FILTER, COOLANT, FIXTURE_REGULATION, HOSES, OIL, PLUGS, REAR_PADS, TODAY, TRANSFER_OIL } from '../../tests/fixtures/regulation';
import { draftToBundle } from '../../tests/helpers';
import type { VisitBundle } from './bundle';
import { suggestRegulationIds, unlinkedMatchingLines } from './keywords';
import { mileagePoints } from './mileage';
import type { ManualEvent, RegulationItem } from './model';
import { actualIntervals, currentMileage, DEFAULT_THRESHOLDS, kmDueDateEstimate, scheduleAll, scheduleItem, type Thresholds } from './schedule';

/** History of test pages 1–6, lines linked to the fixture regulation by keywords. */
function history(items: readonly RegulationItem[] = FIXTURE_REGULATION): VisitBundle[] {
  return ALL_PAGES.map((p) => {
    const b = draftToBundle(p);
    return { ...b, documents: b.documents.map((d) => ({ ...d, lines: d.lines.map((l) => ({ ...l, regulationItemIds: suggestRegulationIds(l.rawName, items) })) })) };
  });
}

const manual = (date: string, km: number | null, regulationItemId: string, approximate = false): ManualEvent => ({
  id: `m-${date}`,
  createdAt: '',
  updatedAt: '',
  deleted: false,
  deviceId: 'd',
  vehicleId: 'v',
  date,
  km,
  approximate,
  regulationItemId,
  note: '',
});

function ctx(bundles: VisitBundle[], events: ManualEvent[] = [], thresholds: Thresholds = DEFAULT_THRESHOLDS, today = TODAY) {
  const points = mileagePoints(bundles.flatMap((b) => (b.mileage ? [b.mileage] : [])));
  return { bundles, events, points, today, thresholds };
}

describe('schedule on the fixture regulation', () => {
  const bundles = history();
  const c = ctx(bundles);

  it('forecasts today’s mileage from the history', () => {
    const cur = currentMileage(c.points, TODAY)!;
    // 293 000 (12.03.25) → 303 700 (30.10.25): 46.1 km/day × 122 days
    expect(cur).toMatchObject({ km: 309327, estimated: true, lastDate: '2025-10-30', lastKm: 303700 });
  });

  it('gives the expected status for every item', () => {
    const byName = Object.fromEntries(scheduleAll(FIXTURE_REGULATION, c).map((s) => [s.item.name, s]));
    expect(byName[OIL.name]).toMatchObject({ status: 'green', dueKm: 313700, dueDate: '2026-10-30', remainingKm: 4373, remainingDays: 243 });
    expect(byName[REAR_PADS.name]).toMatchObject({ status: 'green', dueKm: 325000, dueDate: null, remainingKm: 15673 });
    expect(byName[AIR_FILTER.name]).toMatchObject({ status: 'green', dueKm: 315000, dueDate: '2027-04-11', remainingKm: 5673 });
    // 10 days left ≤ 30, though km are far
    expect(byName[CABIN_FILTER.name]).toMatchObject({ status: 'yellow', dueKm: 315000, dueDate: '2026-03-11', remainingDays: 10 });
    // 673 km left ≤ 1 000
    expect(byName[TRANSFER_OIL.name]).toMatchObject({ status: 'yellow', dueKm: 310000, remainingKm: 673 });
    // km not reached yet, but 48 months passed
    expect(byName[PLUGS.name]).toMatchObject({ status: 'red', dueKm: 310000, dueDate: '2025-10-06', remainingKm: 673, remainingDays: -146 });
    expect(byName[COOLANT.name]).toMatchObject({ status: 'red', dueKm: 290000, dueDate: '2023-10-06' });
    expect(byName[ALT_BELT.name]).toMatchObject({ status: 'gray', grayReason: 'no-data', last: null });
    expect(byName[HOSES.name]).toMatchObject({ status: 'gray', grayReason: 'no-interval' });
  });

  it('sorts by urgency: red, yellow, gray, then green', () => {
    expect(scheduleAll(FIXTURE_REGULATION, c).map((s) => s.item.name)).toEqual([
      COOLANT.name,
      PLUGS.name,
      CABIN_FILTER.name, // 10 days
      TRANSFER_OIL.name, // 673 km ≈ 15 days at the average pace
      ALT_BELT.name,
      HOSES.name,
      OIL.name, // 4 373 km ≈ 95 days
      AIR_FILTER.name, // 5 673 km ≈ 123 days
      REAR_PADS.name,
    ]);
  });

  it('collects all executions and the actual intervals between them', () => {
    const s = scheduleItem(OIL, c);
    expect(s.executions.map((e) => [e.date, e.km])).toEqual([
      ['2025-10-30', 303700],
      ['2025-04-11', 295000],
      ['2021-10-06', 250000],
    ]);
    expect(actualIntervals(s.executions).map((i) => [i.from.date, i.to.date, i.days, i.km])).toEqual([
      ['2021-10-06', '2025-04-11', 1283, 45000],
      ['2025-04-11', '2025-10-30', 202, 8700],
    ]);
  });

  it('uses severe intervals when the toggle is on', () => {
    const s = scheduleItem(OIL, ctx(bundles, [], { ...DEFAULT_THRESHOLDS, severeConditions: true }));
    expect(s).toMatchObject({ severeUsed: true, intervalKm: 7500, intervalMonths: 6, dueKm: 311200, dueDate: '2026-04-30', status: 'green' });
    // items without severe intervals keep the normal ones
    expect(scheduleItem(AIR_FILTER, ctx(bundles, [], { ...DEFAULT_THRESHOLDS, severeConditions: true }))).toMatchObject({ severeUsed: false, intervalKm: 20000 });
  });

  it('applies the thresholds from settings', () => {
    const s = scheduleItem(OIL, ctx(bundles, [], { ...DEFAULT_THRESHOLDS, severeConditions: true, warnKm: 2000 }));
    expect(s.status).toBe('yellow');
    expect(scheduleItem(CABIN_FILTER, ctx(bundles, [], { ...DEFAULT_THRESHOLDS, warnDays: 7, warnPercent: 2 })).status).toBe('green');
  });

  it('estimates when the km point is reached', () => {
    const s = scheduleItem(TRANSFER_OIL, c);
    expect(kmDueDateEstimate(s, currentMileage(c.points, TODAY), TODAY)).toBe('2026-03-16');
  });
});

describe('manual events ("Отметить, когда делалось")', () => {
  const bundles = history();

  it('make an item without visits trackable', () => {
    const s = scheduleItem(ALT_BELT, ctx(bundles, [manual('2024-05-01', null, ALT_BELT.id, true)]));
    expect(s).toMatchObject({ status: 'green', dueKm: null, dueDate: '2028-05-01' });
    expect(s.last).toMatchObject({ source: 'manual', approximate: true });
  });

  it('win over older visits', () => {
    const s = scheduleItem(OIL, ctx(bundles, [manual('2026-02-01', 308000, OIL.id)]));
    expect(s).toMatchObject({ dueKm: 318000, dueDate: '2027-02-01' });
    expect(s.executions).toHaveLength(4);
  });

  it('are ignored when deleted', () => {
    const e = { ...manual('2026-02-01', 308000, OIL.id), deleted: true };
    expect(scheduleItem(OIL, ctx(bundles, [e])).dueKm).toBe(313700);
  });
});

describe('what counts as an execution', () => {
  it('skips deleted visits and replaced documents', () => {
    const bundles = history();
    const deleted = bundles.map((b) => (b.visit.date === '2025-10-30' ? { ...b, visit: { ...b.visit, deleted: true } } : b));
    expect(scheduleItem(OIL, ctx(deleted)).last?.date).toBe('2025-04-11');
    const superseded = bundles.map((b) =>
      b.visit.date === '2025-10-30' ? { ...b, documents: b.documents.map((d) => ({ ...d, document: { ...d.document, supersededBy: 'other' } })) } : b,
    );
    expect(scheduleItem(OIL, ctx(superseded)).last?.date).toBe('2025-04-11');
  });

  it('estimates km of a visit without odometer from the mileage history', () => {
    const block: RegulationItem = { ...ALT_BELT, id: 'block', name: 'Блок цилиндров', intervalKm: 200000, intervalMonths: null, keywords: ['блок цилиндров'] };
    const bundles = history([block]);
    // invoice of 30.09.2021 has no odometer and there are no readings before it
    expect(scheduleItem(block, ctx(bundles))).toMatchObject({ status: 'gray', grayReason: 'no-data', last: { date: '2021-09-30', km: null } });
    const withReading = ctx(bundles);
    withReading.points.unshift({ date: '2021-01-01', km: 240000 });
    expect(scheduleItem(block, withReading)).toMatchObject({ last: { km: 240000, approximate: true }, dueKm: 440000 });
  });
});

describe('keyword matching', () => {
  it('finds history lines to link after adding an item', () => {
    const unlinked = history([]);
    const found = unlinkedMatchingLines(unlinked, OIL);
    expect(found.map((f) => f.date)).toEqual(['2025-10-30', '2025-04-11', '2025-04-11', '2021-10-06']);
    expect(unlinkedMatchingLines(history(), OIL)).toEqual([]);
  });

  it('matches word starts in any order, not substrings', () => {
    expect(suggestRegulationIds('Замена масла и фильтра в двигателе', FIXTURE_REGULATION)).toEqual([OIL.id]);
    expect(suggestRegulationIds('Замена масла в АКПП', FIXTURE_REGULATION)).toEqual([]);
    expect(suggestRegulationIds('Фильтр салонный', FIXTURE_REGULATION)).toEqual([CABIN_FILTER.id]);
    expect(suggestRegulationIds('Замена масла в раздаточной коробке', FIXTURE_REGULATION)).toEqual([TRANSFER_OIL.id]);
    expect(suggestRegulationIds('', FIXTURE_REGULATION)).toEqual([]);
  });
});
