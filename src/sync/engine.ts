// "Отправить" and "Подтянуть" (SPEC section 8). Layout of carlog-data:
//   vault.json          public KDF parameters + encrypted check string (the only readable file)
//   data/snapshot.enc   every synced record, encrypted
//   scans/<sha256>.enc  scan files, encrypted, one per content hash
//   drafts/<id>.enc     recognition results written by the Claude Code CLI (stage 5)

import { decryptBytes, decryptJson, encryptBytes, encryptJson, parseVault, verifyKey, type Vault } from '../core/crypto';
import { validateDraft } from '../core/draftSchema';
import type { CarlogDB } from '../db/db';
import { setDraftPayload } from '../db/drafts';
import { GitHub, GitHubError, type TreeEntry } from './github';
import { applySnapshot, buildSnapshot, parseSnapshot } from './snapshot';
import { loadSyncState, saveSyncState, type SyncState } from './state';

export const VAULT_PATH = 'vault.json';
export const SNAPSHOT_PATH = 'data/snapshot.enc';
export const scanPath = (sha256: string) => `scans/${sha256}.enc`;
const DRAFT_RE = /^drafts\/([^/]+)\.enc$/;
const SCAN_RE = /^scans\/([0-9a-f]{64})\.enc$/;
const MAX_PUSH_ATTEMPTS = 3;

export class SyncError extends Error {}
/** The password was changed on another device: this device's key no longer opens the data. */
export class VaultChangedError extends SyncError {
  constructor() {
    super('Пароль сменили на другом устройстве. Введите новый пароль.');
  }
}

export interface SyncContext {
  db: CarlogDB;
  gh: GitHub;
  key: CryptoKey;
  deviceId: string;
  now?: () => string;
  onProgress?: (message: string) => void;
}

interface Remote {
  head: string | null;
  tree: string | null;
  files: Map<string, string>;
}

async function readRemote(gh: GitHub, branch: string): Promise<Remote> {
  const head = await gh.head(branch);
  if (!head) return { head: null, tree: null, files: new Map() };
  const tree = await gh.commitTree(head);
  const entries: TreeEntry[] = await gh.tree(tree);
  return { head, tree, files: new Map(entries.filter((e) => e.type === 'blob').map((e) => [e.path, e.sha])) };
}

const nowOf = (ctx: SyncContext) => (ctx.now ?? (() => new Date().toISOString()))();

function config(state: SyncState) {
  if (!state.config) throw new SyncError('Синхронизация не настроена');
  return state.config;
}

function scanIndexOf(files: Map<string, string>): Record<string, string> {
  const index: Record<string, string> = {};
  for (const [path, sha] of files) {
    const m = SCAN_RE.exec(path);
    if (m) index[m[1]!] = sha;
  }
  return index;
}

/** Re-reads vault.json if it changed and checks that our key still opens it. */
async function checkVault(ctx: SyncContext, state: SyncState, remote: Remote): Promise<Partial<SyncState>> {
  const sha = remote.files.get(VAULT_PATH);
  if (!sha) throw new SyncError('В репозитории нет vault.json — это не репозиторий данных Бортжурнала');
  if (sha === state.vaultSha && state.vault) return {};
  const vault = parseVault(JSON.parse(new TextDecoder().decode(await ctx.gh.blob(sha))));
  try {
    await verifyKey(vault, ctx.key);
  } catch {
    throw new VaultChangedError();
  }
  return { vault, vaultSha: sha };
}

// --- Подтянуть ------------------------------------------------------------------------------

export interface PullResult {
  upToDate: boolean;
  received: number;
  newerHere: number;
  drafts: number;
  scansDownloaded: number;
}

