import { expect, test, type Page } from '@playwright/test';

const TABS = [
  { label: 'Состояние', title: 'Состояние авто', hash: '#/' },
  { label: 'История', title: 'История', hash: '#/history' },
  { label: 'Входящие', title: 'Входящие', hash: '#/inbox' },
  { label: 'Регламент', title: 'Регламент', hash: '#/regulation' },
  { label: 'Ещё', title: 'Ещё', hash: '#/more' },
];

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  return errors;
}

async function hasHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
}

test('navigates through all five sections without errors or horizontal scroll', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Состояние авто');

  const nav = page.getByRole('navigation', { name: 'Разделы' });
  for (const tab of TABS) {
    await nav.getByRole('link', { name: tab.label }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(tab.title);
    await expect(nav.getByRole('link', { name: tab.label })).toHaveAttribute('aria-current', 'page');
    expect(new URL(page.url()).hash || '#/').toBe(tab.hash);
    expect(await hasHorizontalScroll(page), `horizontal scroll on ${tab.label}`).toBe(false);
  }
  expect(errors).toEqual([]);
});

test('unknown address shows a not-found message with a way home', async ({ page }) => {
  await page.goto('./#/nowhere');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Страница не найдена');
  await page.getByRole('link', { name: 'На главную' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Состояние авто');
});

test('theme switch applies immediately and survives a reload', async ({ page }) => {
  await page.goto('./#/more');
  const html = page.locator('html');
  const themeColor = page.locator('meta[name="theme-color"]');

  await page.getByRole('radio', { name: 'Тёмная' }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(themeColor).toHaveAttribute('content', /^#171b21$/i);

  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('radio', { name: 'Тёмная' })).toHaveAttribute('aria-checked', 'true');

  await page.getByRole('radio', { name: 'Светлая' }).click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  // The CSS minifier may shorten #ffffff to #fff.
  await expect(themeColor).toHaveAttribute('content', /^#fff(fff)?$/i);

  await page.getByRole('radio', { name: 'Системная' }).click();
  await expect(html).not.toHaveAttribute('data-theme', /.+/);
});

test('settings show storage usage and app version', async ({ page }) => {
  await page.goto('./#/more');
  await expect(page.getByTestId('storage-usage')).toHaveText(/\d/);
  await expect(page.getByTestId('app-version')).toHaveText(/^\d+\.\d+\.\d+ \(\w+\)$/);
});

test('production build has a strict Content-Security-Policy', async ({ page }) => {
  await page.goto('./');
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("connect-src 'self' https://api.github.com");
  expect(csp).not.toContain('unsafe-inline');
  expect(csp).not.toContain('unsafe-eval');
});

test('web app manifest is installable and its icons load', async ({ page, request }) => {
  await page.goto('./');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const manifestUrl = new URL(href!, page.url()).toString();
  const manifest = await (await request.get(manifestUrl)).json();

  expect(manifest.name).toBe('Бортжурнал');
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/carlog/');
  const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);

  for (const icon of manifest.icons as { src: string }[]) {
    const res = await request.get(new URL(icon.src, manifestUrl).toString());
    expect(res.status(), icon.src).toBe(200);
    expect(res.headers()['content-type']).toContain('image/png');
  }
});

test('opens without internet after the first visit', async ({ page, context }) => {
  await page.goto('./');
  await expect(page.getByTestId('offline-ready')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => navigator.serviceWorker.ready);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Состояние авто');
  await expect(page.getByText('офлайн')).toBeVisible();

  await page.getByRole('navigation', { name: 'Разделы' }).getByRole('link', { name: 'Ещё' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ещё');

  await context.setOffline(false);
  await expect(page.getByText('офлайн')).toBeHidden();
});
