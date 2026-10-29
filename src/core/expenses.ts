// "Расходы" (D-095): money spent on the car by year and month, ТО against ремонт, by node, per km.
//
// A visit costs what visitTotal() says: each document's own total, or the sum of its lines. Inside a
// document the total is spread over the lines in proportion to their sums, so a discount lowers every
// line alike and the parts always add up to the total:
//   line of ТО / ремонт (core/purpose.ts)   → "ТО" / "Ремонт"
//   anything else (purchase without installation, a line that is neither, a total without lines)
//                                           → "Другое"

import { activeDocuments, sumLines, type VisitBundle } from './bundle';
import type { Id, IsoDate, Kopecks, RegulationItem } from './model';
import type { MileagePoint } from './mileage';
import { visitPurpose } from './purpose';

export type ExpenseKind = 'maintenance' | 'repair' | 'other';

export const EXPENSE_KINDS: readonly ExpenseKind[] = ['maintenance', 'repair', 'other'];

export const EXPENSE_KIND_LABELS: Record<ExpenseKind, string> = { maintenance: 'ТО', repair: 'Ремонт', other: 'Другое' };

export type ByKind = Record<ExpenseKind, number>;

export interface VisitExpense {
  visitId: Id;
  date: IsoDate;
  shop: string | null;
  self: boolean;
  total: number;
  byKind: ByKind;
  /** Money per node; null = lines without a node and totals without lines. */
  byNode: Map<Id | null, number>;
}

const zero = (): ByKind => ({ maintenance: 0, repair: 0, other: 0 });

function addTo<K>(map: Map<K, number>, key: K, amount: number) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

export function visitExpense(bundle: VisitBundle, regulation: ReadonlyMap<Id, RegulationItem>): VisitExpense {
  const purposes = visitPurpose(bundle, regulation).byLine;
  const byKind = zero();
  const byNode = new Map<Id | null, number>();
  let total = 0;
  for (const { document, lines } of activeDocuments(bundle)) {
    if (document.deleted) continue;
    const live = lines.filter((l) => !l.deleted);
    const lineSum = sumLines(live).total;
    const docTotal = document.totals.total ?? lineSum;
    total += docTotal;
    const factor = lineSum > 0 ? docTotal / lineSum : 0;
    let spread = 0;
    for (const l of live) {
      if (!l.sum) continue;
      const amount = l.sum * factor;
      spread += amount;
      const p = document.purchaseOnly ? null : (purposes.get(l.id) ?? null);
      byKind[p ?? 'other'] += amount;
      addTo(byNode, l.componentId, amount);
    }
    const rest = docTotal - spread;
    if (Math.abs(rest) > 0.5) {
      byKind.other += rest;
      addTo(byNode, null, rest);
    }
  }
  return { visitId: bundle.visit.id, date: bundle.visit.date, shop: bundle.visit.shop.name, self: bundle.visit.kind === 'self', total, byKind, byNode };
}

