import { newId } from '../core/ids';
import type { CarlogDB } from './db';

const DEVICE_ID_KEY = 'deviceId';

/** Cached per database instance: tests run two "devices" (two databases) in one process. */
const cache = new WeakMap<CarlogDB, string>();

/** Stable id of this browser profile; stored locally, never synced. Used in `deviceId` fields. */
export async function getDeviceId(db: CarlogDB): Promise<string> {
  const cached = cache.get(db);
  if (cached) return cached;
  const stored = await db.meta.get(DEVICE_ID_KEY);
  let id: string;
  if (typeof stored?.value === 'string') {
    id = stored.value;
  } else {
    id = newId();
    // add() fails if another tab created it first; then use theirs.
    try {
      await db.meta.add({ key: DEVICE_ID_KEY, value: id });
    } catch {
      id = String((await db.meta.get(DEVICE_ID_KEY))?.value ?? id);
    }
  }
  cache.set(db, id);
  return id;
}

/** Kept for tests written before the per-database cache; nothing to reset any more. */
export function resetDeviceIdCache(): void {}
