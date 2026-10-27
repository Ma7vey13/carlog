import { useEffect, useState } from 'react';
import type { Scan } from '../../core/model';
import { getDb } from '../../db/db';
import { loadScanBlob, rotateScan } from '../../db/scans';
import { rotatedCopy } from '../../scan/process';
import { fetchScanOnDemand } from '../../sync/session';
import { BackIcon } from '../../ui/icons';

const ZOOMS = [1, 1.5, 2, 3] as const;
const NEXT_ROTATION: Record<Scan['rotation'], Scan['rotation']> = { 0: 90, 90: 180, 180: 270, 270: 0 };

/**
 * Object URL of a page shown upright (rotation applied), revoked when no longer needed.
 * Returns null until the image for exactly this page and rotation is ready, so the viewer never
 * shows the previous page under the new page's number.
 */
function usePageUrl(scan: Scan | undefined): string | null | 'missing' {
  const key = scan ? `${scan.id}|${scan.rotation}` : '';
  const [state, setState] = useState<{ key: string; url: string | 'missing' } | null>(null);
  useEffect(() => {
    if (!scan) return;
    let cancelled = false;
    let created: string | null = null;
    (async () => {
      let blob = await loadScanBlob(getDb(), scan.sha256);
      // Not on this device yet (phones download scans on demand): fetch it from GitHub.
      if (!blob && (await fetchScanOnDemand(scan.sha256))) blob = await loadScanBlob(getDb(), scan.sha256);
      if (cancelled) return;
      if (!blob) {
        setState({ key, url: 'missing' });
        return;
      }
      const shown = await rotatedCopy(blob, scan.rotation);
      if (cancelled) return;
      created = URL.createObjectURL(shown);
      setState({ key, url: created });
    })().catch(() => setState(null));
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [key, scan]);
  return state && state.key === key ? state.url : null;
}

/** Scan pages with paging, zoom and rotation (SPEC section 7). Rotation is saved with the scan. */
export function ScanViewer({ scans, label = 'Скан' }: { scans: readonly Scan[]; label?: string }) {
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState<(typeof ZOOMS)[number]>(1);
  const scan = scans[Math.min(index, scans.length - 1)];
  const url = usePageUrl(scan);

  if (!scans.length) return <p className="muted">Сканов нет.</p>;

  const zoomIndex = ZOOMS.indexOf(zoom);
  return (
    <section className="viewer" aria-label={label} data-testid="scan-viewer">
      <div className="viewer__bar">
        {scans.length > 1 && (
          <div className="viewer__pages">
            <button type="button" className="icon-btn" aria-label="Предыдущая страница" disabled={index === 0} onClick={() => setIndex(index - 1)}>
              <BackIcon width={20} height={20} />
            </button>
            <span className="viewer__count" aria-live="polite">
              {index + 1} / {scans.length}
            </span>
            <button
              type="button"
              className="icon-btn viewer__next"
              aria-label="Следующая страница"
              disabled={index >= scans.length - 1}
              onClick={() => setIndex(index + 1)}
            >
              <BackIcon width={20} height={20} />
            </button>
          </div>
        )}
        <div className="viewer__tools">
          <button type="button" className="icon-btn viewer__text-btn" aria-label="Уменьшить" disabled={zoomIndex <= 0} onClick={() => setZoom(ZOOMS[zoomIndex - 1]!)}>
            −
          </button>
          <span className="viewer__zoom">{Math.round(zoom * 100)}%</span>
          <button type="button" className="icon-btn viewer__text-btn" aria-label="Увеличить" disabled={zoomIndex >= ZOOMS.length - 1} onClick={() => setZoom(ZOOMS[zoomIndex + 1]!)}>
            +
          </button>
          <button
            type="button"
            className="icon-btn viewer__text-btn"
            aria-label="Повернуть по часовой"
            title="Повернуть по часовой"
            onClick={() => scan && void rotateScan(getDb(), scan.id, NEXT_ROTATION[scan.rotation])}
          >
            ⟳
          </button>
        </div>
      </div>
      <div className="viewer__frame" tabIndex={0} aria-label={`Страница ${index + 1}`}>
        {url === 'missing' ? (
          <p className="muted viewer__loading" data-testid="scan-missing">
            Скан хранится на GitHub и ещё не скачан на это устройство. Подключитесь к интернету и введите пароль синхронизации («Ещё → Синхронизация»),
            затем откройте скан снова.
          </p>
        ) : url ? (
          <img className="viewer__img" src={url} alt={`${label}, страница ${index + 1}`} style={{ width: `${zoom * 100}%` }} data-rotation={scan?.rotation ?? 0} />
        ) : (
          <p className="muted viewer__loading">Загружаю…</p>
        )}
      </div>
    </section>
  );
}

/** Small first-page preview for lists. */
export function ScanThumb({ scan }: { scan: Scan | undefined }) {
  const url = usePageUrl(scan);
  return <span className="thumb">{url && url !== 'missing' ? <img src={url} alt="" /> : null}</span>;
}
