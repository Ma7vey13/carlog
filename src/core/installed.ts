// "Что ставили" on a regulation item card (D-094): the parts and materials of each visit where the
// item was done, with brand, article and price, so the owner can buy the same or compare prices.
//
//   a visit counts when one of its lines is linked to the item
//   its parts are the part and material lines that are linked to the item themselves, or that belong
//   to the same node as a linked line (or the item's own node) and are not linked to another item
// Documents "покупка без установки" are left out: those parts were not put on the car.

import { activeDocuments, type VisitBundle } from './bundle';
import type { Id, IsoDate, Kopecks, LineItem, RegulationItem } from './model';

export interface InstalledVisit {
  visitId: Id;
  date: IsoDate;
  km: number | null;
  shop: string | null;
  self: boolean;
  parts: LineItem[];
  /** Linked works, for the price of the job. */
  works: LineItem[];
  worksSum: Kopecks | null;
}

/** Visits where the item was done, newest first, with what was put on. */
export function installedFor(item: Pick<RegulationItem, 'id' | 'componentId'>, bundles: readonly VisitBundle[]): InstalledVisit[] {
  const out: InstalledVisit[] = [];
  for (const b of bundles) {
    if (b.visit.deleted || b.visit.status !== 'confirmed') continue;
    const lines = activeDocuments(b)
      .filter((d) => !d.document.deleted && !d.document.purchaseOnly)
      .flatMap((d) => d.lines.filter((l) => !l.deleted));
    const linked = lines.filter((l) => l.regulationItemIds.includes(item.id));
    if (linked.length === 0) continue;

    const nodes = new Set<Id>(linked.map((l) => l.componentId).filter((c): c is Id => c !== null));
    if (item.componentId) nodes.add(item.componentId);
    const parts = lines.filter(
      (l) =>
        l.kind !== 'work' &&
        (l.regulationItemIds.includes(item.id) || (l.regulationItemIds.length === 0 && l.componentId !== null && nodes.has(l.componentId))),
    );
    const works = linked.filter((l) => l.kind === 'work');
    const priced = works.filter((w) => w.sum !== null);
    out.push({
      visitId: b.visit.id,
      date: b.visit.date,
      km: b.visit.odometerKm,
      shop: b.visit.shop.name,
      self: b.visit.kind === 'self',
      parts,
      works,
      worksSum: priced.length ? priced.reduce((sum, w) => sum + (w.sum ?? 0), 0) : null,
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
