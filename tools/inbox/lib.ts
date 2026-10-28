// The inbox round trip for Claude Code (SPEC section 6А), on a local clone of carlog-data:
//   pull:  pending drafts → private/inbox/<draftId>/page-N.jpg (+ history.json for context)
//   push:  private/inbox/<draftId>/result.json → validated → drafts/<draftId>.enc (encrypted)
// Pure file work; git and the password prompt live in the command entry points.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decryptBytes, decryptJson, encryptJson, parseVault, unlockVault, type Vault } from '../../src/core/crypto';
import { parseDraftText, type DraftV1, type ParseResult } from '../../src/core/draftSchema';
import type { CarDocument, Draft, Scan, Visit } from '../../src/core/model';
import { SNAPSHOT_PATH, VAULT_PATH, scanPath } from '../../src/sync/engine';
import { parseSnapshot, type Snapshot } from '../../src/sync/snapshot';

export const CLI_DRAFT_FORMAT = 'carlog.cli-draft.v1';

export async function openVault(dataDir: string, password: string): Promise<{ vault: Vault; key: CryptoKey }> {
  const path = join(dataDir, VAULT_PATH);
  if (!existsSync(path)) throw new Error('В carlog-data нет vault.json — синхронизация в приложении ещё не настроена');
  const vault = parseVault(JSON.parse(readFileSync(path, 'utf8')));
  return { vault, key: await unlockVault(vault, password) };
}

export async function readSnapshot(dataDir: string, key: CryptoKey): Promise<Snapshot | null> {
  const path = join(dataDir, SNAPSHOT_PATH);
  if (!existsSync(path)) return null;
  return parseSnapshot(await decryptJson(key, new Uint8Array(readFileSync(path))));
}

const draftFile = (dataDir: string, id: string) => join(dataDir, 'drafts', `${id}.enc`);

/** Drafts waiting for recognition that have no result in carlog-data yet. */
export function pendingDrafts(snapshot: Snapshot, dataDir: string): Draft[] {
  return ((snapshot.tables.drafts ?? []) as Draft[])
    .filter((d) => !d.deleted && d.status === 'pending' && d.scanIds.length > 0 && !existsSync(draftFile(dataDir, d.id)))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** What is already in the history, so Claude does not confuse a work order with its act. */
export function historySummary(snapshot: Snapshot) {
  const visits = ((snapshot.tables.visits ?? []) as Visit[]).filter((v) => !v.deleted);
  const docs = ((snapshot.tables.documents ?? []) as CarDocument[]).filter((d) => !d.deleted && !d.supersededBy);
  return visits
    .map((v) => ({
      visitDate: v.date,
      odometerKm: v.odometerKm,
      documents: docs
        .filter((d) => d.visitId === v.id)
        .map((d) => ({ type: d.type, number: d.number, date: d.date, relatedOrder: d.relatedOrder })),
    }))
    .sort((a, b) => a.visitDate.localeCompare(b.visitDate));
}

const INBOX_README = `# Входящие для /parse-scans

Здесь расшифрованные сканы черновиков, ждущих распознавания. Папка удаляется командой \`npm run inbox:push\`.

- \`<id>/page-N.jpg\` — страницы одного документа по порядку; \`<id>/meta.json\` — поворот страниц, заданный владельцем.
- \`<id>/result.json\` — сюда записать ровно один JSON формата carlog.draft.v1 (правила — в /parse-scans).
- \`history.json\` — документы, уже внесённые в историю: не путать заказ-наряд и акт по одному заказу, дубли отмечать в notes.
`;

export interface ExportedDraft {
  id: string;
  pages: number;
  dir: string;
}

/** Writes pending drafts to the inbox. Existing draft folders (maybe with a result) are left as they are. */
export async function exportInbox(dataDir: string, inboxDir: string, key: CryptoKey, snapshot: Snapshot): Promise<ExportedDraft[]> {
  const scans = new Map(((snapshot.tables.scans ?? []) as Scan[]).map((s) => [s.id, s]));
  mkdirSync(inboxDir, { recursive: true });
  writeFileSync(join(inboxDir, 'README.md'), INBOX_README);
  writeFileSync(join(inboxDir, 'history.json'), JSON.stringify(historySummary(snapshot), null, 2));

  const out: ExportedDraft[] = [];
  for (const draft of pendingDrafts(snapshot, dataDir)) {
    const dir = join(inboxDir, draft.id);
    if (existsSync(dir)) {
      out.push({ id: draft.id, pages: draft.scanIds.length, dir });
      continue;
    }
    mkdirSync(dir);
    const pages: Array<{ file: string; rotation: number }> = [];
    for (const [i, scanId] of draft.scanIds.entries()) {
      const scan = scans.get(scanId);
      const encPath = scan ? join(dataDir, scanPath(scan.sha256)) : '';
      if (!scan || !existsSync(encPath)) {
        throw new Error(`Скан страницы ${i + 1} черновика ${draft.id} ещё не отправлен с телефона. Нажмите там «Отправить» и повторите.`);
      }
      const bytes = await decryptBytes(key, new Uint8Array(readFileSync(encPath)));
      const sha = createHash('sha256').update(bytes).digest('hex');
      if (sha !== scan.sha256) throw new Error(`Скан ${scan.sha256} повреждён: хеш не совпадает`);
      const file = `page-${i + 1}.jpg`;
      writeFileSync(join(dir, file), bytes);
      pages.push({ file, rotation: scan.rotation });
    }
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({ draftId: draft.id, createdAt: draft.createdAt, pages }, null, 2));
    out.push({ id: draft.id, pages: pages.length, dir });
  }
  return out;
}

export interface InboxResult {
  id: string;
  /** null when result.json has not been written yet. */
  result: ParseResult | null;
}

/** Reads every <draftId>/result.json and validates it against the draft schema. */
export function readResults(inboxDir: string): InboxResult[] {
  if (!existsSync(inboxDir)) return [];
  return readdirSync(inboxDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const path = join(inboxDir, e.name, 'result.json');
      return { id: e.name, result: existsSync(path) ? parseDraftText(readFileSync(path, 'utf8')) : null };
    });
}

/** Encrypts valid results into carlog-data/drafts/<id>.enc. Returns repository-relative paths. */
export async function writeDraftFiles(dataDir: string, key: CryptoKey, results: Array<{ id: string; draft: DraftV1 }>, now = new Date().toISOString()): Promise<string[]> {
  mkdirSync(join(dataDir, 'drafts'), { recursive: true });
  const paths: string[] = [];
  for (const { id, draft } of results) {
    const bytes = await encryptJson(key, { format: CLI_DRAFT_FORMAT, draftId: id, payload: draft, source: 'claude-code', createdAt: now });
    writeFileSync(draftFile(dataDir, id), bytes);
    paths.push(`drafts/${id}.enc`);
  }
  return paths;
}
