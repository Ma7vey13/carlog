// Russian UI labels for stored enum values.

import type { Axle, CarDocument, DocumentType, LineKind, Side, VisitKind } from './model';
import { formatDate } from './format';

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  work_order: 'Заказ-наряд',
  act: 'Акт выполненных работ',
  invoice: 'Товарная накладная',
  receipt: 'Чек',
  other: 'Другой документ',
};

export const LINE_KIND_LABELS: Record<LineKind, string> = {
  work: 'Работа',
  part: 'Запчасть',
  material: 'Материалы',
};

export const VISIT_KIND_LABELS: Record<VisitKind, string> = {
  service: 'Сервис',
  self: 'Своя работа',
};

export const AXLE_LABELS: Record<Axle, string> = { front: 'перед', rear: 'зад' };
export const SIDE_LABELS: Record<Side, string> = { left: 'лев', right: 'прав' };

/** "Акт выполненных работ № 1 от 12.03.2025 к з/н № 25857 от 12.03.2025" */
export function documentTitle(doc: Pick<CarDocument, 'type' | 'number' | 'date' | 'relatedOrder'>): string {
  const parts = [DOCUMENT_TYPE_LABELS[doc.type]];
  if (doc.number) parts.push(`№ ${doc.number}`);
  if (doc.date) parts.push(`от ${formatDate(doc.date)}`);
  const ro = doc.relatedOrder;
  if (ro && (ro.number || ro.date)) {
    parts.push('к з/н' + (ro.number ? ` № ${ro.number}` : '') + (ro.date ? ` от ${formatDate(ro.date)}` : ''));
  }
  return parts.join(' ');
}

/** "перед, лев" or '' */
export function positionLabel(pos: { axle: Axle | null; side: Side | null }): string {
  return [pos.axle ? AXLE_LABELS[pos.axle] : null, pos.side ? SIDE_LABELS[pos.side] : null].filter(Boolean).join(', ');
}
