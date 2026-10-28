// Russian UI labels for stored enum values.

import type { TotalsMismatch } from './bundle';
import type { Axle, CarDocument, DocumentType, DraftStatus, LineKind, Performer, RegulationAction, RegulationSource, Side, VisitKind } from './model';
import type { Purpose } from './purpose';
import type { ScheduleStatus } from './schedule';
import { formatDate } from './format';
import { formatRub } from './money';

/** "Запчасти: в документе 18 500 ₽, по строкам 18 600 ₽" */
export function totalsMismatchText(m: TotalsMismatch): string {
  return `${m.label}: в документе ${formatRub(m.document)}, по строкам ${formatRub(m.lines)}`;
}

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

export const DRAFT_STATUS_LABELS: Record<DraftStatus, string> = {
  pending: 'Ждёт распознавания',
  ready: 'Готов к проверке',
  accepted: 'Принят',
  rejected: 'Отклонён',
};

/** ТО or ремонт (D-089), see core/purpose.ts. */
export const PURPOSE_LABELS: Record<Purpose, string> = { maintenance: 'ТО', repair: 'Ремонт' };

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

export const SCHEDULE_STATUS_LABELS: Record<ScheduleStatus, string> = {
  red: 'Пора',
  yellow: 'Скоро',
  green: 'В порядке',
  gray: 'Нет данных',
};

export const REGULATION_ACTION_LABELS: Record<RegulationAction, string> = { replace: 'Замена', inspect: 'Проверка' };
export const PERFORMER_LABELS: Record<Performer, string> = { service: 'Сервис', self: 'Сам' };
/** Where a regulation item comes from (short, for tags and the source field). */
export const REGULATION_SOURCE_LABELS: Record<RegulationSource, string> = { service: 'Сервис', instruction: 'Инструкция' };
/** Group titles on the regulation screen. */
export const REGULATION_SOURCE_GROUPS: Record<RegulationSource | 'none', string> = {
  service: 'По графику сервиса',
  instruction: 'Дополнительно по инструкции',
  none: 'Источник не указан',
};
