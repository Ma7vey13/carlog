import { useEffect } from 'react';
import { checkRemote, runSync, useSession } from '../../sync/session';

/** "На GitHub есть новые данные" — offered, never applied automatically (SPEC section 8). */
export function RemoteBanner() {
  const session = useSession();

  // Check again when the connection comes back or the app returns to the foreground.
  useEffect(() => {
    const recheck = () => {
      if (document.visibilityState === 'visible') void checkRemote();
    };
    window.addEventListener('online', recheck);
    document.addEventListener('visibilitychange', recheck);
    return () => {
      window.removeEventListener('online', recheck);
      document.removeEventListener('visibilitychange', recheck);
    };
  }, []);

  if (!session.remoteNewer) return null;
  return (
    <div className="remote-banner" role="status" data-testid="remote-banner">
      <span>На GitHub есть новые данные с другого устройства.</span>
      <button type="button" className="btn btn--primary" disabled={!!session.busy} onClick={() => void runSync('pull')}>
        {session.busy === 'pull' ? 'Подтягиваю…' : 'Подтянуть'}
      </button>
    </div>
  );
}
