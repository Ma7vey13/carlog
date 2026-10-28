// Per-device sync state in the local `meta` table (never synced, never leaves the device).

import { base64ToBytes, bytesToBase64, decryptBytes, encryptBytes, type Vault } from '../core/crypto';
import type { CarlogDB } from '../db/db';

export interface SyncConfig {
  owner: string;
  repo: string;
  branch: string;
  deviceName: string;
}

export interface SyncMark {
  at: string;
  commitSha: string;
  snapshotSha: string | null;
}

export interface SyncState {
  config: SyncConfig | null;
  /** The GitHub token, encrypted with the vault key (SPEC section 8). */
  tokenEnc: string | null;
  vault: Vault | null;
  /** Git blob sha of vault.json, to notice a password change made on another device. */
  vaultSha: string | null;
  lastPull: SyncMark | null;
  lastPush: SyncMark | null;
  /** The newest commit this device has seen (pushed or pulled). */
  knownHead: string | null;
  /** sha256 of a scan → git blob sha of scans/<sha256>.enc */
  scanIndex: Record<string, string>;
  /** drafts/<id>.enc blob shas already taken into the inbox. */
  appliedDraftFiles: string[];
  /** Download every scan on pull (computer) or only when opened (phone, default). */
  downloadAllScans: boolean;
  /** Push changes and pull other devices' ones by itself while the key is known (D-090). */
  autoSync: boolean;
}

const KEY = 'sync';
const REMEMBERED_KEY = 'rememberedKey';

const EMPTY: SyncState = {
  config: null,
  tokenEnc: null,
  vault: null,
  vaultSha: null,
  lastPull: null,
  lastPush: null,
  knownHead: null,
  scanIndex: {},
  appliedDraftFiles: [],
  downloadAllScans: false,
  autoSync: true,
};

export async function loadSyncState(db: CarlogDB): Promise<SyncState> {
  const stored = (await db.meta.get(KEY))?.value as Partial<SyncState> | undefined;
  return { ...EMPTY, ...stored };
}

export async function saveSyncState(db: CarlogDB, patch: Partial<SyncState>): Promise<SyncState> {
  return db.transaction('rw', db.meta, async () => {
    const next = { ...(await loadSyncState(db)), ...patch };
    await db.meta.put({ key: KEY, value: next });
    return next;
  });
}

/** Forget sync on this device: config, token, marks and the remembered key. Data stays. */
export async function resetSyncState(db: CarlogDB): Promise<void> {
  await db.meta.bulkDelete([KEY, REMEMBERED_KEY]);
}

export async function encryptToken(key: CryptoKey, token: string): Promise<string> {
  return bytesToBase64(await encryptBytes(key, new TextEncoder().encode(token.trim())));
}

export async function decryptToken(key: CryptoKey, tokenEnc: string): Promise<string> {
  return new TextDecoder().decode(await decryptBytes(key, base64ToBytes(tokenEnc)));
}

// "Запомнить на этом устройстве": the non-extractable CryptoKey itself is stored in IndexedDB.

export async function rememberKey(db: CarlogDB, key: CryptoKey): Promise<void> {
  await db.meta.put({ key: REMEMBERED_KEY, value: key });
}

export async function loadRememberedKey(db: CarlogDB): Promise<CryptoKey | null> {
  const value = (await db.meta.get(REMEMBERED_KEY))?.value;
  return value instanceof CryptoKey ? value : null;
}

export async function forgetKey(db: CarlogDB): Promise<void> {
  await db.meta.delete(REMEMBERED_KEY);
}
