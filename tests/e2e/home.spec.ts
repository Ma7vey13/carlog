import { expect, test } from '@playwright/test';

// The main screen (D-098): four tiles under the mileage, sync at the bottom, and the owner's own
// order of the blocks, kept on the device.

test('tiles, and the blocks reordered with the arrows', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');

  const tiles = page.getByRole('navigation', { name: 'Главное' });
  await expect(tiles.getByRole('link')).toHaveCount(4);
  await expect(tiles.getByTestId('service-list-link')).toContainText('Список к ТО');
  await expect(tiles.getByTestId('self-check-link')).toContainText('11 пора');
  // 2 × 2 on any screen
  const boxes = await tiles.getByRole('link').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [Math.round(r.top), Math.round(r.left)]));
  expect(boxes[0]![0]).toBe(boxes[1]![0]);
  expect(boxes[2]![0]).toBeGreaterThan(boxes[0]![0]);
  expect(boxes[2]![1]).toBe(boxes[0]![1]);

  // Sync is the last block; the tiles come right after the mileage.
  const order = () => page.locator('.stack > *').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid') ?? e.getAttribute('aria-label') ?? e.className));
  await expect(page.getByTestId('sync-line')).toBeVisible();
  let blocks = await order();
  expect(blocks[blocks.indexOf('sync-line') + 1]).toBe('home-edit');
  expect(blocks.indexOf('tiles')).toBe(blocks.indexOf('mileage-card') + 1);

  // Move the tiles one down (below "Пора заняться" / the empty regulation) and keep it after a reload.
  await page.getByTestId('home-edit').click();
  const items = page.getByTestId('order-item');
  await expect(items).toHaveCount(10);
  await expect(page.getByRole('button', { name: 'Выше: Пробег' })).toBeDisabled();
  await page.getByRole('button', { name: /^Ниже: Плитки/ }).click();
  await expect(items.nth(2)).toHaveAttribute('data-block', 'tiles');
  await page.getByRole('button', { name: 'Готово' }).click();
  await page.reload();
  await expect(page.getByTestId('tiles')).toBeVisible();
  await expect(page.getByTestId('sync-line')).toBeVisible();
  blocks = await order();
  expect(blocks.indexOf('tiles')).toBe(blocks.indexOf('mileage-card') + 2);

  // Back to the default order.
  await page.getByTestId('home-edit').click();
  await page.getByRole('button', { name: 'Как было сначала' }).click();
  await expect(items.nth(1)).toHaveAttribute('data-block', 'tiles');
  await page.getByRole('button', { name: 'Готово' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  expect(errors).toEqual([]);
});
