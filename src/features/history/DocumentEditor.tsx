import type { Component, LineKind, RegulationItem } from '../../core/model';
import { totalsMismatches } from '../../core/bundle';
import { DOCUMENT_TYPE_LABELS, totalsMismatchText } from '../../core/labels';
import { formatRub, parseRubles } from '../../core/money';
import type { DocumentForm, LineForm } from '../../core/visitForm';
import { Checkbox, SelectField, TextField } from '../../ui/Field';
import { PlusIcon, TrashIcon } from '../../ui/icons';
import { LineEditor } from './LineEditor';

interface Props {
  doc: DocumentForm;
  index: number;
  count: number;
  tree: Array<{ component: Component; depth: number }>;
  regulation: RegulationItem[];
  namesListId: string;
  issues: Record<string, string>;
  warnings: Record<string, string>;
  onChange: (key: string, patch: Partial<DocumentForm>) => void;
  onRemove: (key: string) => void;
  onAddLine: (docKey: string, kind: LineKind) => void;
  onLineChange: (docKey: string, lineKey: string, patch: Partial<LineForm>) => void;
  onLineRemove: (docKey: string, lineKey: string) => void;
}

/** Sums of the lines as typed, by kind (materials count as parts). */
function formTotals(lines: LineForm[]) {
  let works = 0;
  let parts = 0;
  for (const l of lines) {
    const sum = parseRubles(l.sum);
    if (sum === null) continue;
    if (l.kind === 'work') works += sum;
    else parts += sum;
  }
  return { works, parts, total: works + parts };
}

export function DocumentEditor(props: Props) {
  const { doc, index, count, tree, regulation, namesListId, issues, warnings } = props;
  const err = (field: string) => issues[`doc:${doc.key}:${field}`];
  const set = (patch: Partial<DocumentForm>) => props.onChange(doc.key, patch);
  const totals = formTotals(doc.lines);
  const showRelated = doc.type === 'act' || doc.type === 'invoice' || doc.relatedNumber !== '' || doc.relatedDate !== '';

  // Differences between typed document totals and the lines: shown as hints, not blocking.
  const mismatches = totalsMismatches(
    { works: parseRubles(doc.totalWorks), parts: parseRubles(doc.totalParts), total: parseRubles(doc.totalAll), discountPercent: null },
    totals,
  );

  return (
    <section className="card" aria-label={`Документ ${index + 1}`} data-testid="document">
      <div className="card__head">
        <h2 className="card__title">{count > 1 ? `Документ ${index + 1}` : 'Документ'}</h2>
        {count > 1 && (
          <button type="button" className="icon-btn" aria-label={`Удалить документ ${index + 1}`} onClick={() => props.onRemove(doc.key)}>
            <TrashIcon />
          </button>
        )}
      </div>

      <SelectField label="Тип документа" value={doc.type} onChange={(e) => set({ type: e.target.value as DocumentForm['type'] })}>
        {Object.entries(DOCUMENT_TYPE_LABELS).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </SelectField>
      <div className="grid2">
        <TextField label="Номер" value={doc.number} onChange={(e) => set({ number: e.target.value })} />
        <TextField
          label="Дата документа"
          type="date"
          value={doc.date}
          error={err('date')}
          hint={doc.date ? undefined : 'Пусто — как дата визита'}
          onChange={(e) => set({ date: e.target.value })}
        />
      </div>
      {showRelated && (
        <div className="grid2">
          <TextField label="К заказ-наряду №" value={doc.relatedNumber} onChange={(e) => set({ relatedNumber: e.target.value })} />
          <TextField label="от" type="date" value={doc.relatedDate} onChange={(e) => set({ relatedDate: e.target.value })} />
        </div>
      )}
      {(doc.type === 'invoice' || doc.type === 'receipt') && (
        <Checkbox label="Покупка без установки" checked={doc.purchaseOnly} onChange={(purchaseOnly) => set({ purchaseOnly })} />
      )}

      <div className="lines">
        {doc.lines.map((line, i) => (
          <LineEditor
            key={line.key}
            line={line}
            index={i}
            tree={tree}
            regulation={regulation}
            namesListId={namesListId}
            issues={issues}
            warnings={warnings}
            onChange={(lineKey, patch) => props.onLineChange(doc.key, lineKey, patch)}
            onRemove={(lineKey) => props.onLineRemove(doc.key, lineKey)}
          />
        ))}
      </div>

      <div className="btn-row">
        <button type="button" className="btn btn--secondary" onClick={() => props.onAddLine(doc.key, 'work')}>
          <PlusIcon width={18} height={18} /> Работа
        </button>
        <button type="button" className="btn btn--secondary" onClick={() => props.onAddLine(doc.key, 'part')}>
          <PlusIcon width={18} height={18} /> Запчасть
        </button>
        <button type="button" className="btn btn--secondary" onClick={() => props.onAddLine(doc.key, 'material')}>
          <PlusIcon width={18} height={18} /> Материалы
        </button>
      </div>

      <dl className="facts facts--totals" data-testid="doc-totals">
        <div>
          <dt>Работы по строкам</dt>
          <dd>{formatRub(totals.works)}</dd>
        </div>
        <div>
          <dt>Запчасти и материалы</dt>
          <dd>{formatRub(totals.parts)}</dd>
        </div>
        <div className="facts__total">
          <dt>Всего по строкам</dt>
          <dd>{formatRub(totals.total)}</dd>
        </div>
      </dl>

      <details className="line__more" open={doc.totalAll !== '' || doc.totalWorks !== '' || doc.totalParts !== ''}>
        <summary>Итоги из документа</summary>
        <div className="grid2">
          <TextField label="Работы, ₽" inputMode="decimal" value={doc.totalWorks} error={err('totalWorks')} onChange={(e) => set({ totalWorks: e.target.value })} />
          <TextField label="Запчасти, ₽" inputMode="decimal" value={doc.totalParts} error={err('totalParts')} onChange={(e) => set({ totalParts: e.target.value })} />
          <TextField label="Всего, ₽" inputMode="decimal" value={doc.totalAll} error={err('totalAll')} onChange={(e) => set({ totalAll: e.target.value })} />
          <TextField
            label="Скидка, %"
            inputMode="decimal"
            value={doc.discountPercent}
            error={err('discountPercent')}
            hint="Если уже внутри сумм — только для справки"
            onChange={(e) => set({ discountPercent: e.target.value })}
          />
        </div>
        {mismatches.length > 0 && (
          <ul className="notice notice--warning" data-testid="totals-mismatch">
            {mismatches.map((m) => (
              <li key={m.label}>{totalsMismatchText(m)}</li>
            ))}
          </ul>
        )}
      </details>
    </section>
  );
}
