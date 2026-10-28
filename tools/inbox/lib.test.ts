import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ALL_PAGES, PAGE2_ACT } from '../../tests/fixtures/drafts';
import { createVault, decryptJson, encryptBytes, encryptJson, WrongPasswordError } from '../../src/core/crypto';
import { validateDraft } from '../../src/core/draftSchema';
import { SNAPSHOT_FORMAT } from '../../src/sync/snapshot';
import { commitAndPush, ROOT, syncClone, type CliConfig } from '../cli/env';
import { exportInbox, openVault, pendingDrafts, readResults, readSnapshot, writeDraftFiles } from './lib';
import { buildParseScansCommand, PARSE_SCANS_PATH } from './parseScansCommand';
import { compareWithReference, referenceTable } from './reference';

const PASSWORD = 'long test password here';
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const identity = (dir: string) => {
  git(dir, 'config', 'user.name', 'Test');
  git(dir, 'config', 'user.email', 'test@example.invalid');
};

let tmp: string;
let cfg: CliConfig;
let app: string; // the "app side" working copy that pushes vault + snapshot
let clone: string; // the CLI's private/carlog-data
let inbox: string;
const SCAN = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
let scanSha: string;

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'carlog-cli-'));
  const remote = join(tmp, 'remote.git');
  execFileSync('git', ['init', '--quiet', '--bare', '-b', 'main', remote]);
  cfg = { dataRepo: 'owner/carlog-data', branch: 'main', remoteUrl: remote };

  // What the app has pushed: vault, snapshot with one pending draft and one stored visit, the scan.
  app = join(tmp, 'app');
  execFileSync('git', ['clone', '--quiet', remote, app], { stdio: 'ignore' });
  identity(app);
  const { vault, key } = await createVault(PASSWORD, undefined, 1000);
  scanSha = (await import('node:crypto')).createHash('sha256').update(SCAN).digest('hex');
  const t = '2026-10-28T10:00:00.000Z';
  const base = { createdAt: t, updatedAt: t, deleted: false, deviceId: 'phone' };
  const snapshot = {
    format: SNAPSHOT_FORMAT,
    createdAt: t,
    deviceId: 'phone',
    deviceName: 'Телефон',
    tables: {
      scans: [{ ...base, id: 'scan-1', mime: 'image/jpeg', size: SCAN.length, sha256: scanSha, width: 1, height: 1, rotation: 90, page: 1, uploaded: true }],
      drafts: [
        { ...base, id: 'draft-1', source: 'chat', scanIds: ['scan-1'], payload: null, status: 'pending', visitId: null },
        { ...base, id: 'draft-done', source: 'chat', scanIds: ['scan-1'], payload: null, status: 'accepted', visitId: 'v1' },
      ],
      visits: [{ ...base, id: 'v1', vehicleId: 'car', date: '2025-07-20', odometerKm: 297900, kind: 'service', shop: {}, notes: '', status: 'confirmed' }],
      documents: [{ ...base, id: 'd1', visitId: 'v1', type: 'work_order', number: '26548', date: '2025-07-20', relatedOrder: null, totals: {}, purchaseOnly: false, scanIds: [] }],
    },
  };
  mkdirSync(join(app, 'data'));
  mkdirSync(join(app, 'scans'));
  writeFileSync(join(app, 'vault.json'), JSON.stringify(vault));
  writeFileSync(join(app, 'data', 'snapshot.enc'), await encryptJson(key, snapshot));
  writeFileSync(join(app, 'scans', `${scanSha}.enc`), await encryptBytes(key, SCAN));
  git(app, 'add', '.');
  git(app, 'commit', '--quiet', '-m', 'sync: Телефон');
  git(app, 'push', '--quiet', 'origin', 'HEAD:main');

  clone = join(tmp, 'carlog-data');
  inbox = join(tmp, 'inbox');
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('inbox round trip (Claude Code, SPEC section 6А)', () => {
  it('pull: clones, refuses a wrong password, exports the pending draft with context', async () => {
    syncClone(cfg, clone);
    identity(clone);
    await expect(openVault(clone, 'wrong password!!')).rejects.toBeInstanceOf(WrongPasswordError);
    const { key } = await openVault(clone, PASSWORD);
    const snapshot = (await readSnapshot(clone, key))!;
    expect(pendingDrafts(snapshot, clone).map((d) => d.id)).toEqual(['draft-1']);

    const exported = await exportInbox(clone, inbox, key, snapshot);
    expect(exported).toMatchObject([{ id: 'draft-1', pages: 1 }]);
    expect(new Uint8Array(readFileSync(join(inbox, 'draft-1', 'page-1.jpg')))).toEqual(SCAN);
    expect(JSON.parse(readFileSync(join(inbox, 'draft-1', 'meta.json'), 'utf8'))).toMatchObject({ pages: [{ file: 'page-1.jpg', rotation: 90 }] });
    expect(JSON.parse(readFileSync(join(inbox, 'history.json'), 'utf8'))).toEqual([
      { visitDate: '2025-07-20', odometerKm: 297900, documents: [{ type: 'work_order', number: '26548', date: '2025-07-20', relatedOrder: null }] },
    ]);
    expect(existsSync(join(inbox, 'README.md'))).toBe(true);
  });

  it('check: missing and invalid results are reported, valid ones pass', () => {
    expect(readResults(inbox)).toEqual([{ id: 'draft-1', result: null }]);
    writeFileSync(join(inbox, 'draft-1', 'result.json'), JSON.stringify({ ...PAGE2_ACT, lines: [] }));
    const bad = readResults(inbox)[0]!.result!;
    expect(bad.ok).toBe(false);
    writeFileSync(join(inbox, 'draft-1', 'result.json'), JSON.stringify(PAGE2_ACT, null, 2));
    expect(readResults(inbox)[0]!.result).toMatchObject({ ok: true });
  });

  it('push: encrypts the result into drafts/<id>.enc that the app can read', async () => {
    const { key } = await openVault(clone, PASSWORD);
    const valid = readResults(inbox).map((r) => ({ id: r.id, draft: (r.result as { ok: true; draft: typeof PAGE2_ACT }).draft }));
    const paths = await writeDraftFiles(clone, key, valid);
    expect(paths).toEqual(['drafts/draft-1.enc']);
    commitAndPush(cfg, paths, 'drafts: 1 от Claude Code', clone);

    git(app, 'pull', '--quiet', 'origin', 'main');
    const file = new Uint8Array(readFileSync(join(app, 'drafts', 'draft-1.enc')));
    expect(new TextDecoder().decode(file)).not.toContain('26548');
    const decoded = await decryptJson<{ draftId: string; payload: unknown }>(key, file);
    expect(decoded.draftId).toBe('draft-1');
    expect(validateDraft(decoded.payload)).toMatchObject({ ok: true });
    expect(git(app, 'log', '-1', '--format=%s').trim()).toBe('drafts: 1 от Claude Code');

    // A recognised draft is not exported again.
    const snapshot = (await readSnapshot(clone, key))!;
    expect(pendingDrafts(snapshot, clone)).toEqual([]);
  });
});

