import { v7 as uuidv7 } from 'uuid';

/** New record id: UUID v7 (time-ordered, SPEC section 4). */
export function newId(): string {
  return uuidv7();
}

/**
 * Deterministic id for built-in records (vehicle, starting components, self-check list).
 * Every device seeds the same ids, so the first sync merges them instead of duplicating.
 * Shape is a valid UUID v7 with a zero timestamp: 00000000-0000-7000-8000-<12 hex>.
 */
export function seedId(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffffffff) throw new RangeError(`bad seed number ${n}`);
  return `00000000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;
}

/** Timestamp of built-in records: older than any real edit, so the owner's changes always win a merge. */
export const SEED_TIMESTAMP = '2000-01-01T00:00:00.000Z';

export function isSeedId(id: string): boolean {
  return id.startsWith('00000000-0000-7000-8000-');
}
