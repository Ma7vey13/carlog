import { useMemo, useState } from 'react';
import { usePageHeader } from '../../app/pageHeader';
import { hrefFor } from '../../app/routes';
import { activeDocuments, type VisitBundle } from '../../core/bundle';
import { formatDate, plural } from '../../core/format';
import { PERFORMER_LABELS, REGULATION_ACTION_LABELS, SCHEDULE_STATUS_LABELS } from '../../core/labels';
import { unlinkedMatchingLines } from '../../core/keywords';
import type { Id, RegulationItem } from '../../core/model';
import { actualIntervals, type Execution } from '../../core/schedule';
import { dueAtText, dueText, executionText, itemIntervalText, stepText } from '../../core/scheduleText';
import { getDb } from '../../db/db';
import { useComponents } from '../../db/hooks';
import { deleteManualEvent, linkLines, unlinkVisit } from '../../db/regulation';
import { ConfirmDialog } from '../../ui/Dialog';
import { DocumentScans } from '../history/VisitCard';
import { ManualEventDialog } from './ManualEventDialog';
import { useSchedule } from './useSchedule';

/** Regulation item card (SPEC section 9): status, every execution with visits and scans, actual intervals. */
export function ItemCard({ id, backHref }: { id: Id; backHref: string }) {
  const data = useSchedule();
  const components = useComponents();
  const s = data?.items.find((x) => x.item.id === id);
  usePageHeader(s?.item.name ?? 'Пункт регламента', backHref);

  const [marking, setMarking] = useState<RegulationItem | null>(null);
  const [unlinking, setUnlinking] = useState<Execution | null>(null);
  const [deletingEvent, setDeletingEvent] = useState<Execution | null>(null);

  if (!data) return <p className="muted">Загрузка…</p>;
  if (!s) {
    return (
      <p>
        Пункт не найден — возможно, он удалён. <a href={hrefFor('/regulation')}>К регламенту</a>
      </p>
    );
  }

  const { item } = s;
  const component = item.componentId ? components?.find((c) => c.id === item.componentId) : undefined;
  const steps = actualIntervals(s.executions).reverse();
  const bundleById = new Map(data.bundles.map((b) => [b.visit.id, b]));

  return (
    <div className="stack">
      <section className={`card sched-card sched-card--${s.status}`} data-testid="item-status">
        <p className="sched-card__status">
          <span className="sched-dot" aria-hidden="true" /> {SCHEDULE_STATUS_LABELS[s.status]}
        </p>
        <p className="sched-card__due">{dueText(s)}</p>
        <dl className="facts">
          {dueAtText(s) && (
            <div>
              <dt>Следующий раз</dt>
              <dd data-testid="due-at">{dueAtText(s)}</dd>
            </div>
          )}
          <div>
            <dt>Последний раз</dt>
            <dd>{s.last ? executionText(s.last) : '—'}</dd>
          </div>
          <div>
            <dt>Интервал</dt>
            <dd>{itemIntervalText(item)}</dd>
          </div>
          {s.severeUsed && (
            <div>
              <dt>Считается</dt>
              <dd>по тяжёлым условиям</dd>
            </div>
          )}
          <div>
            <dt>Что делать</dt>
            <dd>
              {REGULATION_ACTION_LABELS[item.action]}, {PERFORMER_LABELS[item.performer].toLowerCase()}
            </dd>
          </div>
          {item.source && (
            <div>
              <dt>Откуда</dt>
              <dd data-testid="item-source">{item.source === 'service' ? 'график ТО сервиса' : 'инструкция к автомобилю'}</dd>
            </div>
          )}
          {component && (
            <div>
              <dt>Узел</dt>
              <dd>
                <a href={hrefFor(`/state/component/${component.id}`)}>{component.name}</a>
              </dd>
            </div>
          )}
        </dl>
        {item.note && <p className="hint">{item.note}</p>}
        <div className="btn-row">
          <button type="button" className="btn btn--primary" onClick={() => setMarking(item)}>
            Отметить, когда делалось
          </button>
          <a className="btn btn--secondary" href={hrefFor(`/regulation/${item.id}/edit`)}>
            Изменить пункт
          </a>
        </div>
      </section>

      <LinkSuggestions item={item} bundles={data.bundles} />

      <section className="card" aria-label="Когда делалось">
        <h2 className="card__title">Когда делалось</h2>
        {s.executions.length === 0 ? (
          <p className="hint">
            В истории нет строк, привязанных к этому пункту. Привяжите их в визите (строка → «Подробнее» → «Пункты регламента») или отметьте
            вручную.
          </p>
        ) : (
          <ul className="exec-list" data-testid="executions">
            {s.executions.map((e) => (
              <ExecutionRow
                key={e.visitId ?? e.manualEventId}
                e={e}
                bundle={e.visitId ? bundleById.get(e.visitId) : undefined}
                onUnlink={() => setUnlinking(e)}
                onDelete={() => setDeletingEvent(e)}
              />
            ))}
          </ul>
        )}
        {steps.length > 0 && (
          <>
            <h3 className="card__subtitle">Фактические интервалы</h3>
            <ul className="plain-list" data-testid="intervals">
              {steps.map((step) => (
                <li key={step.from.date + step.to.date}>{stepText(step)}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      <ManualEventDialog item={marking} onClose={() => setMarking(null)} />
      <ConfirmDialog
        open={unlinking !== null}
        title="Отвязать визит?"
        confirmLabel="Отвязать"
        onConfirm={() => {
          if (unlinking?.visitId) void unlinkVisit(getDb(), item.id, unlinking.visitId);
          setUnlinking(null);
        }}
        onCancel={() => setUnlinking(null)}
      >
        <p>Строки визита от {formatDate(unlinking?.date)} перестанут считаться выполнением пункта «{item.name}». Сам визит не изменится.</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={deletingEvent !== null}
        title="Удалить отметку?"
        confirmLabel="Удалить"
        danger
        onConfirm={() => {
          if (deletingEvent?.manualEventId) void deleteManualEvent(getDb(), deletingEvent.manualEventId);
          setDeletingEvent(null);
        }}
        onCancel={() => setDeletingEvent(null)}
      >
        <p>Отметка от {formatDate(deletingEvent?.date)} будет удалена.</p>
      </ConfirmDialog>
    </div>
  );
}

function ExecutionRow({ e, bundle, onUnlink, onDelete }: { e: Execution; bundle: VisitBundle | undefined; onUnlink: () => void; onDelete: () => void }) {
  const scanIds = bundle ? activeDocuments(bundle).flatMap((d) => d.document.scanIds) : [];
  return (
    <li className="exec-row">
      <div className="exec-row__top">
        <span className="exec-row__when">{executionText(e)}</span>
        {e.source === 'visit' ? (
          <button type="button" className="link-btn" onClick={onUnlink}>
            отвязать
          </button>
        ) : (
          <button type="button" className="link-btn" onClick={onDelete}>
            удалить
          </button>
        )}
      </div>
      {e.source === 'visit' && bundle ? (
        <a className="exec-row__link" href={hrefFor(`/history/${bundle.visit.id}`)}>
          {bundle.visit.shop.name || 'Визит'}
          {e.approximate ? ' · пробег по прогнозу' : ''} ›
        </a>
      ) : (
        <span className="hint">Отмечено вручную{e.note ? `: ${e.note}` : ''}</span>
      )}
      {scanIds.length > 0 && <DocumentScans scanIds={scanIds} />}
    </li>
  );
}

/** "Найдено N строк в истории — привязать?" for lines saved before the item existed. */
export function LinkSuggestions({ item, bundles }: { item: RegulationItem; bundles: VisitBundle[] }) {
  const found = useMemo(() => unlinkedMatchingLines(bundles, item), [bundles, item]);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signature = found.map((f) => f.lineId).join(',');
  if (!found.length || dismissed === signature) return null;

  return (
    <section className="notice notice--info stack-sm" data-testid="link-suggestions">
      <p className="notice__title">
        Найдено {found.length} {plural(found.length, 'строка', 'строки', 'строк')} в истории — привязать к пункту?
      </p>
      <ul className="plain-list">
        {found.slice(0, 8).map((f) => (
          <li key={f.lineId}>
            {formatDate(f.date)} — {f.name}
          </li>
        ))}
        {found.length > 8 && <li>…и ещё {found.length - 8}</li>}
      </ul>
      <div className="btn-row">
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void linkLines(
              getDb(),
              item.id,
              found.map((f) => f.lineId),
            ).finally(() => setBusy(false));
          }}
        >
          Привязать
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => setDismissed(signature)}>
          Не сейчас
        </button>
      </div>
    </section>
  );
}
