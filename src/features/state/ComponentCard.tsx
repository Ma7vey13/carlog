import { useMemo } from 'react';
import { usePageHeader } from '../../app/pageHeader';
import { hrefFor } from '../../app/routes';
import type { Id } from '../../core/model';
import { actualIntervals, componentHistory } from '../../core/schedule';
import { executionText, stepText } from '../../core/scheduleText';
import { componentSubtree } from '../../core/search';
import { useComponents } from '../../db/hooks';
import { ScheduleRow } from './StateScreen';
import { useSchedule } from './useSchedule';

/** Component card: its regulation items and everything done to it, part by part, with actual intervals. */
export function ComponentCard({ id }: { id: Id }) {
  const data = useSchedule();
  const components = useComponents();
  const component = components?.find((c) => c.id === id);
  usePageHeader(component?.name ?? 'Узел', hrefFor('/'));

  const ids = useMemo(() => (components ? componentSubtree(id, components) : new Set<Id>()), [components, id]);
  const parts = useMemo(() => (data ? componentHistory(ids, data.bundles, data.points) : []), [data, ids]);

  if (!data || !components) return <p className="muted">Загрузка…</p>;
  if (!component) {
    return (
      <p>
        Узел не найден. <a href={hrefFor('/')}>На главную</a>
      </p>
    );
  }

  const items = data.items.filter((s) => s.item.componentId && ids.has(s.item.componentId));

  return (
    <div className="stack">
      {items.length > 0 && (
        <section className="card" aria-label="Пункты регламента">
          <h2 className="card__title">Пункты регламента</h2>
          <ul className="sched-list">
            {items.map((s) => (
              <ScheduleRow key={s.item.id} s={s} />
            ))}
          </ul>
        </section>
      )}

      <section className="card" aria-label="Что делалось">
        <h2 className="card__title">Что делалось</h2>
        {parts.length === 0 ? (
          <p className="hint">В истории нет строк с этим узлом.</p>
        ) : (
          <ul className="part-history" data-testid="part-history">
            {parts.map((p) => {
              const steps = actualIntervals(p.executions).reverse();
              return (
                <li key={p.key}>
                  <p className="part-history__name">{p.name}</p>
                  <ul className="plain-list">
                    {steps.length > 0
                      ? steps.map((step) => <li key={step.from.date + step.to.date}>{stepText(step)}</li>)
                      : p.executions.map((e) => (
                          <li key={e.visitId}>
                            <a href={hrefFor(`/history/${e.visitId}`)}>{executionText(e)}</a>
                          </li>
                        ))}
                  </ul>
                  {steps.length > 0 && (
                    <p className="hint">
                      Визиты:{' '}
                      {p.executions.map((e, i) => (
                        <span key={e.visitId}>
                          {i > 0 && ', '}
                          <a href={hrefFor(`/history/${e.visitId}`)}>{executionText(e)}</a>
                        </span>
                      ))}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
