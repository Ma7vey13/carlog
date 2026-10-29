// Recognition drafts (SPEC sections 6–7): from scans in the inbox to a reviewed visit.
// Nothing reaches the history without the review screen; rejected drafts keep their scans.

import { activeDocuments } from '../core/bundle';
import type { ReviewDecision } from '../core/checks';
import { nowIso } from '../core/dates';
import type { DraftV1 } from '../core/draftSchema';
import { newId } from '../core/ids';
import { ruleKey } from '../core/matchRules';
import type { Draft, DraftSource, Id, MatchRule, MileageEntry, Visit } from '../core/model';
import { normalizeName } from '../core/normalize';
import { formToRecords, type VisitForm } from '../core/visitForm';
import type { CarlogDB } from './db';
import { getDeviceId } from './device';
import { VEHICLE_ID } from './seed';
import { loadVisitBundle } from './visits';

const OPEN: Draft['status'][] = ['pending', 'ready'];

export function isOpenDraft(d: Draft): boolean {
  return !d.deleted && OPEN.includes(d.status);
}

export async function loadDrafts(db: CarlogDB): Promise<Draft[]> {
  return (await db.drafts.toArray()).filter((d) => !d.deleted).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function newDraft(db: CarlogDB, fields: Pick<Draft, 'source' | 'scanIds' | 'payload' | 'status'>): Promise<Id> {
  const deviceId = await getDeviceId(db);
  const now = nowIso();
  const draft: Draft = { id: newId(), createdAt: now, updatedAt: now, deleted: false, deviceId, visitId: null, ...fields };
  await db.drafts.add(draft);
  return draft.id;
}

/** "Добавить документ": stored scans → draft waiting for recognition. */
export function createDraftFromScans(db: CarlogDB, scanIds: Id[]): Promise<Id> {
  return newDraft(db, { source: 'chat', scanIds, payload: null, status: 'pending' });
}

/** "Добавить страницу": more pages of the same document (e.g. page 2 photographed later). */
export async function addPagesToDraft(db: CarlogDB, id: Id, scanIds: Id[]): Promise<void> {
  const draft = await db.drafts.get(id);
  if (!draft) return;
  const deviceId = await getDeviceId(db);
  const all = [...draft.scanIds, ...scanIds];
  await db.transaction('rw', [db.drafts, db.scans], async () => {
    await db.drafts.update(id, { scanIds: all, updatedAt: nowIso(), deviceId });
    // Keep page numbers continuous across the whole document.
    for (const [i, scanId] of all.entries()) await db.scans.update(scanId, { page: i + 1 });
  });
}

/**
 * "Это разные документы": a PDF of several documents (like the test file of six) becomes one
 * draft per page. The first page stays in this draft; the order of the new drafts follows the pages.
 */
export async function splitDraftByPages(db: CarlogDB, id: Id): Promise<Id[]> {
  const draft = await db.drafts.get(id);
  if (!draft || draft.scanIds.length < 2) return [id];
  const deviceId = await getDeviceId(db);
  const [first, ...rest] = draft.scanIds;
  const base = Date.parse(draft.createdAt) || Date.now();
  const created: Draft[] = rest.map((scanId, i) => ({
    id: newId(),
    // Older-to-newer by page, so the inbox (newest first) lists page 2 right after page 1.
    createdAt: new Date(base - (i + 1)).toISOString(),
    updatedAt: nowIso(),
    deleted: false,
    deviceId,
    source: draft.source,
    scanIds: [scanId],
    payload: null,
    status: 'pending',
    visitId: null,
  }));
  await db.transaction('rw', [db.drafts, db.scans], async () => {
    await db.drafts.update(id, { scanIds: [first!], payload: null, status: 'pending', updatedAt: nowIso(), deviceId });
    await db.drafts.bulkAdd(created);
    for (const scanId of draft.scanIds) await db.scans.update(scanId, { page: 1 });
  });
  return [id, ...created.map((d) => d.id)];
}

/** "Импорт JSON-файла" without scans: ready for review at once. */
export function createDraftFromJson(db: CarlogDB, draft: DraftV1, source: DraftSource = 'chat'): Promise<Id> {
  return newDraft(db, { source, scanIds: [], payload: draft, status: 'ready' });
}

/** "Вставить результат" / JSON file for an existing draft → ready for review. */
export async function setDraftPayload(db: CarlogDB, id: Id, payload: DraftV1, source: DraftSource = 'chat'): Promise<void> {
  const deviceId = await getDeviceId(db);
  await db.drafts.update(id, { payload, source, status: 'ready', updatedAt: nowIso(), deviceId });
}

/** "Ввести вручную" for a draft with scans: review with an empty form. */
export async function startManualReview(db: CarlogDB, id: Id): Promise<void> {
  const deviceId = await getDeviceId(db);
  await db.drafts.update(id, { source: 'manual', status: 'ready', updatedAt: nowIso(), deviceId });
}

/** "Отклонить": to the archive; scans stay. */
export async function rejectDraft(db: CarlogDB, id: Id): Promise<void> {
  const deviceId = await getDeviceId(db);
  const now = nowIso();
  await db.drafts.update(id, { status: 'rejected', archivedAt: now, updatedAt: now, deviceId });
}

/** "Отклонить все": every open draft to the archive in one transaction; scans stay. Returns how many. */
export async function rejectAllOpenDrafts(db: CarlogDB): Promise<number> {
  const deviceId = await getDeviceId(db);
  const now = nowIso();
  return db.transaction('rw', db.drafts, async () => {
    const open = (await db.drafts.toArray()).filter(isOpenDraft);
    for (const d of open) await db.drafts.update(d.id, { status: 'rejected', archivedAt: now, updatedAt: now, deviceId });
    return open.length;
  });
}

/** "Вернуть все отклонённые": undo for a mistaken "Отклонить все". Returns how many. */
export async function restoreAllRejectedDrafts(db: CarlogDB): Promise<number> {
  const deviceId = await getDeviceId(db);
  const now = nowIso();
  return db.transaction('rw', db.drafts, async () => {
    const rejected = (await db.drafts.toArray()).filter((d) => !d.deleted && d.status === 'rejected');
    for (const d of rejected) {
      const status = d.payload || d.source === 'manual' ? 'ready' : 'pending';
      await db.drafts.update(d.id, { status, archivedAt: null, updatedAt: now, deviceId });
    }
    return rejected.length;
  });
}

/** Back from the archive to the inbox. */
export async function restoreDraft(db: CarlogDB, id: Id): Promise<void> {
  const draft = await db.drafts.get(id);
  if (!draft) return;
  const deviceId = await getDeviceId(db);
  const status = draft.payload || draft.source === 'manual' ? 'ready' : 'pending';
  await db.drafts.update(id, { status, archivedAt: null, updatedAt: nowIso(), deviceId });
}

/** The archive clears itself this many days after a draft went there. */
export const ARCHIVE_KEEP_DAYS = 30;

/** When the draft went to the archive; drafts archived before D-092 have only updatedAt. */
export function archivedAtOf(d: Draft): string {
  return d.archivedAt ?? d.updatedAt;
}

export interface ArchiveCleanup {
  drafts: number;
  scans: number;
}

/**
 * "Очистить архив" (D-092): archived drafts are deleted (softly, so other devices follow), and so
 * are their scans that no document refers to — the pages of rejected drafts. Scans of saved visits
 * stay, even of a deleted visit. With `olderThanDays`, only drafts archived at least that long ago.
 * Files no live scan uses are then removed from this device.
 */
export async function clearArchive(db: CarlogDB, opts: { olderThanDays?: number; now?: Date } = {}): Promise<ArchiveCleanup> {
  const deviceId = await getDeviceId(db);
  const nowDate = opts.now ?? new Date();
  const now = nowDate.toISOString();
  const cutoff = opts.olderThanDays === undefined ? null : new Date(nowDate.getTime() - opts.olderThanDays * 86_400_000).toISOString();
  return db.transaction('rw', [db.drafts, db.documents, db.scans, db.scanBlobs], async () => {
    const drafts = (await db.drafts.toArray()).filter((d) => !d.deleted);
    const gone = drafts.filter((d) => !isOpenDraft(d) && (cutoff === null || archivedAtOf(d) <= cutoff));
    if (gone.length === 0) return { drafts: 0, scans: 0 };
    const goneIds = new Set(gone.map((d) => d.id));

    const kept = new Set<string>();
    for (const doc of await db.documents.toArray()) for (const id of doc.scanIds) kept.add(id);
    for (const d of drafts) if (!goneIds.has(d.id)) for (const id of d.scanIds) kept.add(id);
    const scanIds = [...new Set(gone.flatMap((d) => d.scanIds))].filter((id) => !kept.has(id));

    const mark = { deleted: true, updatedAt: now, deviceId };
    for (const d of gone) await db.drafts.update(d.id, mark);
    let scans = 0;
    for (const s of await db.scans.bulkGet(scanIds)) {
      if (!s || s.deleted) continue;
      await db.scans.update(s.id, mark);
      scans++;
    }
    await pruneScanBlobs(db);
    return { drafts: gone.length, scans };
  });
}

/** Removes local files that no live scan refers to (left by deleted scans, here or on another device). */
export async function pruneScanBlobs(db: CarlogDB): Promise<number> {
  return db.transaction('rw', [db.scans, db.scanBlobs], async () => {
    const used = new Set((await db.scans.toArray()).filter((s) => !s.deleted).map((s) => s.sha256));
    const orphans = (await db.scanBlobs.toCollection().primaryKeys()).filter((sha) => !used.has(sha));
    await db.scanBlobs.bulkDelete(orphans);
    return orphans.length;
  });
}

export interface ReviewSave {
  draftId: Id | null;
  form: VisitForm;
  decision: ReviewDecision;
  /** With decision 'replace': documents of the target visit whose lines the new document replaces. */
  replaceDocumentIds?: Id[];
}

/**
 * "Сохранить визит" on the review screen. Creates a visit or joins an existing one,
 * stores documents and lines, the mileage mark, learned MatchRules, and accepts the draft.
 */
export async function saveReviewedDraft(db: CarlogDB, save: ReviewSave): Promise<Id> {
  const deviceId = await getDeviceId(db);
  const now = nowIso();
  const target = save.decision.mode === 'new' ? null : await loadVisitBundle(db, save.decision.visitId);
  if (save.decision.mode !== 'new' && !target) throw new Error('Визит для прикрепления не найден');

  const records = formToRecords(save.form, { deviceId, vehicleId: VEHICLE_ID, now, existing: null });
  let visit: Visit = records.visit;
  let mileage: MileageEntry | null = records.mileage;
  const documents = records.documents;
  const lines = records.lines;
  const superseded: Array<{ id: Id }> = [];

  if (target) {
    // Join the existing visit: move the new document and lines over, fill gaps in the visit.
    for (const d of documents) d.visitId = target.visit.id;
    for (const l of lines) l.visitId = target.visit.id;
    const act = documents.find((d) => d.type === 'act' && d.date);
    const odometerKm = target.visit.odometerKm ?? records.visit.odometerKm;
    const shop = { ...target.visit.shop };
    for (const k of Object.keys(shop) as Array<keyof typeof shop>) shop[k] ??= records.visit.shop[k];
    visit = {
      ...target.visit,
      // The act dates the visit (DECISIONS D-013).
      date: act?.date ?? target.visit.date,
      odometerKm,
      shop,
      updatedAt: now,
      deviceId,
    };
    mileage =
      odometerKm === null
        ? null
        : {
            ...(target.mileage ?? {
              id: newId(),
              createdAt: now,
              vehicleId: visit.vehicleId,
              source: 'visit' as const,
              visitId: visit.id,
            }),
            date: visit.date,
            km: odometerKm,
            deleted: false,
            updatedAt: now,
            deviceId,
          };
    if (save.decision.mode === 'replace') {
      const ids = new Set(save.replaceDocumentIds ?? []);
      for (const { document } of activeDocuments(target)) if (ids.has(document.id)) superseded.push({ id: document.id });
    }
  }

  const newDocId = documents[0]?.id ?? null;
  const rules = await learnedRules(db, save.form, deviceId, now);

  await db.transaction('rw', [db.visits, db.documents, db.lineItems, db.mileageEntries, db.matchRules, db.drafts], async () => {
    await db.visits.put(visit);
    await db.documents.bulkPut(documents);
    await db.lineItems.bulkPut(lines);
    if (mileage) await db.mileageEntries.put(mileage);
    for (const s of superseded) await db.documents.update(s.id, { supersededBy: newDocId, updatedAt: now, deviceId });
    if (rules.length) await db.matchRules.bulkPut(rules);
    if (save.draftId) await db.drafts.update(save.draftId, { status: 'accepted', visitId: visit.id, archivedAt: now, updatedAt: now, deviceId });
  });
  return visit.id;
}

/** "Запомнить для похожих строк": one rule per ticked line, updating an existing rule with the same key. */
async function learnedRules(db: CarlogDB, form: VisitForm, deviceId: string, now: string): Promise<MatchRule[]> {
  const ticked = form.documents.flatMap((d) => d.lines).filter((l) => l.remember && l.rawName.trim());
  if (!ticked.length) return [];
  const existing = (await db.matchRules.toArray()).filter((r) => !r.deleted);
  return ticked.map((l) => {
    const pattern = ruleKey(l.rawName);
    const prev = existing.find((r) => r.pattern === pattern);
    return {
      id: prev?.id ?? newId(),
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
      deleted: false,
      deviceId,
      pattern,
      name: l.nameOverride.trim() || normalizeName(l.rawName),
      componentId: l.componentId,
      regulationItemIds: l.regulationItemIds,
    };
  });
}
