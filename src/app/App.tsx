import { useEffect, type ReactNode } from 'react';
import { MoreScreen } from '../features/more/MoreScreen';
import { HistoryScreen, InboxScreen, RegulationScreen, StateScreen } from '../features/placeholders';
import { CloudOffIcon, TAB_ICONS } from '../ui/icons';
import { hrefFor, TABS, type TabId } from './routes';
import { UpdatePrompt } from './UpdatePrompt';
import { useOnline } from './useOnline';
import { useRoute } from './useRoute';
import { useTheme } from './theme';

const SCREENS: Record<TabId, () => ReactNode> = {
  state: StateScreen,
  history: HistoryScreen,
  inbox: InboxScreen,
  regulation: RegulationScreen,
  more: MoreScreen,
};

export function App() {
  const route = useRoute();
  const online = useOnline();
  useTheme(); // applies the saved theme and follows the OS theme

  const tab = TABS.find((t) => t.id === route.tab);
  const Screen = tab ? SCREENS[tab.id] : null;
  const title = tab ? tab.title : 'Страница не найдена';

  useEffect(() => {
    document.title = tab && tab.id !== 'state' ? `${tab.title} · Бортжурнал` : 'Бортжурнал';
    window.scrollTo(0, 0);
  }, [tab]);

  return (
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
                  <TabIcon className="nav__icon" />
                  <span className="nav__label">{t.label}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="page">
        <header className="appbar">
          <h1 className="appbar__title">{title}</h1>
          {!online && (
            <span className="pill" title="Нет подключения к интернету. Приложение работает, синхронизация недоступна.">
              <CloudOffIcon width={16} height={16} />
              офлайн
            </span>
          )}
        </header>
        <main className="content" id="main">
          {Screen ? (
            <Screen />
          ) : (
            <p>
              Такой страницы нет. <a href={hrefFor('/')}>На главную</a>
            </p>
          )}
        </main>
      </div>

      <UpdatePrompt />
    </div>
  );
}
