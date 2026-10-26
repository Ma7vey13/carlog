import { useMemo, useState } from 'react';
import { hrefFor, type Route } from '../../app/routes';
import { allLines, visitTotal } from '../../core/bundle';
import { formatDate, formatKm } from '../../core/format';
import { documentTitle, VISIT_KIND_LABELS } from '../../core/labels';
import type { MileageEntry } from '../../core/model';
import { formatRub } from '../../core/money';
import { componentSubtree, filterVisits, type VisitMatch } from '../../core/search';
import { getDb } from '../../db/db';
import { componentTree, useComponents, useMileage, useVisitBundles } from '../../db/hooks';
import { deleteMileage } from '../../db/visits';
import { ConfirmDialog } from '../../ui/Dialog';
import { EmptyState } from '../../ui/EmptyState';
import { CloseIcon, GaugeIcon, HistoryIcon, PlusIcon, SearchIcon } from '../../ui/icons';
import { MileageDialog } from './MileageDialog';
import { VisitCard } from './VisitCard';
import { VisitEditor } from './VisitEditor';

/** History tab router: list, `/history/new`, `/history/<id>`, `/history/<id>/edit`. */
export function HistoryScreen({ route }: { route: Route }) {
  const [first, second] = route.rest;
  if (first === 'new') return <VisitEditor editId={null} />;
  if (first && second === 'edit') return <VisitEditor editId={first} />;
  if (first) return <VisitCard id={first} />;
  return <HistoryList />;
}

type FeedItem = { type: 'visit'; date: string; match: VisitMatch } | { type: 'mileage'; date: string; entry: MileageEntry };

function HistoryList() {
  const bundles = useVisitBundles();
  const mileage = useMileage();
  const components = useComponents();
  const [query, setQuery] = useState('');
  const [componentId, setComponentId] = useState('');
  const [mileageOpen, setMileageOpen] = useState(false);
  const [deleting, setDeleting] = useState<MileageEntry | null>(null);

  const tree = useMemo(() => componentTree(components ?? []), [components]);
  const filtering = query.trim() !== '' || componentId !== '';

  const feed = useMemo<FeedItem[]>(() => {
    if (!bundles) return [];
    const componentIds = componentId ? componentSubtree(componentId, components ?? []) : null;
    const matches = filterVisits(bundles, { query, componentIds });
    const items: FeedItem[] = matches.map((match) => ({ type: 'visit', date: match.bundle.visit.date, match }));
    // Manual mileage marks appear in the feed only when nothing is filtered.
    if (!filtering) {
      for (const entry of mileage ?? []) {
        if (entry.source === 'manual') items.push({ type: 'mileage', date: entry.date, entry });
      }
    }
    return items.sort((a, b) => b.date.localeCompare(a.date));
  }, [bundles, mileage, components, query, componentId, filtering]);

  if (bundles === undefined) return <p className="muted">Загрузка…</p>;

  const toolbar = (
    <div className="btn-row">
      <a className="btn btn--primary" href={hrefFor('/history/new')}>
        <PlusIcon width={18} height={18} /> Добавить визит
      </a>
      <button type="button" className="btn btn--secondary" onClick={() => setMileageOpen(true)}>
        <GaugeIcon width={18} height={18} /> Отметить пробег
      </button>
    </div>
  );

  const dialogs = (
    <>
      <MileageDialog open={mileageOpen} onClose={() => setMileageOpen(false)} />
      <ConfirmDialog
        open={deleting !== null}
        title="Удалить отметку пробега?"
        confirmLabel="Удалить"
        danger
        onConfirm={() => {
          if (deleting) void deleteMileage(getDb(), deleting.id);
          setDeleting(null);
        }}
        onCancel={() => setDeleting(null)}
      >
        {deleting && (
          <p>
            {formatKm(deleting.km)} от {formatDate(deleting.date)}
          </p>
        )}
      </ConfirmDialog>
    </>
  );

  if (bundles.length === 0 && (mileage ?? []).length === 0) {
    return (
      <>
        <EmptyState icon={<HistoryIcon />} title="История пуста">
          <p>Добавьте первый визит в сервис или свою работу — из накладной или по памяти.</p>
        </EmptyState>
        <div className="center">{toolbar}</div>
        {dialogs}
      </>
    );
  }

  return (
    <div className="stack">
      {toolbar}

      <div className="filters">
        <label className="search">
          <SearchIcon className="search__icon" width={20} height={20} />
          <input
            className="input search__input"
            type="search"
            placeholder="Поиск: колодки, масло, номер документа"
            aria-label="Поиск по истории"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button type="button" className="icon-btn search__clear" aria-label="Очистить поиск" onClick={() => setQuery('')}>
              <CloseIcon width={18} height={18} />
            </button>
          )}
        </label>
        <select className="input" aria-label="Фильтр по узлу" value={componentId} onChange={(e) => setComponentId(e.target.value)}>
          <option value="">Все узлы</option>
          {tree.map(({ component, depth }) => (
            <option key={component.id} value={component.id}>
              {' '.repeat(depth) + component.name}
            </option>
          ))}
        </select>
      </div>

      {filtering && (
        <p className="muted" role="status">
          Найдено визитов: {feed.length}
        </p>
      )}

      <ul className="feed" aria-label="История">
        {feed.map((item) =>
          item.type === 'visit' ? (
            <li key={item.match.bundle.visit.id}>
              <VisitRow match={item.match} />
            </li>
          ) : (
            <li key={item.entry.id} className="feed__mileage">
              <GaugeIcon width={18} height={18} />
              <span>
                <strong>{formatKm(item.entry.km)}</strong> · отметка пробега {formatDate(item.entry.date)}
              </span>
              <button type="button" className="icon-btn" aria-label={`Удалить отметку ${formatKm(item.entry.km)}`} onClick={() => setDeleting(item.entry)}>
                <CloseIcon width={18} height={18} />
              </button>
            </li>
          ),
        )}
      </ul>
      {filtering && feed.length === 0 && <p className="muted">Ничего не найдено. Попробуйте другое слово или «Все узлы».</p>}
      {dialogs}
    </div>
  );
}

function VisitRow({ match }: { match: VisitMatch }) {
  const { bundle, matchedLines } = match;
  const { visit } = bundle;
  const lines = allLines(bundle);
  const preview = lines.slice(0, 3).map((l) => l.name || l.rawName);
  const firstDoc = bundle.documents[0]?.document;
  const who = visit.kind === 'self' ? VISIT_KIND_LABELS.self : visit.shop.name || 'Сервис';

  return (
    <a className="visit-row" href={hrefFor(`/history/${visit.id}`)} data-testid="visit-row">
      <div className="visit-row__top">
        <span className="visit-row__date">{formatDate(visit.date)}</span>
        {visit.odometerKm !== null && <span className="visit-row__km">{formatKm(visit.odometerKm)}</span>}
        <span className="visit-row__sum">{formatRub(visitTotal(bundle))}</span>
      </div>
      <div className="visit-row__who">
        {who}
        {firstDoc ? <span className="muted"> · {documentTitle(firstDoc)}</span> : null}
      </div>
      {matchedLines.length > 0 ? (
        <ul className="visit-row__matches" aria-label="Совпадения">
          {matchedLines.map((l) => (
            <li key={l.id}>{l.name || l.rawName}</li>
          ))}
        </ul>
      ) : (
        <div className="visit-row__lines muted">
          {preview.join(' · ')}
          {lines.length > preview.length ? ` · ещё ${lines.length - preview.length}` : ''}
        </div>
      )}
    </a>
  );
}

