import { useEffect, useRef } from 'react';
import { useOnline } from '../../app/useOnline';
import { checkRemote, runSync, useSession, type SessionState } from '../../sync/session';
import { useSyncState, useUnsentCount } from './SyncPanel';

/** Changes go out this long after the last edit, so a visit being entered is one commit, not ten. */
export const PUSH_DELAY_MS = 10_000;
/** After a failed attempt, wait before trying by itself again. */
const RETRY_MS = 60_000;
/** While the app is open, look for other devices' changes this often. */
const RECHECK_MS = 5 * 60_000;

/**
 * Automatic sync (D-090), mounted once in the app. While the key is known and the setting is on:
 *   - changes are sent PUSH_DELAY_MS after the last edit, and at once when the app is hidden
 *     (switching apps on the phone, closing the tab);
 *   - other devices' changes are pulled when noticed (start, return to the app, every 5 minutes).
 * Whatever the setting, closing the tab with unsent changes asks the browser to warn.
 */
export function AutoSync() {
  const s = useSyncState();
  const unsent = useUnsentCount(s) ?? 0;
  const session = useSession();
  const online = useOnline();
  const failedAt = useRef(0);

  // A wrong token or password will not fix itself: wait for the owner instead of retrying.
  const blocked = session.error?.kind === 'auth' || session.error?.kind === 'locked' || session.error?.kind === 'vault';
  const on = !!s?.config && s.autoSync && !!session.key && online && !blocked;

  const latest = useRef({ on, unsent, session, configured: !!s?.config });
  latest.current = { on, unsent, session, configured: !!s?.config };

  useEffect(() => {
    if (!on || session.busy) return;
    const kind = unsent > 0 ? 'push' : session.remoteNewer ? 'pull' : null; // a push pulls first when needed
    if (!kind) return;
    const wait = Math.max(kind === 'push' ? PUSH_DELAY_MS : 0, failedAt.current + RETRY_MS - Date.now());
    const timer = window.setTimeout(() => {
      void runSync(kind).then((ok) => {
        failedAt.current = ok ? 0 : Date.now();
      });
    }, wait);
    return () => window.clearTimeout(timer);
  }, [on, unsent, session.busy, session.remoteNewer]);

  useEffect(() => {
    if (!on) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void checkRemote();
    }, RECHECK_MS);
    return () => window.clearInterval(timer);
  }, [on]);

  useEffect(() => {
    const flush = () => {
      const { on, unsent, session } = latest.current;
      if (document.visibilityState === 'hidden' && on && unsent > 0 && !session.busy) void runSync('push');
    };
    const warn = (e: BeforeUnloadEvent) => {
      const { on, unsent, session, configured } = latest.current;
      if (!configured || !shouldWarn(unsent, session)) return;
      // Start sending while the browser asks; "Остаться" lets it finish.
      if (on && !session.busy) void runSync('push');
      e.preventDefault();
      e.returnValue = '';
    };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('beforeunload', warn);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('beforeunload', warn);
    };
  }, []);

  return null;
}

/** Leaving now would keep changes on this device only. */
export function shouldWarn(unsent: number, session: Pick<SessionState, 'busy'>): boolean {
  return unsent > 0 || session.busy === 'push';
}
