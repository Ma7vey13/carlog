import { expect, test } from '@playwright/test';

// Owner guides are built into the app ("Ещё → Справка") and links stay inside the app.

test('help: guides open from "Ещё", section links scroll, links between guides stay in the app', async ({ page }) => {
  await page.goto('./#/more');
  await page.getByRole('link', { name: 'Руководство: установка, синхронизация, распознавание, копия' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Справка');
  await page.getByRole('link', { name: /Синхронизация/ }).click();

  const guide = page.getByTestId('guide');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Синхронизация');
  await expect(guide.getByRole('heading', { name: 'Шаг 1. Создать токен GitHub' })).toBeVisible();
  await expect(guide.getByRole('table')).toContainText('vault.json');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);

  // Straight to a section, as the "Как получить новый токен" button does.
  await page.goto('./#/more/help/sync/' + encodeURIComponent('если-токен-истёк'));
  const section = guide.getByRole('heading', { name: 'Если токен истёк' });
  await expect(section).toBeFocused();
  await expect(section).toBeInViewport();

  // A link to another guide opens it inside the app.
  await guide.getByRole('link', { name: 'шаг 1 инструкции по репозиториям' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Репозитории GitHub');
  expect(page.url()).toContain('#/more/help/repos');

  // The sync panel links to the guide too.
  await page.goto('./#/more');
  await page.getByRole('link', { name: 'Инструкция по синхронизации' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Синхронизация');
});
