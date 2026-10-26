import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

// Simulates a new deploy by changing the bytes of the served service worker script.
// The preview server reads dist/ from disk, so the browser sees an updated worker.
const SW_PATH = resolve('dist/sw.js');

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
