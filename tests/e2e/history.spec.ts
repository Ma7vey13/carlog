import { expect, test, type Locator, type Page } from '@playwright/test';
import { BRAKES_FRONT_2025, type FixtureLine } from '../fixtures/manualVisits';

// Stage 2 acceptance: enter the page-4-like visit by hand, find it by "колодки", edit, delete.

const KIND_BUTTON: Record<FixtureLine['kind'], string> = { work: 'Работа', part: 'Запчасть', material: 'Материалы' };

async function hasHorizontalScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
}

async function addLine(doc: Locator, line: FixtureLine) {
  await doc.getByRole('button', { name: KIND_BUTTON[line.kind], exact: true }).click();
  const row = doc.getByTestId('line').last();
  await row.getByLabel('Название').fill(line.name);
  await row.getByLabel('Кол-во').fill(line.qty);
  await row.getByLabel('Цена, ₽').fill(line.price);
  await expect(row.getByLabel('Сумма, ₽')).toHaveValue(line.sum); // computed from qty × price
}

test('enter a visit by hand, find it, edit it and delete it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const fx = BRAKES_FRONT_2025;

  await page.goto('./#/history');
  await expect(page.getByText('История пуста')).toBeVisible();
  await page.getByRole('link', { name: 'Добавить визит' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Новый визит');

  // Saving an empty form explains what is missing.
  await page.getByRole('button', { name: 'Сохранить визит' }).click();
  await expect(page.getByTestId('form-errors')).toHaveText('Добавьте хотя бы одну строку: работу или запчасть');

  // Visit header.
  await page.getByLabel('Дата визита').fill(fx.date);
  await page.getByLabel('Пробег, км').fill(fx.odometer);
  await page.getByLabel('Сервис', { exact: true }).fill(fx.shopName);

  // Document.
  const doc = page.getByTestId('document');
  await doc.getByLabel('Тип документа').selectOption(fx.document.type);
  await doc.getByLabel('Номер').fill(fx.document.number);
  await doc.getByLabel('Дата документа').fill(fx.document.date);
  await doc.getByLabel('К заказ-наряду №').fill(fx.document.relatedNumber);
  await doc.getByLabel('от', { exact: true }).fill(fx.document.relatedDate);
  for (const line of fx.lines) await addLine(doc, line);

  // Component suggested from the name; normalized name previewed.
  const caliper = doc.getByTestId('line').nth(4);
  await expect(caliper.getByLabel('Узел')).toHaveText(/Тормоза передние/);
  await expect(caliper.getByLabel('Узел').locator('option:checked')).toHaveText('Тормоза передние');
  await expect(caliper.getByText('Сохранится как: Суппорт тормозной перед.(лев.) SFN')).toBeVisible();

  // Totals from the document match the lines.
  await expect(doc.getByTestId('doc-totals')).toContainText('23 200 ₽');
  await doc.getByText('Итоги из документа').click();
  await doc.getByLabel('Работы, ₽').fill(fx.document.totalWorks);
  await doc.getByLabel('Запчасти, ₽').fill(fx.document.totalParts);
  await doc.getByLabel('Всего, ₽').fill(fx.document.totalAll);
  await expect(doc.getByTestId('totals-mismatch')).toHaveCount(0);

  expect(await hasHorizontalScroll(page), 'editor fits the screen').toBe(false);
  await page.getByRole('button', { name: 'Сохранить визит' }).click();

  // Visit card.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Визит 12.03.2025');
  await expect(page.getByTestId('visit-total')).toHaveText('23 200 ₽');
  await expect(page.getByText('Суппорт тормозной перед.(лев.) SFN')).toBeVisible();
  await expect(page.getByText('В документе: Супорт тормозной перед.(лев.) SFN')).toBeVisible();
  await expect(page.getByText('Акт выполненных работ № 1 от 12.03.2025 к з/н № 25857 от 12.03.2025')).toBeVisible();
  await expect(page.getByTestId('card-totals-mismatch')).toHaveCount(0);

  // Survives a reload (stored in IndexedDB).
  await page.reload();
  await expect(page.getByTestId('visit-total')).toHaveText('23 200 ₽');

  // Search by "колодки" in the history.
  await page.getByRole('link', { name: 'Назад' }).click();
  await page.getByLabel('Поиск по истории').fill('колодки');
  await expect(page.getByTestId('visit-row')).toHaveCount(1);
  const matches = page.getByRole('list', { name: 'Совпадения' });
  await expect(matches).toContainText('Замена передних тормозных колодок (джип)');
  await expect(matches).toContainText('Колодки тормозные перед.(OEM) SFN');
  await page.getByLabel('Поиск по истории').fill('ступица');
  await expect(page.getByTestId('visit-row')).toHaveCount(0);
  await page.getByLabel('Очистить поиск').click();

  // Filter by component.
  await page.getByLabel('Фильтр по узлу').selectOption({ label: 'Тормоза передние' });
  await expect(page.getByTestId('visit-row')).toHaveCount(1);
  await page.getByLabel('Фильтр по узлу').selectOption({ label: 'АКПП' });
  await expect(page.getByTestId('visit-row')).toHaveCount(0);
  await page.getByLabel('Фильтр по узлу').selectOption({ label: 'Все узлы' });
  expect(await hasHorizontalScroll(page), 'history fits the screen').toBe(false);

  // Edit: change the brake pads price.
  await page.getByTestId('visit-row').click();
  await page.getByRole('link', { name: 'Изменить' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Изменить визит');
  const pads = page.getByTestId('line').nth(3);
  await pads.getByLabel('Цена, ₽').fill('3700');
  await expect(pads.getByLabel('Сумма, ₽')).toHaveValue('3700');
  await expect(page.getByTestId('totals-mismatch')).toContainText('Запчасти: в документе 18 500 ₽, по строкам 18 600 ₽');
  await page.getByRole('button', { name: 'Сохранить визит' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Визит 12.03.2025');
  await expect(page.locator('.line-item', { hasText: 'Колодки тормозные перед.(OEM) SFN' })).toContainText('3 700 ₽');

  // The card warns that the document totals no longer match the lines.
  const warning = page.getByTestId('card-totals-mismatch');
  await expect(warning).toContainText('Итоги документа не сходятся со строками');
  await expect(warning).toContainText('Запчасти: в документе 18 500 ₽, по строкам 18 600 ₽');
  await expect(warning).toContainText('Всего: в документе 23 200 ₽, по строкам 23 300 ₽');
  await expect(warning.getByRole('link', { name: 'изменить визит' })).toHaveAttribute('href', /\/edit$/);

  // Delete with confirmation.
  await page.getByRole('button', { name: 'Удалить' }).click();
  const dialog = page.getByRole('dialog', { name: 'Удалить визит?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Удалить' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('История');
  await expect(page.getByText('История пуста')).toBeVisible();

  expect(errors).toEqual([]);
});

test('component tree can be extended and renamed, and shows up in the editor', async ({ page }) => {
  await page.goto('./#/more');
  await page.getByRole('link', { name: 'Справочник узлов' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Справочник узлов');
  await expect(page.getByRole('list', { name: 'Узлы' }).getByRole('listitem')).toHaveCount(24);

  await page.getByRole('button', { name: 'Добавить узел' }).click();
  const add = page.getByRole('dialog', { name: 'Новый узел' });
  await add.getByLabel('Название').fill('Суппорты');
  await add.getByLabel('Внутри узла').selectOption({ label: 'Тормоза передние' });
  await add.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('list', { name: 'Узлы' }).getByRole('listitem')).toHaveCount(25);

  await page.getByRole('button', { name: 'Переименовать «Прочее»' }).click();
  const rename = page.getByRole('dialog', { name: 'Переименовать узел' });
  await rename.getByLabel('Название').fill('Разное');
  await rename.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByText('Разное', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Удалить «Кузов»' }).click();
  await page.getByRole('dialog', { name: 'Удалить узел?' }).getByRole('button', { name: 'Удалить' }).click();
  await expect(page.getByRole('list', { name: 'Узлы' }).getByRole('listitem')).toHaveCount(24);
  expect(await hasHorizontalScroll(page)).toBe(false);

  await page.goto('./#/history/new');
  await page.getByRole('button', { name: 'Запчасть', exact: true }).click();
  const options = await page.getByTestId('line').getByLabel('Узел').locator('option').allTextContents();
  expect(options.map((o) => o.trim())).toEqual(expect.arrayContaining(['Суппорты', 'Разное']));
  expect(options).not.toContain('Кузов');
});

test('templates, copy of the last visit and manual mileage', async ({ page }) => {
  await page.goto('./#/history/new');

  // Template fills lines with components.
  await page.getByLabel('Вставить шаблон').selectOption({ label: 'ТО двигателя' });
  const lines = page.getByTestId('line');
  await expect(lines).toHaveCount(3);
  await expect(lines.nth(0).getByLabel('Название')).toHaveValue('Замена масла и фильтра в двигателе');
  await expect(lines.nth(1).getByLabel('Узел').locator('option:checked')).toHaveText('Смазка двигателя');
  await lines.nth(0).getByLabel('Цена, ₽').fill('1000');
  await lines.nth(1).getByLabel('Кол-во').fill('5');
  await lines.nth(1).getByLabel('Цена, ₽').fill('580');
  await lines.nth(2).getByLabel('Цена, ₽').fill('450');
  await page.getByLabel('Пробег, км').fill('250000');
  await page.getByLabel('Сервис', { exact: true }).fill('Гараж');
  await page.getByRole('button', { name: 'Сохранить визит' }).click();
  await expect(page.getByTestId('visit-total')).toHaveText('4 350 ₽');

  // Copy the last visit: same lines and shop, empty odometer.
  await page.goto('./#/history/new');
  await page.getByRole('button', { name: 'Скопировать прошлый визит' }).click();
  await expect(page.getByTestId('line')).toHaveCount(3);
  await expect(page.getByLabel('Сервис', { exact: true })).toHaveValue('Гараж');
  await expect(page.getByLabel('Пробег, км')).toHaveValue('');

  // Name suggestions come from earlier lines.
  const options = await page.locator('#line-name-hints option').evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value));
  expect(options).toContain('Масло моторное');

  // Leaving with changes asks first.
  await page.getByRole('button', { name: 'Отмена' }).click();
  await page.getByRole('dialog', { name: 'Выйти без сохранения?' }).getByRole('button', { name: 'Выйти' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('История');

  // Manual mileage mark appears in the feed and can be deleted.
  await page.getByRole('button', { name: 'Отметить пробег' }).click();
  const dialog = page.getByRole('dialog', { name: 'Отметить пробег' });
  await dialog.getByLabel('Пробег, км').fill('310 500');
  await dialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByText('310 500 км')).toBeVisible();
  await page.getByRole('button', { name: 'Удалить отметку 310 500 км' }).click();
  await page.getByRole('dialog', { name: 'Удалить отметку пробега?' }).getByRole('button', { name: 'Удалить' }).click();
  await expect(page.getByText('310 500 км')).toHaveCount(0);
});
