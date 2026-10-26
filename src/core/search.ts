// History search and component filter (SPEC stage 2). Data is small (hundreds of lines),
// so filtering runs in memory over loaded bundles.

import { allLines, type VisitBundle } from './bundle';
import type { Component, Id, LineItem } from './model';
import { matchKey } from './normalize';

export interface HistoryFilter {
  query: string;
  /** Component and all its descendants; null = any component. */
  componentIds: ReadonlySet<Id> | null;
}

export interface VisitMatch {
  bundle: VisitBundle;
  /** Lines that explain the match, to show under the visit. Empty when nothing is filtered. */
  matchedLines: LineItem[];
}

/** All ids in the subtree of `rootId`, including itself. */
export function componentSubtree(rootId: Id, components: readonly Component[]): Set<Id> {
  const children = new Map<Id, Id[]>();
  for (const c of components) {
    if (c.deleted || !c.parentId) continue;
    children.set(c.parentId, [...(children.get(c.parentId) ?? []), c.id]);
  }
  const result = new Set<Id>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    if (result.has(id)) continue;
    result.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  return result;
}

function lineText(line: LineItem): string {
  return matchKey([line.rawName, line.name, line.brand ?? '', line.article ?? ''].join(' '));
}

function visitText(bundle: VisitBundle): string {
  const { visit, documents } = bundle;
  return matchKey(
    [visit.shop.name ?? '', visit.notes, ...documents.map((d) => [d.document.number ?? '', d.document.relatedOrder?.number ?? ''].join(' '))].join(' '),
  );
}

/**
 * Crude Russian stemming for search words: drops up to two trailing letters of Cyrillic words
 * of 5+ letters, keeping at least 4. "колодки" → "колод" finds "колодок", "колодками";
 * "масло" → "масл" finds "масла". Numbers and Latin words are kept as typed.
 */
export function searchStem(word: string): string {
  if (!/^[а-я]+$/.test(word) || word.length < 5) return word;
  return word.slice(0, Math.max(4, word.length - 2));
}

/**
 * Filters visits by a text query and a component.
 * Every query word (stemmed) must occur as a substring; words may match
 * different lines or the shop name/notes/document numbers.
 */
export function filterVisits(bundles: readonly VisitBundle[], filter: HistoryFilter): VisitMatch[] {
  const words = matchKey(filter.query).split(' ').filter(Boolean).map(searchStem);
  const { componentIds } = filter;
  const result: VisitMatch[] = [];

  for (const bundle of bundles) {
    const lines = allLines(bundle).filter((l) => !l.deleted);
    const inComponent = componentIds ? lines.filter((l) => l.componentId && componentIds.has(l.componentId)) : lines;
    if (componentIds && inComponent.length === 0) continue;

    if (words.length === 0) {
      result.push({ bundle, matchedLines: componentIds ? inComponent : [] });
      continue;
    }

    const texts = inComponent.map((l) => ({ line: l, text: lineText(l) }));
    const header = visitText(bundle);
    const allWordsFound = words.every((w) => header.includes(w) || texts.some((t) => t.text.includes(w)));
    if (!allWordsFound) continue;

    const matchedLines = texts.filter((t) => words.some((w) => t.text.includes(w))).map((t) => t.line);
    result.push({ bundle, matchedLines });
  }
  return result;
}
