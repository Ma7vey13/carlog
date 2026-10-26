// Automatic checks of the review screen (SPEC section 7, items 1–7). Pure: they run on the
// form being reviewed plus the stored history, and re-run on every edit. Saving is allowed only
// after the owner has explicitly confirmed (or resolved) every warning.

import { activeDocuments, totalsMismatches, type VisitBundle } from './bundle';
import { daysBetween } from './dates';
import { findMissingParts } from './expectedParts';
import { formatDate, formatKm } from './format';
import { totalsMismatchText } from './labels';
import { forecastKm, type MileagePoint } from './mileage';
import type { CarDocument, ExpectedPartRule, Id } from './model';
import { formatQty, formatRub, lineTotal, parseQty, parseRubles } from './money';
import { normalizeName } from './normalize';
import { parseKm, type DocumentForm, type VisitForm } from './visitForm';

export type CheckKind = 'line-math' | 'totals' | 'date' | 'mileage' | 'duplicate' | 'missing-part' | 'no-mileage';

export interface Check {
  /** Stable while the problem is the same; a confirmation is tied to `signature`. */
  id: string;
  kind: CheckKind;
  title: string;
  details: string[];
  /** Changes when the numbers change, so an old confirmation does not cover a new problem. */
  signature: string;
  lineKey?: string;
  docKey?: string;
  /** Duplicate / no-mileage: visits the document may belong to. */
  candidates?: VisitCandidate[];
  /** Missing part: what to add as "запчасть клиента". */
  partName?: string;
}

export interface VisitCandidate {
  visitId: Id;
  label: string;
  /** Documents of that visit the new one can replace ("заменить строки"). */
  replaceableDocumentIds: Id[];
  reason: 'same' | 'related' | 'date';
}

/** How the reviewed document joins the history. */
export type ReviewDecision = { mode: 'new' } | { mode: 'attach' | 'replace'; visitId: Id };

export interface CheckContext {
  history: readonly VisitBundle[];
  mileage: readonly MileagePoint[];
  rules: readonly ExpectedPartRule[];
  today: string;
  decision: ReviewDecision;
}

/** Sharp jump over the forecast: more than max(5 000 km, half of the expected increase). */
const FORECAST_MARGIN_KM = 5000;

const sig = (...parts: unknown[]) => parts.map((p) => String(p)).join('|');

