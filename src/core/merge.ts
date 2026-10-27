// Merging records from two devices (SPEC section 8): by id, the larger `updatedAt` wins;
// a deletion marker is an ordinary record; on a tie the larger `deviceId` wins, so every
// device reaches the same result. Nothing is ever dropped: a record present on one side only is kept.

import type { SyncFields } from './model';

function time(ts: string): number {
  const t = Date.parse(ts);
  return Number.isNaN(t) ? 0 : t;
}

/** The record that survives a merge of two versions of the same id. */
export function pickWinner<T extends SyncFields>(local: T, remote: T): T {
  const lt = time(local.updatedAt);
  const rt = time(remote.updatedAt);
  if (lt !== rt) return lt > rt ? local : remote;
  if (local.deviceId !== remote.deviceId) return local.deviceId > remote.deviceId ? local : remote;
  return local;
}

export interface MergeResult<T> {
  /** All records after the merge. */
  merged: T[];
  /** Records to write locally: new from remote or remote versions that won. */
  toLocal: T[];
  /** How many local records are newer than the remote ones (they will go up on the next push). */
  localWins: number;
}

export function mergeTable<T extends SyncFields>(local: readonly T[], remote: readonly T[]): MergeResult<T> {
  const byId = new Map<string, T>();
  for (const r of local) byId.set(r.id, r);
  const toLocal: T[] = [];
  let localWins = 0;
  for (const r of remote) {
    const mine = byId.get(r.id);
    if (!mine) {
      byId.set(r.id, r);
      toLocal.push(r);
      continue;
    }
    const winner = pickWinner(mine, r);
    if (winner === r && winner !== mine) {
      byId.set(r.id, r);
      toLocal.push(r);
    } else if (time(mine.updatedAt) !== time(r.updatedAt) || mine.deviceId !== r.deviceId) {
      localWins++;
    }
  }
  return { merged: [...byId.values()], toLocal, localWins };
}
