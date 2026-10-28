import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useState } from 'react';
import { usePageHeader } from '../../app/pageHeader';
import { hrefFor } from '../../app/routes';
import { getStorageInfo, requestPersistence, type StorageInfo } from '../../app/storage';
import { formatBytes } from '../../core/format';
import { getDb } from '../../db/db';
import { freeScanSpace, storageStats } from '../../db/storage';
import { ConfirmDialog } from '../../ui/Dialog';
import { useSyncState } from '../sync/SyncPanel';

export function useStorageInfo(): [StorageInfo | null, () => void] {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const refresh = useCallback(() => {
    getStorageInfo().then(setInfo, () => setInfo(null));
  }, []);
  useEffect(refresh, [refresh]);
  return [info, refresh];
}

/** "Ещё → Хранилище" (stage 8): browser space, what the app keeps here, freeing scan copies. */
export function StorageScreen() {
  usePageHeader('Хранилище', hrefFor('/more'));
  const [info, refresh] = useStorageInfo();
  const sync = useSyncState();
  const index = sync?.scanIndex ?? {};
  const stats = useLiveQuery(() => storageStats(getDb(), sync?.scanIndex ?? {}), [sync?.scanIndex]);
  const [confirmFree, setConfirmFree] = useState(false);
  const [freed, setFreed] = useState<string | null>(null);

  return (
    <div className="stack">
      <section className="card" aria-label="Браузер">
        <h2 className="card__title">Место в браузере</h2>
        {!info ? (
          <p className="muted">Считаю…</p>
        ) : !info.supported ? (
          <p className="muted">Браузер не сообщает, сколько места занято.</p>
        ) : (
          <dl className="facts">
            <div>
              <dt>Занято</dt>
              <dd data-testid="storage-total">{info.usage === null ? '—' : formatBytes(info.usage)}</dd>
            </div>
            <div>
              <dt>Доступно браузеру</dt>
              <dd>{info.quota === null ? '—' : formatBytes(info.quota)}</dd>
            </div>
            <div>
              <dt>Постоянное хранилище</dt>
              <dd>{info.persisted ? 'включено' : 'не включено'}</dd>
            </div>
          </dl>
        )}
        {info?.supported && !info.persisted && (
          <>
            <p className="hint">
              Без постоянного хранилища браузер может удалить данные, если на телефоне кончится место. Chrome обычно включает его сам, когда
              приложение установлено на главный экран.
            </p>
            <button type="button" className="btn btn--secondary" style={{ justifySelf: 'start' }} onClick={() => void requestPersistence().then(refresh)}>
              Запросить у браузера
            </button>
          </>
        )}
      </section>

      <section className="card" aria-label="Данные" data-testid="storage-stats">
        <h2 className="card__title">Что хранится</h2>
        {!stats ? (
          <p className="muted">Считаю…</p>
        ) : (
          <dl className="facts">
            <div>
              <dt>Визиты</dt>
              <dd>{stats.visits}</dd>
            </div>
            <div>
              <dt>Документы и строки</dt>
              <dd>
                {stats.documents} / {stats.lines}
              </dd>
            </div>
            <div>
              <dt>Черновики</dt>
              <dd>{stats.drafts}</dd>
            </div>
            <div>
              <dt>Сканы на устройстве</dt>
              <dd data-testid="scans-here">
                {stats.scansHere} из {stats.scans}, {formatBytes(stats.scansHereBytes)}
              </dd>
            </div>
            {stats.scansOnlyRemote > 0 && (
              <div>
                <dt>Только на GitHub</dt>
                <dd>{stats.scansOnlyRemote}</dd>
              </div>
            )}
          </dl>
        )}
      </section>

      <section className="card" aria-label="Освободить место">
        <h2 className="card__title">Освободить место</h2>
        <p className="hint">
          Удаляет с этого устройства копии сканов, которые уже отправлены на GitHub, и файлы удалённых документов. Записи не трогаются; скан
          скачается снова, когда вы его откроете (нужны интернет и пароль данных).
        </p>
        {stats && stats.freeable > 0 ? (
          <button type="button" className="btn btn--secondary" style={{ justifySelf: 'start' }} onClick={() => setConfirmFree(true)}>
            Освободить {formatBytes(stats.freeableBytes)}
          </button>
        ) : (
          <p className="muted">Освобождать пока нечего.</p>
        )}
        {freed && (
          <p className="notice notice--info" role="status">
            {freed}
          </p>
        )}
      </section>

      <ConfirmDialog
        open={confirmFree}
        title="Удалить копии сканов с устройства?"
        confirmLabel="Удалить копии"
        onConfirm={() => {
          setConfirmFree(false);
          void freeScanSpace(getDb(), index).then((r) => {
            setFreed(`Освобождено ${formatBytes(r.bytes)}: файлов ${r.files}.`);
            refresh();
          });
        }}
        onCancel={() => setConfirmFree(false)}
      >
        <p>
          Сканы останутся на GitHub в зашифрованном виде. Если вы не уверены, что GitHub доступен, сначала сохраните резервную копию.
        </p>
      </ConfirmDialog>
    </div>
  );
}