export function runChecks(form: VisitForm, ctx: CheckContext): Check[] {
  const checks: Check[] = [];
  const doc = form.documents[0];

  // 1. qty × price = sum, per line.
  for (const d of form.documents) {
    d.lines.forEach((line, i) => {
      const qty = parseQty(line.qty);
      const price = parseRubles(line.price);
      const sum = parseRubles(line.sum);
      if (qty === null || price === null || sum === null || lineTotal(qty, price) === sum) return;
      const n = line.n ?? i + 1;
      checks.push({
        id: `math:${line.key}`,
        kind: 'line-math',
        title: `Строка ${n}: ${formatQty(qty)} × ${formatRub(price)} = ${formatRub(lineTotal(qty, price))}, а в сумме ${formatRub(sum)}`,
        details: [line.rawName],
        signature: sig(qty, price, sum),
        lineKey: line.key,
      });
    });
  }

  // 2. Sum of lines by kind = document totals.
  for (const d of form.documents) {
    const lines = d.lines.map((l) => ({ kind: l.kind, sum: parseRubles(l.sum) }));
    const works = lines.filter((l) => l.kind === 'work').reduce((s, l) => s + (l.sum ?? 0), 0);
    const parts = lines.filter((l) => l.kind !== 'work').reduce((s, l) => s + (l.sum ?? 0), 0);
    const mismatches = totalsMismatches(
      { works: parseRubles(d.totalWorks), parts: parseRubles(d.totalParts), total: parseRubles(d.totalAll), discountPercent: null },
      { works, parts, total: works + parts },
    );
    if (mismatches.length) {
      checks.push({
        id: `totals:${d.key}`,
        kind: 'totals',
        title: 'Сумма строк не сходится с итогами документа',
        details: mismatches.map(totalsMismatchText),
        signature: sig(...mismatches.flatMap((m) => [m.label, m.document, m.lines])),
        docKey: d.key,
      });
    }
  }

  // 3. Date in the future or before the first record.
  // "First record" includes document and work-order dates: a visit dated by its act (06.10)
  // already covers its work order (19.09) and an invoice in between (page 6).
  const historyDates = ctx.history.flatMap((b) => [
    b.visit.date,
    ...activeDocuments(b).flatMap((d) => [d.document.date, d.document.relatedOrder?.date ?? null]),
  ]);
  const firstDate = [...historyDates, ...ctx.mileage.map((p) => p.date)].filter((x): x is string => !!x).sort()[0];
  if (form.date > ctx.today) {
    checks.push({ id: 'date-future', kind: 'date', title: `Дата ${formatDate(form.date)} в будущем`, details: [], signature: form.date });
  } else if (firstDate && form.date < firstDate) {
    checks.push({
      id: 'date-early',
      kind: 'date',
      title: `Дата ${formatDate(form.date)} раньше первой записи истории (${formatDate(firstDate)})`,
      details: ['Если это старый документ из архива — всё в порядке, подтвердите.'],
      signature: form.date,
    });
  }

  // 4. Mileage lower than an earlier visit, higher than a later one, or far above the forecast.
  const km = parseKm(form.odometer);
  if (km !== null) {
    const earlier = ctx.mileage.filter((p) => p.date < form.date);
    const later = ctx.mileage.filter((p) => p.date > form.date);
    const maxEarlier = earlier.reduce<MileagePoint | null>((m, p) => (!m || p.km > m.km ? p : m), null);
    const minLater = later.reduce<MileagePoint | null>((m, p) => (!m || p.km < m.km ? p : m), null);
    if (maxEarlier && km < maxEarlier.km) {
      checks.push({
        id: 'km-less',
        kind: 'mileage',
        title: `Пробег ${formatKm(km)} меньше, чем ${formatKm(maxEarlier.km)} на ${formatDate(maxEarlier.date)}`,
        details: [],
        signature: sig(km, form.date),
      });
    } else if (minLater && km > minLater.km) {
      checks.push({
        id: 'km-more-than-later',
        kind: 'mileage',
        title: `Пробег ${formatKm(km)} больше, чем ${formatKm(minLater.km)} позже, на ${formatDate(minLater.date)}`,
        details: [],
        signature: sig(km, form.date),
      });
    } else {
      const forecast = forecastKm(earlier, form.date);
      if (forecast && forecast.dailyAvg !== null) {
        const margin = Math.max(FORECAST_MARGIN_KM, 0.5 * (forecast.km - forecast.lastKm));
        if (km > forecast.km + margin) {
          checks.push({
            id: 'km-forecast',
            kind: 'mileage',
            title: `Пробег ${formatKm(km)} сильно больше прогноза ≈ ${formatKm(forecast.km)} на эту дату`,
            details: [`Последняя отметка — ${formatKm(forecast.lastKm)} на ${formatDate(forecast.lastDate)}. Проверьте, нет ли лишней цифры.`],
            signature: sig(km, form.date),
          });
        }
      }
    }
  }

  // 5. Duplicates: same document already stored, or a document of the same work order.
  if (doc) {
    const candidates = findRelatedVisits(doc, ctx.history);
    if (candidates.length) {
      const same = candidates.filter((c) => c.reason === 'same');
      checks.push({
        id: 'duplicate',
        kind: 'duplicate',
        title: same.length ? 'Такой документ уже есть в истории' : 'В истории есть документ к тому же заказ-наряду',
        details: candidates.map((c) => c.label),
        signature: sig(...candidates.map((c) => c.visitId)),
        candidates,
      });
    }
  }

  // 6. Work without its expected part → "запчасть клиента?".
  const lineLikes = form.documents.flatMap((d) => d.lines.map((l) => ({ key: l.key, kind: l.kind, name: l.rawName })));
  for (const { rule, workLine } of findMissingParts(lineLikes, ctx.rules)) {
    checks.push({
      id: `part:${rule.id}:${workLine.key}`,
      kind: 'missing-part',
      title: `Работа «${normalizeName(workLine.name)}», но среди запчастей нет: ${rule.label.toLowerCase()}`,
      details: ['Запчасть клиента? Добавьте её строкой с отметкой «запчасть клиента» — цена по желанию.'],
      signature: sig(rule.id, workLine.name),
      lineKey: workLine.key,
      partName: rule.partName,
    });
  }

  // 7. Document without mileage (e.g. a goods invoice).
  if (doc && km === null && !doc.purchaseOnly && ctx.decision.mode === 'new') {
    const byDate = findVisitsByDate(doc.date || form.date, ctx.history);
    checks.push({
      id: 'no-mileage',
      kind: 'no-mileage',
      title: 'В документе нет пробега',
      details: [
        byDate.length
          ? 'Прикрепите документ к визиту, введите пробег вручную или отметьте «покупка без установки».'
          : 'Введите пробег вручную или отметьте «покупка без установки».',
      ],
      signature: sig(doc.date, ...byDate.map((c) => c.visitId)),
      candidates: byDate,
      docKey: doc.key,
    });
  }

  return checks;
}