/** Confirmed visits that cost something, newest first. */
export function allExpenses(bundles: readonly VisitBundle[], regulation: ReadonlyMap<Id, RegulationItem>): VisitExpense[] {
  return bundles
    .filter((b) => !b.visit.deleted && b.visit.status === 'confirmed')
    .map((b) => visitExpense(b, regulation))
    .filter((e) => e.total !== 0)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Years with expenses, newest first. */
export function expenseYears(expenses: readonly VisitExpense[]): number[] {
  return [...new Set(expenses.map((e) => Number(e.date.slice(0, 4))))].sort((a, b) => b - a);
}

/** A year, or the whole history. */
export type ExpensePeriod = number | 'all';

export interface ExpenseBucket {
  /** "2026-03" for a month, "2026" for a year. */
  key: string;
  total: number;
  byKind: ByKind;
}

export interface ExpenseSummary {
  total: Kopecks;
  byKind: ByKind;
  visits: number;
  /** Months of the year, or every year from the first to the last. */
  buckets: ExpenseBucket[];
  /** Nodes by money, biggest first. */
  byNode: Array<{ componentId: Id | null; total: number }>;
  /** The costliest visits of the period, up to five. */
  top: VisitExpense[];
  /** km driven in the period by the odometer readings; null when too few readings. */
  km: number | null;
  /** Kopecks per km; null when fewer than MIN_KM_FOR_RATE km are known. */
  perKm: number | null;
}

/** Below this the cost of a km says little (one visit, a few readings). */
export const MIN_KM_FOR_RATE = 500;

function kmAt(points: readonly MileagePoint[], date: IsoDate): number | null {
  let km: number | null = null;
  for (const p of points) if (p.date <= date) km = p.km;
  return km;
}

/** km driven in the period: last reading of it minus the last one before it (or its first). */
export function kmInPeriod(points: readonly MileagePoint[], period: ExpensePeriod): number | null {
  if (points.length < 2) return null;
  let start: number | null;
  let end: number | null;
  if (period === 'all') {
    start = points[0]!.km;
    end = points[points.length - 1]!.km;
  } else {
    const inYear = points.filter((p) => p.date.startsWith(`${period}-`));
    start = kmAt(points, `${period - 1}-12-31`) ?? inYear[0]?.km ?? null;
    end = kmAt(points, `${period}-12-31`);
  }
  if (start === null || end === null || end <= start) return null;
  return end - start;
}

export function summarize(expenses: readonly VisitExpense[], period: ExpensePeriod, points: readonly MileagePoint[]): ExpenseSummary {
  const list = period === 'all' ? [...expenses] : expenses.filter((e) => e.date.startsWith(`${period}-`));
  const byKind = zero();
  const nodes = new Map<Id | null, number>();
  const buckets = new Map<string, ExpenseBucket>();

  let keys: string[];
  if (period === 'all') {
    const years = list.map((e) => Number(e.date.slice(0, 4)));
    const first = Math.min(...years);
    const last = Math.max(...years);
    keys = years.length ? Array.from({ length: last - first + 1 }, (_, i) => String(first + i)) : [];
  } else {
    keys = Array.from({ length: 12 }, (_, i) => `${period}-${String(i + 1).padStart(2, '0')}`);
  }
  for (const key of keys) buckets.set(key, { key, total: 0, byKind: zero() });

  let total = 0;
  for (const e of list) {
    total += e.total;
    const bucket = buckets.get(period === 'all' ? e.date.slice(0, 4) : e.date.slice(0, 7))!;
    bucket.total += e.total;
    for (const k of EXPENSE_KINDS) {
      byKind[k] += e.byKind[k];
      bucket.byKind[k] += e.byKind[k];
    }
    for (const [node, amount] of e.byNode) addTo(nodes, node, amount);
  }

  const km = kmInPeriod(points, period);
  return {
    total: Math.round(total),
    byKind: roundKinds(byKind),
    visits: list.length,
    buckets: [...buckets.values()].map((b) => ({ ...b, total: Math.round(b.total), byKind: roundKinds(b.byKind) })),
    byNode: [...nodes]
      .map(([componentId, sum]) => ({ componentId, total: Math.round(sum) }))
      .filter((n) => n.total !== 0)
      .sort((a, b) => b.total - a.total),
    top: [...list].sort((a, b) => b.total - a.total || b.date.localeCompare(a.date)).slice(0, 5),
    km,
    perKm: km !== null && km >= MIN_KM_FOR_RATE && total > 0 ? Math.round(total / km) : null,
  };
}

/** Rounds to kopecks so that the kinds still add up to the rounded total. */
function roundKinds(k: ByKind): ByKind {
  const total = Math.round(k.maintenance + k.repair + k.other);
  const maintenance = Math.round(k.maintenance);
  const repair = Math.round(k.repair);
  return { maintenance, repair, other: total - maintenance - repair };
}
