// npm run inbox:pull — clone/update carlog-data, ask for the password, decrypt the scans of drafts
// waiting for recognition into private/inbox/ (SPEC section 6А, step 3).

import { WrongPasswordError } from '../src/core/crypto';
import { DATA_DIR, INBOX_DIR, loadConfig, syncClone } from './cli/env';
import { askPassword } from './cli/password';
import { exportInbox, openVault, readSnapshot } from './inbox/lib';

async function main() {
  const cfg = loadConfig();
  syncClone(cfg);
  const password = await askPassword('inbox:pull — расшифровать сканы');
  const { key } = await openVault(DATA_DIR, password);
  const snapshot = await readSnapshot(DATA_DIR, key);
  if (!snapshot) {
    console.log('В carlog-data ещё нет данных. В приложении нажмите «Отправить».');
    return;
  }
  const drafts = await exportInbox(DATA_DIR, INBOX_DIR, key, snapshot);
  if (!drafts.length) {
    console.log('Черновиков, ждущих распознавания, нет. В приложении: «Входящие» → добавить скан → «Ещё» → «Отправить».');
    return;
  }
  console.log(`\nГотово к распознаванию: ${drafts.length}`);
  for (const d of drafts) console.log(`  private/inbox/${d.id}/  — страниц: ${d.pages}`);
  console.log('\nДальше: для каждого запишите result.json (формат carlog.draft.v1), затем npm run inbox:check и npm run inbox:push.');
}

main().catch((err: unknown) => {
  console.error(err instanceof WrongPasswordError ? 'Неверный пароль.' : `Ошибка: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
