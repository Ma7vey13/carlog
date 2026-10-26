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

export interface TotalsMismatch {
  label: 'Работы' | 'Запчасти' | 'Всего';
  document: Kopecks;
  lines: Kopecks;
}

/**
 * Document totals that differ from the sum of its lines. Totals left empty are not compared.
 * Shown as a warning on the visit card and in the editor; never blocks anything.
 */
export function totalsMismatches(totals: CarDocument['totals'], lines: LineTotals): TotalsMismatch[] {
  const pairs: Array<[TotalsMismatch['label'], Kopecks | null, Kopecks]> = [
    ['Работы', totals.works, lines.works],
    ['Запчасти', totals.parts, lines.parts],
    ['Всего', totals.total, lines.total],
  ];
  return pairs
    .filter((p): p is [TotalsMismatch['label'], Kopecks, Kopecks] => p[1] !== null && p[1] !== p[2])
    .map(([label, document, lineSum]) => ({ label, document, lines: lineSum }));
}

/** Documents whose lines count: everything except documents replaced by a later one (D-038). */
export function activeDocuments(bundle: VisitBundle): DocumentBundle[] {
  return bundle.documents.filter((d) => !d.document.supersededBy);
}

/** Lines that count for totals, search and history (superseded documents excluded). */
export function allLines(bundle: VisitBundle): LineItem[] {
  return activeDocuments(bundle).flatMap((d) => d.lines);
}

/** Total of a visit: the document's own total when given, otherwise the sum of lines. */
export function visitTotal(bundle: VisitBundle): Kopecks {
  let total = 0;
  for (const { document, lines } of activeDocuments(bundle)) {
    total += document.totals.total ?? sumLines(lines).total;
  }
  return total;
}
