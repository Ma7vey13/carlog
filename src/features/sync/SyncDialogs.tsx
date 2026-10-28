import { useState } from 'react';
import { WrongPasswordError } from '../../core/crypto';
import { getDb } from '../../db/db';
import { looksLikeToken } from '../../sync/github';
import { helpHref } from '../help/guides';
import { sessionKey, unlock } from '../../sync/session';
import { encryptToken, saveSyncState } from '../../sync/state';
import { Dialog } from '../../ui/Dialog';
import { Checkbox, TextField } from '../../ui/Field';

/** "Введите пароль": unlocks the session, optionally remembering the key on this device. */
export function PasswordDialog({ open, onClose, onUnlocked, reason }: { open: boolean; onClose: () => void; onUnlocked: () => void; reason?: string | undefined }) {
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await unlock(password, remember);
      setPassword('');
      onUnlocked();
    } catch (err) {
      setError(err instanceof WrongPasswordError ? 'Неверный пароль' : err instanceof Error ? err.message : 'Не удалось открыть данные');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      title="Пароль данных"
      onClose={onClose}
      onSubmit={() => void submit()}
      actions={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy || !password}>
            {busy ? 'Проверяю…' : 'Открыть'}
          </button>
        </>
      }
    >
      {reason && <p className="hint">{reason}</p>}
      <TextField label="Пароль" type="password" autoComplete="current-password" autoFocus value={password} error={error ?? undefined} onChange={(e) => setPassword(e.target.value)} />
      <Checkbox label="Запомнить на этом устройстве" checked={remember} onChange={setRemember} />
      <p className="hint">Запомненный ключ хранится только в этом браузере и не может быть из него извлечён. На чужих устройствах не включайте.</p>
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
