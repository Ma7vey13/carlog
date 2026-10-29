import { useState } from 'react';
import { hrefFor, type Route } from '../../app/routes';
import { formatDate, formatKm, formatLocalDateTime, plural } from '../../core/format';
import { SCHEDULE_STATUS_LABELS } from '../../core/labels';
import type { RegulationItem } from '../../core/model';
import type { CurrentMileage, ItemSchedule } from '../../core/schedule';
import { dueText } from '../../core/scheduleText';
import { parseKm } from '../../core/visitForm';
import { isMileageStale } from '../../core/mileage';
import { serviceList } from '../../core/serviceList';
import { getDb } from '../../db/db';
import { useOpenDraftCount, useRepairs } from '../../db/hooks';
import { openRepairs } from '../../core/repairs';
import { addManualMileage } from '../../db/visits';
import { EmptyState } from '../../ui/EmptyState';
import { RegulationIcon } from '../../ui/icons';
import { selfCheckText, type SelfCheckStatus } from '../../core/selfCheck';
import type { TermStatus } from '../../core/termDocs';
import { useSyncState, useUnsentCount } from '../sync/SyncPanel';
import { useSession } from '../../sync/session';
import { ItemKindTag, SelfTag } from '../history/PurposeTags';
import { SelfCheckScreen, useSelfCheck } from './SelfCheckScreen';
import { TermDocsScreen, TermRow, useTermStatuses } from './TermDocsScreen';
import { ComponentCard } from './ComponentCard';
import { ItemCard } from './ItemCard';
import { ManualEventDialog } from './ManualEventDialog';
import { RepairRow, RepairsScreen } from './RepairsScreen';
import { ServiceListScreen } from './ServiceListScreen';
import { useSchedule } from './useSchedule';

/** Home tab: `/`, `/state/item/<id>`, `/state/component/<id>`, `/state/self-check[/…]`, `/state/docs[/…]`, `/state/service-list`, `/state/repairs[/…]`. */
export function StateScreen({ route }: { route: Route }) {
  const [kind, id, action] = route.rest;
  if (kind === 'item' && id) return <ItemCard id={id} backHref={hrefFor('/')} />;
  if (kind === 'component' && id) return <ComponentCard id={id} />;
  if (kind === 'self-check') return <SelfCheckScreen id={id ?? null} />;
  if (kind === 'docs') return <TermDocsScreen id={id ?? null} edit={action === 'edit'} />;
  if (kind === 'service-list') return <ServiceListScreen />;
  if (kind === 'repairs') return <RepairsScreen id={id ?? null} />;
  return <StateHome />;
}

/**
 * SPEC section 9, top to bottom: mileage → red and yellow items → documents with an end date that
 * is near or past → self-check that is due → inbox → sync status → green items, collapsed.
 */
