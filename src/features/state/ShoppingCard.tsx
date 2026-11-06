import { useMemo, useState } from 'react';
import { formatDate } from '../../core/format';
import type { Id, RegulationItem, Repair } from '../../core/model';
import type { VisitBundle } from '../../core/bundle';
import { formatQty, formatRub } from '../../core/money';
import type { ServiceListEntry } from '../../core/serviceList';
import { shoppingList, shoppingText } from '../../core/shopping';
import { copyText } from '../../scan/share';

/**
 * "Что купить" (D-102): parts for the ticked items of the service list, from the history. For the
 * owner himself: its own copy button, never printed. Rows of "Проверить" items start unticked.
 */
export function ShoppingCard({
  chosen,
  regulation,
  repairs,
  bundles,
}: {
  chosen: ServiceListEntry[];
  regulation: ReadonlyMap<Id, RegulationItem>;
  repairs: ReadonlyMap<Id, Repair>;
  bundles: VisitBundle[];
}) {
  const list = useMemo(() => shoppingList(chosen, { regulation, repairs, bundles }), [chosen, regulation, repairs, bundles]);
  // What the owner changed by hand; the rest follows the default (ticked unless only for a check).
  const [manual, setManual] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null);

  if (list.items.length === 0 && list.notFound.length === 0) return null;
  const isOn = (key: string, maybe: boolean) => manual.get(key) ?? !maybe;
  const picked = list.items.filter((i) => isOn(i.key, i.maybe));
  const text = shoppingText(picked);

  return (
    <section className="card no-print" aria-label="Что купить" data-testid="shopping">
      <h2 className="card__title">Что купить</h2>
      <p className="hint">Запчасти, которые ставили в прошлый раз для отмеченных выше пунктов. Это список для вас: копируется отдельно и не печатается.</p>
      {list.items.length > 0 && (
        <ul className="service-items">
          {list.items.map((i) => {
            const on = isOn(i.key, i.maybe);
            const meta = [i.brand && !i.name.includes(i.brand) ? i.brand : null, i.article ? `арт. ${i.article}` : null, i.qty !== null ? `${formatQty(i.qty)} ${i.unit || 'шт'}` : null, i.price !== null ? `${formatRub(i.price)} (${formatDate(i.date)})` : formatDate(i.date)].filter(Boolean);
            return (
              <li key={i.key} className={`service-item${on ? '' : ' service-item--unpicked'}`} data-testid="shopping-item">
                <label className="service-item__label">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => {
                      setManual(new Map(manual).set(i.key, !on));
                      setCopied(null);
                    }}
                  />
                  <span className="service-item__text">
                    <span className="service-item__name">{i.name}</span>
                    <span className="service-item__meta">{meta.join(' · ')}</span>
                    <span className="service-item__reason">для: {i.for.join(', ')}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {list.notFound.length > 0 && (
        <p className="hint" data-testid="shopping-not-found">
          В истории нет запчастей для: {list.notFound.join(', ')}.
        </p>
      )}
      {list.items.length > 0 && (
        <button
          type="button"
          className="btn btn--secondary"
          style={{ justifySelf: 'start' }}
          disabled={picked.length === 0}
          onClick={() => void copyText(text).then((ok) => setCopied(ok ? 'ok' : 'failed'))}
        >
          Скопировать список покупок
        </button>
      )}
      {copied === 'ok' && (
        <p className="hint" role="status" data-testid="shopping-copied">
          Список покупок скопирован.
        </p>
      )}
      {copied === 'failed' && (
        <textarea className="input" readOnly rows={Math.min(12, text.split('\n').length + 1)} value={text} onFocus={(e) => e.currentTarget.select()} />
      )}
    </section>
  );
}
