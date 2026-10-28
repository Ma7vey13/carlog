// Applying an uploaded regulation table and undoing the last upload (stage 9).

import type { VisitBundle } from '../core/bundle';
import { nowIso } from '../core/dates';
import { newId } from '../core/ids';
import { unlinkedMatchingLines } from '../core/keywords';
import type { Id, RegulationImport, RegulationItem } from '../core/model';
import { itemsToLink, type ImportPlan } from '../core/regulationTable';
import type { CarlogDB } from './db';
import { getDeviceId } from './device';
import { loadVisitBundles } from './visits';

/** History lines the plan would link, [lineId, itemId] — for the preview and for applying. */
export function plannedLinks(bundles: readonly VisitBundle[], plan: ImportPlan, createdIds: readonly Id[] = plan.create.map((_, i) => `new-${i}`)): Array<[Id, Id]> {
  const pairs: Array<[Id, Id]> = [];
  for (const item of itemsToLink(plan, createdIds)) {
    for (const line of unlinkedMatchingLines(bundles, item)) pairs.push([line.lineId, item.id]);
  }
  return pairs;
}

export async function applyRegulationImport(db: CarlogDB, plan: ImportPlan, fileName: string): Promise<RegulationImport> {
  const deviceId = await getDeviceId(db);
  const now = nowIso();
  const bundles = await loadVisitBundles(db);
  const createdIds = plan.create.map(() => newId());
  const links = plannedLinks(bundles, plan, createdIds);

  const record: RegulationImport = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    deleted: false,
    deviceId,
    fileName,
    created: createdIds,
    before: [...plan.update.map((u) => u.existing), ...plan.revive.map((r) => r.existing), ...plan.remove],
    linked: [],
    summary: { created: plan.create.length, updated: plan.update.length, revived: plan.revive.length, removed: plan.remove.length, linked: 0 },
    undone: false,
  };

  await db.transaction('rw', [db.regulationItems, db.regulationImports, db.lineItems], async () => {
    const stamp = { updatedAt: now, deviceId, deleted: false, origin: 'table' as const };
    for (const [i, input] of plan.create.entries()) {
      const item: RegulationItem = { id: createdIds[i]!, createdAt: now, ...input, ...stamp };
      await db.regulationItems.add(item);
    }
    for (const { existing, input } of [...plan.update, ...plan.revive]) await db.regulationItems.put({ ...existing, ...input, ...stamp });
    for (const item of plan.remove) await db.regulationItems.put({ ...item, deleted: true, updatedAt: now, deviceId });

    const byLine = new Map<Id, Id[]>();
    for (const [lineId, itemId] of links) byLine.set(lineId, [...(byLine.get(lineId) ?? []), itemId]);
    for (const line of await db.lineItems.bulkGet([...byLine.keys()])) {
      if (!line || line.deleted) continue;
      const add = byLine.get(line.id)!.filter((id) => !line.regulationItemIds.includes(id));
      if (!add.length) continue;
      await db.lineItems.put({ ...line, regulationItemIds: [...line.regulationItemIds, ...add], updatedAt: now, deviceId });
      for (const id of add) record.linked.push([line.id, id]);
    }
    record.summary.linked = record.linked.length;
    await db.regulationImports.add(record);
  });
  return record;
}

/** The newest upload, if it can still be undone. */
export async function lastRegulationImport(db: CarlogDB): Promise<RegulationImport | null> {
  const all = (await db.regulationImports.toArray()).filter((r) => !r.deleted).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const last = all[0];
  return last && !last.undone ? last : null;
}

/**
 * Puts the regulation back as it was before the upload: changed and removed items restored,
 * created ones removed, history links made by the upload taken off. Only the newest upload.
 */
export async function undoRegulationImport(db: CarlogDB, importId: Id): Promise<void> {
  const last = await lastRegulationImport(db);
  if (!last || last.id !== importId) throw new Error('Отменить можно только последнюю загрузку таблицы');
  const deviceId = await getDeviceId(db);
  const now = nowIso();
  await db.transaction('rw', [db.regulationItems, db.regulationImports, db.lineItems], async () => {
    for (const item of last.before) await db.regulationItems.put({ ...item, updatedAt: now, deviceId });
    for (const id of last.created) await db.regulationItems.update(id, { deleted: true, updatedAt: now, deviceId });
    const byLine = new Map<Id, Id[]>();
    for (const [lineId, itemId] of last.linked) byLine.set(lineId, [...(byLine.get(lineId) ?? []), itemId]);
    for (const line of await db.lineItems.bulkGet([...byLine.keys()])) {
      if (!line) continue;
      const drop = new Set(byLine.get(line.id));
      await db.lineItems.put({ ...line, regulationItemIds: line.regulationItemIds.filter((id) => !drop.has(id)), updatedAt: now, deviceId });
    }
    await db.regulationImports.update(last.id, { undone: true, updatedAt: now, deviceId });
  });
}
