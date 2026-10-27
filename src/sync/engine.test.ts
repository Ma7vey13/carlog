import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeGitHub } from '../../tests/fakeGithub';
import { BRAKES_FRONT_2025, DISCS_FRONT_2025 } from '../../tests/fixtures/manualVisits';
import { PAGE2_ACT } from '../../tests/fixtures/drafts';
import { fixtureToForm } from '../../tests/helpers';
import { createVault, encryptJson, type Vault } from '../core/crypto';
import { bundleToForm, updateLine } from '../core/visitForm';
import { CarlogDB } from '../db/db';
import { getDeviceId } from '../db/device';
import { createDraftFromScans } from '../db/drafts';
import { storeScans } from '../db/scans';
import { ensureSeed } from '../db/seed';
import { addManualMileage, deleteVisit, loadMileage, loadVisitBundle, loadVisitBundles, saveVisitForm } from '../db/visits';
import { downloadMissingScans, hasRemoteChanges, initRepository, pull, push, SNAPSHOT_PATH, VaultChangedError, type SyncContext } from './engine';
import { GitHub, GitHubError } from './github';
import { loadSyncState, saveSyncState } from './state';

const OWNER = 'owner';
const REPO = 'carlog-data';
const TOKEN = ['test', 'token', 'value'].join('-');
const FAST = 1000; // PBKDF2 iterations for tests only

let fake: FakeGitHub;
let vault: Vault;
let key: CryptoKey;
let phone: CarlogDB;
let pc: CarlogDB;
let n = 0;

async function device(name: string): Promise<CarlogDB> {
  const db = new CarlogDB(`sync-${name}-${++n}`);
  await ensureSeed(db);
  await saveSyncState(db, { config: { owner: OWNER, repo: REPO, branch: 'main', deviceName: name }, vault });
  return db;
}

async function ctx(db: CarlogDB, k: CryptoKey = key): Promise<SyncContext> {
  return { db, gh: new GitHub(OWNER, REPO, TOKEN, fake.fetch), key: k, deviceId: await getDeviceId(db) };
}

beforeEach(async () => {
  fake = new FakeGitHub(OWNER, REPO, TOKEN);
  ({ vault, key } = await createVault('long test password', undefined, FAST));
  phone = await device('Телефон');
  pc = await device('Компьютер');
  await initRepository(await ctx(phone), vault);
});

afterEach(async () => {
  await phone.delete();
  await pc.delete();
});

const visitDates = async (db: CarlogDB) => (await loadVisitBundles(db)).map((b) => b.visit.date).sort();

describe('first device', () => {
  it('creates vault.json in an empty repository, then the encrypted snapshot in one commit', () => {
    expect([...fake.files().keys()].sort()).toEqual(['data/snapshot.enc', 'vault.json']);
    expect(fake.history()).toEqual([expect.stringMatching(/^sync: Телефон \d\d\.\d\d\.\d{4} \d\d:\d\d$/), 'init: vault.json (public KDF parameters only)']);
  });
});

describe('phone ↔ computer (stage 4 acceptance)', () => {
  it('a visit entered on the phone appears on the computer, and back', async () => {
    await saveVisitForm(phone, fixtureToForm(BRAKES_FRONT_2025), null);
    await push(await ctx(phone));

    const pulled = await pull(await ctx(pc));
    expect(pulled.upToDate).toBe(false);
    expect(await visitDates(pc)).toEqual(['2025-03-12']);

    await saveVisitForm(pc, fixtureToForm(DISCS_FRONT_2025), null);
    await push(await ctx(pc));
    await pull(await ctx(phone));
    expect(await visitDates(phone)).toEqual(['2025-03-12', '2025-07-22']);
  });

  it('changed on both without syncing: nothing is lost', async () => {
    const shared = await saveVisitForm(phone, fixtureToForm(BRAKES_FRONT_2025), null);
    const toDelete = await saveVisitForm(phone, fixtureToForm(DISCS_FRONT_2025), null);
    await push(await ctx(phone));
    await pull(await ctx(pc));

    // Offline on both: the phone edits a price and adds mileage; the computer deletes a visit and adds mileage.
    const bundle = (await loadVisitBundle(phone, shared))!;
    const form = bundleToForm(bundle);
    form.documents[0]!.lines[0] = updateLine(form.documents[0]!.lines[0]!, { price: '2100' });
    await saveVisitForm(phone, form, bundle);
    await addManualMileage(phone, '2026-01-10', 310000);
    await deleteVisit(pc, toDelete);
    await addManualMileage(pc, '2026-02-10', 312000);

    await push(await ctx(phone));
    const second = await push(await ctx(pc)); // must pull and merge first
    expect(second.pulledFirst).toBe(true);
    await pull(await ctx(phone));

    for (const db of [phone, pc]) {
      expect(await visitDates(db)).toEqual(['2025-03-12']);
      expect((await loadVisitBundle(db, shared))!.documents[0]!.lines[0]!.price).toBe(210000);
      expect((await loadMileage(db)).map((m) => m.km)).toEqual([312000, 310000, 293000]);
    }
  });

  it('retries when another device pushes in between (ref moved)', async () => {
    await saveVisitForm(phone, fixtureToForm(BRAKES_FRONT_2025), null);
    fake.beforeUpdateRef = () => {
      // Another device's commit lands right before our ref update.
      const head = fake.refs.get('main')!;
      const commit = 'f'.repeat(40);
      fake.commits.set(commit, { tree: fake.commits.get(head)!.tree, parents: [head], message: 'sync: другое устройство' });
      fake.refs.set('main', commit);
    };
    const result = await push(await ctx(phone));
    expect(result.attempts).toBe(2);
    expect(fake.history()[0]).toMatch(/^sync: Телефон/);
    expect(fake.history()[1]).toBe('sync: другое устройство');
  });
});

