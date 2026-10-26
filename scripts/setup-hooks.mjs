#!/usr/bin/env node
// Runs on `npm install` (prepare): points git at the repo's hooks directory.
// Silently does nothing outside a git checkout (e.g. a tarball install).
import { execFileSync } from 'node:child_process';

try {
  execFileSync('git', ['rev-parse', '--git-dir'], { stdio: 'ignore' });
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'ignore' });
} catch {
  // Not a git repository or git is unavailable: nothing to set up.
}