function StateHome() {
  const data = useSchedule();
  const terms = useTermStatuses();
  const checks = useSelfCheck();
  const inbox = useOpenDraftCount();
  const repairs = useRepairs();
  const [marking, setMarking] = useState<RegulationItem | null>(null);

  if (!data || !terms || !checks || !repairs) return <p className="muted">Загрузка…</p>;

  const termAlerts = terms.filter((t) => t.state === 'expired' || t.state === 'soon');

  const urgent = data.items.filter((s) => s.status === 'red' || s.status === 'yellow');
  const gray = data.items.filter((s) => s.status === 'gray');
  const green = data.items.filter((s) => s.status === 'green');
  const forService = serviceList(data.items, checks).length;
  const toRepair = openRepairs(repairs);

  return (
    <div className="stack">
      <MileageCard current={data.current} today={data.today} />

      {data.regulation.length === 0 ? (
        <EmptyState icon={<RegulationIcon />} title="Регламент пуст">
          <p>Добавьте пункты ТО с интервалами — и здесь появится, что и когда менять.</p>
          <a className="btn btn--primary" href={hrefFor('/regulation/new')}>
            Добавить пункт
          </a>
        </EmptyState>
      ) : urgent.length > 0 ? (
        <section className="card" aria-label="Пора заняться">
          <h2 className="card__title">Пора заняться</h2>
          <ul className="sched-list">
            {urgent.map((s) => (
              <ScheduleRow key={s.item.id} s={s} />
            ))}
          </ul>
          {forService > 0 && (
            <a className="btn btn--secondary" href={hrefFor('/state/service-list')} data-testid="service-list-button">
              Список к ТО
            </a>
          )}
        </section>
      ) : (
        <p className="notice notice--info" data-testid="all-ok">
          Ничего срочного: все пункты с данными в порядке.
        </p>
      )}

      {toRepair.length > 0 && (
        <section className="card" aria-label="Нужно отремонтировать" data-testid="repairs-card">
          <div className="card__head">
            <h2 className="card__title">Нужно отремонтировать</h2>
            <a className="btn btn--ghost btn--small card__head-action" href={hrefFor('/state/repairs/new')} aria-label="Добавить ремонт">
              + Добавить
            </a>
          </div>
          <ul className="sched-list">
            {toRepair.map((r) => (
              <RepairRow key={r.id} r={r} />
            ))}
          </ul>
        </section>
      )}

      {termAlerts.length > 0 && (
        <section className="card" aria-label="Документы со сроком" data-testid="term-alerts">
          <h2 className="card__title">Документы</h2>
          <ul className="sched-list">
            {termAlerts.map((t) => (
              <TermRow key={t.doc.id} s={t} />
            ))}
          </ul>
        </section>
      )}

      <SelfCheckCard checks={checks} />

      {inbox > 0 && (
        <a className="notice notice--warning notice--link" href={hrefFor('/inbox')} data-testid="inbox-line">
          Входящие: {inbox} {plural(inbox, 'черновик ждёт', 'черновика ждут', 'черновиков ждут')} проверки
          <span aria-hidden="true">›</span>
        </a>
      )}

      <SyncLine />

      {gray.length > 0 && (
        <details className="card sched-group" data-testid="gray-items">
          <summary>Нет данных: {gray.length}</summary>
          <p className="hint">Отметьте, когда это делалось в последний раз, — и срок посчитается.</p>
          <ul className="sched-list">
            {gray.map((s) => (
              <ScheduleRow key={s.item.id} s={s} onMark={s.grayReason === 'no-data' ? () => setMarking(s.item) : undefined} />
            ))}
          </ul>
        </details>
      )}

      {green.length > 0 && (
        <details className="card sched-group" data-testid="green-items">
          <summary>В порядке: {green.length}</summary>
          <ul className="sched-list">
            {green.map((s) => (
              <ScheduleRow key={s.item.id} s={s} />
            ))}
          </ul>
        </details>
      )}

      <section className="card" aria-label="Ещё">
        <a className="menu-link" href={hrefFor('/state/service-list')} data-testid="service-list-link">
          <span>Список к следующему ТО</span>
          <span className="muted">{forService ? `${forService} ${plural(forService, 'пункт', 'пункта', 'пунктов')}` : 'пусто'} ›</span>
        </a>
        <a className="menu-link" href={hrefFor('/state/repairs')} data-testid="repairs-link">
          <span>Нужно отремонтировать</span>
          <span className="muted">{toRepair.length ? `${toRepair.length} ${plural(toRepair.length, 'запись', 'записи', 'записей')}` : 'нет'} ›</span>
        </a>
        <a className="menu-link" href={hrefFor('/state/self-check')}>
          <span>Самопроверка</span>
          <span className="muted">
            в норме {checks.filter((c) => c.state === 'ok').length} из {checks.length} ›
          </span>
        </a>
        <a className="menu-link" href={hrefFor('/state/docs')} data-testid="docs-link">
          <span>Документы со сроком</span>
          <span className="muted">{docsSummary(terms)} ›</span>
        </a>
      </section>

      {data.settings.severeConditions && (
        <p className="hint">
          Сроки считаются по интервалам для тяжёлых условий. <a href={hrefFor('/more/schedule')}>Настройки расчёта</a>
        </p>
      )}

      <ManualEventDialog item={marking} onClose={() => setMarking(null)} />
    </div>
  );
}

export function ScheduleRow({ s, onMark, backTo }: { s: ItemSchedule; onMark?: (() => void) | undefined; backTo?: 'regulation' }) {
  const href = backTo === 'regulation' ? hrefFor(`/regulation/${s.item.id}`) : hrefFor(`/state/item/${s.item.id}`);
  return (
    <li className={`sched-row sched-row--${s.status}`} data-testid="sched-row" data-status={s.status}>
      <a className="sched-row__link" href={href}>
        <span className="sched-dot" aria-hidden="true" />
        <span className="sched-row__body">
          <span className="sched-row__name">
            {s.item.name}
            <ItemKindTag item={s.item} />
          </span>
          <span className="sched-row__due">
            <span className="visually-hidden">{SCHEDULE_STATUS_LABELS[s.status]}: </span>
            {dueText(s)}
          </span>
        </span>
        <span className="muted" aria-hidden="true">
          ›
        </span>
      </a>
      {onMark && (
        <button type="button" className="btn btn--secondary btn--small" onClick={onMark}>
          Отметить
        </button>
      )}
    </li>
  );
}

