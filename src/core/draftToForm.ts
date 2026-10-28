// Recognition draft → editable review form. The draft keeps the document as printed;
// here names are normalised and lines get components (learned rules first, then history, then keywords).

import { todayIso } from './dates';
import type { DraftV1 } from './draftSchema';
import { findRule } from './matchRules';
import type { Id, MatchRule, RegulationItem } from './model';
import { formatQty } from './money';
import { emptyDocument, emptyLine, emptyVisitForm, suggestLineRegulation, updateLine, type NameHint, type VisitForm } from './visitForm';

const rubToInput = (v: number | null): string => (v === null ? '' : String(v).replace('.', ','));

export interface DraftToFormOptions {
  hints?: readonly NameHint[];
  rules?: readonly MatchRule[];
  scanIds?: Id[];
  today?: string;
  regulation?: readonly RegulationItem[];
}

/**
 * The visit date is the document date: for an act that is the act date, not the work order date
 * (SPEC section 11, page 5). The odometer comes from the document; empty if it has none.
 */
export function draftToForm(draft: DraftV1, opts: DraftToFormOptions = {}): VisitForm {
  const d = draft.document;
  const today = opts.today ?? todayIso();
  const form = emptyVisitForm(d.date ?? today);

  const lines = draft.lines.map((l) => {
    const regulation = opts.regulation ?? [];
    let line = updateLine(emptyLine(l.kind), { rawName: l.name }, opts.hints ?? [], regulation);
    line = {
      ...line,
      n: l.n,
      qty: l.qty === null ? '' : formatQty(l.qty),
      unit: l.unit ?? '',
      price: rubToInput(l.price),
      sum: rubToInput(l.sum),
      // The document's own sums are kept even if they disagree with qty × price (check 1 reports it).
      sumTouched: l.sum !== null,
      brand: l.brand ?? '',
      article: l.article ?? '',
    };
    const rule = findRule(l.name, opts.rules ?? []);
    if (rule) {
      line = {
        ...line,
        nameOverride: rule.name,
        componentId: rule.componentId,
        componentTouched: true,
      };
      // A learned rule's regulation links win; without them, keywords of the rule's name apply too.
      line = rule.regulationItemIds.length
        ? { ...line, regulationItemIds: rule.regulationItemIds, regulationTouched: true }
        : { ...line, regulationItemIds: suggestLineRegulation(line, regulation) };
    }
    return line;
  });

  return {
    ...form,
    odometer: d.odometerKm === null ? '' : String(d.odometerKm),
    shopName: d.shop?.name ?? '',
    shopInn: d.shop?.inn ?? '',
    shopAddress: d.shop?.address ?? '',
    shopPhone: d.shop?.phone ?? '',
    documents: [
      {
        ...emptyDocument(d.type),
        number: d.number ?? '',
        date: d.date ?? '',
        relatedNumber: d.relatedOrder?.number ?? '',
        relatedDate: d.relatedOrder?.date ?? '',
        totalWorks: rubToInput(d.totals.works),
        totalParts: rubToInput(d.totals.parts),
        totalAll: rubToInput(d.totals.total),
        discountPercent: d.totals.discountPercent === null ? '' : formatQty(d.totals.discountPercent),
        scanIds: opts.scanIds ?? [],
        lines,
      },
    ],
  };
}
