import { expect, test, type Page } from '@playwright/test';

// After stage 9, at the owner's request: "Список к ТО" to copy and print (D-093), "Что ставили" on
// the item card (D-094), the "Расходы" tab (D-095) and the month-old mileage note (D-096).

const S = (t: string | null) => (t ?? '').replace(/[  ]/g, ' ');

async function hasHorizontalScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
}

/** The clipboard text; Windows turns line breaks into CRLF. */
async function clipboard(page: Page) {
  return (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');
}

test('service list, what was put on, expenses and the mileage note', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-10-28T12:00:00'));

  await page.goto('./#/regulation/new');
  await page.getByLabel('Название').fill('Масло двигателя');
  await page.getByLabel('Каждые, км').first().fill('15000');
  await page.getByLabel('Каждые, мес').first().fill('12');
  await page.getByLabel('Ключевые слова — по варианту в строке').fill('замена масла');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Масло двигателя');

  // An oil change a year ago: due in two weeks, and the last odometer reading is that old.
  await page.goto('./#/history/new');
  await page.getByLabel('Вставить шаблон').selectOption({ label: 'ТО двигателя' });
  await page.getByLabel('Дата визита').fill('2025-11-10');
  await page.getByLabel('Пробег, км').fill('305000');
  const lines = page.getByTestId('line');
  for (const [i, price] of ['1000', '4500', '800'].entries()) await lines.nth(i).getByLabel('Цена, ₽').fill(price);
  await lines.nth(1).getByLabel('Кол-во').fill('1');
  await lines.nth(1).getByText('Подробнее').click();
  await lines.nth(1).getByLabel('Бренд').fill('Brand-X');
  await lines.nth(1).getByLabel('Артикул').fill('OIL-5W30');
  await page.getByRole('button', { name: 'Сохранить визит' }).click();
  await expect(page.getByTestId('visit-total')).toBeVisible();

  // Self-check: something for the master to look at.
  await page.goto('./#/state/self-check');
  const coolant = page.getByTestId('self-check-row').filter({ hasText: 'охлаждающей жидкости' });
  await coolant.getByRole('button', { name: 'Нужно внимание' }).click();
  const dialog = page.getByRole('dialog', { name: 'Нужно внимание' });
  await dialog.getByLabel('Что не так').fill('уровень у MIN');
  await dialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(coolant).toHaveAttribute('data-state', 'attention');

  // Main screen: the note about the old reading, and the way to the list.
  await page.goto('./');
  await expect(page.getByTestId('mileage-stale')).toContainText('больше месяца');
  await expect(page.getByTestId('service-list-link')).toContainText('2 пункта');
  await page.getByTestId('service-list-button').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Список к ТО');
  await expect(page.getByTestId('service-group')).toHaveCount(2);
  expect(await hasHorizontalScroll(page)).toBe(false);

  // Copy: a plain list, nothing else.
  await page.getByRole('button', { name: 'Скопировать' }).click();
  await expect(page.getByTestId('service-list-copied')).toBeVisible();
  expect(await clipboard(page)).toBe(
    'Заменить:\n- Масло двигателя\n\nПроверить:\n- Уровень охлаждающей жидкости в расширительном бачке — уровень у MIN',
  );
  // An unticked line is left out.
  await page.getByTestId('service-item').filter({ hasText: 'охлаждающей' }).getByRole('checkbox').uncheck();
  await page.getByRole('button', { name: 'Скопировать' }).click();
  expect(await clipboard(page)).toBe('Заменить:\n- Масло двигателя');

  // Print: the browser dialog opens; the printout is the ticked lines only.
  await page.evaluate(() => {
    (window as unknown as { printed: boolean }).printed = false;
    window.print = () => ((window as unknown as { printed: boolean }).printed = true);
  });
  await page.getByRole('button', { name: 'Распечатать' }).click();
  expect(await page.evaluate(() => (window as unknown as { printed: boolean }).printed)).toBe(true);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.service-list__print-title')).toHaveText('Список к ТО');
  await expect(page.getByTestId('service-group').filter({ hasText: 'Проверить' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Скопировать' })).toBeHidden();
  await expect(page.locator('.nav')).toBeHidden();
  await page.emulateMedia({ media: 'screen' });

  // The item card: what was put on last time.
  await page.getByTestId('service-item').filter({ hasText: 'Масло двигателя' }).getByRole('link').click();
  const installed = page.getByTestId('installed');
  await expect(installed).toContainText('10.11.2025');
  await expect(installed.getByTestId('installed-part').first()).toContainText('Brand-X · арт. OIL-5W30');
  expect(S(await installed.textContent())).toContain('Работа: 1 000 ₽');

  // A fresh reading hides the note.
  await page.goto('./');
  await page.getByPlaceholder('Обновить пробег, км').fill('312000');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByTestId('mileage-basis')).toHaveText('Отмечен сегодня');
  await expect(page.getByTestId('mileage-stale')).toBeHidden();

  // Expenses: the year with spending is shown; ТО and the cost of a km.
  await page.getByRole('link', { name: 'Расходы' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Расходы');
  await expect(page.getByLabel('Период')).toHaveValue('2025');
  expect(S(await page.getByTestId('expenses-total').textContent())).toContain('6 300 ₽');
  expect(S(await page.getByTestId('expenses-maintenance').textContent())).toContain('6 300 ₽ · 100 %');
  await expect(page.getByTestId('expenses-buckets').locator('li')).toHaveCount(12);
  await page.getByLabel('Период').selectOption('all');
  // 6 300 ₽ over 7 000 km
  expect(S(await page.getByTestId('expenses-per-km').textContent())).toContain('Километр обошёлся в 0,90 ₽');
  await expect(page.getByTestId('expenses-top').locator('li')).toHaveCount(1);
  expect(await hasHorizontalScroll(page)).toBe(false);

  expect(errors).toEqual([]);
});
