import { newId } from '../core/ids';
import type { CarlogDB } from './db';

const DEVICE_ID_KEY = 'deviceId';

let cached: string | null = null;

/** Stable id of this browser profile; stored locally, never synced. Used in `deviceId` fields. */
export async function getDeviceId(db: CarlogDB): Promise<string> {
  if (cached) return cached;
  const stored = await db.meta.get(DEVICE_ID_KEY);
  if (typeof stored?.value === 'string') {
    cached = stored.value;
    return cached;
  }
  const id = newId();
  // add() fails if another tab created it first; then use theirs.
  try {
    await db.meta.add({ key: DEVICE_ID_KEY, value: id });
    cached = id;
  } catch {
    cached = String((await db.meta.get(DEVICE_ID_KEY))?.value ?? id);
  }
  return cached;
}

/** For tests: forget the cached id (each test database has its own). */
export function resetDeviceIdCache(): void {
  cached = null;
}