describe('reference comparison (SPEC section 11)', () => {
  it('synthetic pages 1–6 match every cell', () => {
    const rows = compareWithReference([...ALL_PAGES]);
    expect(rows.every((r) => r.found && r.cells.every((c) => c.ok))).toBe(true);
    expect(referenceTable(rows)).toContain('| 5 | ✓ акт к з/н №19963 от 19.09.2021 | ✓ 06.10.2021 | ✓ 250 000 | ✓ 2 / 62 190 | ✓ 16 / 63 290 | ✓ 125 480 |');
  });

  it('a wrong cell is shown with the reference value', () => {
    const p2 = structuredClone(PAGE2_ACT);
    p2.document.odometerKm = 298800;
    const row = compareWithReference([p2]).find((r) => r.page === 2)!;
    expect(row.cells.filter((c) => !c.ok).map((c) => c.label)).toEqual(['Пробег']);
    expect(referenceTable([row])).toContain('✗ 298 800 (эталон: 298 000)');
    expect(compareWithReference([p2]).find((r) => r.page === 1)?.found).toBe(false);
  });
});

describe('/parse-scans command', () => {
  it('is up to date with the shared format rules (npm run gen:commands)', () => {
    expect(readFileSync(join(ROOT, PARSE_SCANS_PATH), 'utf8')).toBe(buildParseScansCommand());
  });
});
