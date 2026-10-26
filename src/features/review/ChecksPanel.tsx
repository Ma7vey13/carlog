import { confirmationKey, type Check, type ReviewDecision, type VisitCandidate } from '../../core/checks';
import type { Id } from '../../core/model';

export interface ChecksPanelProps {
  checks: readonly Check[];
  confirmed: ReadonlySet<string>;
  decision: ReviewDecision;
  onConfirm: (check: Check, on: boolean) => void;
  onDecision: (decision: ReviewDecision, replaceDocumentIds: Id[], check: Check) => void;
  onAddCustomerPart: (check: Check) => void;
  onPurchaseOnly: (docKey: string) => void;
  onEnterMileage: () => void;
  onShowLine: (lineKey: string) => void;
}

/** Automatic checks with the action each one needs (SPEC section 7). */
export function ChecksPanel(props: ChecksPanelProps) {
  const { checks, confirmed } = props;
  const open = checks.filter((c) => !confirmed.has(confirmationKey(c)));

  if (!checks.length) {
    return (
      <section className="card checks-panel checks-panel--ok" aria-label="Проверки" data-testid="checks-ok">
        <p className="notice__title">Автопроверки: замечаний нет</p>
        <p className="hint">Суммы сходятся, дублей нет, даты и пробег правдоподобны. Проверьте строки по скану и сохраните.</p>
      </section>
    );
  }

  return (
    <section className="card checks-panel" aria-label="Проверки">
      <h2 className="card__title">
        Замечания: {open.length ? `осталось ${open.length} из ${checks.length}` : `все ${checks.length} проверены`}
      </h2>
      <ul className="checks-list">
        {checks.map((check) => (
          <CheckItem key={check.id} check={check} done={confirmed.has(confirmationKey(check))} {...props} />
        ))}
      </ul>
    </section>
  );
}

function CheckItem({ check, done, ...p }: ChecksPanelProps & { check: Check; done: boolean }) {
  const confirmBox = (label: string) => (
    <label className="check">
      <input type="checkbox" checked={done} onChange={(e) => p.onConfirm(check, e.target.checked)} />
      <span>{label}</span>
    </label>
  );

  return (
    <li className={done ? 'check-item check-item--done' : 'check-item'} data-testid="check" data-kind={check.kind}>
      <p className="check-item__title">{check.title}</p>
      {check.details.length > 0 && (
        <ul className="plain-list check-item__details">
          {check.details.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}

      <div className="check-item__actions">
        {check.kind === 'duplicate' && <DecisionChoice check={check} done={done} {...p} />}

        {check.kind === 'no-mileage' && (
          <>
            {(check.candidates ?? []).map((c) => (
              <button key={c.visitId} type="button" className="btn btn--secondary btn--wrap" onClick={() => p.onDecision({ mode: 'attach', visitId: c.visitId }, [], check)}>
                Прикрепить к: {c.label}
              </button>
            ))}
            <div className="btn-row">
              <button type="button" className="btn btn--secondary" onClick={p.onEnterMileage}>
                Ввести пробег
              </button>
              {check.docKey && (
                <button type="button" className="btn btn--secondary" onClick={() => p.onPurchaseOnly(check.docKey!)}>
                  Покупка без установки
                </button>
              )}
            </div>
            {confirmBox('Сохранить без пробега')}
          </>
        )}

        {check.kind === 'missing-part' && (
          <>
            <button type="button" className="btn btn--secondary btn--wrap" onClick={() => p.onAddCustomerPart(check)}>
              Добавить «{check.partName}» — запчасть клиента
            </button>
            {confirmBox('Запчасти не было, всё верно')}
          </>
        )}

        {(check.kind === 'line-math' || check.kind === 'totals' || check.kind === 'date' || check.kind === 'mileage') &&
          confirmBox('Проверил — так в документе')}

        {check.lineKey && check.kind !== 'missing-part' && (
          <button type="button" className="btn btn--ghost" onClick={() => p.onShowLine(check.lineKey!)}>
            Показать строку
          </button>
        )}
      </div>
    </li>
  );
}

function DecisionChoice({ check, done, decision, onDecision }: ChecksPanelProps & { check: Check; done: boolean }) {
  const name = `decision-${check.id}`;
  const option = (label: string, value: ReviewDecision, replaceIds: Id[], key: string) => {
    const checked =
      done &&
      decision.mode === value.mode &&
      (value.mode === 'new' || (decision.mode !== 'new' && decision.visitId === (value as { visitId: Id }).visitId));
    return (
      <label className="radio" key={key}>
        <input type="radio" name={name} checked={checked} onChange={() => onDecision(value, replaceIds, check)} />
        <span>{label}</span>
      </label>
    );
  };
  const candidates: VisitCandidate[] = check.candidates ?? [];
  return (
    <fieldset className="choices">
      <legend>Что сделать с документом?</legend>
      {candidates.flatMap((c) => [
        ...(c.replaceableDocumentIds.length
          ? [option(`Заменить строки в визите: ${c.label}`, { mode: 'replace', visitId: c.visitId }, c.replaceableDocumentIds, `r-${c.visitId}`)]
          : []),
        option(`Прикрепить к визиту: ${c.label}`, { mode: 'attach', visitId: c.visitId }, [], `a-${c.visitId}`),
      ])}
      {option('Это другой визит', { mode: 'new' }, [], 'new')}
    </fieldset>
  );
}
