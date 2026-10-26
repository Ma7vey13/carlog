// Visit form (manual entry, SPEC section 6В): editable text state, validation and conversion
// to records. Pure functions; the UI only renders this state and the db layer only stores records.

import { activeDocuments, type VisitBundle } from './bundle';
import { suggestComponentId } from './components';
import { isIsoDate, todayIso } from './dates';
import { newId } from './ids';
import { formatQty, kopecksToInput, lineTotal, parseQty, parseRubles } from './money';
import type {
  Axle,
  CarDocument,
  DocumentType,
  Id,
  LineItem,
  LineKind,
  MileageEntry,
  Side,
  SyncFields,
  Visit,
  VisitKind,
} from './model';
import { detectPosition, matchKey, normalizeName } from './normalize';
import type { VisitTemplate } from './templates';

export interface LineForm {
  key: string;
  id: Id | null;
  /** Row number in the document; null for lines added by hand (numbered after the last one). */
  n: number | null;
  kind: LineKind;
  /** Name as typed or as in the document; the stored `name` is normalizeName(rawName) … */
  rawName: string;
  /** … unless the owner (or a learned MatchRule) set a name of their own. '' = automatic. */
  nameOverride: string;
  /** True once the owner changed the name, component or regulation items by hand (offer "Запомнить"). */
  bindingEdited: boolean;
  /** Save this line's binding as a MatchRule for similar lines. */
  remember: boolean;
  qty: string;
  unit: string;
  price: string;
  sum: string;
  /** False while the sum follows qty × price automatically. */
  sumTouched: boolean;
  brand: string;
  article: string;
  axle: Axle | null;
  side: Side | null;
  positionTouched: boolean;
  customerPart: boolean;
  componentId: Id | null;
  componentTouched: boolean;
  regulationItemIds: Id[];
}

export interface DocumentForm {
  key: string;
  id: Id | null;
  type: DocumentType;
  number: string;
  date: string;
  relatedNumber: string;
  relatedDate: string;
  totalWorks: string;
  totalParts: string;
  totalAll: string;
  discountPercent: string;
  purchaseOnly: boolean;
  scanIds: Id[];
  lines: LineForm[];
}

export interface VisitForm {
  id: Id | null;
  date: string;
  odometer: string;
  kind: VisitKind;
  shopName: string;
  shopInn: string;
  shopAddress: string;
  shopPhone: string;
  notes: string;
  documents: DocumentForm[];
}

/** Earlier lines the form learns from: same name → same component, kind, unit, brand. */
export interface NameHint {
  rawName: string;
  kind: LineKind;
  componentId: Id | null;
  unit: string | null;
  brand: string | null;
}

let keyCounter = 0;
const nextKey = () => `k${++keyCounter}`;

export function emptyLine(kind: LineKind = 'work'): LineForm {
  return {
    key: nextKey(),
    id: null,
    n: null,
    kind,
    rawName: '',
    nameOverride: '',
    bindingEdited: false,
    remember: false,
    qty: '1',
    unit: '',
    price: '',
    sum: '',
    sumTouched: false,
    brand: '',
    article: '',
    axle: null,
    side: null,
    positionTouched: false,
    customerPart: false,
    componentId: null,
    componentTouched: false,
    regulationItemIds: [],
  };
}

export function emptyDocument(type: DocumentType = 'work_order', date = ''): DocumentForm {
  return {
    key: nextKey(),
    id: null,
    type,
    number: '',
    date,
    relatedNumber: '',
    relatedDate: '',
    totalWorks: '',
    totalParts: '',
    totalAll: '',
    discountPercent: '',
    purchaseOnly: false,
    scanIds: [],
    lines: [],
  };
}

export function emptyVisitForm(today: string = todayIso()): VisitForm {
  return {
    id: null,
    date: today,
    odometer: '',
    kind: 'service',
    shopName: '',
    shopInn: '',
    shopAddress: '',
    shopPhone: '',
    notes: '',
    // Empty document date = the visit date (see formToRecords), so it follows the visit date.
    documents: [emptyDocument('work_order')],
  };
}

// ---------------------------------------------------------------------------------------------
// Editing helpers: keep derived fields (sum, component, position) in step with what was typed.

