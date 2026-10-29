import { useMemo, useState } from 'react';
import { usePageHeader } from '../../app/pageHeader';
import { hrefFor } from '../../app/routes';
import { formatDate, formatKm, groupThousands } from '../../core/format';
import { SERVICE_LIST_GROUP_TITLES, SERVICE_LIST_HORIZON, serviceList, serviceListText, type ServiceListEntry } from '../../core/serviceList';
import { copyText } from '../../scan/share';
import { useSelfCheck } from './SelfCheckScreen';
import { useSchedule } from './useSchedule';

const HORIZON_TEXT = `${groupThousands(SERVICE_LIST_HORIZON.km)} км или ${SERVICE_LIST_HORIZON.days / 30} месяца`;

/** `/state/service-list`: what to replace and what to check at the next service visit (D-093). */
export function ServiceListScreen() {
  usePageHeader('Список к ТО', hrefFor('/'));
  const data = useSchedule();
  const checks = useSelfCheck();
  const entries = useMemo(() => (data && checks ? serviceList(data.items, checks) : undefined), [data, checks]);
  const [off, setOff] = useState<ReadonlySet<string>>(new Set());
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null);

  if (!data || !entries) return <p className="muted">Загрузка…</p>;

  const chosen = entries.filter((e) => !off.has(e.id));
  const text = serviceListText(chosen);
  const toggle = (id: string) => {
    const next = new Set(off);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOff(next);
    setCopied(null);
  };

  return (
    <div className="stack service-list">
      <div className="print-only service-list__print-head">
        <p className="service-list__print-title">Список к ТО</p>
        <p>
          {formatDate(data.today)}
          {data.current ? `, пробег ${formatKm(data.current.km)}` : ''}
        </p>
      </div>

      <p className="hint no-print">
        Что подойдёт в ближайшие {HORIZON_TEXT}, и что вы отметили в самопроверке как «Нужно внимание». Пункты, которые вы делаете сами, сюда не
        входят. Снимите галочку с того, что делать не нужно.
      </p>

      {entries.length === 0 ? (
        <p className="notice notice--info" data-testid="service-list-empty">
          В ближайшие {HORIZON_TEXT} ничего не подходит.
        </p>
      ) : (
        <>
          {(['replace', 'inspect'] as const).map((group) => (
            <ServiceGroup key={group} title={SERVICE_LIST_GROUP_TITLES[group]} entries={entries.filter((e) => e.group === group)} off={off} onToggle={toggle} />
          ))}

          <div className="btn-row no-print">
            <button
              type="button"
              className="btn btn--primary"
              disabled={chosen.length === 0}
              onClick={() => void copyText(text).then((ok) => setCopied(ok ? 'ok' : 'failed'))}
            >
              Скопировать
            </button>
            <button type="button" className="btn btn--secondary" disabled={chosen.length === 0} onClick={() => window.print()}>
              Распечатать
            </button>
          </div>
          {copied === 'ok' && (
            <p className="hint no-print" role="status" data-testid="service-list-copied">
              Список скопирован — вставьте его в сообщение.
            </p>
          )}
          {copied === 'failed' && (
            <div className="stack-sm no-print">
              <p className="inline-error" role="alert">
                Браузер не дал скопировать. Выделите текст ниже и скопируйте вручную.
              </p>
              <textarea className="input" readOnly rows={Math.min(14, text.split('\n').length + 1)} value={text} onFocus={(e) => e.currentTarget.select()} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ServiceGroup({ title, entries, off, onToggle }: { title: string; entries: ServiceListEntry[]; off: ReadonlySet<string>; onToggle: (id: string) => void }) {
  if (entries.length === 0) return null;
  return (
    <section className={`card service-list__group${entries.every((e) => off.has(e.id)) ? ' no-print' : ''}`} aria-label={title} data-testid="service-group">
      <h2 className="card__title">{title}</h2>
      <ul className="service-items">
        {entries.map((e) => (
          <li key={e.id} className={`service-item service-item--${e.status}${off.has(e.id) ? ' service-item--off' : ''}`} data-testid="service-item">
            <label className="service-item__label">
              <input type="checkbox" className="no-print" checked={!off.has(e.id)} onChange={() => onToggle(e.id)} />
              <span className="service-item__text">
                <span className="service-item__name">
                  {e.name}
                  {e.note && <span className="service-item__note"> — {e.note}</span>}
                </span>
                <span className="service-item__reason no-print">
                  <span className="sched-dot" aria-hidden="true" />
                  {e.reason}
                </span>
              </span>
            </label>
            <a className="service-item__more no-print" href={hrefFor(e.path)} aria-label={`Открыть: ${e.name}`}>
              ›
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
