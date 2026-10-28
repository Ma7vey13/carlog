// Keyword matching for regulation items (SPEC section 7: "затем по ключевым словам").
// A regulation item has keyword variants; a line matches if every word of some variant starts
// a word of the line (any order, light Russian stemming as in search: "масла" ~ "масло").

import { activeDocuments, type VisitBundle } from './bundle';
import type { Id, RegulationItem } from './model';
import { matchKey } from './normalize';
import { searchStem } from './search';

export function matchesVariant(text: string, variant: string): boolean {
  const words = matchKey(variant).split(' ').filter(Boolean).map(searchStem);
  if (!words.length) return false;
  const tokens = matchKey(text).split(' ');
  return words.every((w) => tokens.some((t) => t.startsWith(w)));
}

export function matchesItem(text: string, item: Pick<RegulationItem, 'keywords'>): boolean {
  return item.keywords.some((k) => matchesVariant(text, k));
}

/** Regulation items whose keywords match a line name. */
export function suggestRegulationIds(name: string, items: readonly RegulationItem[]): Id[] {
  if (!name.trim()) return [];
  return items.filter((i) => !i.deleted && matchesItem(name, i)).map((i) => i.id);
}

export interface LineRef {
  visitId: Id;
  lineId: Id;
  date: string;
  name: string;
}

/** History lines (live, in active documents) matching the keyword variants, newest first. */
export function matchingLines(bundles: readonly VisitBundle[], keywords: readonly string[], exceptLinkedTo: Id | null = null): LineRef[] {
  if (!keywords.length) return [];
  const item = { keywords: [...keywords] };
  const out: LineRef[] = [];
  for (const b of bundles) {
    if (b.visit.deleted) continue;
    for (const d of activeDocuments(b)) {
      if (d.document.deleted) continue;
      for (const l of d.lines) {
        if (l.deleted || (exceptLinkedTo !== null && l.regulationItemIds.includes(exceptLinkedTo))) continue;
        if (matchesItem(l.name, item) || matchesItem(l.rawName, item)) out.push({ visitId: b.visit.id, lineId: l.id, date: b.visit.date, name: l.name });
      }
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * History lines that match an item's keywords but are not linked to it yet — for
 * "Найдено N строк в истории — привязать?" after the owner adds or edits an item.
 */
export function unlinkedMatchingLines(bundles: readonly VisitBundle[], item: Pick<RegulationItem, 'id' | 'keywords'>): LineRef[] {
  return matchingLines(bundles, item.keywords, item.id);
}
