import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PAGE2_ACT, PAGE5_ACT, PAGE6_INVOICE } from '../../tests/fixtures/drafts';
import { allLines, visitTotal } from '../core/bundle';
import { startComponentId } from '../core/components';
import type { DraftV1 } from '../core/draftSchema';
import { draftToForm } from '../core/draftToForm';
import { filterVisits } from '../core/search';
import { updateLine } from '../core/visitForm';
import { CarlogDB } from './db';
import { resetDeviceIdCache } from './device';
import {
  createDraftFromJson,
  createDraftFromScans,
  isOpenDraft,
  loadDrafts,
  rejectAllOpenDrafts,
  rejectDraft,
  restoreAllRejectedDrafts,
  restoreDraft,
  saveReviewedDraft,
  setDraftPayload,
  splitDraftByPages,
} from './drafts';
import { loadScanBlob, loadScans, rotateScan, storeScans } from './scans';
import { ensureSeed } from './seed';
import { loadMileage, loadVisitBundle, loadVisitBundles } from './visits';

let db: CarlogDB;
let n = 0;

beforeEach(async () => {
  resetDeviceIdCache();
  db = new CarlogDB(`carlog-drafts-${++n}`);
  await ensureSeed(db);
});
afterEach(async () => {
  await db.delete();
});

const page = (sha: string) => ({ blob: new Blob([sha], { type: 'image/jpeg' }), mime: 'image/jpeg', width: 1414, height: 2000, sha256: sha });

describe('scans and drafts', () => {
  it('stores pages once per content, keeps order and rotation', async () => {
    const ids = await storeScans(db, [page('aaa'), page('bbb'), page('aaa')]);
    const scans = await loadScans(db, ids);
    expect(scans.map((s) => [s.page, s.sha256, s.rotation, s.uploaded])).toEqual([
      [1, 'aaa', 0, false],
      [2, 'bbb', 0, false],
      [3, 'aaa', 0, false],
    ]);
    expect(await db.scanBlobs.count()).toBe(2);
    expect(await (await loadScanBlob(db, 'bbb'))?.text()).toBe('bbb');

    await rotateScan(db, ids[1]!, 90);
    expect((await loadScans(db, [ids[1]!]))[0]?.rotation).toBe(90);
  });

  it('moves a draft through pending → ready → rejected → restored', async () => {
    const scanIds = await storeScans(db, [page('x')]);
    const id = await createDraftFromScans(db, scanIds);
    expect((await db.drafts.get(id))).toMatchObject({ status: 'pending', payload: null, scanIds });

    await setDraftPayload(db, id, PAGE2_ACT);
    expect((await db.drafts.get(id))?.status).toBe('ready');

    await rejectDraft(db, id);
    const rejected = (await db.drafts.get(id))!;
    expect(rejected.status).toBe('rejected');
    expect(isOpenDraft(rejected)).toBe(false);
    expect(await db.scans.count()).toBe(1); // scans stay

    await restoreDraft(db, id);
    expect((await db.drafts.get(id))?.status).toBe('ready');
    expect((await loadDrafts(db)).map((d) => d.id)).toEqual([id]);
  });
});

describe('splitDraftByPages', () => {
  it('turns a PDF of several documents into one draft per page, in page order', async () => {
    const scanIds = await storeScans(db, [page('p1'), page('p2'), page('p3')]);
    const id = await createDraftFromScans(db, scanIds);
    const ids = await splitDraftByPages(db, id);
    expect(ids[0]).toBe(id);
    const drafts = await loadDrafts(db); // newest first
    expect(drafts.map((d) => d.scanIds)).toEqual([[scanIds[0]], [scanIds[1]], [scanIds[2]]]);
    expect(drafts.every((d) => d.status === 'pending')).toBe(true);
    expect((await loadScans(db, scanIds)).map((s) => s.page)).toEqual([1, 1, 1]);
  });
});

describe('bulk reject / restore', () => {
  it('rejects every open draft at once, leaves accepted ones, and can bring them all back', async () => {
    const scanIds = await storeScans(db, [page('a'), page('b'), page('c')]);
    const pending = await createDraftFromScans(db, scanIds);
    await splitDraftByPages(db, pending); // 3 pending drafts
    const ready = await createDraftFromJson(db, PAGE2_ACT);
    const accepted = await createDraftFromJson(db, PAGE5_ACT);
    await saveReviewedDraft(db, { draftId: accepted, form: draftToForm(PAGE5_ACT), decision: { mode: 'new' } });

    expect(await rejectAllOpenDrafts(db)).toBe(4);
    const after = await loadDrafts(db);
    expect(after.filter(isOpenDraft)).toEqual([]);
    expect(after.find((d) => d.id === accepted)?.status).toBe('accepted');
    expect(await db.scans.count()).toBe(3); // scans stay

    expect(await restoreAllRejectedDrafts(db)).toBe(4);
    const restored = await loadDrafts(db);
    expect(restored.filter((d) => d.status === 'pending')).toHaveLength(3);
    expect(restored.find((d) => d.id === ready)?.status).toBe('ready');
    expect(await rejectAllOpenDrafts(db)).toBe(4);
    expect(await rejectAllOpenDrafts(db)).toBe(0);
  });
});

