// Documents with an end date (SPEC section 10): OSAGO, first-aid kit, extinguisher, other.
// The main screen shows a document when its end is near (yellow) or past (red). A renewed
// document replaces the old one of the same kind, so an expired old policy stops nagging.

import { daysBetween } from './dates';
import { formatDate, plural } from './format';
import type { Id, IsoDate, TermDocument, TermDocumentKind } from './model';

export const TERM_KIND_LABELS: Record<TermDocumentKind, string> = {
  osago: 'ОСАГО',
  first_aid: 'Аптечка',
  extinguisher: 'Огнетушитель',
  other: 'Другое',
};

export const DEFAULT_REMIND_DAYS = 30;

export type TermState = 'expired' | 'soon' | 'ok' | 'no-date' | 'replaced';

export interface TermStatus {
  doc: TermDocument;
  state: TermState;
  /** Days until the end date, inclusive of it: 0 = the last day. Null without an end date. */
  daysLeft: number | null;
  /** The newer document of the same kind, for "replaced". */
  replacedBy: Id | null;
}

/** What counts as "the same document": the kind, or the title for "other". */
function groupKey(doc: TermDocument): string {
  return doc.kind === 'other' ? `other:${(doc.title ?? '').trim().toLowerCase()}` : doc.kind;
}

const newer = (a: TermDocument, b: TermDocument) => (a.endDate ?? '').localeCompare(b.endDate ?? '') || a.createdAt.localeCompare(b.createdAt);

export function termTitle(doc: TermDocument): string {
  const kind = doc.kind === 'other' ? doc.title?.trim() || 'Документ' : TERM_KIND_LABELS[doc.kind];
  return doc.number ? `${kind} ${doc.number}` : kind;
}

/** Status of every live document, urgent first: expired, soon, ok, no date, replaced. */
export function termStatuses(docs: readonly TermDocument[], today: IsoDate): TermStatus[] {
  const live = docs.filter((d) => !d.deleted);
  const current = new Map<string, TermDocument>();
  for (const d of live) {
    const key = groupKey(d);
    const prev = current.get(key);
    if (!prev || newer(d, prev) > 0) current.set(key, d);
  }
  const out = live.map((doc): TermStatus => {
    const head = current.get(groupKey(doc))!;
    const daysLeft = doc.endDate ? daysBetween(today, doc.endDate) : null;
    if (head.id !== doc.id) return { doc, state: 'replaced', daysLeft, replacedBy: head.id };
    const state: TermState = daysLeft === null ? 'no-date' : daysLeft < 0 ? 'expired' : daysLeft <= doc.remindDaysBefore ? 'soon' : 'ok';
    return { doc, state, daysLeft, replacedBy: null };
  });
  const order: Record<TermState, number> = { expired: 0, soon: 1, ok: 2, 'no-date': 3, replaced: 4 };
  return out.sort((a, b) => order[a.state] - order[b.state] || (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity) || termTitle(a.doc).localeCompare(termTitle(b.doc), 'ru'));
}

/** "до 15.03.2027, осталось 12 дней", "закончился 01.10.2026". */
export function termDueText(s: TermStatus, today: IsoDate): string {
  const { doc, daysLeft } = s;
  if (!doc.endDate || daysLeft === null) return 'дата окончания не указана';
  const end = formatDate(doc.endDate);
  if (s.state === 'replaced') return `до ${end}, заменён новым`;
  if (daysLeft < 0) return `закончился ${end}`;
  if (daysLeft === 0) return `последний день — ${end}`;
  if (doc.startDate && doc.startDate > today) return `с ${formatDate(doc.startDate)} до ${end}`;
  return `до ${end}, осталось ${daysLeft} ${plural(daysLeft, 'день', 'дня', 'дней')}`;
}
