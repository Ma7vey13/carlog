import { useEffect, useState } from 'react';
import { passwordProblems, WrongPasswordError } from '../../core/crypto';
import { getDb } from '../../db/db';
import { looksLikeToken } from '../../sync/github';
import { helpHref } from '../help/guides';
import { adoptPasswordInSession, changePasswordInSession, hasOldKey, sessionKey, unlock } from '../../sync/session';
import { encryptToken, saveSyncState } from '../../sync/state';
import { Dialog } from '../../ui/Dialog';
import { Checkbox, TextField } from '../../ui/Field';

/**
 * "Пароль данных": unlocks the session, optionally remembering the key on this device.
 * Second mode: the password was changed on another device — take the new one (D-079).
 */
export function PasswordDialog({ open, onClose, onUnlocked, reason }: { open: boolean; onClose: () => void; onUnlocked: () => void; reason?: string | undefined }) {
  const [mode, setMode] = useState<'unlock' | 'adopt'>(reason ? 'adopt' : 'unlock');
  const [password, setPassword] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [needOld, setNeedOld] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(reason ? 'adopt' : 'unlock');
    void hasOldKey().then((has) => setNeedOld(!has));
  }, [open, reason]);

  const close = () => {
    setPassword('');
    setOldPassword('');
    setError(null);
    setWrong(false);
    onClose();
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'unlock') await unlock(password, remember);
      else await adoptPasswordInSession(needOld ? oldPassword : null, password, remember);
      setPassword('');
      setOldPassword('');
      setWrong(false);
      onUnlocked();
    } catch (err) {
      if (err instanceof WrongPasswordError) {
        setWrong(mode === 'unlock');
        setError(mode === 'unlock' ? 'Неверный пароль' : needOld ? 'Неверный старый или новый пароль' : 'Неверный новый пароль');
      } else setError(err instanceof Error ? err.message : 'Не удалось открыть данные');
    } finally {
      setBusy(false);
    }
  };

  const adopt = mode === 'adopt';
  return (
    <Dialog
      open={open}
      title={adopt ? 'Пароль сменили' : 'Пароль данных'}
      onClose={close}
      onSubmit={() => void submit()}
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={close}>
            Отмена
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy || !password || (adopt && needOld && !oldPassword)}>
            {busy ? 'Проверяю…' : 'Открыть'}
          </button>
        </>
      }
    >
      {reason && <p className="hint">{reason}</p>}
      {adopt && !reason && <p className="hint">Введите новый пароль, который задали на другом устройстве.</p>}
      {adopt && needOld && (
        <TextField
          label="Старый пароль"
          type="password"
          autoComplete="current-password"
          value={oldPassword}
          hint="Нужен один раз: им зашифрован токен на этом устройстве"
          onChange={(e) => setOldPassword(e.target.value)}
        />
      )}
      <TextField
        label={adopt ? 'Новый пароль' : 'Пароль'}
        type="password"
        autoComplete="current-password"
        autoFocus
        value={password}
        error={error ?? undefined}
        onChange={(e) => setPassword(e.target.value)}
      />
      {wrong && (
        <button
          type="button"
          className="link-btn"
          style={{ justifySelf: 'start' }}
          onClick={() => {
            setMode('adopt');
            setError(null);
            setWrong(false);
          }}
        >
          Пароль меняли на другом устройстве?
        </button>
      )}
      <Checkbox label="Запомнить на этом устройстве" checked={remember} onChange={setRemember} />
      <p className="hint">Запомненный ключ хранится только в этом браузере и не может быть из него извлечён. На чужих устройствах не включайте.</p>
    </Dialog>
  );
}

