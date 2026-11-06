import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PAGE2_ACT } from '../../tests/fixtures/drafts';
import { createVault, decryptJson, encryptBytes, encryptJson, WrongPasswordError } from '../../src/core/crypto';
import { SNAPSHOT_FORMAT } from '../../src/sync/snapshot';
import type { CliConfig } from '../cli/env';
import { doneFile, runSession } from './session';

// /parse-scans in one go (D-101): one password, results picked up from the .done file.

const PASSWORD = 'long test password here';
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const SCAN = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 8, 7]);

let tmp: string;
let cfg: CliConfig;
let app: string;
let key: CryptoKey;

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'carlog-session-'));
  const remote = join(tmp, 'remote.git');
  execFileSync('git', ['init', '--quiet', '--bare', '-b', 'main', remote]);
  cfg = { dataRepo: 'owner/carlog-data', branch: 'main', remoteUrl: remote };
  app = join(tmp, 'app');
  execFileSync('git', ['clone', '--quiet', remote, app], { stdio: 'ignore' });
  git(app, 'config', 'user.name', 'Test');
  git(app, 'config', 'user.email', 'test@example.invalid');
  const created = await createVault(PASSWORD, undefined, 1000);
  key = created.key;
  const sha = createHash('sha256').update(SCAN).digest('hex');
  const t = '2026-11-06T10:00:00.000Z';
  const base = { createdAt: t, updatedAt: t, deleted: false, deviceId: 'phone' };
  const snapshot = {
    format: SNAPSHOT_FORMAT,
    createdAt: t,
    deviceId: 'phone',
    deviceName: 'Телефон',
    tables: {
      scans: [{ ...base, id: 'scan-1', mime: 'image/jpeg', size: SCAN.length, sha256: sha, width: 1, height: 1, rotation: 0, page: 1, uploaded: true }],
      drafts: [{ ...base, id: 'draft-1', source: 'chat', scanIds: ['scan-1'], payload: null, status: 'pending', visitId: null }],
    },
  };
  mkdirSync(join(app, 'data'));
  mkdirSync(join(app, 'scans'));
  writeFileSync(join(app, 'vault.json'), JSON.stringify(created.vault));
  writeFileSync(join(app, 'data', 'snapshot.enc'), await encryptJson(key, snapshot));
  writeFileSync(join(app, 'scans', `${sha}.enc`), await encryptBytes(key, SCAN));
  git(app, 'add', '.');
  git(app, 'commit', '--quiet', '-m', 'sync: Телефон');
  git(app, 'push', '--quiet', 'origin', 'HEAD:main');
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

const waitFor = async (check: () => boolean, ms = 10_000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe('inbox session', () => {
  it('a wrong password stops it before anything is decrypted', async () => {
    const inboxDir = join(tmp, 'inbox-wrong');
    await expect(runSession({ cfg, dataDir: join(tmp, 'data-wrong'), inboxDir, askPassword: async () => 'wrong password!!', log: () => {} })).rejects.toBeInstanceOf(
      WrongPasswordError,
    );
    expect(existsSync(inboxDir)).toBe(false);
  });

  it('asks once, waits for the results, rejects bad ones, then sends and cleans up', async () => {
    const dataDir = join(tmp, 'data');
    const inboxDir = join(tmp, 'inbox');
    const lines: string[] = [];
    let asked = 0;
    const session = runSession({
      cfg,
      dataDir,
      inboxDir,
      askPassword: async () => {
        asked++;
        return PASSWORD;
      },
      log: (l) => lines.push(l),
      pollMs: 20,
    });
    // The clone has no author of its own in a test: give it one before the session commits.
    await waitFor(() => existsSync(join(inboxDir, 'draft-1', 'page-1.jpg')));
    git(dataDir, 'config', 'user.name', 'Test');
    git(dataDir, 'config', 'user.email', 'test@example.invalid');
    expect(lines.join('\n')).toContain('ГОТОВО К РАСПОЗНАВАНИЮ: 1');

    // Not valid yet: reported, the session keeps waiting.
    writeFileSync(join(inboxDir, 'draft-1', 'result.json'), JSON.stringify({ ...PAGE2_ACT, lines: [] }));
    writeFileSync(doneFile(inboxDir), '');
    await waitFor(() => lines.some((l) => l.includes('НЕ ОТПРАВЛЕНО')));
    expect(existsSync(inboxDir)).toBe(true);

    writeFileSync(join(inboxDir, 'draft-1', 'result.json'), JSON.stringify(PAGE2_ACT));
    writeFileSync(doneFile(inboxDir), '');
    expect(await session).toEqual({ kind: 'sent', drafts: 1 });
    expect(asked).toBe(1);
    expect(existsSync(inboxDir)).toBe(false);

    git(app, 'pull', '--quiet', 'origin', 'main');
    const decoded = await decryptJson<{ draftId: string; source: string }>(key, new Uint8Array(readFileSync(join(app, 'drafts', 'draft-1.enc'))));
    expect(decoded).toMatchObject({ draftId: 'draft-1', source: 'claude-code' });
  });

  it('nothing waiting: says so and asks for nothing more', async () => {
    const lines: string[] = [];
    expect(await runSession({ cfg, dataDir: join(tmp, 'data'), inboxDir: join(tmp, 'inbox2'), askPassword: async () => PASSWORD, log: (l) => lines.push(l) })).toEqual({
      kind: 'nothing',
    });
    expect(lines.join('\n')).toContain('Черновиков, ждущих распознавания, нет');
  });

  it('times out: the decrypted scans are deleted, nothing is sent', async () => {
    // A fresh pending draft for this run.
    const t = '2026-11-06T11:00:00.000Z';
    const base = { createdAt: t, updatedAt: t, deleted: false, deviceId: 'phone' };
    const sha = createHash('sha256').update(SCAN).digest('hex');
    const snapshot = {
      format: SNAPSHOT_FORMAT,
      createdAt: t,
      deviceId: 'phone',
      deviceName: 'Телефон',
      tables: {
        scans: [{ ...base, id: 'scan-1', mime: 'image/jpeg', size: SCAN.length, sha256: sha, width: 1, height: 1, rotation: 0, page: 1, uploaded: true }],
        drafts: [{ ...base, id: 'draft-2', source: 'chat', scanIds: ['scan-1'], payload: null, status: 'pending', visitId: null }],
      },
    };
    writeFileSync(join(app, 'data', 'snapshot.enc'), await encryptJson(key, snapshot));
    git(app, 'add', '.');
    git(app, 'commit', '--quiet', '-m', 'sync: ещё скан');
    git(app, 'push', '--quiet', 'origin', 'HEAD:main');

    const inboxDir = join(tmp, 'inbox3');
    const outcome = await runSession({ cfg, dataDir: join(tmp, 'data'), inboxDir, askPassword: async () => PASSWORD, log: () => {}, pollMs: 10, timeoutMs: 50 });
    expect(outcome).toEqual({ kind: 'timeout' });
    expect(existsSync(inboxDir)).toBe(false);
  });
});
