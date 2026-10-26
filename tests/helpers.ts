// Helpers shared by unit tests: fixture → form → records/bundle.
// Lives outside src/ so it never ends up in the app bundle.

import type { FixtureVisit } from './fixtures/manualVisits';
import type { VisitBundle } from '../src/core/bundle';
import type { DraftV1 } from '../src/core/draftSchema';
import { draftToForm } from '../src/core/draftToForm';
import { seedId } from '../src/core/ids';
import { emptyLine, emptyVisitForm, formToRecords, updateLine, type VisitForm } from '../src/core/visitForm';

export const TEST_DEVICE = 'device-test';
export const TEST_VEHICLE = seedId(1);

export function fixtureToForm(fx: FixtureVisit): VisitForm {
  const form = emptyVisitForm(fx.date);
  const doc = form.documents[0]!;
  return {
    ...form,
    odometer: fx.odometer,
    shopName: fx.shopName,
    documents: [
      {
        ...doc,
        ...fx.document,
        lines: fx.lines.map((l) => updateLine(emptyLine(l.kind), { rawName: l.name, qty: l.qty, price: l.price, sum: l.sum })),
      },
    ],
  };
}

/** Draft → form → records → bundle, as if the draft had been reviewed and saved. */
export function draftToBundle(draft: DraftV1, now = '2026-01-01T10:00:00.000Z'): VisitBundle {
  const records = formToRecords(draftToForm(draft), { deviceId: TEST_DEVICE, vehicleId: TEST_VEHICLE, now, existing: null });
  return {
    visit: records.visit,
    documents: records.documents.map((document) => ({ document, lines: records.lines.filter((l) => l.documentId === document.id) })),
    mileage: records.mileage,
  };
}

export function fixtureToBundle(fx: FixtureVisit, now = '2026-01-01T10:00:00.000Z'): VisitBundle {
  const records = formToRecords(fixtureToForm(fx), { deviceId: TEST_DEVICE, vehicleId: TEST_VEHICLE, now, existing: null });
  return {
    visit: records.visit,
    documents: records.documents.map((document) => ({
      document,
      lines: records.lines.filter((l) => l.documentId === document.id),
    })),
    mileage: records.mileage,
  };
}
