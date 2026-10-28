import { expect, test, type Page } from '@playwright/test';
import { makeJpeg } from './files';

// Stage 7 acceptance: the owner enters an OSAGO policy (fictional data here) with a scan and
// marks a couple of self-check items; reminders appear on the main screen and go away.

const S = (t: string) => t.replace(/ /g, ' ');

async function hasHorizontalScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
}

test('OSAGO with a scan: reminder before the end, renewal removes it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-10-28T12:00:00'));

  await page.goto('./');
  await expect(page.getByTestId('docs-link')).toContainText('не внесены');
  await page.getByTestId('docs-link').click();
  await page.getByRole('link', { name: 'Добавить документ' }).click();

  // A year of OSAGO: the end date follows the start date.
  await expect(page.getByLabel('Вид')).toHaveValue('osago');
  await page.getByLabel('Номер').fill('XXX 0000000000');
  await page.getByLabel('Компания').fill('Страховая «Пример»');
  await page.getByLabel('Начало').fill('2025-11-20');
  await expect(page.getByLabel('Окончание')).toHaveValue('2026-11-19');
  await expect(page.getByLabel('Напомнить за, дней')).toHaveValue('30');
  await page.getByRole('button', { name: 'Сохранить' }).click();

  const card = page.getByTestId('term-card');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('ОСАГО XXX 0000000000');
  await expect(card).toContainText(S('до 19.11.2026, осталось 22 дня'));
  await expect(card).toHaveClass(/sched-card--yellow/);

  // A scan, stored and encrypted like the others, without recognition.
  const photo = await makeJpeg(page, 'OSAGO');
  await page.getByTestId('doc-files-input').setInputFiles({ name: 'osago.jpg', mimeType: 'image/jpeg', buffer: photo });
  await expect(page.getByTestId('scan-viewer')).toBeVisible();
  expect(await hasHorizontalScroll(page)).toBe(false);

  // Main screen: the policy card, yellow.
  await page.goto('./');
  const alerts = page.getByTestId('term-alerts');
  await expect(alerts.getByTestId('term-row')).toHaveAttribute('data-state', 'soon');
  await expect(alerts).toContainText('ОСАГО XXX 0000000000');

  // Renewal: next term prefilled, the old policy stops reminding.
  await alerts.getByRole('link', { name: /ОСАГО/ }).click();
  await page.getByRole('link', { name: 'Внести новый на следующий срок' }).click();
  await expect(page.getByLabel('Начало')).toHaveValue('2026-11-20');
  await expect(page.getByLabel('Окончание')).toHaveValue('2027-11-19');
  await expect(page.getByLabel('Компания')).toHaveValue('Страховая «Пример»');
  await page.getByLabel('Номер').fill('XXX 1111111111');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByTestId('term-card')).toContainText('с 20.11.2026 до 19.11.2027');

  await page.goto('./');
  await expect(page.getByTestId('term-alerts')).toBeHidden();
  await expect(page.getByTestId('docs-link')).toContainText('ОСАГО до 19.11.2027');
  await page.goto('./#/state/docs');
  await expect(page.getByText('Заменённые новыми: 1')).toBeVisible();
  expect(errors).toEqual([]);
});

test('an expired document is red on the main screen', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-28T12:00:00'));
  await page.goto('./#/state/docs/new');
  await page.getByLabel('Вид').selectOption('first_aid');
  await page.getByLabel('Окончание').fill('2026-10-01');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Аптечка');
  await page.goto('./');
  const row = page.getByTestId('term-alerts').getByTestId('term-row');
  await expect(row).toHaveAttribute('data-state', 'expired');
  await expect(row).toContainText('закончился 01.10.2026');
});

test('self-check: "В норме", "Нужно внимание" stays on the main screen until fixed', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-28T12:00:00'));
  await page.goto('./');
  const card = page.getByTestId('self-check-card');
  await expect(card.getByTestId('due-row')).toContainText('Пора проверить: 11 пунктов');
  await card.getByTestId('due-row').getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Самопроверка');

  // Oil level: fine.
  const oil = page.getByTestId('self-check-row').filter({ hasText: 'Уровень моторного масла' });
  await oil.getByText('Как проверить').click();
  await expect(oil).toContainText('щуп');
  await oil.getByRole('button', { name: 'В норме' }).click();
  await expect(oil).toHaveAttribute('data-state', 'ok');
  await expect(oil).toContainText('в норме 28.10.2026, следующая проверка 11.11.2026');

  // Coolant: needs attention, with a note.
  const coolant = page.getByTestId('self-check-row').filter({ hasText: 'охлаждающей жидкости' });
  await coolant.getByRole('button', { name: 'Нужно внимание' }).click();
  const dialog = page.getByRole('dialog', { name: 'Нужно внимание' });
  await dialog.getByLabel('Что не так').fill('уровень у MIN');
  await dialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(coolant).toHaveAttribute('data-state', 'attention');
  expect(await hasHorizontalScroll(page)).toBe(false);

  await page.goto('./');
  const attention = page.getByTestId('attention-row');
  await expect(attention).toContainText('нужно внимание с 28.10.2026: уровень у MIN');
  await expect(page.getByTestId('due-row')).toContainText('Пора проверить: 9 пунктов');
  // names without the parenthesised hints
  await expect(page.getByTestId('due-row')).toContainText('Уровень тормозной жидкости, Жидкость ГУР, Жидкость омывателя…');

  // Fixed: "В норме" on the item page; the journal keeps both entries.
  await attention.getByRole('link').click();
  await page.getByRole('button', { name: 'В норме' }).click();
  await expect(page.getByTestId('self-check-log').locator('li')).toHaveCount(2);
  await page.goto('./');
  await expect(page.getByTestId('attention-row')).toBeHidden();
  expect(await hasHorizontalScroll(page)).toBe(false);
});
