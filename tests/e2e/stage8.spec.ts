import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { FakeGitHub } from '../fakeGithub';
import { makeJpeg } from './files';

// Stage 8: backup ZIP to the device and back, the storage screen, password change on two devices.

const OWNER = 'owner';
const REPO = 'carlog-data';
const TOKEN = 'github' + '_pat_' + 'C'.repeat(40);
const OLD = 'лошадь батарейка скрепка правильно';
const NEW = 'новый длинный пароль для проверки';

async function addVisit(page: Page, date: string, km: string, template: string) {
  await page.goto('./#/history/new');
  await page.getByLabel('Вставить шаблон').selectOption({ label: template });
  await page.getByLabel('Дата визита').fill(date);
  await page.getByLabel('Пробег, км').fill(km);
  await page.getByTestId('line').first().getByLabel('Цена, ₽').fill('1000');
  await page.getByRole('button', { name: 'Сохранить визит' }).click();
  await expect(page.getByTestId('visit-total')).toBeVisible();
}

test('backup: save a ZIP, restore it on an empty device with scans', async ({ browser, page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await addVisit(page, '2025-03-12', '293000', 'Тормоза передние');
  await page.goto('./#/state/docs/new');
  await page.getByLabel('Номер').fill('XXX 0000000000');
  await page.getByLabel('Окончание').fill('2027-11-19');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await page.getByTestId('doc-files-input').setInputFiles({ name: 'osago.jpg', mimeType: 'image/jpeg', buffer: await makeJpeg(page, 'OSAGO') });
  await expect(page.getByTestId('scan-viewer')).toBeVisible();

  // Storage screen counts the scan.
  await page.goto('./#/more');
  await page.getByRole('link', { name: /Хранилище/ }).click();
  await expect(page.getByTestId('scans-here')).toContainText('1 из 1');

  // Save the backup.
  await page.goto('./#/more/backup');
  await expect(page.getByText('не зашифрован')).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Сохранить резервную копию' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^carlog-backup-\d{4}-\d\d-\d\d\.zip$/);
  const file = testInfo.outputPath('backup.zip');
  await download.saveAs(file);
  await expect(page.getByTestId('backup-done')).toContainText('сканов 1');

  // A fresh browser = a new phone with empty storage.
  const ctx = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: testInfo.project.use.viewport ?? null });
  const fresh = await ctx.newPage();
  await fresh.goto('./#/history');
  await expect(fresh.getByText('История пуста')).toBeVisible();
  await fresh.goto('./#/more/backup');
  await fresh.getByTestId('backup-input').setInputFiles(file);
  await fresh.getByRole('dialog', { name: 'Восстановить из копии?' }).getByRole('button', { name: 'Восстановить' }).click();
  await expect(fresh.getByTestId('restore-done')).toContainText('Сканов добавлено: 1');

  await fresh.goto('./#/history');
  await expect(fresh.getByTestId('visit-row')).toHaveCount(1);
  await fresh.goto('./#/state/docs');
  await fresh.getByRole('link', { name: /ОСАГО XXX 0000000000/ }).click();
  await expect(fresh.getByTestId('scan-viewer').locator('img')).toBeVisible();

  // A wrong file is explained, not imported.
  await fresh.goto('./#/more/backup');
  await fresh.getByTestId('backup-input').setInputFiles({ name: 'other.zip', mimeType: 'application/zip', buffer: Buffer.from('not a zip') });
  await fresh.getByRole('button', { name: 'Восстановить' }).click();
  await expect(fresh.getByTestId('restore-error')).toContainText('Это не ZIP-архив');
  await ctx.close();
  expect(errors).toEqual([]);
});

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
  return { ctx, page: await ctx.newPage() };
}

async function setup(page: Page, name: string) {
  await page.goto('./#/more');
  await page.getByRole('link', { name: 'Настроить синхронизацию' }).click();
  await page.getByLabel('Репозиторий данных').fill(`${OWNER}/${REPO}`);
  await page.getByLabel('Токен GitHub').fill(TOKEN);
  await page.getByLabel('Имя устройства').fill(name);
  await page.getByRole('button', { name: 'Проверить доступ' }).click();
}