/** The last odometer reading (no forecast, D-088) with the quick "Обновить пробег" field. */
function MileageCard({ current, today }: { current: CurrentMileage | null; today: string }) {
  const [km, setKm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    const value = parseKm(km);
    if (value === null) {
      setError('Целое число километров, например 310500');
      return;
    }
    if (current && value < current.km) {
      setError(`Меньше прошлой отметки (${formatKm(current.km)} от ${formatDate(current.date)}). Ошибочную отметку можно удалить в «Истории».`);
      return;
    }
    await addManualMileage(getDb(), today, value);
    setKm('');
    setError(null);
    setSaved(true);
  };

  return (
    <section className="card mileage-card" aria-label="Пробег">
      <p className="mileage-card__label">Пробег</p>
      <p className="mileage-card__km" data-testid="current-km">
        {current ? formatKm(current.km) : 'не отмечен'}
      </p>
      {current && (
        <p className="hint" data-testid="mileage-basis">
          {current.date === today ? 'Отмечен сегодня' : `Отмечен ${formatDate(current.date)}`}
        </p>
      )}
      {current && !saved && isMileageStale(current.date, today) && (
        <p className="mileage-card__stale" data-testid="mileage-stale">
          Пробег не обновляли больше месяца. Введите показания одометра — сроки по пробегу посчитаются точнее.
        </p>
      )}
      <form
        className="mileage-card__form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="visually-hidden" htmlFor="quick-km">
          Обновить пробег, км
        </label>
        <input
          id="quick-km"
          className="input"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Обновить пробег, км"
          value={km}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'quick-km-error' : undefined}
          onChange={(e) => {
            setKm(e.target.value);
            setSaved(false);
            setError(null);
          }}
        />
        <button type="submit" className="btn btn--primary" disabled={!km.trim()}>
          Сохранить
        </button>
      </form>
      {error && (
        <p className="inline-error" id="quick-km-error" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="hint" role="status">
          Пробег отмечен на сегодня.
        </p>
      )}
    </section>
  );
}

function SyncLine() {
  const s = useSyncState();
  const unsent = useUnsentCount(s);
  const session = useSession();
  if (!s) return null;
  if (!s.config) {
    return (
      <a className="menu-link card" href={hrefFor('/more/sync')} data-testid="sync-line">
        <span>Синхронизация не настроена</span>
        <span className="muted" aria-hidden="true">
          ›
        </span>
      </a>
    );
  }
  const parts = [s.lastPush ? `отправлено ${formatLocalDateTime(s.lastPush.at)}` : 'ещё не отправляли'];
  if (unsent) parts.push(`не отправлено изменений: ${unsent}`);
  if (s.autoSync && !session.key) parts.push('сама не отправится: введите пароль');
  return (
    <a className="menu-link card" href={hrefFor('/more/sync')} data-testid="sync-line">
      <span>Синхронизация: {parts.join(' · ')}</span>
      <span className="muted" aria-hidden="true">
        ›
      </span>
    </a>
  );
}

/** Self-check on the main screen: "Нужно внимание" items one by one, due ones as a summary. */
function SelfCheckCard({ checks }: { checks: SelfCheckStatus[] }) {
  const attention = checks.filter((c) => c.state === 'attention');
  const due = checks.filter((c) => c.state === 'due');
  if (!attention.length && !due.length) return null;
  return (
    <section className="card" aria-label="Самопроверка" data-testid="self-check-card">
      <h2 className="card__title">Самопроверка</h2>
      <ul className="sched-list">
        {attention.map((c) => (
          <li key={c.item.id} className="sched-row sched-row--red" data-testid="attention-row">
            <a className="sched-row__link" href={hrefFor(`/state/self-check/${c.item.id}`)}>
              <span className="sched-dot" aria-hidden="true" />
              <span className="sched-row__body">
                <span className="sched-row__name">
                  {c.item.name}
                  <SelfTag />
                </span>
                <span className="sched-row__due">{selfCheckText(c)}</span>
              </span>
              <span className="muted" aria-hidden="true">
                ›
              </span>
            </a>
          </li>
        ))}
        {due.length > 0 && (
          <li className="sched-row sched-row--yellow" data-testid="due-row">
            <a className="sched-row__link" href={hrefFor('/state/self-check')}>
              <span className="sched-dot" aria-hidden="true" />
              <span className="sched-row__body">
                <span className="sched-row__name">
                  Пора проверить: {due.length} {plural(due.length, 'пункт', 'пункта', 'пунктов')}
                  <SelfTag />
                </span>
                <span className="sched-row__due">
                  {due
                    .slice(0, 3)
                    .map((c) => c.item.name.replace(/\s*\(.*\)$/, ''))
                    .join(', ')}
                  {due.length > 3 ? '…' : ''}
                </span>
              </span>
              <span className="muted" aria-hidden="true">
                ›
              </span>
            </a>
          </li>
        )}
      </ul>
    </section>
  );
}

function docsSummary(terms: TermStatus[]): string {
  const osago = terms.find((t) => t.doc.kind === 'osago' && t.state !== 'replaced');
  if (osago?.doc.endDate) return `ОСАГО до ${formatDate(osago.doc.endDate)}`;
  const current = terms.filter((t) => t.state !== 'replaced').length;
  return current ? `${current} шт.` : 'не внесены';
}
