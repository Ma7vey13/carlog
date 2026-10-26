// A visit together with its documents, lines and mileage mark: the unit the UI reads and writes.

import type { CarDocument, Kopecks, LineItem, MileageEntry, Visit } from './model';

export interface DocumentBundle {
  document: CarDocument;
  lines: LineItem[];
}

export interface VisitBundle {
  visit: Visit;
  documents: DocumentBundle[];
  /** Mileage mark created from the visit odometer, if any. */
  mileage: MileageEntry | null;
}

export interface LineTotals {
  works: Kopecks;
  parts: Kopecks;
  total: Kopecks;
}

/** Sums lines by kind. Materials count as parts, as in the documents (SPEC section 11). */
export function sumLines(lines: readonly LineItem[]): LineTotals {
  let works = 0;
  let parts = 0;
  for (const line of lines) {
    if (line.deleted || line.sum === null) continue;
    if (line.kind === 'work') works += line.sum;
    else parts += line.sum;
  }
  return { works, parts, total: works + parts };
}

export function allLines(bundle: VisitBundle): LineItem[] {
  return bundle.documents.flatMap((d) => d.lines);
}

/** Total of a visit: the document's own total when given, otherwise the sum of lines. */
export function visitTotal(bundle: VisitBundle): Kopecks {
  let total = 0;
  for (const { document, lines } of bundle.documents) {
    total += document.totals.total ?? sumLines(lines).total;
  }
  return total;
}
