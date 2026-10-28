import { useCallback, useEffect, useState } from 'react';
import { hrefFor, type Route } from '../../app/routes';
import { ComponentsScreen } from './ComponentsScreen';
import { PartRulesScreen } from './PartRulesScreen';
import { ScheduleSettingsScreen } from './ScheduleSettingsScreen';
import { SyncPanel } from '../sync/SyncPanel';
import { SyncScreen } from '../sync/SyncScreen';
import { HelpScreen } from '../help/HelpScreen';
import { getStorageInfo, requestPersistence, type StorageInfo } from '../../app/storage';
import { THEME_LABELS, useTheme, type ThemeChoice } from '../../app/theme';
import { formatBytes, formatLocalDate } from '../../core/format';

const THEME_ORDER: ThemeChoice[] = ['system', 'light', 'dark'];

export function MoreScreen({ route }: { route: Route }) {
  if (route.rest[0] === 'components') return <ComponentsScreen />;
  if (route.rest[0] === 'part-rules') return <PartRulesScreen />;
  if (route.rest[0] === 'schedule') return <ScheduleSettingsScreen />;
  if (route.rest[0] === 'sync') return <SyncScreen route={route} />;
  if (route.rest[0] === 'help') return <HelpScreen route={route} />;
  return (
    <div className="stack">
      <SyncPanel compact />
      <section className="card">
        <h2 className="card__title">Данные</h2>
        <a className="menu-link" href={hrefFor('/more/components')}>
          <span>Справочник узлов</span>
          <span className="muted" aria-hidden="true">
            ›
          </span>
        </a>
        <a className="menu-link" href={hrefFor('/more/part-rules')}>
          <span>Правила «работа → запчасть»</span>
          <span className="muted" aria-hidden="true">
            ›
          </span>
        </a>
        <a className="menu-link" href={hrefFor('/state/self-check')}>
          <span>Самопроверка: пункты и журнал</span>
          <span className="muted" aria-hidden="true">
            ›
          </span>
        </a>
        <a className="menu-link" href={hrefFor('/state/docs')}>
          <span>Документы со сроком: ОСАГО и др.</span>
          <span className="muted" aria-hidden="true">
            ›
          </span>
        </a>
        <a className="menu-link" href={hrefFor('/more/schedule')}>
          <span>Расчёт сроков: тяжёлые условия, пороги</span>
          <span className="muted" aria-hidden="true">
            ›
          </span>
        </a>
      </section>
      <section className="card">
        <h2 className="card__title">Справка</h2>
        <a className="menu-link" href={hrefFor('/more/help')}>
          <span>Инструкции: синхронизация, установка, GitHub</span>
          <span className="muted" aria-hidden="true">
            ›
          </span>
        </a>
      </section>
      <ChatPrivacySection />
      <ThemeSection />
      <StorageSection />
      <AboutSection />
    </div>
  );
}

/** SPEC section 6Б: how to keep chats with scans out of AI training. */
function ChatPrivacySection() {
  return (
    <section className="card">
      <h2 className="card__title">Распознавание через чат-ИИ</h2>
      <details className="line__more">
        <summary>Как в Gemini отключить сохранение чатов</summary>
        <ol className="steps steps--compact">
          <li>
            Откройте Gemini → меню (☰) → <strong>Настройки</strong> → <strong>Действия</strong> (в некоторых версиях — «Активность в приложениях Gemini»).
          </li>
          <li>
            Нажмите <strong>Отключить</strong> (или «Отключить и удалить действия»). Тогда новые чаты не сохраняются в аккаунте и не используются для
            обучения моделей.
          </li>
          <li>Даже при отключённой истории Google хранит чат до 72 часов для работы сервиса. Сам сервис менять настройки за вас не может.</li>
        </ol>
        <p className="hint">
          Страница настроек в браузере:{' '}
          <a href="https://myactivity.google.com/product/gemini" target="_blank" rel="noreferrer noopener">
            myactivity.google.com/product/gemini
          </a>
        </p>
      </details>
      <p className="hint">
        На скане есть ваши ФИО, телефон и госномер. Они уходят в чат вместе с картинкой. Если не хотите — закройте их пальцем на фото или
        обрежьте скан перед отправкой: для распознавания они не нужны.
      </p>
    </section>
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
          <dd>{formatLocalDate(__BUILD_TIME__)}</dd>
        </div>
      </dl>
      <p className="hint">
        Данные хранятся на этом устройстве; на GitHub уходят только в зашифрованном виде, кнопкой «Отправить».
      </p>
    </section>
  );
}