export async function pull(ctx: SyncContext): Promise<PullResult> {
  const state = await loadSyncState(ctx.db);
  const cfg = config(state);
  ctx.onProgress?.('Проверяю данные на GitHub…');
  const remote = await readRemote(ctx.gh, cfg.branch);
  const result: PullResult = { upToDate: true, received: 0, newerHere: 0, drafts: 0, scansDownloaded: 0 };
  if (!remote.head) return result;

  const patch: Partial<SyncState> = await checkVault(ctx, state, remote);

  const snapshotSha = remote.files.get(SNAPSHOT_PATH) ?? null;
  const known = new Set([state.lastPull?.snapshotSha, state.lastPush?.snapshotSha].filter(Boolean));
  if (snapshotSha && !known.has(snapshotSha)) {
    ctx.onProgress?.('Скачиваю и расшифровываю данные…');
    const snapshot = parseSnapshot(await decryptJson(ctx.key, await ctx.gh.blob(snapshotSha)));
    const applied = await applySnapshot(ctx.db, snapshot);
    result.upToDate = false;
    result.received = applied.received;
    result.newerHere = applied.newerHere;
  }

  // Recognition results from the Claude Code CLI → drafts ready for review.
  const applied = new Set(state.appliedDraftFiles);
  for (const [path, sha] of remote.files) {
    const m = DRAFT_RE.exec(path);
    if (!m || applied.has(sha)) continue;
    const file = await decryptJson<{ draftId?: string; payload?: unknown }>(ctx.key, await ctx.gh.blob(sha));
    const draft = file.draftId ? await ctx.db.drafts.get(file.draftId) : undefined;
    const parsed = validateDraft(file.payload);
    if (draft && draft.status === 'pending' && parsed.ok) {
      await setDraftPayload(ctx.db, draft.id, parsed.draft, 'claude-code');
      result.drafts++;
    }
    applied.add(sha);
  }

  const scanIndex = scanIndexOf(remote.files);
  if (state.downloadAllScans) result.scansDownloaded = await downloadMissingScans(ctx, scanIndex);

  await saveSyncState(ctx.db, {
    ...patch,
    lastPull: { at: nowOf(ctx), commitSha: remote.head, snapshotSha },
    knownHead: remote.head,
    scanIndex,
    appliedDraftFiles: [...applied],
  });
  return result;
}

/** Downloads scans that are only on GitHub (all of them, or the given hashes). */
export async function downloadMissingScans(ctx: SyncContext, index: Record<string, string>, only?: string[]): Promise<number> {
  const wanted = only ?? (await ctx.db.scans.toArray()).filter((s) => !s.deleted).map((s) => s.sha256);
  let n = 0;
  for (const sha256 of new Set(wanted)) {
    if (await ctx.db.scanBlobs.get(sha256)) continue;
    const blobSha = index[sha256];
    if (!blobSha) continue;
    ctx.onProgress?.(`Скачиваю сканы: ${n + 1}…`);
    const bytes = await decryptBytes(ctx.key, await ctx.gh.blob(blobSha));
    await ctx.db.scanBlobs.put({ sha256, blob: new Blob([bytes as BlobPart], { type: 'image/jpeg' }) });
    n++;
  }
  return n;
}

// --- Отправить ------------------------------------------------------------------------------

export interface PushResult {
  commitSha: string;
  scansUploaded: number;
  pulledFirst: boolean;
  attempts: number;
}

