import { useState } from 'react';
import { hrefFor } from '../../app/routes';
import { formatKm } from '../../core/format';
import { REGULATION_SOURCE_GROUPS } from '../../core/labels';
import type { RegulationItem } from '../../core/model';
import { itemIntervalText } from '../../core/scheduleText';
import { MAP_COLUMNS, mapColumns, mapGroups, stepContents, type MapGroup, type MapRow } from '../../core/serviceMap';
import { Checkbox } from '../../ui/Field';

/** «Карта ТО»: what is replaced and checked at 15, 30 … 150 thousand km, the service's items first. */
export function ServiceMapView({ items }: { items: readonly RegulationItem[] }) {
  const [onlyReplace, setOnlyReplace] = useState(false);
  const columns = mapColumns();
  const groups = mapGroups(items);
  const showTitles = groups.length > 1 || groups[0]?.key !== 'none';

  const rows = (g: MapGroup) => [...g.replace, ...(onlyReplace ? [] : g.inspect)];

  return (
    <div className="stack" data-testid="service-map">
      <p className="hint">
        Как в сервисной книжке: ТО каждые {formatKm(15000)} или 12 месяцев, считая от нового автомобиля. <strong>З</strong> — замена, П — проверка.
        Интервал не кратный 15 000 км поставлен на ТО раньше срока. Сколько осталось по вашей истории — на главном экране.
      </p>
      <Checkbox label="Только замены" checked={onlyReplace} onChange={setOnlyReplace} />

      <div className="map-scroll" role="region" aria-label="Карта ТО по пробегу" tabIndex={0}>
        <table className="map-table">
          <thead>
            <tr>
              <th scope="col" className="map-table__name">
                тыс. км
                <span className="map-table__sub">месяцы</span>
              </th>
              {columns.map((c) => (
                <th key={c.step} scope="col">
                  {c.km / 1000}
                  <span className="map-table__sub">{c.months}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <GroupRows key={g.key} title={showTitles ? REGULATION_SOURCE_GROUPS[g.key] : null} rows={rows(g)} />
            ))}
          </tbody>
        </table>
      </div>

      <section className="stack-sm" aria-label="По каждому ТО">
        <h2 className="card__title">Что делать на каждом ТО</h2>
        {columns.map((c) => {
          const s = stepContents(groups, c.step);
          const inspect = onlyReplace ? [] : s.inspect;
          if (!s.replace.length && !inspect.length) return null;
          return (
            <details key={c.step} className="card map-step" data-testid={`map-step-${c.step}`}>
              <summary>
                <span className="map-step__km">
                  {formatKm(c.km)} · {c.months} мес
                </span>
                <span className="muted">
                  — замена: {s.replace.length}
                  {onlyReplace ? '' : `, проверка: ${inspect.length}`}
                </span>
              </summary>
              {s.replace.length > 0 && (
                <>
                  <h3 className="map-step__sub">Заменить</h3>
                  <ul className="plain-list">
                    {s.replace.map((i) => (
                      <li key={i.id}>
                        <a href={hrefFor(`/regulation/${i.id}`)}>{i.name}</a>
                        {i.source === 'instruction' && <span className="tag tag--muted">инструкция</span>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {inspect.length > 0 && (
                <>
                  <h3 className="map-step__sub">Проверить</h3>
                  <ul className="plain-list">
                    {inspect.map((i) => (
                      <li key={i.id}>
                        <a href={hrefFor(`/regulation/${i.id}`)}>{i.name}</a>
                        {i.source === 'instruction' && <span className="tag tag--muted">инструкция</span>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </details>
          );
        })}
      </section>
    </div>
  );
}

function GroupRows({ title, rows }: { title: string | null; rows: MapRow[] }) {
  if (!rows.length) return null;
  return (
    <>
      {title && (
        <tr className="map-table__group">
          <th scope="rowgroup" colSpan={MAP_COLUMNS + 1}>
            {title}
          </th>
        </tr>
      )}
      {rows.map(({ item, steps }) => (
        <tr key={item.id} className={item.action === 'replace' ? 'map-row--replace' : 'map-row--inspect'}>
          <th scope="row" className="map-table__name">
            <a href={hrefFor(`/regulation/${item.id}`)}>{item.name}</a>
            {!steps.length && <span className="map-table__sub">{itemIntervalText(item)}</span>}
          </th>
          {Array.from({ length: MAP_COLUMNS }, (_, i) => {
            const on = steps.includes(i + 1);
            return (
              <td key={i} className={on ? 'map-cell map-cell--on' : 'map-cell'}>
                {on ? (item.action === 'replace' ? 'З' : 'П') : ''}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
