// npm run gen:commands — writes .claude/commands/parse-scans.md from the shared format rules.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT } from './cli/env';
import { buildParseScansCommand, PARSE_SCANS_PATH } from './inbox/parseScansCommand';

const path = join(ROOT, PARSE_SCANS_PATH);
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, buildParseScansCommand());
console.log(`Записано: ${PARSE_SCANS_PATH}`);
