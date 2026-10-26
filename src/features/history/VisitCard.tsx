import { useMemo, useState } from 'react';
import { usePageHeader } from '../../app/pageHeader';
import { hrefFor } from '../../app/routes';
import { sumLines, totalsMismatches, visitTotal, type TotalsMismatch } from '../../core/bundle';
import { formatDate, formatKm } from '../../core/format';
import { documentTitle, LINE_KIND_LABELS, positionLabel, totalsMismatchText, VISIT_KIND_LABELS } from '../../core/labels';
import type { Component, Id, LineItem } from '../../core/model';
import { formatQty, formatRub } from '../../core/money';
import { getDb } from '../../db/db';
import { useComponents, useVisitBundle } from '../../db/hooks';
import { deleteVisit } from '../../db/visits';
import { ConfirmDialog } from '../../ui/Dialog';
import { EditIcon, TrashIcon } from '../../ui/icons';

export function VisitCard({ id }: { id: Id }) {
  const bundle = useVisitBundle(id);
  const components = useComponents();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const title = bundle ? `Визит ${formatDate(bundle.visit.date)}` : 'Визит';
  usePageHeader(title, hrefFor('/history'));

  const componentNames = useMemo(() => new Map((components ?? []).map((c: Component) => [c.id, c.name])), [components]);

  if (bundle === undefined) return <p className="muted">Загрузка…</p>;
  if (bundle === null) {
    return (
      <p>
        Визит не найден — возможно, он удалён. <a href={hrefFor('/history')}>К истории</a>
      </p>
    );
  }

  const { visit } = bundle;
  const shop = visit.shop;

  const onDelete = async () => {
    setConfirmDelete(false);
    await deleteVisit(getDb(), visit.id);
    window.location.replace(hrefFor('/history'));
  };

  return (
    <div className="stack">
      <section className="card" aria-label="Визит">
        <dl className="facts">
          <div>
            <dt>Дата</dt>
            <dd>{formatDate(visit.date)}</dd>
          </div>
          <div>
            <dt>Пробег</dt>
            <dd>{visit.odometerKm === null ? 'не указан' : formatKm(visit.odometerKm)}</dd>
          </div>
          <div>
            <dt>{visit.kind === 'self' ? 'Кто делал' : 'Сервис'}</dt>
            <dd>{visit.kind === 'self' ? VISIT_KIND_LABELS.self : shop.name || '—'}</dd>
          </div>
          {shop.inn && (
            <div>
              <dt>ИНН</dt>
              <dd>{shop.inn}</dd>
            </div>
          )}
          {shop.address && (
            <div>
              <dt>Адрес</dt>
              <dd>{shop.address}</dd>
            </div>
          )}
          {shop.phone && (
            <div>
              <dt>Телефон</dt>
              <dd>{shop.phone}</dd>
            </div>
          )}
          <div className="facts__total">
            <dt>Итого</dt>
            <dd data-testid="visit-total">{formatRub(visitTotal(bundle))}</dd>
          </div>
        </dl>
        {visit.notes && <p className="notes">{visit.notes}</p>}
      </section>

      {bundle.documents.map(({ document, lines }) => {
        const totals = sumLines(lines);
        const mismatches = totalsMismatches(document.totals, totals);
        const works = lines.filter((l) => l.kind === 'work');
        const parts = lines.filter((l) => l.kind !== 'work');
        return (
          <section key={document.id} className="card" aria-label={documentTitle(document)}>
            <h2 className="card__title">{documentTitle(document)}</h2>
            {document.purchaseOnly && <p className="pill">Покупка без установки</p>}
            {works.length > 0 && <LineGroup title="Работы" lines={works} componentNames={componentNames} />}
            {parts.length > 0 && <LineGroup title="Запчасти и материалы" lines={parts} componentNames={componentNames} />}
            <dl className="facts facts--totals">
              <div>
                <dt>Работы</dt>
                <dd>{formatRub(document.totals.works ?? totals.works)}</dd>
              </div>
              <div>
                <dt>Запчасти и материалы</dt>
                <dd>{formatRub(document.totals.parts ?? totals.parts)}</dd>
              </div>
              {document.totals.discountPercent !== null && (
                <div>
                  <dt>В т.ч. скидка</dt>
                  <dd>{formatQty(document.totals.discountPercent)} %</dd>
                </div>
              )}
              <div className="facts__total">
                <dt>Всего</dt>
                <dd>{formatRub(document.totals.total ?? totals.total)}</dd>
              </div>
            </dl>
            {mismatches.length > 0 && <TotalsWarning mismatches={mismatches} editHref={hrefFor(`/history/${visit.id}/edit`)} />}
          </section>
        );
      })}

      <div className="btn-row">
        <a className="btn btn--primary" href={hrefFor(`/history/${visit.id}/edit`)}>
          <EditIcon width={18} height={18} /> Изменить
        </a>
        <button type="button" className="btn btn--danger-outline" onClick={() => setConfirmDelete(true)}>
          <TrashIcon width={18} height={18} /> Удалить
        </button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Удалить визит?"
        confirmLabel="Удалить"
        danger
        onConfirm={() => void onDelete()}
        onCancel={() => setConfirmDelete(false)}
      >
        <p>
          Визит от {formatDate(visit.date)} пропадёт из истории. После синхронизации — и на других устройствах. Сканы, если они есть,
          останутся.
        </p>
      </ConfirmDialog>
    </div>
  );
}

