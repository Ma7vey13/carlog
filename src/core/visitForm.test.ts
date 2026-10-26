import { describe, expect, it } from 'vitest';
import { BRAKES_FRONT_2025, DISCS_FRONT_2025, ORDER_OIL_2025 } from '../../tests/fixtures/manualVisits';
import { fixtureToBundle, fixtureToForm, TEST_DEVICE, TEST_VEHICLE } from '../../tests/helpers';
import { sumLines, visitTotal } from './bundle';
import { startComponentId } from './components';
import { VISIT_TEMPLATES } from './templates';
import {
  applyTemplate,
  bundleToForm,
  checkVisitForm,
  copyVisitToForm,
  emptyLine,
  emptyVisitForm,
  formToRecords,
  nameHintsFrom,
  updateLine,
} from './visitForm';

const NOW = '2026-01-01T10:00:00.000Z';
const LATER = '2026-02-01T10:00:00.000Z';
const ctx = (existing = null as ReturnType<typeof fixtureToBundle> | null, now = NOW) => ({
  deviceId: TEST_DEVICE,
  vehicleId: TEST_VEHICLE,
  now,
  existing,
});

describe('updateLine', () => {
  it('fills the sum from qty × price until the sum is typed by hand', () => {
    let line = updateLine(emptyLine('part'), { qty: '4,5', price: '1100' });
    expect(line.sum).toBe('4950');
    line = updateLine(line, { sum: '5000' });
    expect(line.sumTouched).toBe(true);
    line = updateLine(line, { qty: '5' });
    expect(line.sum).toBe('5000');
    line = updateLine(line, { sum: '' });
    expect(line.sumTouched).toBe(false);
    expect(line.sum).toBe('5500');
  });

  it('suggests component and position from the name until changed by hand', () => {
    let line = updateLine(emptyLine('part'), { rawName: 'Супорт тормозной зад.(лев.) SFN' });
    expect(line.componentId).toBe(startComponentId('Тормоза задние'));
    expect([line.axle, line.side]).toEqual(['rear', 'left']);

    line = updateLine(line, { componentId: startComponentId('Прочее') });
    line = updateLine(line, { rawName: 'Колодки тормозные перед.(OEM) SFN' });
    expect(line.componentId).toBe(startComponentId('Прочее'));
    expect(line.axle).toBe('front');
  });

  it('learns the component from earlier lines with the same name', () => {
    const hints = [{ rawName: 'Масло трансм. синт. 75W90', kind: 'part' as const, componentId: startComponentId('Задний редуктор'), unit: 'л', brand: 'Micking' }];
    const line = updateLine(emptyLine('part'), { rawName: 'масло трансм синт 75w90' }, hints);
    expect(line.componentId).toBe(startComponentId('Задний редуктор'));
    expect(line.unit).toBe('л');
    expect(line.brand).toBe('Micking');
  });
});

describe('checkVisitForm', () => {
  it('accepts a complete visit', () => {
    const check = checkVisitForm(fixtureToForm(BRAKES_FRONT_2025), '2026-01-01');
    expect(check).toEqual({ errors: [], warnings: [] });
  });

  it('reports missing data in plain Russian', () => {
    const form = emptyVisitForm('2026-01-01');
    form.date = '';
    form.odometer = '293 000 км';
    const check = checkVisitForm(form, '2026-01-01');
    expect(check.errors.map((e) => e.message)).toEqual([
      'Укажите дату визита',
      'Пробег — целое число километров',
      'Добавьте хотя бы одну строку: работу или запчасть',
    ]);
  });

  it('flags a line whose qty × price differs from the sum, and a future date', () => {
    const form = fixtureToForm(BRAKES_FRONT_2025);
    form.date = '2027-01-01';
    const line = form.documents[0]!.lines[2]!;
    form.documents[0]!.lines[2] = updateLine(line, { sum: '800' });
    form.documents[0]!.lines[0] = updateLine(form.documents[0]!.lines[0]!, { rawName: ' ' });
    const check = checkVisitForm(form, '2026-01-01');
    expect(check.errors.map((e) => e.message)).toEqual(['Строка 1: нет названия']);
    expect(check.warnings.map((w) => w.message)).toEqual(['Дата визита в будущем', 'Строка 3: количество × цена не равно сумме']);
  });
});

