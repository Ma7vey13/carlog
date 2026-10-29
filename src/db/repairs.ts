// "Нужно отремонтировать" (D-097): records are soft-deleted and synced like the rest.

import { nowIso } from '../core/dates';
import { newId } from '../core/ids';
import type { Id, IsoDate, Repair } from '../core/model';
import type { CarlogDB } from './db';
import { getDeviceId } from './device';

export type RepairInput = Pick<Repair, 'title' | 'note' | 'urgency' | 'componentId'>;

export async function loadRepairs(db: CarlogDB): Promise<Repair[]> {
  return (await db.repairs.toArray()).filter((r) => !r.deleted);
}

export async function saveRepair(db: CarlogDB, id: Id | null, input: RepairInput): Promise<Id> {
  const deviceId = await getDeviceId(db);
  const now = nowIso();
  const prev = id ? await db.repairs.get(id) : undefined;
  const repair: Repair = {
    id: prev?.id ?? newId(),
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
    deleted: false,
    deviceId,
    doneDate: prev?.doneDate ?? null,
    visitId: prev?.visitId ?? null,
    ...input,
    title: input.title.trim(),
    note: input.note.trim(),
  };
  await db.repairs.put(repair);
  return repair.id;
}

/** "Сделано": the date and, if picked, the visit where it was done. */
export async function markRepairDone(db: CarlogDB, id: Id, doneDate: IsoDate, visitId: Id | null): Promise<void> {
  const deviceId = await getDeviceId(db);
  await db.repairs.update(id, { doneDate, visitId, updatedAt: nowIso(), deviceId });
}

/** Back to the open list (marked done by mistake, or it came back). */
export async function reopenRepair(db: CarlogDB, id: Id): Promise<void> {
  const deviceId = await getDeviceId(db);
  await db.repairs.update(id, { doneDate: null, visitId: null, updatedAt: nowIso(), deviceId });
}

export async function deleteRepair(db: CarlogDB, id: Id): Promise<void> {
  const deviceId = await getDeviceId(db);
  await db.repairs.update(id, { deleted: true, updatedAt: nowIso(), deviceId });
}