/** Applies a change to a line and recomputes the fields that follow it automatically. */
export function updateLine(line: LineForm, patch: Partial<LineForm>, hints: readonly NameHint[] = []): LineForm {
  const next: LineForm = { ...line, ...patch };

  if ('sum' in patch) next.sumTouched = patch.sum !== '';
  if ('componentId' in patch) next.componentTouched = true;
  if ('componentId' in patch || 'nameOverride' in patch || 'regulationItemIds' in patch) next.bindingEdited = true;
  if ('axle' in patch || 'side' in patch) next.positionTouched = true;

  if ('rawName' in patch) {
    const hint = findHint(next.rawName, hints);
    if (!next.componentTouched) {
      next.componentId = hint?.componentId ?? suggestComponentId(next.rawName);
    }
    if (!next.positionTouched) {
      const pos = detectPosition(next.rawName);
      next.axle = pos.axle;
      next.side = pos.side;
    }
    if (hint && line.rawName === '' && next.unit === '' && hint.unit) next.unit = hint.unit;
    if (hint && line.rawName === '' && next.brand === '' && hint.brand) next.brand = hint.brand;
  }

  // Clearing the sum hands it back to automatic qty × price.
  if (!next.sumTouched && ('qty' in patch || 'price' in patch || 'sum' in patch)) {
    const qty = parseQty(next.qty);
    const price = parseRubles(next.price);
    next.sum = qty !== null && price !== null ? kopecksToInput(lineTotal(qty, price)) : '';
  }
  return next;
}

function findHint(rawName: string, hints: readonly NameHint[]): NameHint | undefined {
  const key = matchKey(rawName);
  if (!key) return undefined;
  return hints.find((h) => matchKey(h.rawName) === key);
}

/** Distinct earlier line names, newest first, for suggestions in the name field. */
export function nameHintsFrom(bundles: readonly VisitBundle[]): NameHint[] {
  const seen = new Set<string>();
  const hints: NameHint[] = [];
  const sorted = [...bundles].sort((a, b) => b.visit.date.localeCompare(a.visit.date));
  for (const bundle of sorted) {
    for (const { lines } of bundle.documents) {
      for (const line of lines) {
        const key = matchKey(line.name || line.rawName);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        hints.push({
          rawName: line.name || line.rawName,
          kind: line.kind,
          componentId: line.componentId,
          unit: line.unit,
          brand: line.brand,
        });
      }
    }
  }
  return hints;
}

export function applyTemplate(form: VisitForm, template: VisitTemplate, hints: readonly NameHint[] = []): VisitForm {
  const [first, ...rest] = form.documents;
  const doc = first ?? emptyDocument('work_order', form.date);
  const added = template.lines.map((t) =>
    updateLine(emptyLine(t.kind), { rawName: t.name, qty: t.qty === undefined ? '' : formatQty(t.qty) }, hints),
  );
  // Drop a single untouched empty line so the template does not leave a blank row above it.
  const kept = doc.lines.filter((l) => l.rawName.trim() !== '' || l.price !== '' || l.sum !== '');
  return { ...form, documents: [{ ...doc, lines: [...kept, ...added] }, ...rest] };
}

// ---------------------------------------------------------------------------------------------
// Validation

export interface FormIssue {
  /** Where to show it: 'date', 'odometer', 'doc:<key>', 'line:<key>:<field>'. */
  path: string;
  message: string;
}

export interface FormCheck {
  errors: FormIssue[];
  warnings: FormIssue[];
}