describe('scans and drafts', () => {
  it('uploads scans encrypted once; the other device downloads them on demand', async () => {
    const original = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3, 4, 5]);
    const [scanId] = await storeScans(phone, [{ blob: new Blob([original]), mime: 'image/jpeg', width: 10, height: 10, sha256: 'a'.repeat(64) }]);
    const first = await push(await ctx(phone));
    expect(first.scansUploaded).toBe(1);
    expect(fake.files().has(`scans/${'a'.repeat(64)}.enc`)).toBe(true);
    expect((await phone.scans.get(scanId!))?.uploaded).toBe(true);
    expect((await push(await ctx(phone))).scansUploaded).toBe(0);

    await pull(await ctx(pc));
    expect(await pc.scans.get(scanId!)).toMatchObject({ uploaded: true });
    expect(await pc.scanBlobs.get('a'.repeat(64))).toBeUndefined(); // phone-friendly: not downloaded yet
    const state = await loadSyncState(pc);
    expect(await downloadMissingScans(await ctx(pc), state.scanIndex, ['a'.repeat(64)])).toBe(1);
    const blob = (await pc.scanBlobs.get('a'.repeat(64)))!.blob;
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(original);
  });

  it('takes recognition results from drafts/ into the inbox (Claude Code CLI, stage 5)', async () => {
    const scanIds = await storeScans(phone, [{ blob: new Blob(['x']), mime: 'image/jpeg', width: 1, height: 1, sha256: 'b'.repeat(64) }]);
    const draftId = await createDraftFromScans(phone, scanIds);
    await push(await ctx(phone));

    // What the CLI does: an encrypted result next to the snapshot.
    const gh = new GitHub(OWNER, REPO, TOKEN, fake.fetch);
    const head = (await gh.head('main'))!;
    const blob = await gh.createBlob(await encryptJson(key, { draftId, payload: PAGE2_ACT }));
    const tree = await gh.createTree(await gh.commitTree(head), [{ path: `drafts/${draftId}.enc`, sha: blob }]);
    await gh.updateRef('main', await gh.createCommit('drafts: 1', tree, [head]));

    const result = await pull(await ctx(phone));
    expect(result.drafts).toBe(1);
    expect(await phone.drafts.get(draftId)).toMatchObject({ status: 'ready', source: 'claude-code', payload: PAGE2_ACT });
    expect((await pull(await ctx(phone))).drafts).toBe(0); // applied once
  });
});

describe('safety', () => {
  it('nothing in the repository is readable except vault.json', async () => {
    await saveVisitForm(phone, fixtureToForm(BRAKES_FRONT_2025), null);
    await storeScans(phone, [{ blob: new Blob(['ПЛАТЁЖНЫЙ ТЕКСТ']), mime: 'image/jpeg', width: 1, height: 1, sha256: 'c'.repeat(64) }]);
    await push(await ctx(phone));
    for (const [path, bytes] of fake.files()) {
      const text = new TextDecoder().decode(bytes);
      if (path === 'vault.json') {
        expect(JSON.parse(text).format).toBe('carlog.vault.v1');
        continue;
      }
      expect(() => JSON.parse(text), path).toThrow();
      for (const word of ['Пример', 'колодки', 'Колодки', '293000', 'ПЛАТЁЖНЫЙ']) expect(text, path).not.toContain(word);
    }
  });

  it('a key that does not open the vault is refused (password changed elsewhere)', async () => {
    const other = await createVault('another password!!', undefined, FAST);
    await saveSyncState(pc, { vaultSha: null });
    await expect(pull(await ctx(pc, other.key))).rejects.toBeInstanceOf(VaultChangedError);
  });

  it('a wrong token gives a readable auth error, without the token in it', async () => {
    fake.token = 'a different token';
    const err = await pull(await ctx(pc)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GitHubError);
    expect((err as GitHubError).kind).toBe('auth');
    expect((err as GitHubError).message).toBe('Токен истёк или неверен (код 401)');
    expect((err as GitHubError).message).not.toContain(TOKEN);
  });

  it('offers "Подтянуть" only when GitHub has a commit this device has not seen', async () => {
    const gh = new GitHub(OWNER, REPO, TOKEN, fake.fetch);
    expect(await hasRemoteChanges(phone, gh)).toBe(false);
    expect(await hasRemoteChanges(pc, gh)).toBe(true);
    await pull(await ctx(pc));
    expect(await hasRemoteChanges(pc, gh)).toBe(false);
    expect(fake.files().get(SNAPSHOT_PATH)).toBeDefined();
  });
});
