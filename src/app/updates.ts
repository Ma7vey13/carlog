// Checking for a new version (D-099). The service worker registration is kept here so that the app
// can check when the owner comes back to it and on "Проверить обновления", not only once an hour:
// a phone keeps an installed app in memory for days and holds back its timers.

let registration: ServiceWorkerRegistration | null = null;
let showPrompt: () => void = () => {};
let checking: Promise<UpdateCheck> | null = null;

export type UpdateCheck = 'available' | 'latest' | 'offline' | 'unsupported' | 'error';

/** Called by UpdatePrompt once the worker is registered. */
export function setUpdateTarget(reg: ServiceWorkerRegistration, onAvailable: () => void): void {
  registration = reg;
  showPrompt = onAvailable;
}

const INSTALL_WAIT_MS = 20_000;

/** Waits until a worker being installed is ready (or gone). */
function settled(reg: ServiceWorkerRegistration): Promise<void> {
  const worker = reg.installing;
  if (!worker) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      if (worker.state === 'installed' || worker.state === 'activated' || worker.state === 'redundant') resolve();
    };
    worker.addEventListener('statechange', done);
    setTimeout(resolve, INSTALL_WAIT_MS);
    done();
  });
}

/** Asks the server for a new version; shows "Доступна новая версия" when there is one. */
export function checkForUpdate(): Promise<UpdateCheck> {
  checking ??= (async (): Promise<UpdateCheck> => {
    const reg = registration;
    if (!reg) return 'unsupported';
    if (reg.waiting) {
      showPrompt();
      return 'available';
    }
    if (!navigator.onLine) return 'offline';
    try {
      await reg.update();
      await settled(reg);
    } catch {
      return navigator.onLine ? 'error' : 'offline';
    }
    if (reg.waiting) {
      showPrompt();
      return 'available';
    }
    return 'latest';
  })().finally(() => {
    checking = null;
  });
  return checking;
}
