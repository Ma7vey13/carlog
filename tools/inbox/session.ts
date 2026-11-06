// /parse-scans in one go with one password (D-101): decrypt the waiting scans, wait for the results,
// then encrypt and push them with the same key. The key stays in this process's memory only.

import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { DraftV1 } from '../../src/core/draftSchema';
import { commitAndPush, syncClone, type CliConfig } from '../cli/env';
import { exportInbox, openVault, readResults, readSnapshot, writeDraftFiles } from './lib';

export interface SessionOptions {
  cfg: CliConfig;
  dataDir: string;
  inboxDir: string;
  askPassword: () => Promise<string>;
  log?: (line: string) => void;
  pollMs?: number;
  timeoutMs?: number;
  /** Lets a test stop waiting. */
  signal?: AbortSignal;
}

export type SessionOutcome = { kind: 'nothing' } | { kind: 'sent'; drafts: number } | { kind: 'timeout' } | { kind: 'aborted' };

/** The file Claude Code creates when every result.json is written and checked. */
export const doneFile = (inboxDir: string) => join(inboxDir, '.done');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runSession(opts: SessionOptions): Promise<SessionOutcome> {
  const log = opts.log ?? ((line: string) => console.log(line));
  const pollMs = opts.pollMs ?? 2000;
  const timeoutMs = opts.timeoutMs ?? 3 * 60 * 60 * 1000;
  const done = doneFile(opts.inboxDir);

  syncClone(opts.cfg, opts.dataDir);
  const { key } = await openVault(opts.dataDir, await opts.askPassword());
  const snapshot = await readSnapshot(opts.dataDir, key);
  if (!snapshot) {
    log('В carlog-data ещё нет данных: включите синхронизацию в приложении.');
    return { kind: 'nothing' };
  }
  const drafts = await exportInbox(opts.dataDir, opts.inboxDir, key, snapshot);
  if (!drafts.length) {
    log('Черновиков, ждущих распознавания, нет. Сфотографируйте документ во «Входящих» — снимок уйдёт с синхронизацией.');
    return { kind: 'nothing' };
  }
  rmSync(done, { force: true });
  log(`\nГОТОВО К РАСПОЗНАВАНИЮ: ${drafts.length}`);
  for (const d of drafts) log(`  private/inbox/${d.id}/  — страниц: ${d.pages}`);
  log('\nЖду: запишите result.json в каждую папку, проверьте npm run inbox:check, затем создайте файл private/inbox/.done.');

  const started = Date.now();
  for (;;) {
    if (opts.signal?.aborted) return { kind: 'aborted' };
    if (Date.now() - started > timeoutMs) {
      rmSync(opts.inboxDir, { recursive: true, force: true });
      log('Время сессии вышло, ничего не отправлено. Расшифрованные сканы удалены (private/inbox).');
      return { kind: 'timeout' };
    }
    await sleep(pollMs);
    if (!existsSync(done)) continue;
    rmSync(done, { force: true });

    const results = readResults(opts.inboxDir);
    const bad = results.filter((r) => !r.result?.ok);
    if (bad.length) {
      log(`\nНЕ ОТПРАВЛЕНО: ${bad.length} без правильного result.json. Исправьте и снова создайте private/inbox/.done.`);
      for (const r of bad) log(`  ${r.id}: ${r.result && !r.result.ok ? r.result.errors.slice(0, 5).join('; ') : 'нет result.json'}`);
      continue;
    }

    const valid = results.map((r) => ({ id: r.id, draft: (r.result as { ok: true; draft: DraftV1 }).draft }));
    syncClone(opts.cfg, opts.dataDir);
    const paths = await writeDraftFiles(opts.dataDir, key, valid);
    commitAndPush(opts.cfg, paths, `drafts: ${paths.length} от Claude Code`, opts.dataDir);
    rmSync(opts.inboxDir, { recursive: true, force: true });
    log(`\nОТПРАВЛЕНО ЧЕРНОВИКОВ: ${paths.length}. Папка private/inbox удалена.`);
    log('На телефоне черновики появятся во «Входящих» сами (автосинхронизация), как «Готов к проверке».');
    return { kind: 'sent', drafts: paths.length };
  }
}
