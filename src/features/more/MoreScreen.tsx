import { useCallback, useEffect, useState } from 'react';
import { getStorageInfo, requestPersistence, type StorageInfo } from '../../app/storage';
import { THEME_LABELS, useTheme, type ThemeChoice } from '../../app/theme';
import { formatBytes, formatDate } from '../../core/format';

const THEME_ORDER: ThemeChoice[] = ['system', 'light', 'dark'];

export function MoreScreen() {
  return (
    <div className="stack">
      <ThemeSection />
      <StorageSection />
      <AboutSection />
    </div>
  );
}

function ThemeSection() {
  const [theme, setTheme] = useTheme();
  return (
    <section className="card">
      <h2 className="card__title" id="theme-title">
        Оформление
      </h2>
      <div className="segmented" role="radiogroup" aria-labelledby="theme-title">
        {THEME_ORDER.map((choice) => (
          <button
            key={choice}
            type="button"
            role="radio"
            aria-checked={theme === choice}
            className="segmented__item"
            onClick={() => setTheme(choice)}
          >
            {THEME_LABELS[choice]}
          </button>
        ))}
      </div>
    </section>
  );
}

function StorageSection() {
  const [info, setInfo] = useState<StorageInfo | null>(null);

  const refresh = useCallback(() => {
    getStorageInfo().then(setInfo, () => setInfo(null));
  }, []);
  useEffect(refresh, [refresh]);

  const askPersistence = async () => {
    await requestPersistence();
    refresh();
  };

  return (
    <section className="card">
      <h2 className="card__title">Хранилище на этом устройстве</h2>
      {!info ? (
        <p className="muted">Считаю…</p>
      ) : !info.supported ? (
        <p className="muted">Браузер не сообщает, сколько места занято.</p>
      ) : (
        <dl className="facts">
          <div>
            <dt>Занято</dt>
            <dd data-testid="storage-usage">{info.usage === null ? '—' : formatBytes(info.usage)}</dd>
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
            Без постоянного хранилища браузер может удалить данные, если на телефоне кончится место. Chrome обычно
            включает его сам, когда приложение установлено на главный экран.
          </p>
          <button type="button" className="btn btn--secondary" onClick={askPersistence}>
            Запросить у браузера
          </button>
        </>
      )}
    </section>
  );
}

function AboutSection() {
  return (
    <section className="card">
      <h2 className="card__title">О приложении</h2>
      <dl className="facts">
        <div>
          <dt>Версия</dt>
          <dd data-testid="app-version">
            {__APP_VERSION__} ({__BUILD_SHA__})
          </dd>
        </div>
        <div>
          <dt>Сборка</dt>
          <dd>{formatDate(__BUILD_TIME__)}</dd>
        </div>
      </dl>
      <p className="hint">
        Все данные хранятся на этом устройстве. Синхронизация между телефоном и компьютером появится на этапе 4.
      </p>
    </section>
  );
}