/**
 * The totals above come from the document; this says where they differ from the lines,
 * e.g. after a price was corrected but the document totals were not.
 */
function TotalsWarning({ mismatches, editHref }: { mismatches: TotalsMismatch[]; editHref: string }) {
  return (
    <div className="notice notice--warning" role="note" data-testid="card-totals-mismatch">
      <p className="notice__title">Итоги документа не сходятся со строками</p>
      <ul className="plain-list">
        {mismatches.map((m) => (
          <li key={m.label}>{totalsMismatchText(m)}</li>
        ))}
      </ul>
      <p className="notice__hint">
        Проверьте цены в строках или итоги документа: <a href={editHref}>изменить визит</a>.
      </p>
    </div>
  );
}

/** Shows the raw name only when normalisation changed more than letter case or spaces ("Супорт" → "Суппорт"). */
function differsBeyondCase(name: string, raw: string): boolean {
  if (!name || !raw) return false;
  const fold = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').replace(/\.$/, '').trim();
  return fold(name) !== fold(raw);
}

function LineGroup({ title, lines, componentNames }: { title: string; lines: LineItem[]; componentNames: Map<Id, string> }) {
  return (
    <div className="line-group">
      <h3 className="line-group__title">{title}</h3>
      <ul className="line-list">
        {lines.map((l) => {
          const meta = [
            l.kind === 'material' ? LINE_KIND_LABELS.material : null,
            l.componentId ? componentNames.get(l.componentId) : null,
            positionLabel(l.position) || null,
            l.brand,
            l.article ? `арт. ${l.article}` : null,
          ].filter(Boolean);
          return (
            <li key={l.id} className="line-item">
              <div className="line-item__name">
                {l.name || l.rawName}
                {l.customerPart && <span className="tag">запчасть клиента</span>}
              </div>
              {(l.sum !== null || l.price !== null) && (
                <div className="line-item__nums">
                  {l.qty !== null && l.price !== null ? (
                    <span className="muted">
                      {formatQty(l.qty)}
                      {l.unit ? ` ${l.unit}` : ''} × {formatRub(l.price)}
                    </span>
                  ) : (
                    <span />
                  )}
                  <span className="line-item__sum">{formatRub(l.sum)}</span>
                </div>
              )}
              {meta.length > 0 && <div className="line-item__meta">{meta.join(' · ')}</div>}
              {differsBeyondCase(l.name, l.rawName) && <div className="line-item__raw">В документе: {l.rawName}</div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