async function sync(page: Page, name: 'Отправить' | 'Подтянуть') {
  await page.goto('./#/more');
  await page.getByTestId('sync-panel').getByRole('button', { name, exact: true }).click();
}

test('password change: all files re-encrypted, the other device takes the new password', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one run is enough: it opens its own phone and computer');
  test.setTimeout(180_000);
  const fake = new FakeGitHub(OWNER, REPO, TOKEN);
  const phone = await device(browser, fake, 'phone');
  const pc = await device(browser, fake, 'pc');

  await addVisit(phone.page, '2025-03-12', '293000', 'Тормоза передние');
  await setup(phone.page, 'Телефон');
  await phone.page.getByLabel('Пароль', { exact: true }).fill(OLD);
  await phone.page.getByLabel('Пароль ещё раз').fill(OLD);
  await phone.page.getByLabel('Я сохранил пароль в менеджере паролей').check();
  await phone.page.getByRole('button', { name: 'Создать хранилище и отправить данные' }).click();
  await expect(phone.page.getByTestId('setup-done')).toBeVisible({ timeout: 30_000 });

  await setup(pc.page, 'Компьютер');
  await pc.page.getByLabel('Пароль', { exact: true }).fill(OLD);
  await pc.page.getByRole('button', { name: 'Подключиться' }).click();
  await expect(pc.page.getByTestId('setup-done')).toBeVisible({ timeout: 30_000 });
  const vaultBefore = new TextDecoder().decode(fake.files().get('vault.json')!);

  // Phone: change the password.
  await phone.page.goto('./#/more/sync');
  await phone.page.getByRole('button', { name: 'Сменить пароль' }).click();
  const dlg = phone.page.getByRole('dialog', { name: 'Сменить пароль данных' });
  await dlg.getByLabel('Текущий пароль').fill('не тот пароль');
  await dlg.getByLabel('Новый пароль', { exact: true }).fill(NEW);
  await dlg.getByLabel('Новый пароль ещё раз').fill(NEW);
  await dlg.getByRole('button', { name: 'Сменить пароль' }).click();
  await expect(dlg.getByRole('alert')).toHaveText('Неверный текущий пароль', { timeout: 30_000 });
  await dlg.getByLabel('Текущий пароль').fill(OLD);
  await dlg.getByRole('button', { name: 'Сменить пароль' }).click();
  await expect(dlg.getByTestId('password-changed')).toContainText('перешифровано файлов: 1', { timeout: 60_000 });
  await dlg.getByRole('button', { name: 'Готово' }).click();
  expect(fake.history()[0]).toBe('password: все файлы перешифрованы (1)');
  expect(new TextDecoder().decode(fake.files().get('vault.json')!)).not.toBe(vaultBefore);

  // Phone keeps working with the new password.
  await addVisit(phone.page, '2025-07-22', '298000', 'ТО двигателя');
  await sync(phone.page, 'Отправить');
  await expect(phone.page.getByTestId('sync-done')).toBeVisible({ timeout: 30_000 });

  // Computer: told that the password changed, enters the new one, gets the data.
  await sync(pc.page, 'Подтянуть');
  const err = pc.page.getByTestId('sync-error');
  await expect(err).toContainText('Пароль сменили на другом устройстве', { timeout: 30_000 });
  await err.getByRole('button', { name: 'Ввести пароль' }).click();
  const pw = pc.page.getByRole('dialog', { name: 'Пароль сменили' });
  await pw.getByLabel('Новый пароль').fill(NEW);
  await pw.getByRole('button', { name: 'Открыть' }).click();
  await expect(pw).toBeHidden({ timeout: 30_000 });
  await sync(pc.page, 'Подтянуть');
  await expect(pc.page.getByTestId('sync-done')).toBeVisible({ timeout: 30_000 });
  await pc.page.goto('./#/history');
  await expect(pc.page.getByTestId('visit-row')).toHaveCount(2);

  await phone.ctx.close();
  await pc.ctx.close();
});
