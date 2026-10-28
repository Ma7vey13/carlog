// Data model (SPEC section 4). Field names are the storage format: renaming one needs a migration.
// Money is integer kopecks, dates are local ISO `YYYY-MM-DD`, timestamps are ISO with time.

export type IsoDate = string;
export type IsoDateTime = string;
export type Id = string;
export type Kopecks = number;

/** Service fields on every synced record (SPEC section 4, merged by `updatedAt` in stage 4). */
export interface SyncFields {
  id: Id;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  /** Deletion marker: records are never removed physically, so deletes sync like edits. */
  deleted: boolean;
  deviceId: string;
}

export interface Vehicle extends SyncFields {
  make: string;
  model: string;
  engine: string | null;
  year: number | null;
  vin: string | null;
  plate: string | null;
}

export type MileageSource = 'manual' | 'visit';

export interface MileageEntry extends SyncFields {
  vehicleId: Id;
  date: IsoDate;
  km: number;
  source: MileageSource;
  /** Set when source = 'visit'. */
  visitId: Id | null;
}

export interface Shop {
  name: string | null;
  inn: string | null;
  address: string | null;
  phone: string | null;
}

export type VisitKind = 'service' | 'self';
export type VisitStatus = 'draft' | 'confirmed';

export interface Visit extends SyncFields {
  vehicleId: Id;
  date: IsoDate;
  odometerKm: number | null;
  kind: VisitKind;
  shop: Shop;
  notes: string;
  status: VisitStatus;
}

export type DocumentType = 'work_order' | 'act' | 'invoice' | 'receipt' | 'other';

export interface DocumentTotals {
  works: Kopecks | null;
  parts: Kopecks | null;
  total: Kopecks | null;
  discountPercent: number | null;
}

export interface RelatedOrder {
  number: string | null;
  date: IsoDate | null;
}

export interface CarDocument extends SyncFields {
  visitId: Id;
  type: DocumentType;
  number: string | null;
  date: IsoDate | null;
  relatedOrder: RelatedOrder | null;
  totals: DocumentTotals;
  /** Parts bought but not installed (SPEC section 7, item 7). */
  purchaseOnly: boolean;
  scanIds: Id[];
  /**
   * Set when a later document replaced this one's lines ("заменить строки": a work order
   * superseded by its act). The document and its scans stay; its lines no longer count.
   * Optional: records saved before stage 3 do not have it.
   */
  supersededBy?: Id | null;
}

export type LineKind = 'work' | 'part' | 'material';
export type Axle = 'front' | 'rear';
export type Side = 'left' | 'right';

export interface LinePosition {
  axle: Axle | null;
  side: Side | null;
}

export interface LineItem extends SyncFields {
  visitId: Id;
  documentId: Id;
  /** Original row number in the document; also the display order. */
  n: number;
  kind: LineKind;
  rawName: string;
  name: string;
  qty: number | null;
  unit: string | null;
  price: Kopecks | null;
  sum: Kopecks | null;
  brand: string | null;
  article: string | null;
  position: LinePosition;
  /** Part brought by the owner (the shop only charged for the work). */
  customerPart: boolean;
  componentId: Id | null;
  regulationItemIds: Id[];
}

export interface Component extends SyncFields {
  name: string;
  parentId: Id | null;
  order: number;
}

export type RegulationAction = 'replace' | 'inspect';
export type Performer = 'service' | 'self';

export interface RegulationItem extends SyncFields {
  name: string;
  componentId: Id | null;
  action: RegulationAction;
  performer: Performer;
  intervalKm: number | null;
  intervalMonths: number | null;
  severeIntervalKm: number | null;
  severeIntervalMonths: number | null;
  keywords: string[];
  note: string;
  /** 'table' — from an uploaded regulation table (a new table replaces these); missing = added by hand. */
  origin?: 'table' | 'manual';
  /** Whose schedule this is: the service's own ТО table or the car's manual; missing = not stated. */
  source?: RegulationSource;
}

export type RegulationSource = 'service' | 'instruction';

/**
 * One upload of a regulation table (stage 9): what it changed, so the last upload can be undone.
 * Synced like everything else, so it can be undone on another device too.
 */
export interface RegulationImport extends SyncFields {
  /** 1, 2, 3… — "the last upload" does not depend on clocks. */
  seq: number;
  fileName: string;
  /** Items created by this upload (soft-deleted on undo). */
  created: Id[];
  /** Items as they were before the upload: updated, revived or removed ones. */
  before: RegulationItem[];
  /** History lines linked by this upload: [lineId, regulationItemId]. */
  linked: Array<[Id, Id]>;
  summary: { created: number; updated: number; revived: number; removed: number; linked: number };
  undone: boolean;
}

export interface ManualEvent extends SyncFields {
  vehicleId: Id;
  date: IsoDate;
  km: number | null;
  approximate: boolean;
  regulationItemId: Id | null;
  note: string;
}

export interface MatchRule extends SyncFields {
  /** Normalised raw-name pattern (see core/normalize.ts `matchKey`). */
  pattern: string;
  name: string;
  componentId: Id | null;
  regulationItemIds: Id[];
}

/** "Work → expected part" pair for the "customer part?" check (SPEC section 7, item 6). */
export interface ExpectedPartRule extends SyncFields {
  label: string;
  /** All must occur in a work line (word starts, see core/expectedParts.ts). */
  workKeywords: string[];
  /** Any of them in a part/material line means the part is there. */
  partKeywords: string[];
  /** Name of the line added as "запчасть клиента". */
  partName: string;
}

export interface SelfCheckItem extends SyncFields {
  name: string;
  periodDays: number;
  howTo: string;
  order: number;
}

export type SelfCheckResult = 'ok' | 'attention';

export interface SelfCheckLog extends SyncFields {
  itemId: Id;
  date: IsoDate;
  result: SelfCheckResult;
  note: string;
}

export type TermDocumentKind = 'osago' | 'first_aid' | 'extinguisher' | 'other';

export interface TermDocument extends SyncFields {
  kind: TermDocumentKind;
  title: string | null;
  number: string | null;
  company: string | null;
  startDate: IsoDate | null;
  endDate: IsoDate | null;
  remindDaysBefore: number;
  scanIds: Id[];
}

export interface Scan extends SyncFields {
  mime: string;
  size: number;
  sha256: string;
  width: number | null;
  height: number | null;
  /** Clockwise rotation for display, degrees. Pixels are never modified. */
  rotation: 0 | 90 | 180 | 270;
  page: number | null;
  /** True once the encrypted file is in carlog-data. */
  uploaded: boolean;
}

export type DraftSource = 'claude-code' | 'chat' | 'manual';
export type DraftStatus = 'pending' | 'ready' | 'accepted' | 'rejected';

export interface Draft extends SyncFields {
  source: DraftSource;
  scanIds: Id[];
  /** JSON in the carlog.draft.v1 format (stage 3), null while waiting for recognition. */
  payload: unknown;
  status: DraftStatus;
  visitId: Id | null;
}

/** Synced app settings: a single record with a fixed id. */
export interface Settings extends SyncFields {
  severeConditions: boolean;
  warnPercent: number;
  warnKm: number;
  warnDays: number;
}

/** Local blob of a scan; never synced as a record (files go to carlog-data/scans). */
export interface ScanBlob {
  sha256: string;
  blob: Blob;
}

/** Local-only key/value (device id, sync bookkeeping). */
export interface MetaEntry {
  key: string;
  value: unknown;
}
