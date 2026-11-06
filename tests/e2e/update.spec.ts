import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

// Simulates a new deploy by changing the bytes of the served service worker script.
// The preview server reads dist/ from disk, so the browser sees an updated worker.
const SW_PATH = resolve('dist/sw.js');

// The tests change the same dist/sw.js: one at a time.
test.describe.configure({ mode: 'serial' });

test('shows "new version" prompt and reloads into the update on tap', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-360', 'one run is enough: it changes shared dist/sw.js');

  await page.goto('./');
  await expect(page.getByTestId('offline-ready')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Понятно' }).click();

  const original = readFileSync(SW_PATH, 'utf8');
  try {
    writeFileSync(SW_PATH, `${original}\n// e2e update ${Date.now()}\n`);
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
    });
    await expect(page.getByTestId('update-prompt')).toBeVisible({ timeout: 15_000 });

    await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Обновить' }).click()]);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Состояние авто');
    await expect(page.getByTestId('update-prompt')).toBeHidden();
  } finally {
    writeFileSync(SW_PATH, original);
  }
});

test('checks for a new version on "Проверить обновления" and on coming back to the app', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-360', 'one run is enough: it changes shared dist/sw.js');

  await page.goto('./#/more');
  await expect(page.getByTestId('offline-ready')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Понятно' }).click();

  // Nothing new yet.
  await page.getByRole('button', { name: 'Проверить обновления' }).click();
  await expect(page.getByTestId('update-check')).toHaveText('У вас последняя версия.');

  const original = readFileSync(SW_PATH, 'utf8');
  try {
    // A new deploy: the button finds it.
    writeFileSync(SW_PATH, `${original}\n// e2e update ${Date.now()}\n`);
    await page.getByRole('button', { name: 'Проверить обновления' }).click();
    await expect(page.getByTestId('update-check')).toHaveText('Есть новая версия — нажмите «Обновить» внизу экрана.', { timeout: 20_000 });
    await expect(page.getByTestId('update-prompt')).toBeVisible();

    // "Позже", then back to the app: the prompt comes back.
    await page.getByRole('button', { name: 'Позже' }).click();
    await expect(page.getByTestId('update-prompt')).toBeHidden();
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.getByTestId('update-prompt')).toBeVisible({ timeout: 15_000 });
  } finally {
    writeFileSync(SW_PATH, original);
  }
});

test('coming back to the app finds a deploy made while it was in the background', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-360', 'one run is enough: it changes shared dist/sw.js');

  await page.goto('./');
  await expect(page.getByTestId('offline-ready')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Понятно' }).click();

  const original = readFileSync(SW_PATH, 'utf8');
  try {
    writeFileSync(SW_PATH, `${original}\n// e2e update ${Date.now()}\n`);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.getByTestId('update-prompt')).toBeVisible({ timeout: 15_000 });
  } finally {
    writeFileSync(SW_PATH, original);
  }
});
