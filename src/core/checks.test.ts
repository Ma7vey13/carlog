import { describe, expect, it } from 'vitest';
import { PAGE1_WORK_ORDER, PAGE2_ACT, PAGE3_ACT, PAGE4_ACT, PAGE5_ACT, PAGE6_INVOICE } from '../../tests/fixtures/drafts';
import { draftToBundle, TEST_DEVICE, TEST_VEHICLE } from '../../tests/helpers';
import type { VisitBundle } from './bundle';
import { allConfirmed, confirmationKey, runChecks, type CheckContext } from './checks';
import { startComponentId } from './components';
import type { DraftV1 } from './draftSchema';
import { draftToForm } from './draftToForm';
import { findMissingParts, SEED_EXPECTED_PART_RULES } from './expectedParts';
import type { MatchRule } from './model';
import { mileagePoints } from './mileage';
import { emptyLine, formToRecords, updateLine, type VisitForm } from './visitForm';

const ctxWith = (history: VisitBundle[] = [], overrides: Partial<CheckContext> = {}): CheckContext => ({
  history,
  mileage: mileagePoints(history.flatMap((b) => (b.mileage ? [b.mileage] : []))),
  rules: SEED_EXPECTED_PART_RULES,
  today: '2026-10-26',
  decision: { mode: 'new' },
  ...overrides,
});

const kinds = (form: VisitForm, ctx: CheckContext): string[] => runChecks(form, ctx).map((c) => c.id.split(':')[0] ?? c.id);
const edited = <T>(v: T): T => structuredClone(v);

describe('special cases of SPEC section 11', () => {
  it('page 1: oil change without engine oil asks "запчасть клиента?"', () => {
    const form = draftToForm(PAGE1_WORK_ORDER);
    const checks = runChecks(form, ctxWith());
    expect(checks.map((c) => c.kind)).toEqual(['missing-part']);
    expect(checks[0]!.title).toBe('Работа «Замена масла и фильтра в двигателе (джип/минивэн)», но среди запчастей нет: масло в двигателе');
    expect(checks[0]!.partName).toBe('Масло моторное');

    // Adding the oil as a customer part (no price) resolves it.
    const doc = form.documents[0]!;
    const oil = { ...updateLine(emptyLine('part'), { rawName: checks[0]!.partName!, qty: '' }), customerPart: true };
    const fixed: VisitForm = { ...form, documents: [{ ...doc, lines: [...doc.lines, oil] }] };
    expect(runChecks(fixed, ctxWith())).toEqual([]);
  });

  it('page 3: "Супорт" is stored as "Суппорт"; nothing else to flag', () => {
    const form = draftToForm(PAGE3_ACT);
    expect(runChecks(form, ctxWith())).toEqual([]);
    const records = formToRecords(form, { deviceId: TEST_DEVICE, vehicleId: TEST_VEHICLE, now: '2026-01-01T00:00:00Z', existing: null });
    const caliper = records.lines.find((l) => l.n === 12)!;
    expect(caliper.rawName).toBe('Супорт тормозной зад.(лев.) SFN');
    expect(caliper.name).toBe('Суппорт тормозной зад.(лев.) SFN');
    expect(caliper.componentId).toBe(startComponentId('Тормоза задние'));
    expect(records.lines.map((l) => l.n)).toEqual(Array.from({ length: 17 }, (_, i) => i + 1));
  });

  it('page 5: visit dated by the act, discount inside sums is not flagged', () => {
    const form = draftToForm(PAGE5_ACT);
    expect(form.date).toBe('2021-10-06');
    expect(form.documents[0]).toMatchObject({ relatedNumber: '19963', relatedDate: '2021-09-19', totalWorks: '62190', discountPercent: '10' });
    expect(runChecks(form, ctxWith())).toEqual([]);
  });

  it('page 6: no mileage, dated between work order and act → offers the visit of work order 19963', () => {
    const page5 = draftToBundle(PAGE5_ACT);
    const page4 = draftToBundle(PAGE4_ACT);
    const form = draftToForm(PAGE6_INVOICE);
    const checks = runChecks(form, ctxWith([page4, page5]));
    expect(checks.map((c) => c.kind)).toEqual(['no-mileage']);
    expect(checks[0]!.candidates?.map((c) => c.visitId)).toEqual([page5.visit.id]);
    expect(checks[0]!.candidates?.[0]?.label).toBe('Визит 06.10.2021, 250 000 км — акт к з/н № 19963');

    // "Покупка без установки" or a typed odometer resolves it.
    expect(runChecks({ ...form, documents: [{ ...form.documents[0]!, purchaseOnly: true }] }, ctxWith([page5]))).toEqual([]);
    expect(runChecks({ ...form, odometer: '249000' }, ctxWith([page5])).map((c) => c.kind)).toEqual([]);
    // Attaching to the visit also resolves it.
    expect(runChecks(form, ctxWith([page5], { decision: { mode: 'attach', visitId: page5.visit.id } }))).toEqual([]);
  });
});

