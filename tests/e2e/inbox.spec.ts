import { expect, test, type Page } from '@playwright/test';
import { PAGE1_WORK_ORDER, PAGE2_ACT, PAGE5_ACT, PAGE6_INVOICE } from '../fixtures/drafts';
import { jsonFile, makeJpeg, makePdf } from './files';

// Stage 3: scans, drafts, method Б (chat AI), review screen with the checks of SPEC section 7.

const NBSP = ' ';
const rub = (s: string) => s.replace(/ /g, NBSP) + `${NBSP}₽`;

async function importJson(page: Page, name: string, value: unknown) {
  await page.goto('./#/inbox');
  await page.getByTestId('json-input').setInputFiles(jsonFile(name, value));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Проверка документа');
}

async function saveReview(page: Page) {
  const save = page.getByTestId('save-review');
  await expect(save).toHaveText('Сохранить визит');
  await save.click();
  await expect(page.getByTestId('visit-total')).toBeVisible();
}

test('method Б: photo → prompt → chat answer → review → visit (stage 3 acceptance flow)', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('./#/inbox');
  await expect(page.getByText('Входящих нет')).toBeVisible();
  const photo = await makeJpeg(page, 'АКТ №1 к з/н 26548');
  await page.getByTestId('files-input').setInputFiles({ name: 'page2.jpg', mimeType: 'image/jpeg', buffer: photo });

  // Draft waiting for recognition, with the scan and a badge on the tab.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Черновик');
  await expect(page.getByTestId('scan-viewer').locator('img')).toBeVisible();
  await expect(page.getByTestId('inbox-badge')).toHaveText('1');

  // 1. Copy the prompt.
  await page.getByRole('button', { name: 'Скопировать промпт' }).click();
  await expect(page.getByText('Промпт скопирован.')).toBeVisible();
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain('carlog.draft.v1');
  expect(prompt).toContain('Ответь ОДНИМ блоком ```json');

  // 3. A wrong answer is explained line by line.
  const broken = structuredClone(PAGE2_ACT) as unknown as { lines: Array<Record<string, unknown>> };
  delete broken.lines[3]!.sum;
  await page.getByLabel('Вставить результат').fill('```json\n' + JSON.stringify(broken) + '\n```');
  await page.getByRole('button', { name: 'Проверить и продолжить' }).click();
  await expect(page.getByTestId('draft-errors')).toContainText('Строка 4: нет суммы');

  // A good answer, with chat chatter around the JSON block.
  const answer = `Конечно! Вот распознанный документ:\n\n\`\`\`json\n${JSON.stringify(PAGE2_ACT, null, 2)}\n\`\`\`\n\nЕсли нужно что-то поправить — скажите.`;
  await page.getByLabel('Вставить результат').fill(answer);
  await page.getByRole('button', { name: 'Проверить и продолжить' }).click();

  // Review screen: no history yet → nothing to flag.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Проверка документа');
  await expect(page.getByTestId('checks-ok')).toBeVisible();
  const lines = page.getByTestId('line');
  await expect(lines).toHaveCount(6);
  await expect(lines.nth(1).getByLabel('Название', { exact: true })).toHaveValue('Диски тормозные перед.(OEM). SFN');
  await expect(lines.nth(1).getByLabel('Узел').locator('option:checked')).toHaveText('Тормоза передние');

  // The owner corrects a binding and asks to remember it.
  const consumables = lines.nth(5);
  await consumables.getByLabel('Узел').selectOption({ label: 'Тормоза передние' });
  await consumables.getByLabel('Запомнить для похожих строк').check();

  await saveReview(page);
  await expect(page.getByTestId('visit-total')).toHaveText(rub('27 300'));
  await expect(page.getByText('Акт выполненных работ № 1 от 22.07.2025 к з/н № 26548 от 22.07.2025')).toBeVisible();
  await page.getByText('Скан (1 стр.)').click();
  await expect(page.getByTestId('scan-viewer').locator('img')).toBeVisible();

  // Inbox is empty again; the draft is in the archive.
  await expect(page.getByTestId('inbox-badge')).toHaveCount(0);
  await page.goto('./#/inbox');
  await page.getByText('Архив (1)').click();
  await expect(page.getByRole('list', { name: 'Архив' })).toContainText('Принят');

  // The learned rule applies to the next document.
  await importJson(page, 'page5.json', PAGE5_ACT);
  const next = page.getByTestId('line').filter({ has: page.locator('input[value="Расходные материалы"]') });
  await expect(next.getByLabel('Узел').locator('option:checked')).toHaveText('Тормоза передние');

  expect(errors).toEqual([]);
});

test('page 1: work without engine oil → add it as a customer part', async ({ page }) => {
  await importJson(page, 'page1.json', PAGE1_WORK_ORDER);
  const check = page.getByTestId('check').filter({ hasText: 'среди запчастей нет: масло в двигателе' });
  await expect(check).toBeVisible();
  await expect(page.getByTestId('save-review')).toHaveText('Подтвердите замечания: 1');
  await expect(page.getByTestId('save-review')).toBeDisabled();

  await check.getByRole('button', { name: 'Добавить «Масло моторное» — запчасть клиента' }).click();
  await expect(page.getByTestId('checks-ok')).toBeVisible();
  const oil = page.getByTestId('line').last();
  await expect(oil.getByLabel('Название', { exact: true })).toHaveValue('Масло моторное');
  await expect(oil.getByLabel('Запчасть клиента (принёс сам)')).toBeChecked();

  await saveReview(page);
  await expect(page.getByTestId('visit-total')).toHaveText(rub('93 100'));
  await expect(page.locator('.line-item', { hasText: 'Масло моторное' })).toContainText('запчасть клиента');
});

