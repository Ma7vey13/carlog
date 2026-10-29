import { useMemo, useState } from 'react';
import { hrefFor, type Route } from '../../app/routes';
import { todayIso } from '../../core/dates';
import { allExpenses, EXPENSE_KIND_LABELS, EXPENSE_KINDS, expenseYears, MIN_KM_FOR_RATE, summarize, type ByKind, type ExpensePeriod } from '../../core/expenses';
import { formatDate, formatKm, plural } from '../../core/format';
import { mileagePoints } from '../../core/mileage';
import { formatRub } from '../../core/money';
import { regulationById } from '../../core/purpose';
import { useComponents, useMileage, useRegulationItems, useVisitBundles } from '../../db/hooks';
import { EmptyState } from '../../ui/EmptyState';
import { ExpensesIcon } from '../../ui/icons';

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const NODES_SHOWN = 8;

/** "Расходы" tab (D-095): what the car cost by year and month, ТО against ремонт, by node, per km. */
export function ExpensesScreen(_props: { route: Route }) {
  const bundles = useVisitBundles();
  const regulation = useRegulationItems();
  const mileage = useMileage();
  const components = useComponents();
  const expenses = useMemo(() => (bundles && regulation ? allExpenses(bundles, regulationById(regulation)) : undefined), [bundles, regulation]);
  const points = useMemo(() => (mileage ? mileagePoints(mileage) : undefined), [mileage]);
  const [picked, setPicked] = useState<ExpensePeriod | null>(null);

  if (!expenses || !points) return <p className="muted">Загрузка…</p>;
  if (expenses.length === 0) {
    return (
      <EmptyState icon={<ExpensesIcon />} title="Расходов пока нет">
        <p>Здесь появятся траты на машину по годам и месяцам, когда в «Истории» будут визиты с суммами.</p>
        <a className="btn btn--primary" href={hrefFor('/history/new')}>
          Добавить визит
        </a>
      </EmptyState>
    );
  }

  const years = expenseYears(expenses);
  const thisYear = Number(todayIso().slice(0, 4));
  const period: ExpensePeriod = picked ?? (years.includes(thisYear) ? thisYear : years[0]!);
  const s = summarize(expenses, period, points);
  const names = new Map((components ?? []).map((c) => [c.id, c.name]));
  const maxBucket = Math.max(...s.buckets.map((b) => b.total), 1);
  const maxNode = Math.max(...s.byNode.map((n) => n.total), 1);
  const periodText = period === 'all' ? 'за всё время' : `за ${period} год`;

  return (
    <div className="stack expenses">
      <div className="field expenses__period">
        <label htmlFor="expenses-period">Период</label>
        <select
          id="expenses-period"
          className="input"
          value={String(period)}
          onChange={(e) => setPicked(e.target.value === 'all' ? 'all' : Number(e.target.value))}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y} год
            </option>
          ))}
          <option value="all">Всё время</option>
        </select>
      </div>

      <section className="card" aria-label="Итого" data-testid="expenses-total">
        <p className="mileage-card__label">Потрачено {periodText}</p>
        <p className="expenses__total">{formatRub(s.total)}</p>
        <p className="hint">
          {s.visits} {plural(s.visits, 'визит', 'визита', 'визитов')}
          {s.km !== null ? ` · проехали ${formatKm(s.km)}` : ''}
        </p>
        {s.total > 0 && <KindBar byKind={s.byKind} total={s.total} />}
        <dl className="expenses__kinds">
          {EXPENSE_KINDS.filter((k) => s.byKind[k] !== 0).map((k) => (
            <div key={k} className={`expenses__kind expenses__kind--${k}`} data-testid={`expenses-${k}`}>
              <dt>
                <span className="expenses__swatch" aria-hidden="true" />
                {EXPENSE_KIND_LABELS[k]}
              </dt>
              <dd>
                {formatRub(s.byKind[k])}
                <span className="muted"> · {percent(s.byKind[k], s.total)}</span>
              </dd>
            </div>
          ))}
        </dl>
        {s.byKind.other !== 0 && <p className="hint">«Другое» — покупки без установки и суммы, которые не отнести ни к ТО, ни к ремонту.</p>}
        <p className="expenses__per-km" data-testid="expenses-per-km">
          {s.perKm !== null ? (
            <>
              Километр обошёлся в <strong>{formatRub(s.perKm)}</strong>
            </>
          ) : (
            <span className="hint">Цена километра появится, когда за период будет хотя бы {formatKm(MIN_KM_FOR_RATE)} по отметкам пробега.</span>
          )}
        </p>
      </section>

      <section className="card" aria-label={period === 'all' ? 'По годам' : 'По месяцам'}>
        <h2 className="card__title">{period === 'all' ? 'По годам' : 'По месяцам'}</h2>
        <ul className="bars" data-testid="expenses-buckets">
          {s.buckets.map((b) => (
            <li key={b.key} className="bars__row">
              <span className="bars__label">{period === 'all' ? b.key : MONTHS[Number(b.key.slice(5)) - 1]}</span>
              <span className="bars__track" aria-hidden="true">
                {EXPENSE_KINDS.map((k) =>
                  b.byKind[k] > 0 ? <span key={k} className={`bars__fill bars__fill--${k}`} style={{ width: `${(b.byKind[k] / maxBucket) * 100}%` }} /> : null,
                )}
              </span>
              <span className={b.total ? 'bars__value' : 'bars__value muted'}>{b.total ? formatRub(b.total) : '—'}</span>
            </li>
          ))}
        </ul>
      </section>

      {s.byNode.length > 0 && (
        <section className="card" aria-label="По узлам">
          <h2 className="card__title">По узлам</h2>
          <ul className="bars bars--wide" data-testid="expenses-nodes">
            {s.byNode.slice(0, NODES_SHOWN).map((n) => (
              <NodeRow key={n.componentId ?? 'none'} name={nodeName(n.componentId, names)} total={n.total} max={maxNode} />
            ))}
          </ul>
          {s.byNode.length > NODES_SHOWN && (
            <details className="installed__older">
              <summary>Остальные: {s.byNode.length - NODES_SHOWN}</summary>
              <ul className="bars bars--wide">
                {s.byNode.slice(NODES_SHOWN).map((n) => (
                  <NodeRow key={n.componentId ?? 'none'} name={nodeName(n.componentId, names)} total={n.total} max={maxNode} />
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {s.top.length > 0 && (
        <section className="card" aria-label="Самые дорогие визиты">
          <h2 className="card__title">Самые дорогие визиты</h2>
          <ul className="sched-list" data-testid="expenses-top">
            {s.top.map((e) => (
              <li key={e.visitId} className="sched-row">
                <a className="sched-row__link" href={hrefFor(`/history/${e.visitId}`)}>
                  <span className="sched-row__body">
                    <span className="sched-row__name">{formatDate(e.date)}</span>
                    <span className="sched-row__due">{e.self ? 'Своя работа' : e.shop || 'Сервис'}</span>
                  </span>
                  <span className="expenses__visit-sum">{formatRub(e.total)}</span>
                  <span className="muted" aria-hidden="true">
                    ›
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="hint">Считается по визитам в «Истории»: итог документа, если он указан, иначе сумма строк. Скидка делится между строками.</p>
    </div>
  );
}

function KindBar({ byKind, total }: { byKind: ByKind; total: number }) {
  return (
    <span className="kind-bar" aria-hidden="true">
      {EXPENSE_KINDS.map((k) => (byKind[k] > 0 ? <span key={k} className={`bars__fill bars__fill--${k}`} style={{ width: `${(byKind[k] / total) * 100}%` }} /> : null))}
    </span>
  );
}

function NodeRow({ name, total, max }: { name: string; total: number; max: number }) {
  return (
    <li className="bars__row">
      <span className="bars__label">{name}</span>
      <span className="bars__track" aria-hidden="true">
        <span className="bars__fill bars__fill--node" style={{ width: `${Math.max(0, total / max) * 100}%` }} />
      </span>
      <span className="bars__value">{formatRub(total)}</span>
    </li>
  );
}

function nodeName(id: string | null, names: ReadonlyMap<string, string>): string {
  if (id === null) return 'Без узла';
  return names.get(id) ?? 'Удалённый узел';
}

function percent(part: number, total: number): string {
  if (total <= 0) return '0 %';
  const p = (part / total) * 100;
  return `${p > 0 && p < 1 ? '<1' : Math.round(p)} %`;
}
