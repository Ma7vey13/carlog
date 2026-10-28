// Due dates for the maintenance schedule (SPEC section 9). Pure functions over the history.
//
//   last execution = the latest of confirmed visit lines linked to the item and ManualEvents
//   due by km      = km of the last execution + interval km
//   due by date    = date of the last execution + interval months
//   status         = red (overdue) / yellow (≤ 10 % of the interval, ≤ 1 000 km or ≤ 30 days left,
//                    thresholds from settings) / green / gray (no data)

import { activeDocuments, type VisitBundle } from './bundle';
import { addDays, addMonths, daysBetween } from './dates';
import type { Id, IsoDate, ManualEvent, RegulationItem, Settings } from './model';
import { forecastKm, type MileagePoint } from './mileage';
import { matchKey } from './normalize';

export type ScheduleStatus = 'red' | 'yellow' | 'green' | 'gray';

export interface Execution {
  date: IsoDate;
  /** null when unknown (a visit without odometer and no mileage history around it). */
  km: number | null;
  /** km or date was estimated (ManualEvent "примерно", or km taken from the mileage history). */
  approximate: boolean;
  source: 'visit' | 'manual';
  visitId: Id | null;
  manualEventId: Id | null;
  note: string;
}

export interface CurrentMileage {
  km: number;
  /** true when this is a forecast, not a reading of today. */
  estimated: boolean;
  lastDate: IsoDate;
  lastKm: number;
  dailyAvg: number | null;
}

export interface ItemSchedule {
  item: RegulationItem;
  status: ScheduleStatus;
  /** Why gray: nothing recorded yet, or the item has no interval. */
  grayReason: 'no-data' | 'no-interval' | null;
  last: Execution | null;
  executions: Execution[];
  intervalKm: number | null;
  intervalMonths: number | null;
  severeUsed: boolean;
  dueKm: number | null;
  dueDate: IsoDate | null;
  remainingKm: number | null;
  remainingDays: number | null;
  /** Rough days until due (km converted with the average daily mileage) — for sorting. */
  urgencyDays: number | null;
}

export type Thresholds = Pick<Settings, 'warnPercent' | 'warnKm' | 'warnDays' | 'severeConditions'>;

export const DEFAULT_THRESHOLDS: Thresholds = { warnPercent: 10, warnKm: 1000, warnDays: 30, severeConditions: false };

/** Today's mileage: the last reading, plus the average daily mileage × days since (SPEC section 9). */
export function currentMileage(points: readonly MileagePoint[], today: IsoDate): CurrentMileage | null {
  const f = forecastKm(points, today);
  if (!f) return null;
  return { km: f.km, estimated: f.km !== f.lastKm || f.lastDate !== today, lastDate: f.lastDate, lastKm: f.lastKm, dailyAvg: f.dailyAvg };
}

function visitExecution(b: VisitBundle, points: readonly MileagePoint[]): Execution {
  let km = b.visit.odometerKm;
  let approximate = false;
  if (km === null) {
    // e.g. a purchase document without mileage: estimate from the readings before that date
    const f = forecastKm(points, b.visit.date);
    km = f ? f.km : null;
    approximate = km !== null;
  }
  return { date: b.visit.date, km, approximate, source: 'visit', visitId: b.visit.id, manualEventId: null, note: '' };
}

/** Executions of one item, newest first. */
export function executionsOf(item: RegulationItem, bundles: readonly VisitBundle[], events: readonly ManualEvent[], points: readonly MileagePoint[]): Execution[] {
  const out: Execution[] = [];
  for (const b of bundles) {
    if (b.visit.deleted || b.visit.status !== 'confirmed') continue;
    const linked = activeDocuments(b).some((d) => !d.document.deleted && d.lines.some((l) => !l.deleted && l.regulationItemIds.includes(item.id)));
    if (!linked) continue;
    out.push(visitExecution(b, points));
  }
  for (const e of events) {
    if (e.deleted || e.regulationItemId !== item.id) continue;
    out.push({ date: e.date, km: e.km, approximate: e.approximate, source: 'manual', visitId: null, manualEventId: e.id, note: e.note });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || (b.km ?? 0) - (a.km ?? 0));
}

function intervalsOf(item: RegulationItem, severe: boolean) {
  const km = severe && item.severeIntervalKm ? item.severeIntervalKm : item.intervalKm;
  const months = severe && item.severeIntervalMonths ? item.severeIntervalMonths : item.intervalMonths;
  const severeUsed = severe && ((!!item.severeIntervalKm && km === item.severeIntervalKm) || (!!item.severeIntervalMonths && months === item.severeIntervalMonths));
  return { km: km && km > 0 ? km : null, months: months && months > 0 ? months : null, severeUsed };
}

