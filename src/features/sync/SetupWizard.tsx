import { useState } from 'react';
import { usePageHeader } from '../../app/pageHeader';
import { hrefFor } from '../../app/routes';
import { createVault, passwordProblems, unlockVault, WrongPasswordError, type Vault } from '../../core/crypto';
import { getDb } from '../../db/db';
import { getDeviceId } from '../../db/device';
import { initRepository, pull, readRemoteVault, type SyncContext } from '../../sync/engine';
import { GitHub, GitHubError, looksLikeToken, parseRepo } from '../../sync/github';
import { defaultDataRepo, docsUrl, guessDeviceName } from '../../sync/links';
import { setSessionKey } from '../../sync/session';
import { encryptToken, rememberKey, saveSyncState } from '../../sync/state';
import { Checkbox, TextField } from '../../ui/Field';

type Step =
  | { name: 'access' }
  | { name: 'new-password'; gh: GitHub; branch: string }
  | { name: 'existing-password'; gh: GitHub; branch: string; vault: Vault; vaultSha: string }
  | { name: 'done'; created: boolean; message: string };

/** First-run wizard (SPEC stage 4): data repository, token, device name, password. */
export function SetupWizard() {
  usePageHeader('Настройка синхронизации', hrefFor('/more/sync'));
  const [step, setStep] = useState<Step>({ name: 'access' });
  const [repo, setRepo] = useState(defaultDataRepo());
  const [token, setToken] = useState('');
  const [deviceName, setDeviceName] = useState(guessDeviceName());
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [saved, setSaved] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const repoRef = parseRepo(repo);

  const checkAccess = async () => {
    setError(null);
    if (!repoRef) return setError('Укажите репозиторий в виде владелец/название, например Ma7vey13/carlog-data');
    if (!token.trim()) return setError('Вставьте токен');
    if (!deviceName.trim()) return setError('Назовите устройство, например «Телефон»');
    setBusy('Проверяю доступ к репозиторию…');
    try {
      const gh = new GitHub(repoRef.owner, repoRef.repo, token.trim());
      const info = await gh.repoInfo();
      if (!info.private) {
        return setError(
          'Этот репозиторий публичный: файлы в нём видит весь интернет. Сделайте его приватным (Settings → General → Danger Zone → Change visibility → Private) и попробуйте снова.',
        );
      }
      if (!info.canPush) return setError('Токен может только читать. Нужны права Contents: Read and write — см. инструкцию.');
      const remote = await readRemoteVault(gh, info.defaultBranch);
      if (remote) setStep({ name: 'existing-password', gh, branch: info.defaultBranch, vault: remote.vault, vaultSha: remote.sha });
      else setStep({ name: 'new-password', gh, branch: info.defaultBranch });
    } catch (err) {
      setError(err instanceof GitHubError ? err.message : 'Не удалось проверить доступ. Проверьте интернет.');
    } finally {
      setBusy(null);
    }
  };

  const saveConfig = async (gh: GitHub, branch: string, key: CryptoKey, vault: Vault, vaultSha: string | null) => {
    const db = getDb();
    await saveSyncState(db, {
      config: { owner: gh.owner, repo: gh.repo, branch, deviceName: deviceName.trim() },
      tokenEnc: await encryptToken(key, token),
      vault,
      vaultSha,
    });
    if (remember) await rememberKey(db, key);
    setSessionKey(key);
    const ctx: SyncContext = { db, gh, key, deviceId: await getDeviceId(db), onProgress: setBusy };
    return ctx;
  };

  const createNew = async () => {
    if (step.name !== 'new-password') return;
    setError(null);
    const problems = passwordProblems(password);
    if (problems.length) return setError(`Пароль: ${problems.join('; ')}`);
    if (password !== password2) return setError('Пароли не совпадают');
    if (!saved) return setError('Отметьте, что сохранили пароль');
    try {
      setBusy('Создаю ключ из пароля…');
      const { vault, key } = await createVault(password);
      const ctx = await saveConfig(step.gh, step.branch, key, vault, null);
      await initRepository(ctx, vault);
      setStep({ name: 'done', created: true, message: 'Хранилище создано, данные этого устройства зашифрованы и отправлены.' });
    } catch (err) {
      setError(err instanceof GitHubError || err instanceof Error ? err.message : 'Не удалось создать хранилище');
    } finally {
      setBusy(null);
    }
  };

  const joinExisting = async () => {
    if (step.name !== 'existing-password') return;
    setError(null);
    try {
      setBusy('Проверяю пароль…');
      const key = await unlockVault(step.vault, password);
      const ctx = await saveConfig(step.gh, step.branch, key, step.vault, step.vaultSha);
      const r = await pull(ctx);
      setStep({ name: 'done', created: false, message: `Данные с других устройств подтянуты (записей: ${r.received}). Нажмите «Отправить», чтобы туда попали и данные этого устройства.` });
    } catch (err) {
      setError(err instanceof WrongPasswordError ? 'Неверный пароль' : err instanceof Error ? err.message : 'Не удалось подключиться');
    } finally {
      setBusy(null);
    }
  };

  const status = (
    <>
      {busy && (
        <p className="hint" role="status">
          {busy}
        </p>
      )}
      {error && (
        <p className="notice notice--error" role="alert" data-testid="setup-error">
          {error}
        </p>
      )}
    </>
  );

  if (step.name === 'access') {
    return (
      <form
        className="stack"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void checkAccess();
        }}
      >
        <section className="card">
          <h2 className="card__title">1. Доступ к GitHub</h2>
          <p className="hint">
            Нужен приватный репозиторий для данных и токен доступа только к нему.{' '}
            <a href={docsUrl('04-sync.md', 'шаг-1-создать-токен-github')} target="_blank" rel="noreferrer noopener">
              Пошаговая инструкция
            </a>
            .
          </p>
          <TextField label="Репозиторий данных" value={repo} placeholder="владелец/carlog-data" autoComplete="off" spellCheck={false} onChange={(e) => setRepo(e.target.value)} />
          <TextField
            label="Токен GitHub"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={token}
            warning={token && !looksLikeToken(token) ? 'Не похоже на токен GitHub (обычно начинается с github_pat_)' : undefined}
            hint="Хранится только на этом устройстве, в зашифрованном виде"
            onChange={(e) => setToken(e.target.value)}
          />
          <TextField label="Имя устройства" value={deviceName} hint="Видно в истории синхронизации: «Телефон», «Компьютер»" onChange={(e) => setDeviceName(e.target.value)} />
          {status}
          <button type="submit" className="btn btn--primary" disabled={!!busy} style={{ justifySelf: 'start' }}>
            Проверить доступ
          </button>
        </section>
      </form>
    );
  }

  if (step.name === 'new-password') {
    return (
      <form
        className="stack"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void createNew();
        }}
      >
        <section className="card">
          <h2 className="card__title">2. Пароль данных</h2>
          <div className="notice notice--error big-warning" data-testid="password-warning">
            <p className="notice__title">Забытый пароль = потерянные данные</p>
            <p>
              Всё, что уходит на GitHub, шифруется этим паролем. Восстановить его нельзя — ни вам, ни GitHub, ни разработчику. Сохраните пароль в
              менеджере паролей (Google Password Manager, Bitwarden, 1Password) прямо сейчас.
            </p>
          </div>
          <TextField label="Пароль" type="password" autoComplete="new-password" value={password} hint="Не короче 12 символов. Удобно — 4–5 случайных слов." onChange={(e) => setPassword(e.target.value)} />
          <TextField label="Пароль ещё раз" type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
          <Checkbox label="Я сохранил пароль в менеджере паролей" checked={saved} onChange={setSaved} />
          <Checkbox label="Запомнить на этом устройстве" checked={remember} onChange={setRemember} />
          {status}
          <button type="submit" className="btn btn--primary" disabled={!!busy} style={{ justifySelf: 'start' }}>
            Создать хранилище и отправить данные
          </button>
        </section>
      </form>
    );
  }

  if (step.name === 'existing-password') {
    return (
      <form
        className="stack"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void joinExisting();
        }}
      >
        <section className="card">
          <h2 className="card__title">2. Пароль данных</h2>
          <p className="hint">В репозитории уже есть данные с другого устройства. Введите тот же пароль, которым они зашифрованы.</p>
          <TextField label="Пароль" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Checkbox label="Запомнить на этом устройстве" checked={remember} onChange={setRemember} />
          {status}
          <button type="submit" className="btn btn--primary" disabled={!!busy || !password} style={{ justifySelf: 'start' }}>
            Подключиться
          </button>
        </section>
      </form>
    );
  }

  return (
    <section className="card" data-testid="setup-done">
      <h2 className="card__title">Готово</h2>
      <p>{step.message}</p>
      <a className="btn btn--primary" style={{ justifySelf: 'start' }} href={hrefFor('/more/sync')}>
        К синхронизации
      </a>
    </section>
  );
}
