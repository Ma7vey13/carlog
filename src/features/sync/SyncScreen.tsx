import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { usePageHeader } from '../../app/pageHeader';
import { hrefFor, type Route } from '../../app/routes';
import { getDb } from '../../db/db';
import { setAutoSync, setDownloadAllScans, setSessionKey } from '../../sync/session';
import { forgetKey, loadRememberedKey, resetSyncState } from '../../sync/state';
import { ConfirmDialog } from '../../ui/Dialog';
import { Checkbox } from '../../ui/Field';
import { SetupWizard } from './SetupWizard';
import { ChangePasswordDialog, TokenDialog } from './SyncDialogs';
import { SyncPanel, useSyncState } from './SyncPanel';

/** `/more/sync` and `/more/sync/setup`. */
export function SyncScreen({ route }: { route: Route }) {
  if (route.rest[1] === 'setup') return <SetupWizard />;
  return <SyncSettings />;
}

function SyncSettings() {
  usePageHeader('Синхронизация', hrefFor('/more'));
  const s = useSyncState();
  const remembered = useLiveQuery(async () => !!(await loadRememberedKey(getDb())), []);
  const [askToken, setAskToken] = useState(false);
  const [changePassword, setChangePassword] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="stack">
      <SyncPanel />
      {s?.config && (
        <section className="card" aria-label="Настройки">
          <h2 className="card__title">Настройки этого устройства</h2>
          <dl className="facts">
            <div>
              <dt>Репозиторий данных</dt>
              <dd>
                <a href={`https://github.com/${s.config.owner}/${s.config.repo}`} target="_blank" rel="noreferrer noopener">
                  {s.config.owner}/{s.config.repo}
                </a>
              </dd>
            </div>
          </dl>
          <Checkbox label="Синхронизировать автоматически" checked={s.autoSync} onChange={(on) => void setAutoSync(on)} />
          <p className="hint">
            Изменения отправляются сами через 10 секунд после правки и сразу, когда вы уходите из приложения; изменения с другого устройства подтягиваются при
            открытии и каждые 5 минут. Нужен пароль, запомненный на этом устройстве (или введённый в этот раз).
          </p>
          <Checkbox label="Скачивать все сканы при «Подтянуть»" checked={s.downloadAllScans} onChange={(on) => void setDownloadAllScans(on)} />
          <p className="hint">Выключено — сканы скачиваются, только когда их открывают (экономит место на телефоне). На компьютере удобно включить.</p>
          <div className="btn-row">
            <button type="button" className="btn btn--secondary" onClick={() => setAskToken(true)}>
              Заменить токен
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => setChangePassword(true)}>
              Сменить пароль
            </button>
            {remembered && (
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => {
                  void forgetKey(getDb());
                  setSessionKey(null);
                }}
              >
                Забыть пароль на этом устройстве
              </button>
            )}
            <button type="button" className="btn btn--danger-outline" onClick={() => setConfirmReset(true)}>
              Отключить синхронизацию здесь
            </button>
          </div>
        </section>
      )}
      <ChangePasswordDialog open={changePassword} onClose={() => setChangePassword(false)} />
      <TokenDialog open={askToken} onClose={() => setAskToken(false)} onSaved={() => setAskToken(false)} />
      <ConfirmDialog
        open={confirmReset}
        title="Отключить синхронизацию на этом устройстве?"
        confirmLabel="Отключить"
        danger
        onConfirm={() => {
          setConfirmReset(false);
          void resetSyncState(getDb()).then(() => setSessionKey(null));
        }}
        onCancel={() => setConfirmReset(false)}
      >
        <p>Токен и запомненный пароль удалятся с этого устройства. Данные на устройстве и на GitHub останутся; подключиться снова можно в любой момент.</p>
      </ConfirmDialog>
    </div>
  );
}
