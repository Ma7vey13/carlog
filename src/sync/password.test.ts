import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeGitHub } from '../../tests/fakeGithub';
import { BRAKES_FRONT_2025, DISCS_FRONT_2025 } from '../../tests/fixtures/manualVisits';
import { fixtureToForm } from '../../tests/helpers';
import { createVault, decryptBytes, unlockVault, WrongPasswordError, type Vault } from '../core/crypto';
import { CarlogDB } from '../db/db';
import { getDeviceId } from '../db/device';
import { storeScans } from '../db/scans';
import { ensureSeed } from '../db/seed';
import { loadVisitBundles, saveVisitForm } from '../db/visits';
import { hasRemoteChanges, initRepository, pull, push, VaultChangedError, type SyncContext } from './engine';
import { GitHub } from './github';
import { adoptChangedPassword, changePasswordHere, keyFromOldPassword } from './password';
import { decryptToken, encryptToken, loadRememberedKey, loadSyncState, rememberKey, saveSyncState } from './state';

const OWNER = 'owner';
const REPO = 'carlog-data';
const TOKEN = ['test', 'token', 'value'].join('-');
const FAST = 1000;
const OLD = 'old long test password';
const NEW = 'new long test password';

let fake: FakeGitHub;
let vault: Vault;
let key: CryptoKey;
let phone: CarlogDB;
let pc: CarlogDB;
let n = 0;

async function device(name: string): Promise<CarlogDB> {
  const db = new CarlogDB(`pw-${name}-${++n}`);
  await ensureSeed(db);
  await saveSyncState(db, { config: { owner: OWNER, repo: REPO, branch: 'main', deviceName: name }, vault, tokenEnc: await encryptToken(key, TOKEN) });
  return db;
}
const gh = (token = TOKEN) => new GitHub(OWNER, REPO, token, fake.fetch);
async function ctx(db: CarlogDB, k: CryptoKey): Promise<SyncContext> {
  return { db, gh: gh(), key: k, deviceId: await getDeviceId(db) };
}

beforeEach(async () => {
  fake = new FakeGitHub(OWNER, REPO, TOKEN);
  ({ vault, key } = await createVault(OLD, undefined, FAST));
  phone = await device('Телефон');
  pc = await device('Компьютер');
  await initRepository(await ctx(phone, key), vault);
});

afterEach(async () => {
  await phone.delete();
  await pc.delete();
});

describe('password change', () => {
  it('re-encrypts every file in one commit; the old key opens nothing any more', async () => {
    await saveVisitForm(phone, fixtureToForm(BRAKES_FRONT_2025), null);
    await storeScans(phone, [{ blob: new Blob(['scan']), mime: 'image/jpeg', width: 1, height: 1, sha256: 'a'.repeat(64) }]);
    await push(await ctx(phone, key));
    const commitsBefore = fake.history().length;

    const r = await changePasswordHere(await ctx(phone, key), NEW, FAST);
    expect(r.filesReencrypted).toBe(2); // snapshot + scan
    expect(fake.history().length).toBe(commitsBefore + 1);
    expect(fake.history()[0]).toBe('password: все файлы перешифрованы (2)');

    const files = fake.files();
    const newVault = JSON.parse(new TextDecoder().decode(files.get('vault.json')!)) as Vault;
    const newKey = await unlockVault(newVault, NEW);
    await expect(unlockVault(newVault, OLD)).rejects.toThrow(WrongPasswordError);
    for (const [path, bytes] of files) {
      if (!path.endsWith('.enc')) continue;
      await expect(decryptBytes(newKey, bytes)).resolves.toBeInstanceOf(Uint8Array);
      await expect(decryptBytes(key, bytes)).rejects.toThrow();
    }

    // This device: token re-encrypted, nothing looks new, pushing goes on with the new key.
    const s = await loadSyncState(phone);
    expect(await decryptToken(r.key, s.tokenEnc!)).toBe(TOKEN);
    expect(await hasRemoteChanges(phone, gh())).toBe(false);
    expect((await pull(await ctx(phone, r.key))).upToDate).toBe(true);
    await saveVisitForm(phone, fixtureToForm(DISCS_FRONT_2025), null);
    await push(await ctx(phone, r.key));
  });

  it('replaces the remembered key, if there was one', async () => {
    await rememberKey(phone, key);
    await changePasswordHere(await ctx(phone, key), NEW, FAST);
    const remembered = (await loadRememberedKey(phone))!;
    expect(await decryptToken(remembered, (await loadSyncState(phone)).tokenEnc!)).toBe(TOKEN);
  });

  it('the other device is told, takes the new password with its remembered key, and keeps its data', async () => {
    await saveVisitForm(pc, fixtureToForm(DISCS_FRONT_2025), null); // not pushed yet
    await rememberKey(pc, key);
    await changePasswordHere(await ctx(phone, key), NEW, FAST);

    await expect(pull(await ctx(pc, key))).rejects.toThrow(VaultChangedError);
    await expect(adoptChangedPassword(pc, key, 'wrong new password', gh)).rejects.toThrow(WrongPasswordError);
    const newKey = await adoptChangedPassword(pc, key, NEW, gh);
    expect(await decryptToken((await loadRememberedKey(pc))!, (await loadSyncState(pc)).tokenEnc!)).toBe(TOKEN);

    await pull(await ctx(pc, newKey));
    await push(await ctx(pc, newKey));
    await pull(await ctx(phone, await unlockVault((await loadSyncState(phone)).vault!, NEW)));
    expect((await loadVisitBundles(phone)).map((b) => b.visit.date)).toEqual(['2025-07-22']);
  });

  it('without a remembered key the other device needs the old password too', async () => {
    await changePasswordHere(await ctx(phone, key), NEW, FAST);
    await expect(keyFromOldPassword(pc, NEW)).rejects.toThrow(WrongPasswordError);
    const oldKey = await keyFromOldPassword(pc, OLD);
    const newKey = await adoptChangedPassword(pc, oldKey, NEW, gh);
    expect((await pull(await ctx(pc, newKey))).upToDate).toBe(false);
    expect(await loadRememberedKey(pc)).toBeNull();
  });

});
