import { useMemo, useState } from 'react';
import { usePageHeader } from '../../app/pageHeader';
import { hrefFor } from '../../app/routes';
import { formatDate, formatKm, groupThousands } from '../../core/format';
import { openRepairs } from '../../core/repairs';
import { repairEntries, SERVICE_LIST_GROUP_TITLES, SERVICE_LIST_HORIZON, serviceList, serviceListText, type ServiceListEntry } from '../../core/serviceList';
import { useRepairs } from '../../db/hooks';
import { copyText } from '../../scan/share';
import { useSelfCheck } from './SelfCheckScreen';
import { useSchedule } from './useSchedule';

const HORIZON_TEXT = `${groupThousands(SERVICE_LIST_HORIZON.km)} км или ${SERVICE_LIST_HORIZON.days / 30} месяца`;

/**
 * `/state/service-list`: what to replace and what to check at the next service visit (D-093).
 * Open repairs can be picked to go along as "Отремонтировать" (D-097); none is picked at first.
 */
export function ServiceListScreen() {
  usePageHeader('Список к ТО', hrefFor('/'));
  const data = useSchedule();
  const checks = useSelfCheck();
  const repairs = useRepairs();
  const entries = useMemo(() => (data && checks ? serviceList(data.items, checks) : undefined), [data, checks]);
  const repairList = useMemo(() => (repairs ? repairEntries(openRepairs(repairs)) : undefined), [repairs]);
  const [off, setOff] = useState<ReadonlySet<string>>(new Set());
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null);

  if (!data || !entries || !repairList) return <p className="muted">Загрузка…</p>;

  const chosen = [...entries.filter((e) => !off.has(e.id)), ...repairList.filter((e) => picked.has(e.id))];
  const text = serviceListText(chosen);
  const toggle = (set: ReadonlySet<string>, save: (s: ReadonlySet<string>) => void) => (id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    save(next);
    setCopied(null);
  };
  const toggleOff = toggle(off, setOff);
  const togglePicked = toggle(picked, setPicked);

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

      {entries.length === 0 && (
        <p className="notice notice--info no-print" data-testid="service-list-empty">
          В ближайшие {HORIZON_TEXT} по регламенту ничего не подходит.
        </p>
      )}

      {(['replace', 'inspect'] as const).map((group) => (
        <ServiceGroup
          key={group}
          title={SERVICE_LIST_GROUP_TITLES[group]}
          entries={entries.filter((e) => e.group === group)}
          isOn={(id) => !off.has(id)}
          offClass="service-item--off"
          onToggle={toggleOff}
        />
      ))}

      {repairList.length > 0 && (
        <ServiceGroup
          title={SERVICE_LIST_GROUP_TITLES.repair}
          screenTitle="Добавить из «Нужно отремонтировать»"
          hint="Отметьте ремонт, который тоже нужно сделать в этот раз, — он добавится в список."
          entries={repairList}
          isOn={(id) => picked.has(id)}
          offClass="service-item--unpicked"
          onToggle={togglePicked}
          testId="repair-picker"
        />
      )}

      {entries.length > 0 || repairList.length > 0 ? (
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
      ) : null}
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
    </div>
  );
}

interface GroupProps {
  /** As printed and copied. */
  title: string;
  /** On screen, when it differs. */
  screenTitle?: string;
  hint?: string;
  entries: ServiceListEntry[];
  isOn: (id: string) => boolean;
  /** Class of a row that is not in the list: struck out, or just not picked. Either is not printed. */
  offClass: string;
  onToggle: (id: string) => void;
  testId?: string;
}

function ServiceGroup({ title, screenTitle, hint, entries, isOn, offClass, onToggle, testId = 'service-group' }: GroupProps) {
  if (entries.length === 0) return null;
  const printed = entries.some((e) => isOn(e.id));
  return (
    <section className={`card service-list__group${printed ? '' : ' no-print'}`} aria-label={screenTitle ?? title} data-testid={testId}>
      {screenTitle ? (
        <>
          <h2 className="card__title no-print">{screenTitle}</h2>
          <h2 className="card__title print-only">{title}</h2>
        </>
      ) : (
        <h2 className="card__title">{title}</h2>
      )}
      {hint && <p className="hint no-print">{hint}</p>}
      <ul className="service-items">
        {entries.map((e) => (
          <li key={e.id} className={`service-item service-item--${e.status}${isOn(e.id) ? '' : ` ${offClass}`}`} data-testid="service-item">
            <label className="service-item__label">
              <input type="checkbox" className="no-print" checked={isOn(e.id)} onChange={() => onToggle(e.id)} />
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
