// Reading and writing visits as bundles (visit + documents + lines + mileage mark).
// Deletion only sets `deleted: true` (SPEC section 14); nothing is removed physically.

import type { VisitBundle } from '../core/bundle';
import { nowIso } from '../core/dates';
import { newId } from '../core/ids';
import type { Id, MileageEntry, Visit } from '../core/model';
import { formToRecords, type VisitForm } from '../core/visitForm';
import type { CarlogDB } from './db';
import { getDeviceId } from './device';
import { VEHICLE_ID } from './seed';

const live = <T extends { deleted: boolean }>(rows: T[]): T[] => rows.filter((r) => !r.deleted);

/** Newest first; same-day visits by creation time. */
export function compareVisits(a: Visit, b: Visit): number {
  return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);
}

async function assemble(db: CarlogDB, visits: Visit[]): Promise<VisitBundle[]> {
  const ids = visits.map((v) => v.id);
  const [documents, lines, mileage] = await Promise.all([
    db.documents.where('visitId').anyOf(ids).toArray(),
    db.lineItems.where('visitId').anyOf(ids).toArray(),
    db.mileageEntries.where('visitId').anyOf(ids).toArray(),
  ]);
  const liveDocs = live(documents);
  const liveLines = live(lines).sort((a, b) => a.n - b.n);
  const liveMileage = live(mileage);

  return visits.map((visit) => ({
    visit,
    documents: liveDocs
      .filter((d) => d.visitId === visit.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((document) => ({ document, lines: liveLines.filter((l) => l.documentId === document.id) })),
    mileage: liveMileage.find((m) => m.visitId === visit.id) ?? null,
  }));
}

export async function loadVisitBundles(db: CarlogDB): Promise<VisitBundle[]> {
  const visits = live(await db.visits.toArray()).sort(compareVisits);
  return assemble(db, visits);
}

export async function loadVisitBundle(db: CarlogDB, id: Id): Promise<VisitBundle | null> {
  const visit = await db.visits.get(id);
  if (!visit || visit.deleted) return null;
  const [bundle] = await assemble(db, [visit]);
  return bundle ?? null;
}

/** Saves a checked form (see checkVisitForm). Returns the visit id. */
export async function saveVisitForm(db: CarlogDB, form: VisitForm, existing: VisitBundle | null): Promise<Id> {
  const deviceId = await getDeviceId(db);
  const records = formToRecords(form, { deviceId, vehicleId: VEHICLE_ID, now: nowIso(), existing });
  await db.transaction('rw', [db.visits, db.documents, db.lineItems, db.mileageEntries], async () => {
    await db.visits.put(records.visit);
    await db.documents.bulkPut(records.documents);
    await db.lineItems.bulkPut(records.lines);
    if (records.mileage) await db.mileageEntries.put(records.mileage);
  });
  return records.visit.id;
}

/** Marks a visit and everything attached to it as deleted. */
export async function deleteVisit(db: CarlogDB, id: Id): Promise<void> {
  const deviceId = await getDeviceId(db);
  const now = nowIso();
  const mark = { deleted: true, updatedAt: now, deviceId };
  await db.transaction('rw', [db.visits, db.documents, db.lineItems, db.mileageEntries], async () => {
    await db.visits.update(id, mark);
    await db.documents.where('visitId').equals(id).modify(mark);
    await db.lineItems.where('visitId').equals(id).modify(mark);
    await db.mileageEntries.where('visitId').equals(id).modify(mark);
  });
}

// --- Mileage marks ---------------------------------------------------------------------------

export async function loadMileage(db: CarlogDB): Promise<MileageEntry[]> {
  return live(await db.mileageEntries.toArray()).sort((a, b) => b.date.localeCompare(a.date) || b.km - a.km);
}

export async function addManualMileage(db: CarlogDB, date: string, km: number): Promise<Id> {
  const deviceId = await getDeviceId(db);
  const now = nowIso();
  const entry: MileageEntry = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    deleted: false,
    deviceId,
    vehicleId: VEHICLE_ID,
    date,
    km,
    source: 'manual',
    visitId: null,
  };
  await db.mileageEntries.add(entry);
  return entry.id;
}

export async function deleteMileage(db: CarlogDB, id: Id): Promise<void> {
  const deviceId = await getDeviceId(db);
  await db.mileageEntries.update(id, { deleted: true, updatedAt: nowIso(), deviceId });
}
