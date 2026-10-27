import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { usePageHeader } from '../../app/pageHeader';
import { hrefFor, type Route } from '../../app/routes';
import { getDb } from '../../db/db';
import { setDownloadAllScans, setSessionKey } from '../../sync/session';
import { forgetKey, loadRememberedKey, resetSyncState } from '../../sync/state';
import { ConfirmDialog } from '../../ui/Dialog';
import { Checkbox } from '../../ui/Field';
import { SetupWizard } from './SetupWizard';
import { TokenDialog } from './SyncDialogs';
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
          <Checkbox label="Скачивать все сканы при «Подтянуть»" checked={s.downloadAllScans} onChange={(on) => void setDownloadAllScans(on)} />
          <p className="hint">Выключено — сканы скачиваются, только когда их открывают (экономит место на телефоне). На компьютере удобно включить.</p>
          <div className="btn-row">
            <button type="button" className="btn btn--secondary" onClick={() => setAskToken(true)}>
              Заменить токен
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
