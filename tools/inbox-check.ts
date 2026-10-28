// npm run inbox:check [-- --reference] — validates private/inbox/*/result.json against the draft
// schema (no password needed). With --reference also compares with the SPEC section 11 table.

import type { DraftV1 } from '../src/core/draftSchema';
import { INBOX_DIR } from './cli/env';
import { readResults } from './inbox/lib';
import { compareWithReference, referenceTable } from './inbox/reference';

const results = readResults(INBOX_DIR);
if (!results.length) {
  console.log('Папка private/inbox пуста — сначала npm run inbox:pull.');
  process.exit(1);
}

let problems = 0;
const valid: DraftV1[] = [];
for (const { id, result } of results) {
  if (!result) {
    problems++;
    console.log(`✗ ${id}: нет result.json`);
  } else if (!result.ok) {
    problems++;
    console.log(`✗ ${id}:`);
    for (const e of result.errors) console.log(`    ${e}`);
  } else {
    valid.push(result.draft);
    const d = result.draft.document;
    console.log(`✓ ${id}: ${d.type} ${d.number ?? ''} от ${d.date ?? '?'}, строк: ${result.draft.lines.length}${result.draft.notes.length ? `, заметок: ${result.draft.notes.length}` : ''}`);
  }
}

if (process.argv.includes('--reference')) {
  console.log('\nСверка с эталоном (SPEC, раздел 11):\n');
  console.log(referenceTable(compareWithReference(valid)));
}

console.log(problems ? `\nИсправьте: ${problems}.` : '\nВсё в порядке — можно npm run inbox:push.');
process.exit(problems ? 1 : 0);
