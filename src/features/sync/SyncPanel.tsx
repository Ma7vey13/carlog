import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { hrefFor } from '../../app/routes';
import { formatLocalDateTime } from '../../core/format';
import { getDb } from '../../db/db';
import { getDeviceId } from '../../db/device';
import { helpHref } from '../help/guides';
import { clearSyncMessages, runSync, useSession } from '../../sync/session';
import { countUnsent } from '../../sync/snapshot';
import { loadSyncState, type SyncState } from '../../sync/state';
import { PasswordDialog, TokenDialog } from './SyncDialogs';

export function useSyncState(): SyncState | undefined {
  return useLiveQuery(() => loadSyncState(getDb()), []);
}

/** Records changed on this device since the last push (SPEC section 8, indicators). */
export function useUnsentCount(state: SyncState | undefined): number | undefined {
  return useLiveQuery(async () => {
    if (!state?.config) return 0;
    const db = getDb();
    return countUnsent(db, await getDeviceId(db), state.lastPush?.at ?? null);
  }, [state?.config, state?.lastPush?.at]);
}

/** Sync status and the two buttons. `compact` for the "Ещё" screen. */
export function SyncPanel({ compact = false }: { compact?: boolean }) {
  const s = useSyncState();
  const session = useSession();
  const unsent = useUnsentCount(s);
  const [askPassword, setAskPassword] = useState<null | 'push' | 'pull' | 'unlock'>(null);
  const [askToken, setAskToken] = useState(false);

  if (!s) return <section className="card">Загрузка…</section>;

  if (!s.config) {
    return (
      <section className="card" aria-label="Синхронизация">
        <h2 className="card__title">Синхронизация</h2>
        <p className="hint">Сейчас данные есть только на этом устройстве. Настройте синхронизацию, чтобы видеть их и на телефоне, и на компьютере.</p>
        <a className="btn btn--primary" style={{ justifySelf: 'start' }} href={hrefFor('/more/sync/setup')}>
          Настроить синхронизацию
        </a>
        <a className="menu-link" href={helpHref('sync')}>
          <span>Инструкция по синхронизации</span>
          <span className="muted" aria-hidden="true">
            ›
          </span>
        </a>
      </section>
    );
  }

  const act = (kind: 'push' | 'pull') => {
    clearSyncMessages();
    if (!session.key) setAskPassword(kind);
    else void runSync(kind);
  };

  const err = session.error;
  return (
    <section className="card" aria-label="Синхронизация" data-testid="sync-panel">
      <h2 className="card__title">Синхронизация</h2>
      <dl className="facts">
        <div>
          <dt>Это устройство</dt>
          <dd>{s.config.deviceName}</dd>
        </div>
        <div>
          <dt>Отправлено</dt>
          <dd data-testid="last-push">{s.lastPush ? formatLocalDateTime(s.lastPush.at) : 'ещё не отправляли'}</dd>
        </div>
        <div>
          <dt>Подтянуто</dt>
          <dd data-testid="last-pull">{s.lastPull ? formatLocalDateTime(s.lastPull.at) : 'ещё не подтягивали'}</dd>
        </div>
        <div>
          <dt>Неотправленные изменения</dt>
          <dd data-testid="unsent">{unsent ?? '…'}</dd>
        </div>
      </dl>

      <div className="btn-row">
        <button type="button" className="btn btn--primary" disabled={!!session.busy} onClick={() => act('push')}>
          {session.busy === 'push' ? 'Отправляю…' : 'Отправить'}
        </button>
        <button type="button" className="btn btn--secondary" disabled={!!session.busy} onClick={() => act('pull')}>
          {session.busy === 'pull' ? 'Подтягиваю…' : 'Подтянуть'}
        </button>
      </div>

      {session.progress && (
        <p className="hint" role="status">
          {session.progress}
        </p>
      )}
      {session.done && (
        <p className="notice notice--info" role="status" data-testid="sync-done">
          {session.done}
        </p>
      )}
      {err && (
        <div className="notice notice--error" role="alert" data-testid="sync-error">
          <p className="notice__title">{err.kind === 'auth' ? 'Токен истёк или неверен' : err.message}</p>
          {err.kind === 'auth' && (
            <>
              <p>
                GitHub не принял токен доступа к репозиторию данных: срок действия закончился, его отозвали или у него нет прав. Данные на
                устройстве в порядке.
              </p>
              <div className="btn-row">
                <button type="button" className="btn btn--secondary" onClick={() => setAskToken(true)}>
                  Ввести новый токен
                </button>
                <a className="btn btn--ghost" href={helpHref('sync', 'если-токен-истёк')}>
                  Как получить новый токен
                </a>
              </div>
            </>
          )}
          {(err.kind === 'locked' || err.kind === 'vault') && (
            <button type="button" className="btn btn--secondary" onClick={() => setAskPassword('unlock')}>
              Ввести пароль
            </button>
          )}
        </div>
      )}
      {!session.key && !err && (
        <p className="hint">
          Пароль данных не введён: он понадобится при первой синхронизации.{' '}
          <button type="button" className="link-btn" onClick={() => setAskPassword('unlock')}>
            Ввести сейчас
          </button>
        </p>
      )}
      {compact && (
        <a className="menu-link" href={hrefFor('/more/sync')}>
          <span>Настройки синхронизации</span>
          <span className="muted" aria-hidden="true">
            ›
          </span>
        </a>
      )}
      <a className="menu-link" href={helpHref('sync')}>
        <span>Инструкция по синхронизации</span>
        <span className="muted" aria-hidden="true">
          ›
        </span>
      </a>

      <PasswordDialog
        open={askPassword !== null}
        reason={err?.kind === 'vault' ? err.message : undefined}
        onClose={() => setAskPassword(null)}
        onUnlocked={() => {
          const kind = askPassword;
          setAskPassword(null);
          if (kind === 'push' || kind === 'pull') void runSync(kind);
        }}
      />
      <TokenDialog
        open={askToken}
        onClose={() => setAskToken(false)}
        onSaved={() => {
          setAskToken(false);
          clearSyncMessages();
        }}
      />
    </section>
  );
}
