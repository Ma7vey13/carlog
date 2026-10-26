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
  await db.drafts.update(id, { status: 'rejected', updatedAt: nowIso(), deviceId });
}

/** Back from the archive to the inbox. */
export async function restoreDraft(db: CarlogDB, id: Id): Promise<void> {
  const draft = await db.drafts.get(id);
  if (!draft) return;
  const deviceId = await getDeviceId(db);
  const status = draft.payload || draft.source === 'manual' ? 'ready' : 'pending';
  await db.drafts.update(id, { status, updatedAt: nowIso(), deviceId });
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
    if (save.draftId) await db.drafts.update(save.draftId, { status: 'accepted', visitId: visit.id, updatedAt: now, deviceId });
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
