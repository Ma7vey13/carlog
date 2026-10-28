// Password change on this device, and taking over a password changed on another device.
// The GitHub token is stored encrypted with the vault key (SPEC section 8), so after a change
// it has to be re-encrypted with the new key on every device.

import { unlockVault } from '../core/crypto';
import type { CarlogDB } from '../db/db';
import { changePassword, readRemoteVault, SyncError, type PasswordChangeResult, type SyncContext } from './engine';
import type { GitHub } from './github';
import { decryptToken, encryptToken, loadRememberedKey, loadSyncState, rememberKey, saveSyncState } from './state';

/** Re-encrypts carlog-data, then the local token and the remembered key. */
export async function changePasswordHere(ctx: SyncContext, newPassword: string, iterations?: number): Promise<PasswordChangeResult> {
  const before = await loadSyncState(ctx.db);
  if (!before.tokenEnc) throw new SyncError('Синхронизация не настроена');
  const token = await decryptToken(ctx.key, before.tokenEnc);
  const remembered = !!(await loadRememberedKey(ctx.db));
  const result = await changePassword(ctx, newPassword, iterations);
  await finishLocally(ctx.db, result.key, token, remembered);
  return result;
}

/**
 * The password was changed elsewhere. `oldKey` opens the token stored here (the remembered key, or
 * one derived from the old password); the new password must open the new vault.json on GitHub.
 */
export async function adoptChangedPassword(db: CarlogDB, oldKey: CryptoKey, newPassword: string, makeGitHub: (token: string) => GitHub): Promise<CryptoKey> {
  const s = await loadSyncState(db);
  if (!s.config || !s.tokenEnc) throw new SyncError('Синхронизация не настроена');
  let token: string;
  try {
    token = await decryptToken(oldKey, s.tokenEnc);
  } catch {
    throw new SyncError('Старый пароль не подходит к данным этого устройства');
  }
  const remote = await readRemoteVault(makeGitHub(token), s.config.branch);
  if (!remote) throw new SyncError('В репозитории нет vault.json');
  const newKey = await unlockVault(remote.vault, newPassword); // WrongPasswordError for a wrong new password
  await saveSyncState(db, { vault: remote.vault, vaultSha: remote.sha });
  await finishLocally(db, newKey, token, !!(await loadRememberedKey(db)));
  return newKey;
}

/** Old key from the old password, against the vault this device still has. */
export async function keyFromOldPassword(db: CarlogDB, oldPassword: string): Promise<CryptoKey> {
  const s = await loadSyncState(db);
  if (!s.vault) throw new SyncError('Синхронизация не настроена');
  return unlockVault(s.vault, oldPassword);
}

async function finishLocally(db: CarlogDB, key: CryptoKey, token: string, remember: boolean) {
  await saveSyncState(db, { tokenEnc: await encryptToken(key, token) });
  if (remember) await rememberKey(db, key);
}
