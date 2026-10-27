// The sync session in the browser: the key in memory (or remembered on this device), the
// "Отправить" / "Подтянуть" actions with readable errors, the startup check and on-demand scans.

import { useSyncExternalStore } from 'react';
import { unlockVault, WrongPasswordError } from '../core/crypto';
import { getDb } from '../db/db';
import { getDeviceId } from '../db/device';
import { downloadMissingScans, hasRemoteChanges, pull, push, SyncError, VaultChangedError, type SyncContext } from './engine';
import { GitHub, GitHubError } from './github';
import { decryptToken, loadRememberedKey, loadSyncState, rememberKey, saveSyncState } from './state';

export type SyncErrorKind = 'locked' | 'auth' | 'vault' | 'network' | 'other';

export interface SessionState {
  key: CryptoKey | null;
  busy: 'push' | 'pull' | null;
  progress: string | null;
  error: { kind: SyncErrorKind; message: string } | null;
  /** Last successful action, for a short confirmation. */
  done: string | null;
  /** GitHub has a commit this device has not seen (startup check). */
  remoteNewer: boolean;
}

let state: SessionState = { key: null, busy: null, progress: null, error: null, done: null, remoteNewer: false };
const listeners = new Set<() => void>();

function set(patch: Partial<SessionState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useSession(): SessionState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export function sessionKey(): CryptoKey | null {
  return state.key;
}

export function setSessionKey(key: CryptoKey | null) {
  set({ key, error: state.error?.kind === 'locked' || state.error?.kind === 'vault' ? null : state.error });
}

export function clearSyncMessages() {
  set({ error: null, done: null });
}

/** Loads a remembered key and checks GitHub for newer data. Called once at startup. */
export async function startSession(): Promise<void> {
  const db = getDb();
  const remembered = await loadRememberedKey(db);
  if (remembered) set({ key: remembered });
  await checkRemote();
}

/** Startup check (SPEC section 8): only tells, never applies. Silent on any failure. */
export async function checkRemote(): Promise<void> {
  if (!state.key || !navigator.onLine) return;
  try {
    const gh = await github();
    if (gh) set({ remoteNewer: await hasRemoteChanges(getDb(), gh) });
  } catch {
    // Offline, expired token… the buttons will explain when pressed.
  }
}

/** Unlocks with the password against the stored vault; optionally remembers the key here. */
export async function unlock(password: string, remember: boolean): Promise<void> {
  const db = getDb();
  const s = await loadSyncState(db);
  if (!s.vault) throw new SyncError('Синхронизация не настроена');
  const key = await unlockVault(s.vault, password);
  if (remember) await rememberKey(db, key);
  set({ key, error: null });
}

async function github(): Promise<GitHub | null> {
  const s = await loadSyncState(getDb());
  if (!s.config || !s.tokenEnc || !state.key) return null;
  return new GitHub(s.config.owner, s.config.repo, await decryptToken(state.key, s.tokenEnc));
}

async function context(): Promise<SyncContext> {
  const db = getDb();
  const gh = await github();
  if (!gh || !state.key) throw new SyncError('locked');
  return { db, gh, key: state.key, deviceId: await getDeviceId(db), onProgress: (progress) => set({ progress }) };
}

function describe(err: unknown): { kind: SyncErrorKind; message: string } {
  if (err instanceof SyncError && err.message === 'locked') return { kind: 'locked', message: 'Введите пароль, чтобы синхронизировать' };
  if (err instanceof VaultChangedError) return { kind: 'vault', message: err.message };
  if (err instanceof WrongPasswordError) return { kind: 'vault', message: 'Ключ не подходит к данным. Введите пароль ещё раз.' };
  if (err instanceof GitHubError) {
    if (err.kind === 'auth' || err.kind === 'forbidden') return { kind: 'auth', message: err.message };
    if (err.kind === 'network') return { kind: 'network', message: 'Нет связи с GitHub. Проверьте интернет и попробуйте ещё раз.' };
    return { kind: 'other', message: err.message };
  }
  if (err instanceof SyncError) return { kind: 'other', message: err.message };
  console.error(err);
  return { kind: 'other', message: 'Что-то пошло не так. Попробуйте ещё раз.' };
}

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};

/** "Отправить" or "Подтянуть". Errors end up in the session state for the UI to explain. */
export async function runSync(kind: 'push' | 'pull'): Promise<boolean> {
  if (state.busy) return false;
  set({ busy: kind, progress: null, error: null, done: null });
  try {
    const ctx = await context();
    if (kind === 'push') {
      const r = await push(ctx);
      set({
        done: `Отправлено${r.scansUploaded ? `, сканов: ${r.scansUploaded}` : ''}${r.pulledFirst ? '. Перед отправкой подтянуты изменения с другого устройства' : ''}.`,
        remoteNewer: false,
      });
    } else {
      const r = await pull(ctx);
      const parts = [
        r.upToDate && !r.drafts ? 'Новых данных нет' : `Получено записей: ${r.received}`,
        r.drafts ? `${r.drafts} ${plural(r.drafts, 'черновик готов', 'черновика готовы', 'черновиков готовы')} к проверке` : '',
        r.scansDownloaded ? `сканов: ${r.scansDownloaded}` : '',
      ].filter(Boolean);
      set({ done: parts.join(', ') + '.', remoteNewer: false });
    }
    return true;
  } catch (err) {
    set({ error: describe(err) });
    return false;
  } finally {
    set({ busy: null, progress: null });
  }
}

/** Downloads one scan from GitHub when it is opened and is not on this device yet. */
export async function fetchScanOnDemand(sha256: string): Promise<boolean> {
  try {
    const db = getDb();
    const s = await loadSyncState(db);
    if (!s.scanIndex[sha256] || !navigator.onLine) return false;
    const ctx = await context();
    return (await downloadMissingScans(ctx, s.scanIndex, [sha256])) > 0;
  } catch {
    return false;
  }
}

export async function setDownloadAllScans(on: boolean) {
  await saveSyncState(getDb(), { downloadAllScans: on });
}