describe('saveReviewedDraft', () => {
  it('creates a visit with scans, mileage and an accepted draft', async () => {
    const scanIds = await storeScans(db, [page('p2')]);
    const draftId = await createDraftFromScans(db, scanIds);
    await setDraftPayload(db, draftId, PAGE2_ACT);
    const form = draftToForm(PAGE2_ACT, { scanIds });

    const visitId = await saveReviewedDraft(db, { draftId, form, decision: { mode: 'new' } });
    const bundle = (await loadVisitBundle(db, visitId))!;
    expect(bundle.visit).toMatchObject({ date: '2025-07-22', odometerKm: 298000, status: 'confirmed' });
    expect(bundle.documents[0]!.document.scanIds).toEqual(scanIds);
    expect(visitTotal(bundle)).toBe(2730000);
    expect((await db.drafts.get(draftId))).toMatchObject({ status: 'accepted', visitId });
    expect((await loadMileage(db)).map((m) => m.km)).toEqual([298000]);
  });

  it('work order first, then its act with "заменить строки": one total, act dates the visit', async () => {
    const order: DraftV1 = { ...structuredClone(PAGE2_ACT), document: { ...PAGE2_ACT.document, type: 'work_order', number: '26548', date: '2025-07-20', relatedOrder: null } };
    const visitId = await saveReviewedDraft(db, { draftId: null, form: draftToForm(order), decision: { mode: 'new' } });
    const before = (await loadVisitBundle(db, visitId))!;

    await saveReviewedDraft(db, {
      draftId: null,
      form: draftToForm(PAGE2_ACT),
      decision: { mode: 'replace', visitId },
      replaceDocumentIds: [before.documents[0]!.document.id],
    });
    const after = (await loadVisitBundle(db, visitId))!;
    expect(after.visit.date).toBe('2025-07-22');
    expect(after.documents).toHaveLength(2);
    expect(after.documents[0]!.document.supersededBy).toBe(after.documents[1]!.document.id);
    expect(visitTotal(after)).toBe(2730000); // not doubled
    expect(allLines(after)).toHaveLength(6);
    // Only the act's lines count: work "…тормозного диска" + part "Диски…" (4 if the order's lines leaked in).
    expect(filterVisits([after], { query: 'диски', componentIds: null })[0]?.matchedLines).toHaveLength(2);
    expect((await loadVisitBundles(db))).toHaveLength(1);
  });

  it('page 6: attaches the invoice to the visit of work order 19963 and keeps its mileage', async () => {
    const visitId = await saveReviewedDraft(db, { draftId: null, form: draftToForm(PAGE5_ACT), decision: { mode: 'new' } });
    await saveReviewedDraft(db, { draftId: null, form: draftToForm(PAGE6_INVOICE), decision: { mode: 'attach', visitId } });

    const bundle = (await loadVisitBundle(db, visitId))!;
    expect(bundle.visit).toMatchObject({ date: '2021-10-06', odometerKm: 250000 });
    expect(bundle.documents.map((d) => d.document.type)).toEqual(['act', 'invoice']);
    expect(visitTotal(bundle)).toBe(12548000 + 14850000);
    expect((await loadMileage(db)).map((m) => m.km)).toEqual([250000]);
  });

  it('learns a rule from a corrected line and applies it to the next document', async () => {
    const form = draftToForm(PAGE2_ACT);
    const doc = form.documents[0]!;
    const i = doc.lines.findIndex((l) => l.rawName === 'Расходные материалы');
    let line = updateLine(doc.lines[i]!, { componentId: startComponentId('Тормоза передние'), nameOverride: 'Расходники' });
    expect(line.bindingEdited).toBe(true);
    line = { ...line, remember: true };
    doc.lines[i] = line;
    await saveReviewedDraft(db, { draftId: null, form, decision: { mode: 'new' } });

    const rules = await db.matchRules.toArray();
    expect(rules).toMatchObject([{ pattern: 'расходные материалы', name: 'Расходники', componentId: startComponentId('Тормоза передние') }]);

    const next = draftToForm(PAGE5_ACT, { rules });
    const consumables = next.documents[0]!.lines.find((l) => l.rawName === 'Расходные материалы')!;
    expect(consumables).toMatchObject({ nameOverride: 'Расходники', componentId: startComponentId('Тормоза передние') });
  });

  it('a JSON import without scans is ready for review at once', async () => {
    const id = await createDraftFromJson(db, PAGE2_ACT);
    expect(await db.drafts.get(id)).toMatchObject({ status: 'ready', scanIds: [], payload: PAGE2_ACT });
  });
});

describe('seed', () => {
  it('adds the default expected-part rules once', async () => {
    await ensureSeed(db);
    expect(await db.expectedPartRules.count()).toBe(12);
  });
});