export async function push(ctx: SyncContext): Promise<PushResult> {
  let pulledFirst = false;
  for (let attempt = 1; attempt <= MAX_PUSH_ATTEMPTS; attempt++) {
    const state = await loadSyncState(ctx.db);
    const cfg = config(state);
    ctx.onProgress?.('Проверяю данные на GitHub…');
    const remote = await readRemote(ctx.gh, cfg.branch);
    if (!remote.head || !remote.tree) throw new SyncError('Репозиторий данных не подготовлен — пройдите настройку синхронизации заново');
    const vaultPatch = await checkVault(ctx, state, remote);
    if (Object.keys(vaultPatch).length) await saveSyncState(ctx.db, vaultPatch);

    // 1. Someone pushed since we last looked → pull and merge first (SPEC section 8, step 1).
    const remoteSnapshot = remote.files.get(SNAPSHOT_PATH) ?? null;
    const known = new Set([state.lastPull?.snapshotSha, state.lastPush?.snapshotSha].filter(Boolean));
    if (remoteSnapshot && !known.has(remoteSnapshot)) {
      ctx.onProgress?.('На GitHub есть новые данные — сначала подтягиваю их…');
      await pull(ctx);
      pulledFirst = true;
    }

    // 2. Missing scans.
    const entries: Array<{ path: string; sha: string }> = [];
    const uploaded: Record<string, string> = {};
    const scans = (await ctx.db.scans.toArray()).filter((s) => !s.deleted);
    for (const sha256 of new Set(scans.map((s) => s.sha256))) {
      if (remote.files.has(scanPath(sha256))) continue;
      const blob = (await ctx.db.scanBlobs.get(sha256))?.blob;
      if (!blob) continue;
      ctx.onProgress?.(`Шифрую и отправляю сканы: ${Object.keys(uploaded).length + 1}…`);
      const sha = await ctx.gh.createBlob(await encryptBytes(ctx.key, new Uint8Array(await blob.arrayBuffer())));
      entries.push({ path: scanPath(sha256), sha });
      uploaded[sha256] = sha;
    }

    // 3. New snapshot, everything in one commit.
    ctx.onProgress?.('Шифрую и отправляю данные…');
    const snapshot = await buildSnapshot(ctx.db, ctx.deviceId, cfg.deviceName, nowOf(ctx));
    for (const s of (snapshot.tables.scans ?? []) as unknown as Array<{ sha256: string; uploaded: boolean }>) {
      if (uploaded[s.sha256] || remote.files.has(scanPath(s.sha256))) s.uploaded = true;
    }
    const snapshotSha = await ctx.gh.createBlob(await encryptJson(ctx.key, snapshot));
    entries.push({ path: SNAPSHOT_PATH, sha: snapshotSha });
    const tree = await ctx.gh.createTree(remote.tree, entries);
    const message = `sync: ${cfg.deviceName} ${localStamp(nowOf(ctx))}`;
    const commitSha = await ctx.gh.createCommit(message, tree, [remote.head]);

    try {
      await ctx.gh.updateRef(cfg.branch, commitSha);
    } catch (err) {
      // 4. Another device pushed in between → start over (at most 3 times).
      if (err instanceof GitHubError && err.kind === 'conflict' && attempt < MAX_PUSH_ATTEMPTS) continue;
      if (err instanceof GitHubError && err.kind === 'conflict') {
        throw new SyncError('Другое устройство отправляет данные одновременно. Попробуйте ещё раз через минуту.');
      }
      throw err;
    }

    // Local scans are now on GitHub (no updatedAt change: this is device bookkeeping, not an edit).
    await ctx.db.transaction('rw', ctx.db.scans, async () => {
      for (const s of scans) if (!s.uploaded && (uploaded[s.sha256] || remote.files.has(scanPath(s.sha256)))) await ctx.db.scans.update(s.id, { uploaded: true });
    });
    const at = nowOf(ctx);
    await saveSyncState(ctx.db, {
      lastPush: { at, commitSha, snapshotSha },
      knownHead: commitSha,
      scanIndex: { ...scanIndexOf(remote.files), ...uploaded },
    });
    return { commitSha, scansUploaded: Object.keys(uploaded).length, pulledFirst, attempts: attempt };
  }
  throw new SyncError('Не удалось отправить данные');
}

/** "28.10.2026 14:05" in local time for commit messages. */
function localStamp(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// --- Setup and the startup check ------------------------------------------------------------

/** First device: writes vault.json (works on an empty repository) and pushes the first snapshot. */
export async function initRepository(ctx: SyncContext, vault: Vault): Promise<PushResult> {
  const state = await loadSyncState(ctx.db);
  const cfg = config(state);
  const bytes = new TextEncoder().encode(JSON.stringify(vault, null, 2) + '\n');
  await ctx.gh.createFile(VAULT_PATH, bytes, 'init: vault.json (public KDF parameters only)', cfg.branch);
  return push(ctx);
}

/** Reads vault.json of an existing data repository; null if the repository has none yet. */
export async function readRemoteVault(gh: GitHub, branch: string): Promise<{ vault: Vault; sha: string } | null> {
  const remote = await readRemote(gh, branch);
  const sha = remote.files.get(VAULT_PATH);
  if (!sha) return null;
  return { vault: parseVault(JSON.parse(new TextDecoder().decode(await gh.blob(sha)))), sha };
}

/** True when GitHub has a commit this device has not seen (offer "Подтянуть", never auto-apply). */
export async function hasRemoteChanges(db: CarlogDB, gh: GitHub): Promise<boolean> {
  const state = await loadSyncState(db);
  if (!state.config) return false;
  const head = await gh.head(state.config.branch);
  return !!head && head !== state.knownHead;
}
