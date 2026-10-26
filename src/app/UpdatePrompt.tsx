import { useRegisterSW } from 'virtual:pwa-register/react';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const RELOAD_FALLBACK_MS = 4000;

/**
 * Activates the waiting service worker and reloads once it takes over.
 * The plugin reloads by itself only if the tab was already controlled when it opened;
 * on the very first visit it is not, so we also listen for `controllerchange`
 * and reload anyway after a short timeout.
 */
function applyUpdate(updateServiceWorker: (reload?: boolean) => Promise<void>) {
  let reloaded = false;
  const reload = () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  };
  navigator.serviceWorker?.addEventListener('controllerchange', reload, { once: true });
  setTimeout(reload, RELOAD_FALLBACK_MS);
  void updateServiceWorker(true);
}

/**
 * Service worker registration with two notices:
 *  - "ready to work offline" after the first install;
 *  - "new version available" when a deployed update is waiting.
 * The update is applied only when the owner taps the button (SPEC section 3).
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // The app may stay open for days on a phone: check for updates periodically.
      setInterval(() => {
        if (navigator.onLine) registration.update().catch(() => {});
      }, UPDATE_CHECK_INTERVAL_MS);
    },
  });

  if (needRefresh) {
    return (
      <div className="toast" role="status" data-testid="update-prompt">
        <span className="toast__text">Доступна новая версия приложения.</span>
        <div className="toast__actions">
          <button className="btn btn--ghost" onClick={() => setNeedRefresh(false)}>
            Позже
          </button>
          <button className="btn btn--primary" onClick={() => applyUpdate(updateServiceWorker)}>
            Обновить
          </button>
        </div>
      </div>
    );
  }

  if (offlineReady) {
    return (
      <div className="toast" role="status" data-testid="offline-ready">
        <span className="toast__text">Приложение сохранено и будет открываться без интернета.</span>
        <div className="toast__actions">
          <button className="btn btn--primary" onClick={() => setOfflineReady(false)}>
            Понятно
          </button>
        </div>
      </div>
    );
  }

  return null;
}
