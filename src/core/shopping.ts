// "Что купить" (D-102): parts for the chosen items of the service list, taken from the history —
// what was put on the last time, with brand, article, quantity and price. A list for the owner:
// copied apart from the list for the service, never printed.
//
//   regulation item → the parts of its last execution with parts (core/installed.ts)
//   repair          → the newest visit with parts named like the repair ("Стойки стабилизатора" →
//                     "Стойка стабил. перед лев."), on the same node if the repair has one
//   self-check note → nothing: the master looks first
// The service's consumables ("Расходные материалы") are left out. The same part needed for two
// items is one row.

import { activeDocuments, type VisitBundle } from './bundle';
import { installedFor } from './installed';
import type { Id, IsoDate, Kopecks, LineItem, RegulationItem, Repair } from './model';
import { formatQty, formatRub } from './money';
import { matchKey } from './normalize';
import { searchStem } from './search';
import type { ServiceListEntry } from './serviceList';

export interface ShoppingItem {
  /** matchKey of the name: one row per part. */
  key: string;
  name: string;
  brand: string | null;
  article: string | null;
  qty: number | null;
  unit: string | null;
  /** Price per unit the last time. */
  price: Kopecks | null;
  /** When it was bought last. */
  date: IsoDate;
  /** Names of the list items it is for. */
  for: string[];
  /** Only for "Проверить" items: maybe not needed, so not ticked at first. */
  maybe: boolean;
}

export interface ShoppingList {
  items: ShoppingItem[];
  /** List items with no parts in the history (to buy by hand or ask the service). */
  notFound: string[];
}

const CONSUMABLES = /расходн/;

function counted(line: LineItem): boolean {
  return !line.deleted && line.kind !== 'work' && !CONSUMABLES.test(matchKey(line.name || line.rawName));
}

/** The first word of the repair title, stemmed: the thing to buy ("стойк", "шрус", "пыльн"). */
function repairStem(title: string): string | null {
  const word = matchKey(title)
    .split(' ')
    .find((w) => w.length >= 3);
  return word ? searchStem(word) : null;
}

/** Parts of the newest visit that has parts named like the repair. */
export function partsForRepair(repair: Pick<Repair, 'title' | 'componentId'>, bundles: readonly VisitBundle[]): { date: IsoDate; lines: LineItem[] } | null {
  const stem = repairStem(repair.title);
  if (!stem) return null;
  const sorted = bundles.filter((b) => !b.visit.deleted && b.visit.status === 'confirmed').sort((a, b) => b.visit.date.localeCompare(a.visit.date));
  for (const b of sorted) {
    const lines = activeDocuments(b)
      .filter((d) => !d.document.deleted)
      .flatMap((d) => d.lines)
      .filter(counted)
      .filter((l) => (!repair.componentId || !l.componentId || l.componentId === repair.componentId) && matchKey(l.name || l.rawName).split(' ').some((t) => t.startsWith(stem)));
    if (lines.length) return { date: b.visit.date, lines };
  }
  return null;
}

export function shoppingList(
  entries: readonly ServiceListEntry[],
  ctx: { regulation: ReadonlyMap<Id, RegulationItem>; repairs: ReadonlyMap<Id, Repair>; bundles: readonly VisitBundle[] },
): ShoppingList {
  const byKey = new Map<string, ShoppingItem>();
  const notFound: string[] = [];
  for (const e of entries) {
    let found: { date: IsoDate; lines: LineItem[] } | null = null;
    if (e.group === 'repair') {
      const repair = ctx.repairs.get(e.id);
      if (repair) found = partsForRepair(repair, ctx.bundles);
    } else {
      const item = ctx.regulation.get(e.id);
      if (!item) continue; // a self-check note: nothing to buy before the master looks
      const visit = installedFor(item, ctx.bundles).find((v) => v.parts.some(counted));
      if (visit) found = { date: visit.date, lines: visit.parts.filter(counted) };
    }
    if (!found) {
      notFound.push(e.name);
      continue;
    }
    for (const l of found.lines) {
      const name = l.name || l.rawName;
      const key = matchKey(name);
      const had = byKey.get(key);
      if (had) {
        if (!had.for.includes(e.name)) had.for.push(e.name);
        had.maybe &&= e.group === 'inspect';
        continue;
      }
      byKey.set(key, {
        key,
        name,
        brand: l.brand,
        article: l.article,
        qty: l.qty,
        unit: l.unit,
        price: l.price ?? (l.sum !== null && l.qty ? Math.round(l.sum / l.qty) : null),
        date: found.date,
        for: [e.name],
        maybe: e.group === 'inspect',
      });
    }
  }
  return { items: [...byKey.values()], notFound };
}

/** One line of the copied list: "Фильтр маслянный SFN — 1 шт, арт. 26300-35503, в прошлый раз 700 ₽". */
export function shoppingLine(i: ShoppingItem): string {
  const parts = [i.qty !== null ? `${formatQty(i.qty)} ${i.unit || 'шт'}` : '', i.article ? `арт. ${i.article}` : '', i.price !== null ? `в прошлый раз ${formatRub(i.price)}` : ''].filter(Boolean);
  return `- ${i.name}${parts.length ? ` — ${parts.join(', ')}` : ''}`;
}

export function shoppingText(items: readonly ShoppingItem[]): string {
  return items.length ? `Купить:\n${items.map(shoppingLine).join('\n')}` : '';
}
