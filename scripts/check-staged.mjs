#!/usr/bin/env node
// Pre-commit guard for the public `carlog` repository (SPEC section 14).
// Blocks:
//   1. anything under private/;
//   2. scan-like files (*.pdf, *.jpg, *.jpeg, *.png, *.webp, *.heic) outside public/icons/;
//   3. GitHub-token-like strings in staged text;
//   4. strings from the optional local denylist private/denylist.txt
//      (one entry per line, `#` starts a comment; the file itself is git-ignored).
// No dependencies, so it works before `npm install`.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const BLOCKED_EXT = /\.(pdf|jpe?g|png|webp|heic|heif)$/i;
const ALLOWED_IMAGE_DIR = 'public/icons/';
const TOKEN_PATTERNS = [
  /github_pat_[A-Za-z0-9_]{20,}/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/,
];
const DENYLIST_PATH = 'private/denylist.txt';

function git(args) {
  return execFileSync('git', args, { maxBuffer: 256 * 1024 * 1024 });
}

function stagedFiles() {
  const out = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']).toString('utf8');
  return out.split('\0').filter(Boolean);
}

function loadDenylist() {
  if (!existsSync(DENYLIST_PATH)) return [];
  return readFileSync(DENYLIST_PATH, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.toLowerCase());
}

function looksBinary(buf) {
  const len = Math.min(buf.length, 8000);
  for (let i = 0; i < len; i++) if (buf[i] === 0) return true;
  return false;
}

const problems = [];
const denylist = loadDenylist();

for (const file of stagedFiles()) {
  const path = file.replace(/\\/g, '/');

  if (path === 'private' || path.startsWith('private/')) {
    problems.push(`${path}: files from private/ must never be committed`);
    continue;
  }
  if (BLOCKED_EXT.test(path) && !path.startsWith(ALLOWED_IMAGE_DIR)) {
    problems.push(`${path}: scans and images are allowed only in ${ALLOWED_IMAGE_DIR}`);
    continue;
  }

  const blob = git(['show', `:${path}`]);
  if (looksBinary(blob)) continue;
  const text = blob.toString('utf8');

  for (const re of TOKEN_PATTERNS) {
    if (re.test(text)) problems.push(`${path}: contains a string that looks like a GitHub token`);
  }
  if (denylist.length) {
    const lower = text.toLowerCase();
    for (const entry of denylist) {
      // Do not echo the entry itself: it is private data.
      if (lower.includes(entry)) problems.push(`${path}: contains an entry from ${DENYLIST_PATH}`);
    }
  }
}

if (problems.length) {
  console.error('\nКоммит заблокирован проверкой личных данных (scripts/check-staged.mjs):');
  for (const p of problems) console.error('  - ' + p);
  console.error('\nУберите файлы из индекса (git restore --staged <файл>) или исправьте содержимое.\n');
  process.exit(1);
}
