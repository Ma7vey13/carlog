// Asking for the data password (SPEC section 14: interactively, never via arguments, files or logs).
// - In a terminal: hidden input.
// - Without a terminal (Claude Code runs the command): a one-time page on 127.0.0.1 opens in the
//   browser; the owner types the password there. It goes straight into this process's memory.

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';

const PAGE_TIMEOUT_MS = 5 * 60 * 1000;

export async function askPassword(purpose: string): Promise<string> {
  if (process.stdin.isTTY) return askInTerminal(`Пароль данных (${purpose}): `);
  return askInBrowser(purpose);
}

function askInTerminal(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const done = (err?: Error) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
      process.stdout.write('\n');
      if (err) reject(err);
      else resolve(value);
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') return done();
        if (ch === '\u0003') return done(new Error('Отменено'));
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

const PAGE = (purpose: string, path: string) => `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; form-action 'self'">
<title>Бортжурнал — пароль данных</title>
<style>
body{font:16px system-ui,sans-serif;max-width:420px;margin:12vh auto;padding:0 16px;color:#15181d;background:#f4f5f7}
form{display:grid;gap:12px;background:#fff;border:1px solid #dde1e7;border-radius:12px;padding:20px}
input{font:inherit;padding:10px;border:1px solid #dde1e7;border-radius:8px}
button{font:inherit;font-weight:600;padding:10px;border:0;border-radius:8px;background:#1d5fb8;color:#fff}
p{margin:0;color:#5b6471;font-size:14px}
</style></head><body>
<form method="post" action="${path}" autocomplete="off">
<strong>Пароль данных Бортжурнала</strong>
<p>Нужен для команды: ${purpose}. Пароль уйдёт только в программу на этом компьютере и нигде не сохранится.</p>
<input type="password" name="password" autofocus required autocomplete="current-password" aria-label="Пароль">
<button type="submit">Продолжить</button>
</form></body></html>`;

const DONE_PAGE = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Готово</title></head>
<body style="font:16px system-ui,sans-serif;max-width:420px;margin:12vh auto;padding:0 16px">
<p>Пароль получен. Эту вкладку можно закрыть и вернуться в Claude Code.</p></body></html>`;

function openBrowser(url: string) {
  const cmd = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '""', url] : [url];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true, windowsVerbatimArguments: process.platform === 'win32' }).unref();
  } catch {
    // The URL is printed anyway.
  }
}

/** Exported for tests: `open` receives the one-time URL (default: the system browser). */
export function askInBrowser(purpose: string, open: (url: string) => void = openBrowser): Promise<string> {
  const token = randomBytes(16).toString('hex');
  const path = `/${token}`;
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Referrer-Policy', 'no-referrer');
      if (req.url !== path) {
        res.writeHead(404).end();
        return;
      }
      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(PAGE(purpose, path));
        return;
      }
      if (req.method === 'POST') {
        let body = '';
        req.setEncoding('utf8');
        req.on('data', (c: string) => {
          body += c;
          if (body.length > 10_000) req.destroy();
        });
        req.on('end', () => {
          const password = new URLSearchParams(body).get('password') ?? '';
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(DONE_PAGE);
          clearTimeout(timer);
          server.close();
          resolve(password);
        });
        return;
      }
      res.writeHead(405).end();
    });
    const timer = setTimeout(() => {
      server.close();
      reject(new Error('Пароль не введён за 5 минут'));
    }, PAGE_TIMEOUT_MS);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      const url = `http://127.0.0.1:${port}${path}`;
      console.log(`\nВведите пароль данных на открывшейся странице браузера (если не открылась — откройте вручную):\n  ${url}\n`);
      open(url);
    });
  });
}
