import { useEffect, useState, type ReactNode } from 'react';
import { HistoryScreen } from '../features/history/HistoryScreen';
import { MoreScreen } from '../features/more/MoreScreen';
import { InboxScreen } from '../features/inbox/InboxScreen';
import { RegulationScreen } from '../features/regulation/RegulationScreen';
import { StateScreen } from '../features/state/StateScreen';
import { useOpenDraftCount } from '../db/hooks';
import { AutoSync } from '../features/sync/AutoSync';
import { RemoteBanner } from '../features/sync/RemoteBanner';
import { BackIcon, CloudOffIcon, TAB_ICONS } from '../ui/icons';
import { PageHeaderContext, type PageHeader } from './pageHeader';
import { hrefFor, TABS, type Route, type TabId } from './routes';
import { UpdatePrompt } from './UpdatePrompt';
import { useOnline } from './useOnline';
import { useRoute } from './useRoute';
import { useTheme } from './theme';

const SCREENS: Record<TabId, (props: { route: Route }) => ReactNode> = {
  state: StateScreen,
  history: HistoryScreen,
  inbox: InboxScreen,
  regulation: RegulationScreen,
  more: MoreScreen,
};

export function App() {
  const route = useRoute();
  const online = useOnline();
  const inboxCount = useOpenDraftCount();
  const [header, setHeader] = useState<PageHeader | null>(null);
  useTheme(); // applies the saved theme and follows the OS theme

  const tab = TABS.find((t) => t.id === route.tab);
  const Screen = tab ? SCREENS[tab.id] : null;
  const title = header?.title ?? (tab ? tab.title : 'Страница не найдена');

  useEffect(() => {
    document.title = route.path === '/' ? 'Бортжурнал' : `${title} · Бортжурнал`;
  }, [route.path, title]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.path]);

  return (
    <PageHeaderContext.Provider value={setHeader}>
      <div className="layout">
        <nav className="nav" aria-label="Разделы">
          <div className="nav__brand">Бортжурнал</div>
          <ul className="nav__list">
            {TABS.map((t) => {
              const TabIcon = TAB_ICONS[t.id];
              const active = t.id === route.tab;
              return (
                <li key={t.id}>
                  <a className="nav__link" href={hrefFor(t.path)} aria-current={active ? 'page' : undefined}>
                    <span className="nav__icon-wrap">
                      <TabIcon className="nav__icon" />
                      {t.id === 'inbox' && inboxCount > 0 && (
                        <span className="badge" aria-label={`черновиков: ${inboxCount}`} data-testid="inbox-badge">
                          {inboxCount}
                        </span>
                      )}
                    </span>
                    <span className="nav__label">{t.label}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="page">
          <header className="appbar">
            {header?.backHref && (
              <a className="appbar__back" href={header.backHref} aria-label="Назад">
                <BackIcon />
              </a>
            )}
            <h1 className="appbar__title">{title}</h1>
            {!online && (
              <span className="pill" title="Нет подключения к интернету. Приложение работает, синхронизация недоступна.">
                <CloudOffIcon width={16} height={16} />
                офлайн
              </span>
            )}
          </header>
          <RemoteBanner />
          <AutoSync />
          <main className="content" id="main">
            {Screen ? (
              <Screen route={route} />
            ) : (
              <p>
                Такой страницы нет. <a href={hrefFor('/')}>На главную</a>
              </p>
            )}
          </main>
        </div>

        <UpdatePrompt />
      </div>
    </PageHeaderContext.Provider>
  );
}
