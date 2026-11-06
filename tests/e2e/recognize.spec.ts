import { expect, test, type Page, type Route } from '@playwright/test';
import { PAGE2_ACT } from '../fixtures/drafts';
import { makeJpeg } from './files';

// Recognition through OpenRouter (D-100): the owner's key, then "Распознать" in a draft. The
// OpenRouter API is replaced by fixed answers: no real key and no network in tests.

const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function mockOpenRouter(page: Page, chat: (route: Route) => Promise<void>) {
  const calls = { chat: 0, auth: [] as string[] };
  await page.route('https://openrouter.ai/api/v1/models', (route) =>
    json(route, 200, {
      data: [
        { id: 'nvidia/nemotron-3.5-super-vl:free', name: 'NVIDIA Nemotron VL (free)', pricing: { prompt: '0', completion: '0' }, architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] } },
        { id: 'google/gemma-4-31b-it:free', name: 'Google: Gemma 4 31B (free)', pricing: { prompt: '0', completion: '0' }, architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] } },
      ],
    }),
  );
  await page.route('https://openrouter.ai/api/v1/key', (route) => {
    calls.auth.push(route.request().headers()['authorization'] ?? '');
    return json(route, 200, { data: { label: 'Бортжурнал', limit: 0, usage: 0, is_free_tier: true } });
  });
  await page.route('https://openrouter.ai/api/v1/chat/completions', (route) => {
    calls.chat++;
    return chat(route);
  });
  return calls;
}

async function newDraft(page: Page) {
  await page.goto('./#/inbox');
  const photo = await makeJpeg(page, 'АКТ №1 к з/н 26548');
  await page.getByTestId('files-input').setInputFiles({ name: 'act.jpg', mimeType: 'image/jpeg', buffer: photo });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Черновик');
}

test('key in the settings, then "Распознать" fills the draft', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let body: { model?: string; messages?: Array<{ content: Array<{ type: string }> }> } = {};
  const calls = await mockOpenRouter(page, (route) => {
    body = JSON.parse(route.request().postData() ?? '{}');
    return json(route, 200, { choices: [{ message: { content: 'Вот результат:\n```json\n' + JSON.stringify(PAGE2_ACT) + '\n```' } }] });
  });

  // Without a key: a way to the settings, and no request to openrouter.ai.
  await newDraft(page);
  const card = page.getByTestId('auto-recognize');
  await card.getByRole('link', { name: 'Настроить' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Распознавание');
  expect(calls.chat).toBe(0);

  await page.getByLabel('Ключ', { exact: true }).fill('sk-or-v1-test-key-1234');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByTestId('recognition-status')).toHaveText('Ключ работает («Бортжурнал»): тратить деньги ключ не может.');
  await expect(page.getByTestId('recognition-key')).toContainText('sk-or-…1234');
  expect(calls.auth).toEqual(['Bearer sk-or-v1-test-key-1234']);
  await expect(page.getByLabel('Какой нейросетью распознавать')).toContainText('Автоматически: Google: Gemma 4 31B');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);

  // The draft: one tap.
  await page.goto('./#/inbox');
  await page.getByTestId('draft-row').first().click();
  await expect(card.getByLabel('Модель')).toHaveValue('google/gemma-4-31b-it:free');
  await card.getByRole('button', { name: 'Распознать' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Проверка документа');
  expect(body.model).toBe('google/gemma-4-31b-it:free');
  expect(body.messages![0]!.content.map((c) => c.type)).toEqual(['text', 'image_url']);
  expect(errors).toEqual([]);
});

test('a refused request says what to do, and the chat way stays', async ({ page }) => {
  await mockOpenRouter(page, (route) => json(route, 429, { error: { message: 'Rate limit exceeded: free-models-per-day' } }));
  await page.goto('./#/more/recognition');
  await page.getByLabel('Ключ', { exact: true }).fill('sk-or-v1-test-key-1234');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByTestId('recognition-status')).toBeVisible();

  await newDraft(page);
  await page.getByTestId('auto-recognize').getByRole('button', { name: 'Распознать' }).click();
  await expect(page.getByTestId('auto-recognize-error')).toContainText('Бесплатный лимит на сегодня исчерпан');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Черновик');
  await expect(page.getByRole('button', { name: 'Скопировать промпт' })).toBeVisible();

  // Removing the key brings back "Настроить".
  await page.goto('./#/more/recognition');
  await page.getByRole('button', { name: 'Удалить ключ' }).click();
  await page.getByRole('dialog', { name: 'Удалить ключ?' }).getByRole('button', { name: 'Удалить' }).click();
  await expect(page.getByLabel('Ключ', { exact: true })).toBeVisible();
});
