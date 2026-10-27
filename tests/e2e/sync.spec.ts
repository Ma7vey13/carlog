import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { FakeGitHub } from '../fakeGithub';

// Stage 4 acceptance: phone and computer sync through a (fake) private GitHub repository.
// The real PBKDF2 (600 000 iterations) runs in the browser here.

const OWNER = 'owner';
const REPO = 'carlog-data';
const TOKEN = 'github' + '_pat_' + 'A'.repeat(40);
const PASSWORD = 'лошадь батарейка скрепка правильно';

test.describe.configure({ timeout: 120_000 });

async function device(browser: Browser, fake: FakeGitHub, kind: 'phone' | 'pc'): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext(
    kind === 'phone'
      ? { viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, baseURL: 'http://localhost:4173/carlog/' }
      : { viewport: { width: 1366, height: 860 }, baseURL: 'http://localhost:4173/carlog/' },
  );
  await ctx.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, content-type, accept, x-github-api-version',
      'access-control-allow-methods': 'GET, POST, PATCH, PUT, OPTIONS',
    };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const res = fake.handle(req.method(), req.url(), await req.allHeaders(), req.postData());
    await route.fulfill({ status: res.status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(res.body) });
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(`${kind}: ${e.message}`));
  return { ctx, page };
}

const pageErrors: string[] = [];

async function addVisit(page: Page, date: string, km: string, template: string) {
  await page.goto('./#/history/new');
  await page.getByLabel('Вставить шаблон').selectOption({ label: template });
  await page.getByLabel('Дата визита').fill(date);
  await page.getByLabel('Пробег, км').fill(km);
  await page.getByTestId('line').first().getByLabel('Цена, ₽').fill('1000');
  await page.getByRole('button', { name: 'Сохранить визит' }).click();
  await expect(page.getByTestId('visit-total')).toBeVisible();
}

async function setup(page: Page, deviceName: string) {
  await page.goto('./#/more');
  await page.getByRole('link', { name: 'Настроить синхронизацию' }).click();
  await page.getByLabel('Репозиторий данных').fill(`${OWNER}/${REPO}`);
  await page.getByLabel('Токен GitHub').fill(TOKEN);
  await page.getByLabel('Имя устройства').fill(deviceName);
  await page.getByRole('button', { name: 'Проверить доступ' }).click();
}

async function syncButton(page: Page, name: 'Отправить' | 'Подтянуть') {
  await page.goto('./#/more');
  await page.getByTestId('sync-panel').getByRole('button', { name, exact: true }).click();
  await expect(page.getByTestId('sync-done')).toBeVisible({ timeout: 30_000 });
}

async function historyDates(page: Page): Promise<string[]> {
  await page.goto('./#/history');
  const rows = page.getByTestId('visit-row');
  await expect(rows.first()).toBeVisible();
  return (await rows.locator('.visit-row__date').allTextContents()).sort();
}

