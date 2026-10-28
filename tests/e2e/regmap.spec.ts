import { expect, test, type Page } from '@playwright/test';

// The regulation split by source — the service's ТО table first, the manual's extras after —
// and «Карта ТО»: what is replaced and checked at 15, 30 … 150 thousand km.

const BOTH = [
  'Название;Каждые, км;Каждые, мес;Замена / проверка;Источник',
  'Масло двигателя;15000;12;Замена;Сервис',
  'Свечи зажигания;60000;48;Замена;Сервис',
  'Масло раздаточной коробки;45000;36;Замена;Сервис',
  'Диагностика ходовой;15000;12;Проверка;Сервис',
  'Охлаждающая жидкость;45000;36;Замена;Сервис',
  'Зазор клапанов;96000;48;Проверка;Инструкция',
  'Топливная магистраль;15000;12;Проверка;Инструкция',
].join('\n');

// The manual alone, no «Источник» column: the owner says whose table it is.
const MANUAL = ['Название;Каждые, км;Каждые, мес', 'Охлаждающая жидкость;40000;24', 'Свечи зажигания;160000;', 'Топливная магистраль;15000;12'].join('\n');

async function hasHorizontalScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
}

async function paste(page: Page, text: string) {
  await page.goto('./#/regulation/import');
  await page.getByLabel('Или вставьте таблицу').fill(text);
  await page.getByRole('button', { name: 'Разобрать' }).click();
}

test('service first, the manual after; the map by mileage; a manual table leaves the service’s items be', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await paste(page, BOTH);
  await expect(page.getByTestId('import-source')).toContainText('сервис — 5, инструкция — 2');
  await expect(page.getByTestId('import-scope')).toContainText('Заменятся только пункты: сервиса и инструкции');
  await page.getByRole('button', { name: 'Применить таблицу' }).click();

  // The list: the service's group first, replacements before checks.
  const service = page.getByTestId('reg-group-service');
  await expect(service.getByRole('heading', { level: 2 })).toContainText('По графику сервиса');
  await expect(service.getByRole('list', { name: 'По графику сервиса: замена' }).locator('.sched-row__name')).toHaveText([
    'Масло двигателя',
    'Масло раздаточной коробки',
    'Охлаждающая жидкость',
    'Свечи зажигания',
  ]);
  await expect(page.getByTestId('reg-group-instruction').locator('.sched-row__name')).toHaveText(['Зазор клапанов', 'Топливная магистраль']);
  const titles = page.locator('.reg-group__title');
  await expect(titles).toHaveText([/По графику сервиса/, /Дополнительно по инструкции/]);

  // The map: plugs at 60 and 120 thousand, the transfer case at 45, 90, 135.
  await page.getByRole('tab', { name: 'Карта ТО по пробегу' }).click();
  const map = page.getByTestId('service-map');
  const plugs = map.getByRole('row', { name: /Свечи зажигания/ });
  await expect(plugs.locator('.map-cell--on')).toHaveCount(2);
  await expect(plugs.locator('td').nth(3)).toHaveText('З');
  await expect(plugs.locator('td').nth(7)).toHaveText('З');
  await expect(map.getByRole('row', { name: /Масло раздаточной/ }).locator('.map-cell--on')).toHaveCount(3);
  await expect(map.getByRole('row', { name: /Зазор клапанов/ }).locator('td').nth(3)).toHaveText('П');
  expect(await hasHorizontalScroll(page)).toBe(false);

  const at60 = page.getByTestId('map-step-4');
  await at60.locator('summary').click();
  await expect(at60).toContainText('замена: 2, проверка: 3');
  await expect(at60.getByRole('list').first()).toContainText('Свечи зажигания');
  await page.getByLabel('Только замены').check();
  await expect(map.getByRole('row', { name: /Зазор клапанов/ })).toHaveCount(0);
  await expect(page.getByTestId('map-step-4')).toContainText('замена: 2');

  // The manual alone: only the manual's items are replaced; the same work → the more frequent.
  await paste(page, MANUAL);
  await expect(page.getByTestId('import-scope')).toContainText('Без источника таблица заменит весь регламент');
  await page.getByTestId('import-source').getByLabel('Таблица').selectOption({ label: 'Инструкция к автомобилю' });
  await expect(page.getByTestId('import-scope')).toContainText('Заменятся только пункты: инструкции. Пункты сервиса останутся.');
  await expect(page.getByTestId('plan-remove')).toContainText('Зазор клапанов');
  await expect(page.getByTestId('plan-remove')).not.toContainText('Масло');
  const update = page.getByTestId('plan-update');
  await expect(update).toContainText('Охлаждающая жидкость');
  await expect(update).toContainText('более частый');
  await expect(page.getByTestId('plan-keep-other')).toContainText('Масло двигателя');
  expect(await hasHorizontalScroll(page)).toBe(false);
  await page.getByRole('button', { name: 'Применить таблицу' }).click();

  await expect(page.getByTestId('reg-group-service').locator('.sched-row__name')).toHaveText([
    'Масло двигателя',
    'Масло раздаточной коробки',
    'Охлаждающая жидкость',
    'Свечи зажигания',
    'Диагностика ходовой',
  ]);
  // coolant: 40 000 / 24 from the manual; plugs stay at the service's 60 000
  const interval = async (name: RegExp) =>
    ((await page.getByTestId('reg-group-service').getByRole('link', { name }).locator('.sched-row__due').textContent()) ?? '').replace(/[  ]/g, ' ');
  expect(await interval(/Охлаждающая жидкость/)).toContain('40 000 км / 24 мес');
  expect(await interval(/Свечи зажигания/)).toContain('60 000 км / 48 мес');
  await expect(page.getByTestId('reg-group-instruction').locator('.sched-row__name')).toHaveText(['Топливная магистраль']);

  // The item card says where it comes from; the editor can change it.
  await page.getByRole('link', { name: /Топливная магистраль/ }).click();
  await expect(page.getByTestId('item-source')).toHaveText('инструкция к автомобилю');
  expect(errors).toEqual([]);
});
