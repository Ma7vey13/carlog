import Dexie, { type EntityTable } from 'dexie';
import type {
  CarDocument,
  Component,
  Draft,
  ExpectedPartRule,
  LineItem,
  ManualEvent,
  MatchRule,
  MetaEntry,
  MileageEntry,
  RegulationImport,
  RegulationItem,
  Repair,
  Scan,
  ScanBlob,
  SelfCheckItem,
  SelfCheckLog,
  Settings,
  TermDocument,
  Vehicle,
  Visit,
} from '../core/model';

/** Tables that go into the encrypted snapshot on sync (stage 4). */
export const SYNCED_TABLES = [
  'vehicles',
  'mileageEntries',
  'visits',
  'documents',
  'lineItems',
  'components',
  'regulationItems',
  'regulationImports',
  'manualEvents',
  'matchRules',
  'expectedPartRules',
  'selfCheckItems',
  'selfCheckLogs',
  'termDocuments',
  'repairs',
  'scans',
  'drafts',
  'settings',
] as const;

export type SyncedTable = (typeof SYNCED_TABLES)[number];

export class CarlogDB extends Dexie {
  vehicles!: EntityTable<Vehicle, 'id'>;
  mileageEntries!: EntityTable<MileageEntry, 'id'>;
  visits!: EntityTable<Visit, 'id'>;
  documents!: EntityTable<CarDocument, 'id'>;
  lineItems!: EntityTable<LineItem, 'id'>;
  components!: EntityTable<Component, 'id'>;
  regulationItems!: EntityTable<RegulationItem, 'id'>;
  regulationImports!: EntityTable<RegulationImport, 'id'>;
  manualEvents!: EntityTable<ManualEvent, 'id'>;
  matchRules!: EntityTable<MatchRule, 'id'>;
  expectedPartRules!: EntityTable<ExpectedPartRule, 'id'>;
  selfCheckItems!: EntityTable<SelfCheckItem, 'id'>;
  selfCheckLogs!: EntityTable<SelfCheckLog, 'id'>;
  termDocuments!: EntityTable<TermDocument, 'id'>;
  repairs!: EntityTable<Repair, 'id'>;
  scans!: EntityTable<Scan, 'id'>;
  drafts!: EntityTable<Draft, 'id'>;
  settings!: EntityTable<Settings, 'id'>;
  /** Local only: scan files by content hash. */
  scanBlobs!: EntityTable<ScanBlob, 'sha256'>;
  /** Local only: device id, sync bookkeeping. */
  meta!: EntityTable<MetaEntry, 'key'>;

  constructor(name = 'carlog') {
    super(name);
    // Indexes only; other fields are stored but not indexed. `deleted` is filtered in code
    // (booleans cannot be indexed in IndexedDB).
    this.version(1).stores({
      vehicles: 'id, updatedAt',
      mileageEntries: 'id, updatedAt, vehicleId, date, visitId',
      visits: 'id, updatedAt, vehicleId, date',
      documents: 'id, updatedAt, visitId, type, number, relatedOrder.number',
      lineItems: 'id, updatedAt, visitId, documentId, componentId, *regulationItemIds',
      components: 'id, updatedAt, parentId',
      regulationItems: 'id, updatedAt, componentId',
      manualEvents: 'id, updatedAt, regulationItemId, date',
      matchRules: 'id, updatedAt, pattern',
      expectedPartRules: 'id, updatedAt',
      selfCheckItems: 'id, updatedAt',
      selfCheckLogs: 'id, updatedAt, itemId, date',
      termDocuments: 'id, updatedAt, endDate',
      scans: 'id, updatedAt, sha256',
      drafts: 'id, updatedAt, status',
      settings: 'id, updatedAt',
      scanBlobs: 'sha256',
      meta: 'key',
    });
    // Stage 9: uploads of the regulation table.
    this.version(2).stores({ regulationImports: 'id, updatedAt' });
    // "Нужно отремонтировать" (D-097).
    this.version(3).stores({ repairs: 'id, updatedAt, componentId' });
  }
}

let instance: CarlogDB | null = null;

/** The app database. Tests create their own instances with unique names. */
export function getDb(): CarlogDB {
  instance ??= new CarlogDB();
  return instance;
}