test('phone and computer exchange data; nothing readable on GitHub except vault.json', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one run is enough: it opens its own phone and computer');
  const fake = new FakeGitHub(OWNER, REPO, TOKEN);
  const phone = await device(browser, fake, 'phone');
  const pc = await device(browser, fake, 'pc');

  // --- Phone: data first, then the first-run wizard creates the vault -----------------------------
  await addVisit(phone.page, '2025-03-12', '293000', 'Тормоза передние');
  await setup(phone.page, 'Телефон');
  await expect(phone.page.getByTestId('password-warning')).toContainText('Забытый пароль = потерянные данные');
  await phone.page.getByLabel('Пароль', { exact: true }).fill(PASSWORD);
  await phone.page.getByLabel('Пароль ещё раз').fill(PASSWORD);
  await phone.page.getByRole('button', { name: 'Создать хранилище и отправить данные' }).click();
  await expect(phone.page.getByTestId('setup-error')).toHaveText('Отметьте, что сохранили пароль');
  await phone.page.getByLabel('Я сохранил пароль в менеджере паролей').check();
  await phone.page.getByRole('button', { name: 'Создать хранилище и отправить данные' }).click();
  await expect(phone.page.getByTestId('setup-done')).toContainText('Хранилище создано', { timeout: 30_000 });
  expect([...fake.files().keys()].sort()).toEqual(['data/snapshot.enc', 'vault.json']);

  // --- Computer joins with the same password and gets the phone's visit ---------------------------
  await setup(pc.page, 'Компьютер');
  await pc.page.getByLabel('Пароль', { exact: true }).fill('совсем не тот пароль');
  await pc.page.getByRole('button', { name: 'Подключиться' }).click();
  await expect(pc.page.getByTestId('setup-error')).toHaveText('Неверный пароль', { timeout: 30_000 });
  await pc.page.getByLabel('Пароль', { exact: true }).fill(PASSWORD);
  await pc.page.getByRole('button', { name: 'Подключиться' }).click();
  await expect(pc.page.getByTestId('setup-done')).toContainText('Данные с других устройств подтянуты', { timeout: 30_000 });
  expect(await historyDates(pc.page)).toEqual(['12.03.2025']);

  // --- Computer → phone: the phone offers "Подтянуть" on start ------------------------------------
  await addVisit(pc.page, '2025-07-22', '298000', 'ТО двигателя');
  await syncButton(pc.page, 'Отправить');
  await pc.page.goto('./#/more');
  await expect(pc.page.getByTestId('unsent')).toHaveText('0');
  await phone.page.reload();
  await phone.page.goto('./#/history');
  await expect(phone.page.getByTestId('remote-banner')).toBeVisible({ timeout: 30_000 });
  await phone.page.getByTestId('remote-banner').getByRole('button', { name: 'Подтянуть' }).click();
  await expect(phone.page.getByTestId('remote-banner')).toBeHidden({ timeout: 30_000 });
  expect(await historyDates(phone.page)).toEqual(['12.03.2025', '22.07.2025']);

  // --- Both change without syncing: nothing is lost ----------------------------------------------
  await addVisit(phone.page, '2025-10-30', '303700', 'Масло АКПП');
  await addVisit(pc.page, '2025-04-11', '295000', 'Воздушный фильтр');
  await phone.page.goto('./#/more');
  await expect(phone.page.getByTestId('unsent')).not.toHaveText('0');
  await syncButton(phone.page, 'Отправить');
  await syncButton(pc.page, 'Отправить');
  await expect(pc.page.getByTestId('sync-done')).toContainText('подтянуты изменения с другого устройства');
  await syncButton(phone.page, 'Подтянуть');
  const all = ['11.04.2025', '12.03.2025', '22.07.2025', '30.10.2025'];
  expect(await historyDates(phone.page)).toEqual(all);
  expect(await historyDates(pc.page)).toEqual(all);

  // --- GitHub holds nothing readable except vault.json --------------------------------------------
  for (const [path, bytes] of fake.files()) {
    const text = new TextDecoder().decode(bytes);
    if (path === 'vault.json') {
      expect(JSON.parse(text)).toMatchObject({ format: 'carlog.vault.v1', kdf: { iterations: 600000 } });
      expect(text).not.toContain(PASSWORD);
      continue;
    }
    expect(() => JSON.parse(text), path).toThrow();
    for (const word of ['Замена', 'колодок', '293000', 'Телефон']) expect(text, path).not.toContain(word);
  }
  expect(fake.history().filter((m) => m.startsWith('sync: Телефон')).length).toBeGreaterThanOrEqual(2);
  expect(fake.history().filter((m) => m.startsWith('sync: Компьютер')).length).toBeGreaterThanOrEqual(2);

  // --- Expired token: a clear message and a way to enter a new one -------------------------------
  const fresh = 'github' + '_pat_' + 'B'.repeat(40);
  fake.token = fresh;
  await phone.page.goto('./#/more');
  await phone.page.getByTestId('sync-panel').getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(phone.page.getByTestId('sync-error')).toContainText('Токен истёк или неверен');
  await phone.page.getByRole('button', { name: 'Ввести новый токен' }).click();
  await phone.page.getByRole('dialog', { name: 'Новый токен GitHub' }).getByLabel('Токен').fill(fresh);
  await phone.page.getByRole('dialog', { name: 'Новый токен GitHub' }).getByRole('button', { name: 'Сохранить' }).click();
  await syncButton(phone.page, 'Отправить');

  expect(pageErrors).toEqual([]);
  await phone.ctx.close();
  await pc.ctx.close();
});

test('a public data repository is refused', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-360');
  const fake = new FakeGitHub(OWNER, REPO, TOKEN, false);
  const { ctx, page } = await device(browser, fake, 'phone');
  await setup(page, 'Телефон');
  await expect(page.getByTestId('setup-error')).toContainText('Этот репозиторий публичный');
  expect(fake.files().size).toBe(0);
  await ctx.close();
});
