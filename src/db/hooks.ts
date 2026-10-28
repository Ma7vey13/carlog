// Live queries: screens re-render when the data changes (in this tab or another).

import { useLiveQuery } from 'dexie-react-hooks';
import type { VisitBundle } from '../core/bundle';
import type { Component, Draft, ExpectedPartRule, Id, ManualEvent, MatchRule, MileageEntry, RegulationItem, Scan, Settings } from '../core/model';
import { isOpenDraft, loadDrafts } from './drafts';
import { loadScans } from './scans';
import { getDb } from './db';
import { loadManualEvents, loadRegulationItems, loadSettings } from './regulation';
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
  return useLiveQuery(() => loadRegulationItems(getDb()), []);
}

export function useManualEvents(): ManualEvent[] | undefined {
  return useLiveQuery(() => loadManualEvents(getDb()), []);
}

export function useSettings(): Settings | undefined {
  return useLiveQuery(() => loadSettings(getDb()), []);
}

export function useDrafts(): Draft[] | undefined {
  return useLiveQuery(() => loadDrafts(getDb()), []);
}

export function useDraft(id: Id | null): Draft | null | undefined {
  return useLiveQuery(async () => (id ? ((await getDb().drafts.get(id)) ?? null) : null), [id]);
}

/** Number of drafts waiting in the inbox (badge on the tab). */
export function useOpenDraftCount(): number {
  return useLiveQuery(async () => (await getDb().drafts.toArray()).filter(isOpenDraft).length, []) ?? 0;
}

export function useScans(ids: readonly Id[] | undefined): Scan[] | undefined {
  const key = (ids ?? []).join(',');
  return useLiveQuery(() => loadScans(getDb(), ids ?? []), [key]);
}

export function useExpectedPartRules(): ExpectedPartRule[] | undefined {
  return useLiveQuery(async () => (await getDb().expectedPartRules.toArray()).filter((r) => !r.deleted).sort((a, b) => a.label.localeCompare(b.label, 'ru')), []);
}

export function useMatchRules(): MatchRule[] | undefined {
  return useLiveQuery(async () => (await getDb().matchRules.toArray()).filter((r) => !r.deleted), []);
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
