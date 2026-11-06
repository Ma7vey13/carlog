// npm run inbox:session — /parse-scans with one password (D-101). See tools/inbox/session.ts.
// Interrupted, it deletes the decrypted scans (SPEC section 14).

import { existsSync, rmSync } from 'node:fs';
import { WrongPasswordError } from '../src/core/crypto';
import { DATA_DIR, INBOX_DIR, loadConfig } from './cli/env';
import { askPassword } from './cli/password';
import { runSession } from './inbox/session';

for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
  rmSync(INBOX_DIR, { recursive: true, force: true });
  console.log('Прервано. Расшифрованные сканы удалены (private/inbox).');
  process.exit(130);
});

runSession({
  cfg: loadConfig(),
  dataDir: DATA_DIR,
  inboxDir: INBOX_DIR,
  askPassword: () => askPassword('/parse-scans — расшифровать сканы и потом отправить черновики'),
})
  .then((outcome) => process.exit(outcome.kind === 'timeout' ? 1 : 0))
  .catch((err: unknown) => {
    console.error(err instanceof WrongPasswordError ? 'Неверный пароль.' : `Ошибка: ${err instanceof Error ? err.message : String(err)}`);
    // Results already written are kept: npm run inbox:push sends them once the problem is fixed.
    if (existsSync(INBOX_DIR)) console.error('private/inbox оставлена: отправьте её командой npm run inbox:push или удалите.');
    process.exit(1);
  });