describe('checks 1–5', () => {
  it('1: qty × price ≠ sum on a line', () => {
    const draft = edited(PAGE2_ACT);
    draft.lines[1]!.sum = 14000;
    draft.document.totals.parts = 20700;
    draft.document.totals.total = 26300;
    const checks = runChecks(draftToForm(draft), ctxWith());
    expect(checks.map((c) => c.title)).toEqual(['Строка 2: 2 × 7 500 ₽ = 15 000 ₽, а в сумме 14 000 ₽']);
  });

  it('2: lines do not add up to the document totals, with numbers', () => {
    const draft = edited(PAGE2_ACT);
    draft.document.totals.works = 5000;
    const [check] = runChecks(draftToForm(draft), ctxWith());
    expect(check?.kind).toBe('totals');
    expect(check?.details).toEqual(['Работы: в документе 5 000 ₽, по строкам 5 600 ₽']);
  });

  it('3: date in the future or before the first record', () => {
    const future = draftToForm({ ...edited(PAGE2_ACT), document: { ...PAGE2_ACT.document, date: '2027-01-01' } });
    expect(kinds(future, ctxWith())).toEqual(['date-future']);
    const old = draftToForm(PAGE5_ACT);
    expect(kinds(old, ctxWith([draftToBundle(PAGE4_ACT)]))).toEqual(['date-early']);
  });

  it('4: mileage lower than earlier, higher than later, or far above the forecast', () => {
    const history = [draftToBundle(PAGE4_ACT), draftToBundle(PAGE2_ACT)]; // 293 000 → 298 000
    const order = (km: string) => ({ ...draftToForm(PAGE1_WORK_ORDER), odometer: km });
    const without = (ids: string[]) => ids.filter((id) => id !== 'part');
    expect(without(kinds(order('290000'), ctxWith(history)))).toEqual(['km-less']);
    expect(without(kinds(order('303700'), ctxWith(history)))).toEqual([]);
    expect(without(kinds(order('350000'), ctxWith(history)))).toEqual(['km-forecast']);
    const between = { ...draftToForm(PAGE3_ACT), odometer: '299000' }; // 11.04.2025, later reading 298 000
    expect(kinds(between, ctxWith(history))).toEqual(['km-more-than-later']);
  });

  it('5: same document already stored', () => {
    const stored = draftToBundle(PAGE4_ACT);
    const [check] = runChecks(draftToForm(PAGE4_ACT), ctxWith([stored]));
    expect(check?.kind).toBe('duplicate');
    expect(check?.title).toBe('Такой документ уже есть в истории');
    expect(check?.candidates?.[0]).toMatchObject({ visitId: stored.visit.id, reason: 'same' });
  });

  it('5: acts numbered "1" of different work orders are not duplicates', () => {
    expect(runChecks(draftToForm(PAGE2_ACT), ctxWith([draftToBundle(PAGE4_ACT), draftToBundle(PAGE3_ACT)]))).toEqual([]);
  });

  it('5: work order first, then its act → related, replaceable', () => {
    const order: DraftV1 = {
      ...edited(PAGE2_ACT),
      document: { ...PAGE2_ACT.document, type: 'work_order', number: '26548', relatedOrder: null },
    };
    const stored = draftToBundle(order);
    const [check] = runChecks(draftToForm(PAGE2_ACT), ctxWith([stored]));
    expect(check?.title).toBe('В истории есть документ к тому же заказ-наряду');
    expect(check?.candidates?.[0]).toMatchObject({
      visitId: stored.visit.id,
      reason: 'related',
      replaceableDocumentIds: [stored.documents[0]!.document.id],
    });
  });
});

describe('confirmation', () => {
  it('needs every check confirmed with its current numbers', () => {
    const draft = edited(PAGE2_ACT);
    draft.document.totals.works = 5000;
    const checks = runChecks(draftToForm(draft), ctxWith());
    expect(allConfirmed(checks, new Set())).toBe(false);
    const confirmed = new Set(checks.map(confirmationKey));
    expect(allConfirmed(checks, confirmed)).toBe(true);

    draft.document.totals.works = 5100; // the problem changed → old confirmation no longer counts
    expect(allConfirmed(runChecks(draftToForm(draft), ctxWith()), confirmed)).toBe(false);
  });
});

describe('draftToForm', () => {
  it('keeps document sums and numbering, applies learned rules first', () => {
    const rule: MatchRule = {
      id: 'r1',
      createdAt: '',
      updatedAt: '2026-01-01T00:00:00Z',
      deleted: false,
      deviceId: 'd',
      pattern: 'шайба медная тормозного шланга',
      name: 'Шайба тормозного шланга',
      componentId: startComponentId('Тормоза передние'),
      regulationItemIds: [],
    };
    const form = draftToForm(PAGE4_ACT, { rules: [rule], scanIds: ['s1'] });
    const washer = form.documents[0]!.lines[5]!;
    expect(washer).toMatchObject({ n: 6, nameOverride: 'Шайба тормозного шланга', componentId: rule.componentId, bindingEdited: false });
    expect(form.documents[0]!.scanIds).toEqual(['s1']);
    expect(form.documents[0]!.lines[4]).toMatchObject({ rawName: 'Супорт тормозной перед.(лев.) SFN', price: '14500', sum: '14500', sumTouched: true });
  });
});

describe('expected part rules', () => {
  it('fire only on page 1 among pages 1–6', () => {
    const pages = [PAGE1_WORK_ORDER, PAGE2_ACT, PAGE3_ACT, PAGE4_ACT, PAGE5_ACT, PAGE6_INVOICE];
    const fired = pages.map((p) =>
      findMissingParts(
        p.lines.map((l) => ({ key: String(l.n), kind: l.kind, name: l.name })),
        SEED_EXPECTED_PART_RULES,
      ).map((m) => m.rule.label),
    );
    expect(fired).toEqual([['Масло в двигателе'], [], [], [], [], []]);
  });
});
