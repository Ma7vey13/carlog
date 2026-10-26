// Editing the component tree (SPEC section 4: "Справочник редактируемый").

import { nowIso } from '../core/dates';
import { newId } from '../core/ids';
import type { Component, Id } from '../core/model';
import type { CarlogDB } from './db';
import { getDeviceId } from './device';

export async function addComponent(db: CarlogDB, name: string, parentId: Id | null): Promise<Id> {
  const deviceId = await getDeviceId(db);
  const now = nowIso();
  const siblings = (await db.components.toArray()).filter((c) => !c.deleted && c.parentId === parentId);
  const component: Component = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    deleted: false,
    deviceId,
    name: name.trim(),
    parentId,
    order: Math.max(0, ...siblings.map((c) => c.order)) + 10,
  };
  await db.components.add(component);
  return component.id;
}

export async function renameComponent(db: CarlogDB, id: Id, name: string): Promise<void> {
  const deviceId = await getDeviceId(db);
  await db.components.update(id, { name: name.trim(), updatedAt: nowIso(), deviceId });
}

/** How many live lines point at the component (shown before deleting). */
export async function componentUsage(db: CarlogDB, id: Id): Promise<number> {
  return (await db.lineItems.where('componentId').equals(id).toArray()).filter((l) => !l.deleted).length;
}

/**
 * Marks a component deleted. Its children move up to its parent; lines keep the id
 * and simply show no component (they can be re-assigned later).
 */
export async function deleteComponent(db: CarlogDB, id: Id): Promise<void> {
  const deviceId = await getDeviceId(db);
  const now = nowIso();
  await db.transaction('rw', db.components, async () => {
    const target = await db.components.get(id);
    if (!target) return;
    await db.components.where('parentId').equals(id).modify({ parentId: target.parentId, updatedAt: now, deviceId });
    await db.components.update(id, { deleted: true, updatedAt: now, deviceId });
  });
}