describe('formToRecords', () => {
  it('stores kopecks, normalized names, components and a mileage mark', () => {
    const r = formToRecords(fixtureToForm(BRAKES_FRONT_2025), ctx());
    expect(r.visit).toMatchObject({ date: '2025-03-12', odometerKm: 293000, status: 'confirmed', deleted: false, deviceId: TEST_DEVICE });
    expect(r.visit.shop.name).toBe('Автосервис «Пример»');
    expect(r.documents).toHaveLength(1);
    expect(r.documents[0]!.relatedOrder).toEqual({ number: '25857', date: '2025-03-12' });
    expect(r.documents[0]!.totals).toEqual({ works: 470000, parts: 1850000, total: 2320000, discountPercent: null });

    const caliper = r.lines[4]!;
    expect(caliper).toMatchObject({
      n: 5,
      rawName: 'Супорт тормозной перед.(лев.) SFN',
      name: 'Суппорт тормозной перед.(лев.) SFN',
      price: 1450000,
      sum: 1450000,
      position: { axle: 'front', side: 'left' },
      componentId: startComponentId('Тормоза передние'),
    });
    expect(sumLines(r.lines)).toEqual({ works: 470000, parts: 1850000, total: 2320000 });
    expect(r.mileage).toMatchObject({ km: 293000, date: '2025-03-12', source: 'visit', visitId: r.visit.id });
  });

  it('uses the visit date when the document date is left empty', () => {
    const form = fixtureToForm(BRAKES_FRONT_2025);
    form.documents[0]!.date = '';
    form.date = '2025-03-14';
    expect(formToRecords(form, ctx()).documents[0]!.date).toBe('2025-03-14');
    // A new form does not pre-fill the document date with today.
    expect(emptyVisitForm('2026-01-15').documents[0]!.date).toBe('');
  });

  it('keeps ids on edit and marks removed lines and cleared mileage as deleted', () => {
    const original = fixtureToBundle(BRAKES_FRONT_2025, NOW);
    const form = bundleToForm(original);
    form.documents[0]!.lines.splice(1, 1); // remove "замена суппорта"
    form.documents[0]!.lines[0] = updateLine(form.documents[0]!.lines[0]!, { price: '2100' });
    form.odometer = '';

    const r = formToRecords(form, ctx(original, LATER));
    expect(r.visit.id).toBe(original.visit.id);
    expect(r.visit.createdAt).toBe(NOW);
    expect(r.visit.updatedAt).toBe(LATER);

    const live = r.lines.filter((l) => !l.deleted);
    const removed = r.lines.filter((l) => l.deleted);
    expect(live).toHaveLength(6);
    expect(live.map((l) => l.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(live[0]).toMatchObject({ id: original.documents[0]!.lines[0]!.id, price: 210000, sum: 210000 });
    expect(removed.map((l) => l.id)).toEqual([original.documents[0]!.lines[1]!.id]);
    expect(r.mileage).toMatchObject({ id: original.mileage!.id, deleted: true });
  });
});

describe('copy, templates and hints', () => {
  it('copies the last visit with a new date and no odometer or document numbers', () => {
    const last = fixtureToBundle(DISCS_FRONT_2025);
    const form = copyVisitToForm(last, '2026-01-15');
    expect(form).toMatchObject({ id: null, date: '2026-01-15', odometer: '', shopName: 'Автосервис «Пример»' });
    expect(form.documents[0]).toMatchObject({ id: null, type: 'act', number: '', date: '' });
    expect(form.documents[0]!.lines.map((l) => l.id)).toEqual(Array(6).fill(null));
    expect(form.documents[0]!.lines[1]!.price).toBe('7500');
  });

  it('inserts a template into the first document', () => {
    const form = applyTemplate(emptyVisitForm('2026-01-15'), VISIT_TEMPLATES[0]!);
    const lines = form.documents[0]!.lines;
    expect(lines.map((l) => [l.kind, l.rawName])).toEqual([
      ['work', 'Замена масла и фильтра в двигателе'],
      ['part', 'Масло моторное'],
      ['part', 'Фильтр масляный'],
    ]);
    expect(lines.every((l) => l.componentId === startComponentId('Смазка двигателя'))).toBe(true);
  });

  it('collects distinct earlier names, newest visit first', () => {
    const hints = nameHintsFrom([fixtureToBundle(BRAKES_FRONT_2025), fixtureToBundle(DISCS_FRONT_2025)]);
    const names = hints.map((h) => h.rawName);
    expect(names[0]).toBe('Замена (с/у) перед. тормозного диска (Джип/М-вен)');
    expect(names.filter((n) => n === 'Колодки тормозные перед.(OEM) SFN')).toHaveLength(1);
    expect(names).toContain('Суппорт тормозной перед.(лев.) SFN');
  });

  it('visit total uses the document total when present', () => {
    expect(visitTotal(fixtureToBundle(ORDER_OIL_2025))).toBe(9310000);
  });
});
