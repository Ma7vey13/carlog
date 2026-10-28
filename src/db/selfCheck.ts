// Self-check list and journal, documents with an end date (SPEC section 10).

import { nowIso, todayIso } from '../core/dates';
import { newId } from '../core/ids';
import type { Id, IsoDate, SelfCheckItem, SelfCheckLog, SelfCheckResult, TermDocument } from '../core/model';
import type { CarlogDB } from './db';
import { getDeviceId } from './device';

// ---------------------------------------------------------------------------------------------
// Self-check

export type SelfCheckItemInput = Pick<SelfCheckItem, 'name' | 'periodDays' | 'howTo'>;

export async function loadSelfCheckItems(db: CarlogDB): Promise<SelfCheckItem[]> {
  return (await db.selfCheckItems.toArray()).filter((i) => !i.deleted).sort((a, b) => a.order - b.order);
}

export async function loadSelfCheckLogs(db: CarlogDB): Promise<SelfCheckLog[]> {
  return (await db.selfCheckLogs.toArray()).filter((l) => !l.deleted);
}

export async function saveSelfCheckItem(db: CarlogDB, id: Id | null, input: SelfCheckItemInput): Promise<Id> {
  const deviceId = await getDeviceId(db);
  const now = nowIso();
  const prev = id ? await db.selfCheckItems.get(id) : undefined;
  const order = prev?.order ?? Math.max(0, ...(await db.selfCheckItems.toArray()).map((i) => i.order)) + 10;
  const item: SelfCheckItem = {
    id: prev?.id ?? newId(),
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
    deleted: false,
    deviceId,
    order,
    ...input,
  };
  await db.selfCheckItems.put(item);
  return item.id;
}

export async function deleteSelfCheckItem(db: CarlogDB, id: Id): Promise<void> {
  const deviceId = await getDeviceId(db);
  await db.selfCheckItems.update(id, { deleted: true, updatedAt: nowIso(), deviceId });
}

/** "В норме" / "Нужно внимание", dated today unless given. */
export async function logSelfCheck(db: CarlogDB, itemId: Id, result: SelfCheckResult, note = '', date: IsoDate = todayIso()): Promise<Id> {
  const deviceId = await getDeviceId(db);
  const now = nowIso();
  const entry: SelfCheckLog = { id: newId(), createdAt: now, updatedAt: now, deleted: false, deviceId, itemId, date, result, note: note.trim() };
  await db.selfCheckLogs.add(entry);
  return entry.id;
}

export async function deleteSelfCheckLog(db: CarlogDB, id: Id): Promise<void> {
  const deviceId = await getDeviceId(db);
  await db.selfCheckLogs.update(id, { deleted: true, updatedAt: nowIso(), deviceId });
}

// ---------------------------------------------------------------------------------------------
// Documents with an end date

export type TermDocumentInput = Pick<TermDocument, 'kind' | 'title' | 'number' | 'company' | 'startDate' | 'endDate' | 'remindDaysBefore'>;

export async function loadTermDocuments(db: CarlogDB): Promise<TermDocument[]> {
  return (await db.termDocuments.toArray()).filter((d) => !d.deleted);
}

export async function saveTermDocument(db: CarlogDB, id: Id | null, input: TermDocumentInput): Promise<Id> {
  const deviceId = await getDeviceId(db);
  const now = nowIso();
  const prev = id ? await db.termDocuments.get(id) : undefined;
  const doc: TermDocument = {
    id: prev?.id ?? newId(),
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
    deleted: false,
    deviceId,
    scanIds: prev?.scanIds ?? [],
    ...input,
  };
  await db.termDocuments.put(doc);
  return doc.id;
}

/** Attaches stored scans (no recognition: the fields are typed by hand). */
export async function addTermDocumentScans(db: CarlogDB, id: Id, scanIds: readonly Id[]): Promise<void> {
  const deviceId = await getDeviceId(db);
  const doc = await db.termDocuments.get(id);
  if (!doc) return;
  await db.termDocuments.put({ ...doc, scanIds: [...doc.scanIds, ...scanIds], updatedAt: nowIso(), deviceId });
}

/** Detaches all scans; the scan records are marked deleted so they are not uploaded any more. */
export async function clearTermDocumentScans(db: CarlogDB, id: Id): Promise<void> {
  const deviceId = await getDeviceId(db);
  const now = nowIso();
  await db.transaction('rw', [db.termDocuments, db.scans], async () => {
    const doc = await db.termDocuments.get(id);
    if (!doc) return;
    for (const scanId of doc.scanIds) await db.scans.update(scanId, { deleted: true, updatedAt: now, deviceId });
    await db.termDocuments.put({ ...doc, scanIds: [], updatedAt: now, deviceId });
  });
}

export async function deleteTermDocument(db: CarlogDB, id: Id): Promise<void> {
  const deviceId = await getDeviceId(db);
  const now = nowIso();
  await db.transaction('rw', [db.termDocuments, db.scans], async () => {
    const doc = await db.termDocuments.get(id);
    if (!doc) return;
    for (const scanId of doc.scanIds) await db.scans.update(scanId, { deleted: true, updatedAt: now, deviceId });
    await db.termDocuments.update(id, { deleted: true, updatedAt: now, deviceId });
  });
}
