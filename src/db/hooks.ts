// Live queries: screens re-render when the data changes (in this tab or another).

import { useLiveQuery } from 'dexie-react-hooks';
import type { VisitBundle } from '../core/bundle';
import type { Component, Id, MileageEntry, RegulationItem } from '../core/model';
import { getDb } from './db';
import { loadMileage, loadVisitBundle, loadVisitBundles } from './visits';

/** undefined while loading. */
export function useVisitBundles(): VisitBundle[] | undefined {
  return useLiveQuery(() => loadVisitBundles(getDb()), []);
}

/** undefined while loading, null if missing or deleted. */
export function useVisitBundle(id: Id | null): VisitBundle | null | undefined {
  return useLiveQuery(() => (id ? loadVisitBundle(getDb(), id) : Promise.resolve(null)), [id]);
}

export function useComponents(): Component[] | undefined {
  return useLiveQuery(async () => (await getDb().components.toArray()).filter((c) => !c.deleted).sort((a, b) => a.order - b.order), []);
}

export function useMileage(): MileageEntry[] | undefined {
  return useLiveQuery(() => loadMileage(getDb()), []);
}

export function useRegulationItems(): RegulationItem[] | undefined {
  return useLiveQuery(async () => (await getDb().regulationItems.toArray()).filter((r) => !r.deleted), []);
}

/** Components as a flat list in tree order, with depth for indentation. */
export function componentTree(components: readonly Component[]): Array<{ component: Component; depth: number }> {
  const byParent = new Map<Id | null, Component[]>();
  for (const c of components) {
    const key = c.parentId && components.some((p) => p.id === c.parentId) ? c.parentId : null;
    byParent.set(key, [...(byParent.get(key) ?? []), c]);
  }
  const out: Array<{ component: Component; depth: number }> = [];
  const walk = (parent: Id | null, depth: number) => {
    for (const c of (byParent.get(parent) ?? []).sort((a, b) => a.order - b.order)) {
      out.push({ component: c, depth });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}
