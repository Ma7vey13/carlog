// npm run inbox:push — validate every result.json, encrypt into carlog-data/drafts/<id>.enc,
// commit and push, then delete private/inbox/ (SPEC section 6А, step 5).

import { rmSync } from 'node:fs';
import { WrongPasswordError } from '../src/core/crypto';
import type { DraftV1 } from '../src/core/draftSchema';
import { commitAndPush, DATA_DIR, INBOX_DIR, loadConfig, syncClone } from './cli/env';
import { askPassword } from './cli/password';
import { openVault, readResults, writeDraftFiles } from './inbox/lib';

async function main() {
  const results = readResults(INBOX_DIR);
  if (!results.length) {
    console.log('Нечего отправлять: private/inbox пуста.');
    return;
  }
  const bad = results.filter((r) => !r.result?.ok);
  if (bad.length) {
    console.error(`Не отправлено ничего: ${bad.length} без правильного result.json. Запустите npm run inbox:check и исправьте.`);
    process.exit(1);
  }
  const valid = results.map((r) => ({ id: r.id, draft: (r.result as { ok: true; draft: DraftV1 }).draft }));

  const cfg = loadConfig();
  syncClone(cfg);
  const password = await askPassword('inbox:push — зашифровать и отправить черновики');
  const { key } = await openVault(DATA_DIR, password);
  const paths = await writeDraftFiles(DATA_DIR, key, valid);
  commitAndPush(cfg, paths, `drafts: ${paths.length} от Claude Code`);

  // Decrypted scans and results must not stay on disk (SPEC section 14).
  rmSync(INBOX_DIR, { recursive: true, force: true });
  console.log(`\nОтправлено черновиков: ${paths.length}. Папка private/inbox удалена.`);
  console.log('В приложении нажмите «Подтянуть» — черновики появятся во «Входящих» как «Готов к проверке».');
}

main().catch((err: unknown) => {
  console.error(err instanceof WrongPasswordError ? 'Неверный пароль.' : `Ошибка: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