test('work order, then its act: "заменить строки" keeps one total', async ({ page }) => {
  const order = structuredClone(PAGE2_ACT);
  order.document = { ...order.document, type: 'work_order', number: '26548', relatedOrder: null };
  await importJson(page, 'order.json', order);
  await saveReview(page);

  await importJson(page, 'act.json', PAGE2_ACT);
  const dup = page.getByTestId('check').filter({ hasText: 'В истории есть документ к тому же заказ-наряду' });
  await expect(dup).toBeVisible();
  await dup.getByText('Заменить строки в визите:').click();
  await expect(page.getByTestId('decision-note')).toContainText('Строки заменят документ в визите от 22.07.2025');
  await saveReview(page);

  await expect(page.getByTestId('visit-total')).toHaveText(rub('27 300'));
  await expect(page.getByTestId('superseded-document')).toContainText('Заказ-наряд № 26548');
  await page.goto('./#/history');
  await expect(page.getByTestId('visit-row')).toHaveCount(1);
});

test('page 6: invoice without mileage is attached to the visit of work order 19963', async ({ page }) => {
  await importJson(page, 'page5.json', PAGE5_ACT);
  await saveReview(page);

  await importJson(page, 'page6.json', PAGE6_INVOICE);
  const check = page.getByTestId('check').filter({ hasText: 'В документе нет пробега' });
  await check.getByRole('button', { name: /Прикрепить к: Визит 06\.10\.2021, 250.000.км — акт к з\/н № 19963/ }).click();
  await expect(page.getByTestId('decision-note')).toContainText('Документ будет добавлен к визиту от 06.10.2021');
  await saveReview(page);

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Визит 06.10.2021');
  await expect(page.getByText('Товарная накладная № 20052 от 30.09.2021')).toBeVisible();
  await expect(page.getByTestId('visit-total')).toHaveText(rub('273 980'));
});

test('PDF with two pages: paging and rotation that survives a reload', async ({ page }) => {
  await page.goto('./#/inbox');
  await page.getByTestId('files-input').setInputFiles({ name: 'scan.pdf', mimeType: 'application/pdf', buffer: makePdf(['Page one', 'Page two']) });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Черновик', { timeout: 20_000 });

  const viewer = page.getByTestId('scan-viewer');
  await expect(viewer.getByText('1 / 2')).toBeVisible();
  await viewer.getByRole('button', { name: 'Следующая страница' }).click();
  await expect(viewer.getByText('2 / 2')).toBeVisible();
  await viewer.getByRole('button', { name: 'Повернуть по часовой' }).click();
  await expect(viewer.locator('img')).toHaveAttribute('data-rotation', '90');

  await page.reload();
  await viewer.getByRole('button', { name: 'Следующая страница' }).click();
  await expect(viewer.locator('img')).toHaveAttribute('data-rotation', '90');
  // Landscape after rotating a portrait page.
  await expect
    .poll(() => viewer.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > img.naturalHeight))
    .toBe(true);

  await page.goto('./#/inbox');
  await expect(page.getByTestId('draft-row')).toContainText('2 стр.');

  // A PDF of several documents is split into one draft per page.
  await page.getByTestId('draft-row').click();
  await page.getByRole('button', { name: 'Это разные документы — разделить по страницам' }).click();
  await page.getByRole('dialog', { name: 'Разделить по страницам?' }).getByRole('button', { name: 'Разделить' }).click();
  await expect(page.getByTestId('draft-row')).toHaveCount(2);
  await expect(page.getByTestId('inbox-badge')).toHaveText('2');
});

test('reject goes to the archive and can be restored', async ({ page }) => {
  await importJson(page, 'page2.json', PAGE2_ACT);
  await page.getByRole('button', { name: 'Отклонить' }).click();
  await page.getByRole('dialog', { name: 'Отклонить черновик?' }).getByRole('button', { name: 'Отклонить' }).click();
  await expect(page.getByText('Входящих нет')).toBeVisible();
  await page.getByText('Архив (1)').click();
  await page.getByRole('button', { name: 'Вернуть во входящие' }).click();
  await expect(page.getByTestId('draft-row')).toContainText('Готов к проверке');
});

test('more: expected-part rules are listed and editable; chat privacy hint is there', async ({ page }) => {
  await page.goto('./#/more');
  await page.getByText('Как в Gemini отключить сохранение чатов').click();
  await expect(page.getByText('myactivity.google.com/product/gemini')).toBeVisible();

  await page.getByRole('link', { name: 'Правила «работа → запчасть»' }).click();
  await expect(page.getByRole('list', { name: 'Правила' }).getByRole('listitem')).toHaveCount(12);
  await page.getByRole('button', { name: 'Добавить правило' }).click();
  const dialog = page.getByRole('dialog', { name: 'Новое правило' });
  await dialog.getByLabel('Название', { exact: true }).fill('Ремень генератора');
  await dialog.getByLabel('Слова в работе (все), через запятую').fill('замена, ремня, генератора');
  await dialog.getByLabel('Слова в запчасти (любое), через запятую').fill('ремень');
  await dialog.getByLabel('Какую строку добавить').fill('Ремень генератора');
  await dialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('list', { name: 'Правила' }).getByRole('listitem')).toHaveCount(13);
});
