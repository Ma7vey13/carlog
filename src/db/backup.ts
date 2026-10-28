// Backup (SPEC section 8): a ZIP with every record as plain JSON and the scan files, saved on
// the device; import merges it back (newer record wins, nothing is deleted).
//
//   backup.json            { format, createdAt, appVersion, tables, missingScans }
//   scans/<sha256>.jpg     scan files as stored on this device

import { readZip, createZip, ZipError, type ZipEntry } from '../core/zip';
import type { SyncFields } from '../core/model';
import { mergeTables } from '../sync/snapshot';
import { SYNCED_TABLES, type CarlogDB, type SyncedTable } from './db';

export const BACKUP_FORMAT = 'carlog.backup.v1';
const BACKUP_JSON = 'backup.json';
const SCAN_FILE_RE = /^scans\/([0-9a-f]{64})\.[a-z0-9]+$/;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  createdAt: string;
  appVersion: string;
  tables: Partial<Record<SyncedTable, SyncFields[]>>;
  /** Scans whose files were not on this device at export time (only on GitHub). */
  missingScans: string[];
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** sha256 of live scans whose files are not on this device. */
export async function missingScanHashes(db: CarlogDB): Promise<string[]> {
  const hashes = [...new Set((await db.scans.toArray()).filter((s) => !s.deleted).map((s) => s.sha256))];
  const blobs = await db.scanBlobs.bulkGet(hashes);
  return hashes.filter((_, i) => !blobs[i]);
}

export interface BackupResult {
  zip: Uint8Array;
  records: number;
  scans: number;
  missingScans: number;
}

export async function buildBackup(db: CarlogDB, appVersion: string, now = new Date()): Promise<BackupResult> {
  const tables: BackupFile['tables'] = {};
  let records = 0;
  for (const name of SYNCED_TABLES) {
    const rows = (await db.table(name).toArray()) as SyncFields[];
    tables[name] = rows;
    records += rows.filter((r) => !r.deleted).length;
  }

  const live = (await db.scans.toArray()).filter((s) => !s.deleted);
  const mimeBySha = new Map(live.map((s) => [s.sha256, s.mime]));
  const files: ZipEntry[] = [];
  const missing: string[] = [];
  for (const sha256 of mimeBySha.keys()) {
    const blob = (await db.scanBlobs.get(sha256))?.blob;
    if (!blob) {
      missing.push(sha256);
      continue;
    }
    files.push({ name: `scans/${sha256}.${EXT[mimeBySha.get(sha256)!] ?? 'bin'}`, data: new Uint8Array(await blob.arrayBuffer()), date: now });
  }

  const backup: BackupFile = { format: BACKUP_FORMAT, createdAt: now.toISOString(), appVersion, tables, missingScans: missing };
  const json = new TextEncoder().encode(JSON.stringify(backup));
  return { zip: createZip([{ name: BACKUP_JSON, data: json, date: now }, ...files]), records, scans: files.length, missingScans: missing.length };
}

export interface ImportResult {
  /** Records written (new or newer than here). */
  received: number;
  /** Records that are newer here and were kept. */
  newerHere: number;
  scansAdded: number;
  /** Scan files whose content did not match their name (skipped). */
  scansDamaged: number;
  createdAt: string;
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function importBackup(db: CarlogDB, bytes: Uint8Array): Promise<ImportResult> {
  let entries: ZipEntry[];
  try {
    entries = await readZip(bytes);
  } catch (err) {
    throw err instanceof ZipError ? err : new ZipError('Не удалось прочитать архив');
  }
  const json = entries.find((e) => e.name === BACKUP_JSON);
  if (!json) throw new ZipError('В архиве нет backup.json — это не резервная копия Бортжурнала');
  let backup: Partial<BackupFile>;
  try {
    backup = JSON.parse(new TextDecoder().decode(json.data)) as Partial<BackupFile>;
  } catch {
    throw new ZipError('backup.json повреждён');
  }
  if (backup.format !== BACKUP_FORMAT || typeof backup.tables !== 'object' || backup.tables === null) {
    throw new ZipError('Резервная копия в неизвестном формате — возможно, её сделала более новая версия приложения');
  }

  // Scan files first: a record never points to a file that failed to arrive because of us.
  const mimeBySha = new Map(((backup.tables.scans ?? []) as Array<{ sha256?: string; mime?: string }>).map((s) => [s.sha256, s.mime]));
  let scansAdded = 0;
  let scansDamaged = 0;
  for (const e of entries) {
    const m = SCAN_FILE_RE.exec(e.name);
    if (!m) continue;
    const sha256 = m[1]!;
    if ((await sha256Hex(e.data)) !== sha256) {
      scansDamaged++;
      continue;
    }
    if (await db.scanBlobs.get(sha256)) continue;
    await db.scanBlobs.put({ sha256, blob: new Blob([e.data as BlobPart], { type: mimeBySha.get(sha256) ?? 'image/jpeg' }) });
    scansAdded++;
  }

  const tables: BackupFile['tables'] = {};
  for (const name of SYNCED_TABLES) {
    const rows = backup.tables[name];
    if (Array.isArray(rows)) tables[name] = rows;
  }
  const merged = await mergeTables(db, tables);
  return { ...merged, scansAdded, scansDamaged, createdAt: backup.createdAt ?? '' };
}

/** "carlog-backup-2026-10-28.zip" */
export function backupFileName(date: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `carlog-backup-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}.zip`;
}
