import { expect, test, type Page } from '@playwright/test';
import { PAGE1_WORK_ORDER } from '../fixtures/drafts';
import { jsonFile } from './files';

// Stage 6 acceptance: the owner adds "Масло двигателя" 10 000 км / 12 мес and sees the due date
// counted from the visit of 30.10.2025; quick mileage, statuses, "Отметить, когда делалось".

const S = (t: string) => t.replace(/ /g, ' ');

async function hasHorizontalScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
}

async function addItem(page: Page, name: string, km: string, months: string, keywords: string) {
  await page.goto('./#/regulation/new');
  await page.getByLabel('Название').fill(name);
  await page.getByLabel('Каждые, км').first().fill(km);
  await page.getByLabel('Каждые, мес').first().fill(months);
  await page.getByLabel('Ключевые слова — по варианту в строке').fill(keywords);
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
}

test('oil 10 000 km / 12 months is due from the visit of 30.10.2025', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-10-28T12:00:00'));

  // Empty start.
  await page.goto('./');
  await expect(page.getByTestId('current-km')).toHaveText('не отмечен');
  await expect(page.getByText('Регламент пуст')).toBeVisible();

  // The visit of 30.10.2025 (page 1), saved before the regulation existed.
  await page.goto('./#/inbox');
  await page.getByTestId('json-input').setInputFiles(jsonFile('page1.json', PAGE1_WORK_ORDER));
  await page.getByRole('button', { name: 'Добавить «Масло моторное» — запчасть клиента' }).click();
  await page.getByTestId('save-review').click();
  await expect(page.getByTestId('visit-total')).toBeVisible();

  // Add the item; the editor previews the matching history lines.
  await page.goto('./#/regulation/new');
  await page.getByLabel('Название').fill('Масло двигателя');
  await expect(page.getByTestId('keyword-preview')).toContainText('Подходит 1 строка');
  await page.getByLabel('Ключевые слова — по варианту в строке').fill('замена масла двигатель\nмасло моторное');
  await expect(page.getByTestId('keyword-preview')).toContainText('Подходит 2 строки');
  await page.getByLabel('Каждые, км').first().fill('10000');
  await page.getByLabel('Каждые, мес').first().fill('12');
  await page.getByRole('button', { name: 'Сохранить' }).click();

  // The card offers to link the history lines; after that the due date counts from 30.10.2025.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Масло двигателя');
  await expect(page.getByTestId('item-status')).toContainText('Нет данных');
  const offer = page.getByTestId('link-suggestions');
  await expect(offer).toContainText('Найдено 2 строки в истории');
  await offer.getByRole('button', { name: 'Привязать' }).click();
  await expect(offer).toBeHidden();
  await expect(page.getByTestId('due-at')).toHaveText(S('313 700 км / 30.10.2026'));
  await expect(page.getByTestId('item-status')).toContainText(S('через 10 000 км или до 30.10.2026'));
  await expect(page.getByTestId('item-status')).toContainText('Скоро'); // 2 days left
  await expect(page.getByTestId('executions')).toContainText(S('30.10.2025, 303 700 км'));

  // Main screen: the last reading as it is (no forecast), the item among the urgent ones.
  await page.goto('./');
  await expect(page.getByTestId('current-km')).toHaveText(S('303 700 км'));
  await expect(page.getByTestId('mileage-basis')).toHaveText('Отмечен 30.10.2025');
  const row = page.getByTestId('sched-row').filter({ hasText: 'Масло двигателя' });
  await expect(row).toHaveAttribute('data-status', 'yellow');

  // Quick mileage update makes it overdue by km.
  await page.getByLabel('Обновить пробег, км').fill('314 000');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByTestId('current-km')).toHaveText(S('314 000 км'));
  await expect(page.getByTestId('mileage-basis')).toHaveText('Отмечен сегодня');
  await expect(row).toHaveAttribute('data-status', 'red');
  await expect(row).toContainText(S('просрочено на 300 км'));

  // An item with no history is gray until marked.
  await addItem(page, 'Ремень генератора', '60000', '48', 'ремень генератора');
  await page.goto('./');
  const gray = page.getByTestId('gray-items');
  await gray.getByText('Нет данных: 1').click();
  await gray.getByRole('button', { name: 'Отметить' }).click();
  const dialog = page.getByRole('dialog', { name: 'Отметить, когда делалось' });
  await dialog.getByLabel('Дата').fill('2024-05-01');
  await dialog.getByLabel('Примерно (дату или пробег помню не точно)').check();
  await dialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(gray).toBeHidden();
  await page.getByTestId('green-items').getByText('В порядке: 1').click();
  await expect(page.getByTestId('green-items')).toContainText('до 01.05.2028');

  expect(await hasHorizontalScroll(page)).toBe(false);
  await page.goto('./#/state/item/' + (await itemId(page, 'Ремень генератора')));
  await expect(page.getByTestId('executions')).toContainText('≈ 01.05.2024');
  await expect(page.getByTestId('executions')).toContainText('Отмечено вручную');
  expect(await hasHorizontalScroll(page)).toBe(false);
  expect(errors).toEqual([]);
});

test('severe conditions switch the intervals', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-01-10T12:00:00'));
  await page.goto('./#/inbox');
  await page.getByTestId('json-input').setInputFiles(jsonFile('page1.json', PAGE1_WORK_ORDER));
  await page.getByRole('button', { name: 'Добавить «Масло моторное» — запчасть клиента' }).click();
  await page.getByTestId('save-review').click();
  await expect(page.getByTestId('visit-total')).toBeVisible();

  await page.goto('./#/regulation/new');
  await page.getByLabel('Название').fill('Масло двигателя');
  await page.getByLabel('Каждые, км').first().fill('10000');
  await page.getByLabel('Каждые, мес').first().fill('12');
  await page.getByText('Тяжёлые условия', { exact: true }).click();
  await page.getByLabel('Каждые, км').nth(1).fill('7500');
  await page.getByLabel('Каждые, мес').nth(1).fill('6');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await page.getByTestId('link-suggestions').getByRole('button', { name: 'Привязать' }).click();
  await expect(page.getByTestId('due-at')).toHaveText(S('313 700 км / 30.10.2026'));

  await page.goto('./#/more/schedule');
  await page.getByLabel('Тяжёлые условия (пробки, короткие поездки, пыль, буксировка)').check();
  await page.goto('./#/regulation');
  await page.getByRole('link', { name: /Масло двигателя/ }).click();
  await expect(page.getByTestId('due-at')).toHaveText(S('311 200 км / 30.04.2026'));
  await expect(page.getByTestId('item-status')).toContainText('по тяжёлым условиям');
});

async function itemId(page: Page, name: string): Promise<string> {
  await page.goto('./#/regulation');
  const href = await page.getByRole('link', { name: new RegExp(name) }).getAttribute('href');
  return href!.split('/').pop()!;
}
