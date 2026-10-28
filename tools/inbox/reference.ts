// Cell-by-cell comparison of recognised drafts with the reference table of SPEC section 11.

import { REFERENCE } from '../../tests/fixtures/drafts';
import type { DraftV1 } from '../../src/core/draftSchema';
import { formatDate, groupThousands } from '../../src/core/format';
import { rublesNumberToKopecks } from '../../src/core/money';

type Ref = (typeof REFERENCE)[number];

export interface Cell {
  label: string;
  expected: string;
  actual: string;
  ok: boolean;
}

export interface Row {
  page: number;
  doc: string;
  found: boolean;
  cells: Cell[];
}

const rub = (kop: number) => groupThousands(Math.round(kop / 100));
const sumOf = (lines: DraftV1['lines']) => lines.reduce((s, l) => s + rublesNumberToKopecks(l.sum ?? 0), 0);

function docOf(d: DraftV1): string {
  const doc = d.document;
  if (doc.type === 'act') return `акт к з/н №${doc.relatedOrder?.number ?? '?'} от ${formatDate(doc.relatedOrder?.date) || '?'}`;
  return `${doc.type === 'work_order' ? 'заказ-наряд' : doc.type === 'invoice' ? 'накладная' : doc.type} №${doc.number ?? '?'}`;
}

function refDoc(r: Ref): string {
  if (r.type === 'act') return `акт к з/н №${r.order!.number} от ${formatDate(r.order!.date)}`;
  return `${r.type === 'work_order' ? 'заказ-наряд' : 'накладная'} №${r.number}`;
}

function matches(r: Ref, d: DraftV1): boolean {
  const doc = d.document;
  if (doc.type !== r.type) return false;
  return r.type === 'act' ? doc.relatedOrder?.number === r.order!.number : doc.number === r.number;
}

/** One row per reference page; a page without a matching draft has found = false. */
export function compareWithReference(drafts: readonly DraftV1[]): Row[] {
  return REFERENCE.map((r) => {
    const d = drafts.find((x) => matches(r, x));
    if (!d) return { page: r.page, doc: r.doc, found: false, cells: [] };
    const works = d.lines.filter((l) => l.kind === 'work');
    const parts = d.lines.filter((l) => l.kind !== 'work');
    const cell = (label: string, expected: string, actual: string): Cell => ({ label, expected, actual, ok: expected === actual });
    return {
      page: r.page,
      doc: r.doc,
      found: true,
      cells: [
        cell('Документ', refDoc(r), docOf(d)),
        cell('Дата', formatDate(r.date), formatDate(d.document.date)),
        cell('Пробег', r.km === null ? 'нет' : groupThousands(r.km), d.document.odometerKm === null ? 'нет' : groupThousands(d.document.odometerKm)),
        cell('Работы', r.works[0] ? `${r.works[0]} / ${groupThousands(r.works[1])}` : '—', works.length ? `${works.length} / ${rub(sumOf(works))}` : '—'),
        cell('Запчасти', `${r.parts[0]} / ${groupThousands(r.parts[1])}`, `${parts.length} / ${rub(sumOf(parts))}`),
        cell('Всего', groupThousands(r.total), d.document.totals.total === null ? 'нет' : groupThousands(d.document.totals.total)),
      ],
    };
  });
}

/** Markdown table for the stage report: ✓ or ✗ with the recognised value. */
export function referenceTable(rows: readonly Row[]): string {
  const head = '| Стр. | Документ | Дата | Пробег, км | Работы: строк / ₽ | Запчасти: строк / ₽ | Всего, ₽ |\n| --- | --- | --- | --- | --- | --- | --- |';
  const body = rows.map((r) => {
    if (!r.found) return `| ${r.page} | ${r.doc} | ✗ не распознан | | | | |`;
    const c = r.cells.map((x) => (x.ok ? `✓ ${x.actual}` : `✗ ${x.actual} (эталон: ${x.expected})`));
    return `| ${r.page} | ${c.join(' | ')} |`;
  });
  return [head, ...body].join('\n');
}
