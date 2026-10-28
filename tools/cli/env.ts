// Paths, CLI config and git for the Claude Code inbox commands (SPEC section 6А).
// Everything decrypted lives under private/ (git-ignored) and private/inbox/ is removed after a push.

import { execFileSync, type ExecFileSyncOptions } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '..', '..');
export const PRIVATE_DIR = join(ROOT, 'private');
export const DATA_DIR = join(PRIVATE_DIR, 'carlog-data');
export const INBOX_DIR = join(PRIVATE_DIR, 'inbox');
const CONFIG_PATH = join(PRIVATE_DIR, 'carlog-cli.json');

export interface CliConfig {
  /** owner/repo of the private data repository. */
  dataRepo: string;
  branch: string;
  /** Overrides the clone URL (tests use a local bare repository). */
  remoteUrl?: string;
}

function git(args: string[], opts: ExecFileSyncOptions = {}): string {
  return String(execFileSync('git', args, { encoding: 'utf8', ...opts }) ?? '').trim();
}

/**
 * private/carlog-cli.json if present; otherwise derived from this repository's origin:
 * github.com/<owner>/carlog → <owner>/carlog-data.
 */
export function loadConfig(): CliConfig {
  if (existsSync(CONFIG_PATH)) return { branch: 'main', ...(JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as Partial<CliConfig>) } as CliConfig;
  let origin = '';
  try {
    origin = git(['-C', ROOT, 'remote', 'get-url', 'origin'], { stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    // no origin
  }
  const m = /github\.com[/:]([^/]+)\/[^/]+?(?:\.git)?$/.exec(origin);
  if (!m) throw new Error(`Не знаю, где репозиторий данных. Создайте ${CONFIG_PATH} с содержимым {"dataRepo": "владелец/carlog-data"}`);
  return { dataRepo: `${m[1]}/carlog-data`, branch: 'main' };
}

export function cloneUrl(cfg: CliConfig): string {
  return cfg.remoteUrl ?? `https://github.com/${cfg.dataRepo}.git`;
}

/** Clones carlog-data into private/carlog-data or brings it up to date. Git asks for GitHub login itself. */
export function syncClone(cfg: CliConfig, dir = DATA_DIR): void {
  if (!existsSync(join(dir, '.git'))) {
    console.log(`Клонирую ${cfg.dataRepo} в private/carlog-data…`);
    git(['clone', '--branch', cfg.branch, cloneUrl(cfg), dir], { stdio: 'inherit' });
    useOwnerIdentity(dir);
    return;
  }
  console.log('Обновляю private/carlog-data…');
  git(['-C', dir, 'pull', '--rebase', '--quiet', 'origin', cfg.branch], { stdio: 'inherit' });
}

/** Commits in carlog-data use the same author as this repository (pseudonym + noreply). */
function useOwnerIdentity(dir: string) {
  for (const key of ['user.name', 'user.email']) {
    try {
      const value = git(['-C', ROOT, 'config', key], { stdio: ['ignore', 'pipe', 'ignore'] });
      if (value) git(['-C', dir, 'config', key, value]);
    } catch {
      // not set: git will complain on commit with its own message
    }
  }
}

/** Commits the given paths and pushes; on a rejected push rebases once and retries. */
export function commitAndPush(cfg: CliConfig, paths: string[], message: string, dir = DATA_DIR): void {
  git(['-C', dir, 'add', '--', ...paths]);
  git(['-C', dir, 'commit', '--quiet', '-m', message]);
  try {
    git(['-C', dir, 'push', '--quiet', 'origin', `HEAD:${cfg.branch}`], { stdio: 'inherit' });
  } catch {
    console.log('На GitHub появились новые данные — подтягиваю и отправляю снова…');
    git(['-C', dir, 'pull', '--rebase', '--quiet', 'origin', cfg.branch], { stdio: 'inherit' });
    git(['-C', dir, 'push', '--quiet', 'origin', `HEAD:${cfg.branch}`], { stdio: 'inherit' });
  }
}