/** "Сменить пароль": all files on GitHub are re-encrypted in one commit (SPEC section 8). */
export function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const problems = passwordProblems(next);
  const errors = {
    next: submitted && problems.length ? `Пароль должен быть ${problems.join(', ')}` : undefined,
    repeat: submitted && repeat !== next ? 'Пароли не совпадают' : undefined,
    current: submitted && next && next === current ? 'Новый пароль совпадает со старым' : undefined,
  };

  const close = () => {
    if (progress) return; // never interrupt a running re-encryption
    setCurrent('');
    setNext('');
    setRepeat('');
    setSubmitted(false);
    setError(null);
    setDone(null);
    onClose();
  };

  const submit = async () => {
    setSubmitted(true);
    setError(null);
    if (problems.length || repeat !== next || next === current || !current) return;
    setProgress('Проверяю пароль…');
    try {
      const n = await changePasswordInSession(current, next, setProgress);
      setDone(`Пароль сменён, перешифровано файлов: ${n}. На других устройствах при следующей синхронизации введите новый пароль.`);
    } catch (err) {
      setError(err instanceof WrongPasswordError ? 'Неверный текущий пароль' : err instanceof Error ? err.message : 'Не удалось сменить пароль');
    } finally {
      setProgress(null);
    }
  };

  return (
    <Dialog
      open={open}
      title="Сменить пароль данных"
      onClose={close}
      onSubmit={() => void (done ? close() : submit())}
      actions={
        done ? (
          <button type="submit" className="btn btn--primary">
            Готово
          </button>
        ) : (
          <>
            <button type="button" className="btn btn--ghost" disabled={!!progress} onClick={close}>
              Отмена
            </button>
            <button type="submit" className="btn btn--primary" disabled={!!progress || !current || !next}>
              {progress ? 'Меняю…' : 'Сменить пароль'}
            </button>
          </>
        )
      }
    >
      {done ? (
        <p className="notice notice--info" role="status" data-testid="password-changed">
          {done}
        </p>
      ) : (
        <>
          <p className="notice notice--warning">
            Все файлы на GitHub будут перешифрованы новым паролем. Нужен интернет; не закрывайте приложение до конца. Забытый пароль —
            потерянные данные: сохраните новый в менеджере паролей.
          </p>
          <TextField label="Текущий пароль" type="password" autoComplete="current-password" value={current} error={errors.current} onChange={(e) => setCurrent(e.target.value)} />
          <TextField label="Новый пароль" type="password" autoComplete="new-password" value={next} error={errors.next} onChange={(e) => setNext(e.target.value)} />
          <TextField label="Новый пароль ещё раз" type="password" autoComplete="new-password" value={repeat} error={errors.repeat} onChange={(e) => setRepeat(e.target.value)} />
          {progress && (
            <p className="hint" role="status">
              {progress}
            </p>
          )}
          {error && (
            <p className="notice notice--error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </Dialog>
  );
}

/** "Ввести новый токен" after 401/403, or when the old one is about to expire. */
export function TokenDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const key = sessionKey();
    if (!key) {
      setError('Сначала введите пароль данных');
      return;
    }
    if (!token.trim()) {
      setError('Вставьте токен');
      return;
    }
    await saveSyncState(getDb(), { tokenEnc: await encryptToken(key, token) });
    setToken('');
    setError(null);
    onSaved();
  };

  return (
    <Dialog
      open={open}
      title="Новый токен GitHub"
      onClose={onClose}
      onSubmit={() => void submit()}
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" className="btn btn--primary">
            Сохранить
          </button>
        </>
      }
    >
      <p className="hint">
        Как получить новый токен — в{' '}
        <a href={helpHref('sync', 'шаг-1-создать-токен-github')} target="_blank" rel="noopener">
          инструкции
        </a>
        . Токен хранится на этом устройстве в зашифрованном виде.
      </p>
      <TextField
        label="Токен"
        type="password"
        autoComplete="off"
        spellCheck={false}
        autoFocus
        value={token}
        error={error ?? undefined}
        warning={token && !looksLikeToken(token) ? 'Не похоже на токен GitHub (обычно начинается с github_pat_)' : undefined}
        onChange={(e) => setToken(e.target.value)}
      />
    </Dialog>
  );
}