export function checkVisitForm(form: VisitForm, today: string = todayIso()): FormCheck {
  const errors: FormIssue[] = [];
  const warnings: FormIssue[] = [];

  if (!isIsoDate(form.date)) errors.push({ path: 'date', message: 'Укажите дату визита' });
  else if (form.date > today) warnings.push({ path: 'date', message: 'Дата визита в будущем' });

  if (form.odometer.trim() !== '' && parseKm(form.odometer) === null) {
    errors.push({ path: 'odometer', message: 'Пробег — целое число километров' });
  }

  const docs = form.documents;
  const totalLines = docs.reduce((n, d) => n + d.lines.length, 0);
  if (totalLines === 0) errors.push({ path: 'lines', message: 'Добавьте хотя бы одну строку: работу или запчасть' });

  docs.forEach((doc, di) => {
    const docLabel = docs.length > 1 ? `Документ ${di + 1}: ` : '';
    if (doc.date && !isIsoDate(doc.date)) errors.push({ path: `doc:${doc.key}:date`, message: `${docLabel}неверная дата документа` });
    for (const [field, label] of [
      ['totalWorks', 'итог по работам'],
      ['totalParts', 'итог по запчастям'],
      ['totalAll', 'итог «всего»'],
    ] as const) {
      if (doc[field].trim() !== '' && parseRubles(doc[field]) === null) {
        errors.push({ path: `doc:${doc.key}:${field}`, message: `${docLabel}${label} — не число` });
      }
    }
    if (doc.discountPercent.trim() !== '' && parseQty(doc.discountPercent) === null) {
      errors.push({ path: `doc:${doc.key}:discountPercent`, message: `${docLabel}скидка — не число` });
    }

    doc.lines.forEach((line, li) => {
      const where = `${docLabel}строка ${li + 1}`;
      if (line.rawName.trim() === '') errors.push({ path: `line:${line.key}:rawName`, message: `${capitalize(where)}: нет названия` });
      const qty = line.qty.trim() === '' ? null : parseQty(line.qty);
      const price = line.price.trim() === '' ? null : parseRubles(line.price);
      const sum = line.sum.trim() === '' ? null : parseRubles(line.sum);
      if (line.qty.trim() !== '' && qty === null) errors.push({ path: `line:${line.key}:qty`, message: `${capitalize(where)}: количество — не число` });
      if (line.price.trim() !== '' && price === null) errors.push({ path: `line:${line.key}:price`, message: `${capitalize(where)}: цена — не число` });
      if (line.sum.trim() !== '' && sum === null) errors.push({ path: `line:${line.key}:sum`, message: `${capitalize(where)}: сумма — не число` });
      if (qty !== null && price !== null && sum !== null && lineTotal(qty, price) !== sum) {
        warnings.push({ path: `line:${line.key}:sum`, message: `${capitalize(where)}: количество × цена не равно сумме` });
      }
    });
  });

  return { errors, warnings };
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function parseKm(input: string): number | null {
  const cleaned = input.replace(/[\s ]/g, '');
  if (!/^\d{1,7}$/.test(cleaned)) return null;
  return Number(cleaned);
}

// ---------------------------------------------------------------------------------------------
// Conversion form ⇄ records

export interface SaveContext {
  deviceId: string;
  vehicleId: Id;
  now: string;
  /** The stored visit when editing; its ids and createdAt are kept. */
  existing: VisitBundle | null;
}

export interface VisitRecords {
  visit: Visit;
  documents: CarDocument[];
  lines: LineItem[];
  /** Mileage mark from the odometer; a deleted record when the odometer was cleared. */
  mileage: MileageEntry | null;
}

const text = (s: string): string | null => (s.trim() === '' ? null : s.trim());

/**
 * Turns a valid form into records. Lines and documents removed during editing come back
 * with `deleted: true`, so the deletion reaches other devices on sync.
 */
export function formToRecords(form: VisitForm, ctx: SaveContext): VisitRecords {
  const { existing, now, deviceId } = ctx;
  const stamp = <T extends object>(id: Id | null, previous: SyncFields | undefined, body: T): T & SyncFields => ({
    ...body,
    id: id ?? newId(),
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    deleted: false,
    deviceId,
  });

  const visitId = existing?.visit.id ?? newId();
  const odometerKm = form.odometer.trim() === '' ? null : parseKm(form.odometer);

  const visit: Visit = stamp(visitId, existing?.visit, {
    vehicleId: existing?.visit.vehicleId ?? ctx.vehicleId,
    date: form.date,
    odometerKm,
    kind: form.kind,
    shop: {
      name: text(form.shopName),
      inn: text(form.shopInn),
      address: text(form.shopAddress),
      phone: text(form.shopPhone),
    },
    notes: form.notes.trim(),
    status: 'confirmed' as const,
  });

  const oldDocs = new Map((existing?.documents ?? []).map((d) => [d.document.id, d]));
  const oldLines = new Map((existing?.documents ?? []).flatMap((d) => d.lines).map((l) => [l.id, l]));

  const documents: CarDocument[] = [];
  const lines: LineItem[] = [];

  for (const doc of form.documents) {
    const previous = doc.id ? oldDocs.get(doc.id)?.document : undefined;
    const documentId = previous?.id ?? newId();
    const discount = doc.discountPercent.trim() === '' ? null : parseQty(doc.discountPercent);
    documents.push(
      stamp(documentId, previous, {
        visitId,
        type: doc.type,
        number: text(doc.number),
        date: isIsoDate(doc.date) ? doc.date : isIsoDate(form.date) ? form.date : null,
        relatedOrder:
          text(doc.relatedNumber) || isIsoDate(doc.relatedDate)
            ? { number: text(doc.relatedNumber), date: isIsoDate(doc.relatedDate) ? doc.relatedDate : null }
            : null,
        totals: {
          works: parseRubles(doc.totalWorks),
          parts: parseRubles(doc.totalParts),
          total: parseRubles(doc.totalAll),
          discountPercent: discount,
        },
        purchaseOnly: doc.purchaseOnly,
        scanIds: doc.scanIds,
      }),
    );

    // Keep the document's own numbering; lines added by hand go after the largest number.
    let lastN = 0;
    doc.lines.forEach((line) => {
      const prev = line.id ? oldLines.get(line.id) : undefined;
      const n = line.n !== null && line.n > lastN ? line.n : lastN + 1;
      lastN = n;
      lines.push(
        stamp(prev?.id ?? null, prev, {
          visitId,
          documentId,
          n,
          kind: line.kind,
          rawName: line.rawName.trim(),
          name: line.nameOverride.trim() || normalizeName(line.rawName),
          qty: line.qty.trim() === '' ? null : parseQty(line.qty),
          unit: text(line.unit),
          price: parseRubles(line.price),
          sum: parseRubles(line.sum),
          brand: text(line.brand),
          article: text(line.article),
          position: { axle: line.axle, side: line.side },
          customerPart: line.customerPart,
          componentId: line.componentId,
          regulationItemIds: line.regulationItemIds,
        }),
      );
    });
  }

  // Removed while editing → deletion markers. Superseded documents are not in the form
  // (see bundleToForm) and must survive editing untouched.
  const keptDocIds = new Set(documents.map((d) => d.id));
  const keptLineIds = new Set(lines.map((l) => l.id));
  const supersededDocIds = new Set((existing?.documents ?? []).filter((d) => d.document.supersededBy).map((d) => d.document.id));
  for (const { document } of existing?.documents ?? []) {
    if (!keptDocIds.has(document.id) && !supersededDocIds.has(document.id)) {
      documents.push({ ...document, deleted: true, updatedAt: now, deviceId });
    }
  }
  for (const old of oldLines.values()) {
    if (!keptLineIds.has(old.id) && !supersededDocIds.has(old.documentId)) {
      lines.push({ ...old, deleted: true, updatedAt: now, deviceId });
    }
  }

  const oldMileage = existing?.mileage ?? null;
  let mileage: MileageEntry | null = null;
  if (odometerKm !== null) {
    mileage = stamp(oldMileage?.id ?? null, oldMileage ?? undefined, {
      vehicleId: visit.vehicleId,
      date: visit.date,
      km: odometerKm,
      source: 'visit' as const,
      visitId,
    });
  } else if (oldMileage) {
    mileage = { ...oldMileage, deleted: true, updatedAt: now, deviceId };
  }

  return { visit, documents, lines, mileage };
}

/** Stored visit → form for editing. */
export function bundleToForm(bundle: VisitBundle): VisitForm {
  const { visit } = bundle;
  return {
    id: visit.id,
    date: visit.date,
    odometer: visit.odometerKm === null ? '' : String(visit.odometerKm),
    kind: visit.kind,
    shopName: visit.shop.name ?? '',
    shopInn: visit.shop.inn ?? '',
    shopAddress: visit.shop.address ?? '',
    shopPhone: visit.shop.phone ?? '',
    notes: visit.notes,
    // Superseded documents are history, not editable content; formToRecords keeps them as they are.
    documents: activeDocuments(bundle).map(({ document: d, lines }) => ({
      key: nextKey(),
      id: d.id,
      type: d.type,
      number: d.number ?? '',
      date: d.date ?? '',
      relatedNumber: d.relatedOrder?.number ?? '',
      relatedDate: d.relatedOrder?.date ?? '',
      totalWorks: kopecksToInput(d.totals.works),
      totalParts: kopecksToInput(d.totals.parts),
      totalAll: kopecksToInput(d.totals.total),
      discountPercent: d.totals.discountPercent === null ? '' : formatQty(d.totals.discountPercent),
      purchaseOnly: d.purchaseOnly,
      scanIds: d.scanIds,
      lines: lines.map((l) => lineToForm(l)),
    })),
  };
}

function lineToForm(l: LineItem, keepId = true): LineForm {
  const qty = formatQty(l.qty);
  const price = kopecksToInput(l.price);
  const sum = kopecksToInput(l.sum);
  const auto = l.qty !== null && l.price !== null && l.sum !== null && lineTotal(l.qty, l.price) === l.sum;
  return {
    key: nextKey(),
    id: keepId ? l.id : null,
    n: l.n,
    kind: l.kind,
    rawName: l.rawName,
    nameOverride: l.name && l.name !== normalizeName(l.rawName) ? l.name : '',
    bindingEdited: false,
    remember: false,
    qty,
    unit: l.unit ?? '',
    price,
    sum,
    sumTouched: !auto && sum !== '',
    brand: l.brand ?? '',
    article: l.article ?? '',
    axle: l.position.axle,
    side: l.position.side,
    positionTouched: true,
    customerPart: l.customerPart,
    componentId: l.componentId,
    componentTouched: true,
    regulationItemIds: l.regulationItemIds,
  };
}

/**
 * "Скопировать прошлый визит": same shop and lines, new date, empty odometer and document numbers.
 * Prices are kept as a starting point; the owner corrects them.
 */
export function copyVisitToForm(bundle: VisitBundle, today: string = todayIso()): VisitForm {
  const form = bundleToForm(bundle);
  return {
    ...form,
    id: null,
    date: today,
    odometer: '',
    notes: '',
    documents: activeDocuments(bundle).map(({ document: d, lines }) => ({
      ...emptyDocument(d.type),
      lines: lines.map((l) => lineToForm(l, false)),
    })),
  };
}