export function scheduleItem(
  item: RegulationItem,
  ctx: { bundles: readonly VisitBundle[]; events: readonly ManualEvent[]; points: readonly MileagePoint[]; today: IsoDate; thresholds: Thresholds },
): ItemSchedule {
  const executions = executionsOf(item, ctx.bundles, ctx.events, ctx.points);
  const last = executions[0] ?? null;
  const iv = intervalsOf(item, ctx.thresholds.severeConditions);
  const base = { item, executions, last, intervalKm: iv.km, intervalMonths: iv.months, severeUsed: iv.severeUsed };
  const empty = { dueKm: null, dueDate: null, remainingKm: null, remainingDays: null, urgencyDays: null };

  if (!iv.km && !iv.months) return { ...base, ...empty, status: 'gray', grayReason: 'no-interval' };
  if (!last) return { ...base, ...empty, status: 'gray', grayReason: 'no-data' };

  const current = currentMileage(ctx.points, ctx.today);
  const dueKm = iv.km && last.km !== null ? last.km + iv.km : null;
  const dueDate = iv.months ? addMonths(last.date, iv.months) : null;
  const remainingKm = dueKm !== null && current ? dueKm - current.km : null;
  const remainingDays = dueDate ? daysBetween(ctx.today, dueDate) : null;

  if (remainingKm === null && remainingDays === null) return { ...base, ...empty, dueKm, dueDate, status: 'gray', grayReason: 'no-data' };

  const t = ctx.thresholds;
  const overdue = (remainingKm !== null && remainingKm <= 0) || (remainingDays !== null && remainingDays <= 0);
  const intervalDays = iv.months ? daysBetween(last.date, addMonths(last.date, iv.months)) : null;
  const soonKm = remainingKm !== null && iv.km !== null && (remainingKm <= t.warnKm || remainingKm <= (iv.km * t.warnPercent) / 100);
  const soonDays = remainingDays !== null && intervalDays !== null && (remainingDays <= t.warnDays || remainingDays <= (intervalDays * t.warnPercent) / 100);
  const status: ScheduleStatus = overdue ? 'red' : soonKm || soonDays ? 'yellow' : 'green';

  const avg = current?.dailyAvg ?? null;
  const kmAsDays = remainingKm !== null && avg ? remainingKm / avg : null;
  const urgencyDays = [kmAsDays, remainingDays].filter((x): x is number => x !== null).reduce<number | null>((m, x) => (m === null || x < m ? x : m), null);

  return { ...base, status, grayReason: null, dueKm, dueDate, remainingKm, remainingDays, urgencyDays };
}

const ORDER: Record<ScheduleStatus, number> = { red: 0, yellow: 1, gray: 2, green: 3 };

/** All items, most urgent first: red, yellow, then gray (no data), then green. */
export function scheduleAll(
  items: readonly RegulationItem[],
  ctx: { bundles: readonly VisitBundle[]; events: readonly ManualEvent[]; points: readonly MileagePoint[]; today: IsoDate; thresholds: Thresholds },
): ItemSchedule[] {
  return items
    .filter((i) => !i.deleted)
    .map((i) => scheduleItem(i, ctx))
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || (a.urgencyDays ?? Infinity) - (b.urgencyDays ?? Infinity) || a.item.name.localeCompare(b.item.name, 'ru'));
}

/** The date when the km due point is reached at the average pace (for "≈ до …"). */
export function kmDueDateEstimate(s: ItemSchedule, current: CurrentMileage | null, today: IsoDate): IsoDate | null {
  if (s.remainingKm === null || !current?.dailyAvg) return null;
  return addDays(today, Math.round(s.remainingKm / current.dailyAvg));
}

export interface IntervalStep {
  from: Execution;
  to: Execution;
  days: number;
  km: number | null;
}

/** Actual intervals between consecutive executions, oldest first ("12.03.25 → 22.07.25, 5 000 км"). */
export function actualIntervals(executions: readonly Execution[]): IntervalStep[] {
  const asc = [...executions].sort((a, b) => a.date.localeCompare(b.date));
  const out: IntervalStep[] = [];
  for (let i = 1; i < asc.length; i++) {
    const from = asc[i - 1]!;
    const to = asc[i]!;
    out.push({ from, to, days: daysBetween(from.date, to.date), km: from.km !== null && to.km !== null ? to.km - from.km : null });
  }
  return out;
}

export interface PartHistory {
  /** matchKey of the line name: lines named the same are one part. */
  key: string;
  name: string;
  executions: Execution[];
}

/**
 * Everything done to a component (and its sub-components), grouped by line name, newest first —
 * for the component card: "Колодки тормозные перед.: 12.03.25 → 22.07.25, 5 000 км".
 */
export function componentHistory(componentIds: ReadonlySet<Id>, bundles: readonly VisitBundle[], points: readonly MileagePoint[]): PartHistory[] {
  const groups = new Map<string, PartHistory>();
  for (const b of bundles) {
    if (b.visit.deleted || b.visit.status !== 'confirmed') continue;
    for (const d of activeDocuments(b)) {
      if (d.document.deleted) continue;
      for (const l of d.lines) {
        if (l.deleted || l.kind === 'material' || !l.componentId || !componentIds.has(l.componentId)) continue;
        const key = matchKey(l.name);
        const group = groups.get(key) ?? { key, name: l.name, executions: [] };
        if (!group.executions.some((e) => e.visitId === b.visit.id)) group.executions.push(visitExecution(b, points));
        groups.set(key, group);
      }
    }
  }
  for (const g of groups.values()) g.executions.sort((a, b) => b.date.localeCompare(a.date));
  return [...groups.values()].sort((a, b) => b.executions[0]!.date.localeCompare(a.executions[0]!.date) || a.name.localeCompare(b.name, 'ru'));
}