// ---------------------------------------------------------------------------------------------

function visitLabel(b: VisitBundle): string {
  const docs = activeDocuments(b).map((d) => docShortTitle(d.document));
  return `Визит ${formatDate(b.visit.date)}${b.visit.odometerKm !== null ? `, ${formatKm(b.visit.odometerKm)}` : ''}${docs.length ? ` — ${docs.join(', ')}` : ''}`;
}

function docShortTitle(d: CarDocument): string {
  const kind = { work_order: 'з/н', act: 'акт', invoice: 'накладная', receipt: 'чек', other: 'документ' }[d.type];
  const num = d.type === 'act' && d.relatedOrder?.number ? `к з/н № ${d.relatedOrder.number}` : d.number ? `№ ${d.number}` : '';
  return [kind, num].filter(Boolean).join(' ');
}

const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Visits holding the same document (DECISIONS D-006: acts are all numbered "1", so an act is
 * identified by its work order) or a document of the same work order.
 */
export function findRelatedVisits(doc: DocumentForm, history: readonly VisitBundle[]): VisitCandidate[] {
  const out: VisitCandidate[] = [];
  const orderNo = doc.type === 'work_order' ? doc.number : doc.relatedNumber;

  for (const b of history) {
    let reason: VisitCandidate['reason'] | null = null;
    const replaceable: Id[] = [];
    for (const { document: d } of activeDocuments(b)) {
      const dOrder = d.type === 'work_order' ? d.number : d.relatedOrder?.number;
      const isSame =
        d.type === doc.type &&
        (doc.type === 'act'
          ? same(d.relatedOrder?.number, doc.relatedNumber) && (!doc.date || !d.date || d.date === doc.date)
          : same(d.number, doc.number) && (!doc.date || !d.date || d.date === doc.date));
      if (isSame) {
        reason = 'same';
        replaceable.push(d.id);
      } else if (same(dOrder, orderNo)) {
        reason ??= 'related';
        replaceable.push(d.id);
      }
    }
    if (reason) out.push({ visitId: b.visit.id, label: visitLabel(b), replaceableDocumentIds: replaceable, reason });
  }
  return out.sort((a, b) => (a.reason === b.reason ? 0 : a.reason === 'same' ? -1 : 1));
}

/**
 * Visits a mileage-less document may belong to: its date lies between the visit's work order
 * date and the visit date (page 6: invoice of 30.09 → work order 19.09 … act 06.10), or within 3 days.
 */
export function findVisitsByDate(date: string, history: readonly VisitBundle[]): VisitCandidate[] {
  if (!date) return [];
  const out: Array<VisitCandidate & { distance: number }> = [];
  for (const b of history) {
    const docs = activeDocuments(b).map((d) => d.document);
    const starts = docs.flatMap((d) => [d.date, d.relatedOrder?.date ?? null]).filter((x): x is string => !!x);
    const start = [b.visit.date, ...starts].sort()[0]!;
    const end = b.visit.date > start ? b.visit.date : start;
    const inside = date >= start && date <= end;
    const distance = inside ? 0 : Math.min(Math.abs(daysBetween(date, start)), Math.abs(daysBetween(date, end)));
    if (inside || distance <= 3) {
      out.push({ visitId: b.visit.id, label: visitLabel(b), replaceableDocumentIds: [], reason: 'date', distance });
    }
  }
  return out.sort((a, b) => a.distance - b.distance).map(({ distance: _d, ...c }) => c);
}

/** True when every check is confirmed with its current signature. */
export function allConfirmed(checks: readonly Check[], confirmed: ReadonlySet<string>): boolean {
  return checks.every((c) => confirmed.has(confirmationKey(c)));
}

export function confirmationKey(c: Check): string {
  return `${c.id}#${c.signature}`;
}
