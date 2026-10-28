// ТО or ремонт (D-089): what each line of a visit was, derived from the regulation links, so the
// history needs no extra field and old visits are sorted too.
//
//   line linked to a "замена" item                    → ТО
//   line linked to a "проверка" item and named as one → ТО ("Диагностика ходовой")
//   any other work                                    → ремонт ("Замена колодок" found worn)
//   part or material                                  → as the works it goes with: same node,
//                                                       else the document's, else the visit's
// Lines of "покупка без установки" documents are neither: nothing was done to the car.

import { activeDocuments, type VisitBundle } from './bundle';
import type { Id, Kopecks, LineItem, RegulationItem } from './model';
import { matchKey } from './normalize';

export type Purpose = 'maintenance' | 'repair';

export const PURPOSES: readonly Purpose[] = ['maintenance', 'repair'];

export interface VisitPurpose {
  /** Purpose of each counted line; null when it cannot be told (a part with no works around). */
  byLine: Map<Id, Purpose | null>;
  maintenance: boolean;
  repair: boolean;
  maintenanceSum: Kopecks;
  repairSum: Kopecks;
  /** Every document is a purchase without installation. */
  purchaseOnly: boolean;
}

const INSPECTION_RE = /(^| )(диагност|провер|осмотр|контрол|регулир|тест)/;

function ownPurpose(line: LineItem, regulation: ReadonlyMap<Id, RegulationItem>): Purpose | null {
  const items = line.regulationItemIds.map((id) => regulation.get(id)).filter((i): i is RegulationItem => !!i && !i.deleted);
  if (items.some((i) => i.action === 'replace')) return 'maintenance';
  if (items.length > 0 && INSPECTION_RE.test(matchKey(line.name || line.rawName))) return 'maintenance';
  return line.kind === 'work' ? 'repair' : null;
}

/** The only purpose among `ps`, or null when there are none or both. */
function single(ps: ReadonlyArray<Purpose | null>): Purpose | null {
  const set = new Set(ps.filter((p): p is Purpose => p !== null));
  return set.size === 1 ? [...set][0]! : null;
}

export function visitPurpose(bundle: VisitBundle, regulation: ReadonlyMap<Id, RegulationItem>): VisitPurpose {
  const byLine = new Map<Id, Purpose | null>();
  const docs = activeDocuments(bundle).filter((d) => !d.document.deleted);
  const counted = docs.filter((d) => !d.document.purchaseOnly).map((d) => ({ ...d, lines: d.lines.filter((l) => !l.deleted) }));

  const own = new Map<Id, Purpose | null>();
  for (const d of counted) for (const l of d.lines) own.set(l.id, ownPurpose(l, regulation));
  const visitWide = single([...own.values()]);

  for (const d of counted) {
    const docWide = single(d.lines.map((l) => own.get(l.id) ?? null));
    for (const l of d.lines) {
      let p: Purpose | null = own.get(l.id) ?? null;
      if (p === null) {
        const sameNode = l.componentId ? single(d.lines.filter((w) => w.kind === 'work' && w.componentId === l.componentId).map((w) => own.get(w.id) ?? null)) : null;
        p = sameNode ?? docWide ?? visitWide;
      }
      byLine.set(l.id, p);
    }
  }

  let maintenanceSum = 0;
  let repairSum = 0;
  for (const d of counted) {
    for (const l of d.lines) {
      const p = byLine.get(l.id);
      if (p === 'maintenance') maintenanceSum += l.sum ?? 0;
      if (p === 'repair') repairSum += l.sum ?? 0;
    }
  }
  const values = [...byLine.values()];
  return {
    byLine,
    maintenance: values.includes('maintenance'),
    repair: values.includes('repair'),
    maintenanceSum,
    repairSum,
    purchaseOnly: docs.length > 0 && counted.length === 0,
  };
}

export function regulationById(items: readonly RegulationItem[] | undefined): Map<Id, RegulationItem> {
  return new Map((items ?? []).map((i) => [i.id, i]));
}
