import { expect, test, type Page } from '@playwright/test';
import { PAGE1_WORK_ORDER, PAGE5_ACT } from '../fixtures/drafts';
import { jsonFile } from './files';

// Stage 9: the owner uploads a regulation table at any time; a wrong one can be replaced or undone,
// and the history follows the table.

const RIGHT = [
  'Наименование\tПробег, км\tСрок, мес\tКлючевые слова',
  'Масло двигателя\t10 000\t12\tзамена масла двигатель | масло мот',
  'Свечи зажигания\t60 000\t48\tсвечи зажигания',
  'Антифриз\t40 000\t24\tантифриз',
].join('\n');
const WRONG = ['Наименование;Пробег, км;Срок, мес', 'Масло двигателя;5000;6', 'Ремень ГРМ;90000;72'].join('\n');

async function hasHorizontalScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
}

async function importVisit(page: Page, name: string, draft: unknown, fixOil = false) {
  await page.goto('./#/inbox');
  await page.getByTestId('json-input').setInputFiles(jsonFile(name, draft));
  if (fixOil) await page.getByRole('button', { name: 'Добавить «Масло моторное» — запчасть клиента' }).click();
  await page.getByTestId('save-review').click();
  await expect(page.getByTestId('visit-total')).toBeVisible();
}

async function expectRegulation(page: Page, names: string[]) {
  await page.goto('./#/regulation');
  await expect(page.getByTestId('regulation-list').locator('.sched-row__name')).toHaveText(names);
}

test('upload a table, replace it with a wrong one, undo; the history follows', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-10-28T12:00:00'));
  await importVisit(page, 'page5.json', PAGE5_ACT);
  await importVisit(page, 'page1.json', PAGE1_WORK_ORDER, true);

  // Paste cells copied from Excel.
  await page.goto('./#/regulation');
  await page.getByRole('link', { name: 'Загрузить таблицу' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Загрузить регламент');
  await page.getByLabel('Или вставьте таблицу').fill(RIGHT);
  await page.getByRole('button', { name: 'Разобрать' }).click();
  await expect(page.getByTestId('import-summary')).toContainText('В таблице 3 пункта: добавится 3, изменится 0, уберётся 0');
  await expect(page.getByTestId('import-summary')).toContainText('К истории привяжется 5 строк');
  await expect(page.getByTestId('plan-create')).toContainText('Свечи зажигания');
  expect(await hasHorizontalScroll(page)).toBe(false);
  await page.getByRole('button', { name: 'Применить таблицу' }).click();
  await expect(page.getByTestId('last-import')).toContainText('добавлено 3');
  await expectRegulation(page, ['Антифриз', 'Масло двигателя', 'Свечи зажигания']);

  // The main screen follows: plugs and coolant are overdue (06.10.2021 + 48 / 24 months).
  await page.goto('./');
  const urgent = page.getByTestId('sched-row');
  await expect(urgent.filter({ hasText: 'Свечи зажигания' })).toHaveAttribute('data-status', 'red');

  // The wrong table as a CSV file: plugs and coolant would go away.
  await page.goto('./#/regulation/import');
  await page.getByTestId('table-file-input').setInputFiles({ name: 'не та таблица.csv', mimeType: 'text/csv', buffer: Buffer.from(WRONG) });
  const remove = page.getByTestId('plan-remove');
  await expect(remove).toContainText('Свечи зажигания');
  await expect(remove).toContainText('Антифриз');
  await expect(page.getByTestId('plan-update')).toContainText('интервал');
  await page.getByRole('button', { name: 'Применить таблицу' }).click();
  await expectRegulation(page, ['Масло двигателя', 'Ремень ГРМ']);

  // Undo: the right table is back, with its history.
  await page.getByTestId('last-import').getByRole('button', { name: 'Отменить эту загрузку' }).click();
  await page.getByRole('dialog', { name: 'Отменить загрузку таблицы?' }).getByRole('button', { name: 'Отменить загрузку' }).click();
  await expect(page.getByTestId('regulation-list').locator('.sched-row__name')).toHaveText(['Антифриз', 'Масло двигателя', 'Свечи зажигания']);
  await page.getByRole('link', { name: /Свечи зажигания/ }).click();
  await expect(page.getByTestId('executions')).toContainText('06.10.2021');
  expect(errors).toEqual([]);
});

test('a service-book grid, a column set by hand, the template', async ({ page }) => {
  await page.goto('./#/regulation/import');
  const grid = [
    'Операция\t15 000\t30 000\t45 000\t60 000',
    'месяцы\t12\t24\t36\t48',
    'Моторное масло и фильтр\tЗ\tЗ\tЗ\tЗ',
    'Ремень привода агрегатов\tП\tП\tП\tЗ',
  ].join('\n');
  await page.getByLabel('Или вставьте таблицу').fill(grid);
  await page.getByRole('button', { name: 'Разобрать' }).click();
  await expect(page.getByTestId('import-layout')).toContainText('Сетка сервисной книжки');
  await expect(page.getByTestId('import-summary')).toContainText('В таблице 3 пункта');
  await expect(page.getByTestId('plan-create')).toContainText('Ремень привода агрегатов — замена');

  // A header the app does not know: the owner says what the column is.
  await page.getByLabel('Или вставьте таблицу').fill('Работа;Через сколько\nМасло двигателя;10000\nАнтифриз;40000');
  await page.getByRole('button', { name: 'Разобрать' }).click();
  const create = page.getByTestId('plan-create');
  await expect(create).toContainText('Масло двигателя — без интервала');
  await page.getByTestId('import-layout').locator('select').nth(1).selectOption('km');
  await expect(create).toContainText(/Масло двигателя — 10.000.км/);

  // The prompt for a photo and the template.
  await page.getByText('Таблица на фото или в PDF — распознать через чат-ИИ').click();
  await expect(page.getByRole('button', { name: 'Скопировать промпт' })).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Скачать шаблон таблицы (CSV)' }).click()]);
  expect(download.suggestedFilename()).toBe('regulation-template.csv');
  expect(await hasHorizontalScroll(page)).toBe(false);
});
