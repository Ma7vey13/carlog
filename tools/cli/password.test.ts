import { describe, expect, it, vi } from 'vitest';
import { askInBrowser } from './password';

describe('password page on 127.0.0.1', () => {
  it('serves a one-time form and hands the typed password to the process', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    let pageUrl = '';
    const password = askInBrowser('test', (url) => {
      pageUrl = url;
      void (async () => {
        expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{32}$/);
        const page = await fetch(url);
        expect(page.headers.get('cache-control')).toBe('no-store');
        expect(await page.text()).toContain('type="password"');
        expect((await fetch(new URL('/wrong-path', url))).status).toBe(404);
        await fetch(url, { method: 'POST', body: new URLSearchParams({ password: 'секрет с пробелами & знаками=' }) });
      })();
    });
    await expect(password).resolves.toBe('секрет с пробелами & знаками=');
    // The server is closed afterwards.
    await expect(fetch(pageUrl)).rejects.toThrow();
    // The password is never printed.
    expect(log.mock.calls.flat().join(' ')).not.toContain('секрет');
    log.mockRestore();
  });
});
