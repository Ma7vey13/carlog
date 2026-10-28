import { expect, test, type Page } from '@playwright/test';

// ТО or ремонт in the history (D-089): told from the regulation links, shown as tags, a stripe and a filter.

const S = (t: string | null) => (t ?? '').replace(/[  ]/g, ' ');

async function addVisit(page: Page, date: string, templates: string[], prices: Array<[number, string]>) {
  await page.goto('./#/history/new');
  for (const t of templates) await page.getByLabel('Вставить шаблон').selectOption({ label: t });
  await page.getByLabel('Дата визита').fill(date);
  for (const [i, price] of prices) await page.getByTestId('line').nth(i).getByLabel('Цена, ₽').fill(price);
  await page.getByRole('button', { name: 'Сохранить визит' }).click();
  await expect(page.getByTestId('visit-total')).toBeVisible();
}

test('ТО and ремонт are told apart in the history and on the visit card', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // An oil change is in the regulation; brake pads are not.
  await page.goto('./#/regulation/new');
  await page.getByLabel('Название').fill('Масло двигателя');
  await page.getByLabel('Каждые, км').first().fill('15000');
  await page.getByLabel('Каждые, мес').first().fill('12');
  await page.getByLabel('Ключевые слова — по варианту в строке').fill('замена масла');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Масло двигателя');

  await addVisit(page, '2025-03-12', ['ТО двигателя'], [[0, '1000']]);
  await addVisit(page, '2025-05-01', ['Тормоза передние'], [[0, '2000']]);
  await addVisit(page, '2025-07-22', ['ТО двигателя', 'Тормоза передние'], [
    [0, '1000'],
    [3, '2000'],
  ]);

  await page.goto('./#/history');
  const rows = page.getByTestId('visit-row');
  await expect(rows).toHaveCount(3);
  const tags = async () => (await rows.all()).map(async (r) => S(await r.getByTestId('purpose-tags').textContent()));
  expect(await Promise.all(await tags())).toEqual(['ТОРемонт', 'Ремонт', 'ТО']);
  await expect(rows.nth(0)).toHaveClass(/visit-row--mixed/);
  await expect(rows.nth(1)).toHaveClass(/visit-row--repair/);
  await expect(rows.nth(2)).toHaveClass(/visit-row--maintenance/);

  // The filter: a visit with both is found by either.
  const filter = page.getByRole('radiogroup', { name: 'ТО или ремонт' });
  await filter.getByRole('radio', { name: 'ТО' }).click();
  await expect(rows).toHaveCount(2);
  await expect(page.getByText('Найдено визитов: 2')).toBeVisible();
  await filter.getByRole('radio', { name: 'Ремонт' }).click();
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toContainText('01.05.2025');
  await filter.getByRole('radio', { name: 'Все визиты' }).click();
  await expect(rows).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);

  // The visit with both: what each line was and how much went on each.
  await rows.nth(0).click();
  await expect(page.getByTestId('visit-purpose')).toContainText('ТО');
  expect(S(await page.getByTestId('visit-purpose').textContent())).toMatch(/ТО — 1 000(,00)? ₽ремонт — 2 000(,00)? ₽/);
  const purposes = await page.locator('.line-item').evaluateAll((els) => els.map((e) => [e.querySelector('.line-item__name')?.firstChild?.textContent, e.getAttribute('data-purpose')]));
  expect(purposes).toEqual(
    expect.arrayContaining([
      ['Замена масла и фильтра в двигателе', 'maintenance'],
      ['Масло моторное', 'maintenance'],
      ['Замена передних тормозных колодок', 'repair'],
      ['Колодки тормозные передние', 'repair'],
    ]),
  );

  // A visit of one kind does not tag every line.
  await page.goto('./#/history');
  await rows.nth(2).click();
  await expect(page.getByTestId('visit-purpose')).toHaveText('ТО');
  await expect(page.locator('.line-item[data-purpose]')).toHaveCount(0);

  expect(errors).toEqual([]);
});
