// "Нужно отремонтировать" (D-097): open repairs by urgency, done ones newest first.

import type { Repair, RepairUrgency } from './model';

export const REPAIR_URGENCIES: readonly RepairUrgency[] = ['urgent', 'soon', 'later'];

/** The status dot of the main screen: square, triangle, ring. */
export const REPAIR_DOT: Record<RepairUrgency, 'red' | 'yellow' | 'gray'> = { urgent: 'red', soon: 'yellow', later: 'gray' };

const ORDER: Record<RepairUrgency, number> = { urgent: 0, soon: 1, later: 2 };

export function isOpenRepair(r: Repair): boolean {
  return !r.deleted && r.doneDate === null;
}

/** Open repairs: urgent first, then the oldest first (it has waited longest). */
export function openRepairs(repairs: readonly Repair[]): Repair[] {
  return repairs.filter(isOpenRepair).sort((a, b) => ORDER[a.urgency] - ORDER[b.urgency] || a.createdAt.localeCompare(b.createdAt));
}

/** Done repairs, the latest first. */
export function doneRepairs(repairs: readonly Repair[]): Repair[] {
  return repairs.filter((r) => !r.deleted && r.doneDate !== null).sort((a, b) => b.doneDate!.localeCompare(a.doneDate!) || b.updatedAt.localeCompare(a.updatedAt));
}
