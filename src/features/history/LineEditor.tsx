import { memo } from 'react';
import type { Component, RegulationItem } from '../../core/model';
import { AXLE_LABELS, LINE_KIND_LABELS, positionLabel, SIDE_LABELS } from '../../core/labels';
import { normalizeName } from '../../core/normalize';
import type { LineForm } from '../../core/visitForm';
import { Checkbox, SelectField, TextField } from '../../ui/Field';
import { TrashIcon } from '../../ui/icons';

interface Props {
  line: LineForm;
  index: number;
  tree: Array<{ component: Component; depth: number }>;
  regulation: RegulationItem[];
  namesListId: string;
  issues: Record<string, string>;
  warnings: Record<string, string>;
  /** Review screen: the line has an unresolved check; offer a custom name and "Запомнить". */
  review?: { flagged: boolean } | undefined;
  onChange: (key: string, patch: Partial<LineForm>) => void;
  onRemove: (key: string) => void;
}

function LineEditorImpl({ line, index, tree, regulation, namesListId, issues, warnings, review, onChange, onRemove }: Props) {
  const err = (field: string) => issues[`line:${line.key}:${field}`];
  const warn = (field: string) => warnings[`line:${line.key}:${field}`];
  const set = (patch: Partial<LineForm>) => onChange(line.key, patch);
  const normalized = normalizeName(line.rawName);
  const position = positionLabel(line);
  const linked = regulation.filter((r) => line.regulationItemIds.includes(r.id)).map((r) => r.name);
  const moreSummary = [position, line.brand, line.article, line.unit, linked.length ? `регламент: ${linked.join(', ')}` : ''].filter(Boolean).join(' · ');

  return (
    <div className={review?.flagged ? 'line line--flagged' : 'line'} data-testid="line" data-line-key={line.key}>
      <div className="line__head">
        <span className="line__n" aria-hidden="true" title={line.n !== null ? 'Номер строки в документе' : undefined}>
          {line.n ?? index + 1}
        </span>
        <select
          className="input input--compact"
          aria-label={`Вид строки ${index + 1}`}
          value={line.kind}
          onChange={(e) => set({ kind: e.target.value as LineForm['kind'] })}
        >
          {Object.entries(LINE_KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button type="button" className="icon-btn" aria-label={`Удалить строку ${index + 1}`} onClick={() => onRemove(line.key)}>
          <TrashIcon />
        </button>
      </div>

      <TextField
        label="Название"
        value={line.rawName}
        list={namesListId}
        autoComplete="off"
        error={err('rawName')}
        hint={
          line.nameOverride.trim()
            ? `В истории: ${line.nameOverride.trim()}`
            : normalized && normalized !== line.rawName.trim()
              ? `Сохранится как: ${normalized}`
              : undefined
        }
        onChange={(e) => set({ rawName: e.target.value })}
      />

      <div className="grid3">
        <TextField label="Кол-во" inputMode="decimal" value={line.qty} error={err('qty')} onChange={(e) => set({ qty: e.target.value })} />
        <TextField label="Цена, ₽" inputMode="decimal" value={line.price} error={err('price')} onChange={(e) => set({ price: e.target.value })} />
        <TextField
          label="Сумма, ₽"
          inputMode="decimal"
          value={line.sum}
          error={err('sum')}
          warning={warn('sum') ? 'Не равна кол-ву × цене' : undefined}
          onChange={(e) => set({ sum: e.target.value })}
        />
      </div>

      <SelectField label="Узел" value={line.componentId ?? ''} onChange={(e) => set({ componentId: e.target.value || null })}>
        <option value="">— не выбран —</option>
        {tree.map(({ component, depth }) => (
          <option key={component.id} value={component.id}>
            {' '.repeat(depth) + component.name}
          </option>
        ))}
      </SelectField>

      {line.kind !== 'work' && (
        <Checkbox label="Запчасть клиента (принёс сам)" checked={line.customerPart} onChange={(customerPart) => set({ customerPart })} />
      )}

      {review && line.bindingEdited && (
        <Checkbox label="Запомнить для похожих строк" checked={line.remember} onChange={(remember) => onChange(line.key, { remember })} />
      )}

      <details className="line__more">
        <summary>
          Подробнее{moreSummary ? <span className="muted">{' · ' + moreSummary}</span> : null}
        </summary>
        {review && (
          <TextField
            label="Название в истории"
            value={line.nameOverride}
            placeholder={normalized}
            hint="Пусто — как предложено автоматически"
            onChange={(e) => set({ nameOverride: e.target.value })}
          />
        )}
        <div className="grid2">
          <SelectField label="Ось" value={line.axle ?? ''} onChange={(e) => set({ axle: (e.target.value || null) as LineForm['axle'] })}>
            <option value="">—</option>
            {Object.entries(AXLE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </SelectField>
          <SelectField label="Сторона" value={line.side ?? ''} onChange={(e) => set({ side: (e.target.value || null) as LineForm['side'] })}>
            <option value="">—</option>
            {Object.entries(SIDE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </SelectField>
          <TextField label="Бренд" value={line.brand} onChange={(e) => set({ brand: e.target.value })} />
          <TextField label="Артикул" value={line.article} onChange={(e) => set({ article: e.target.value })} />
          <TextField label="Ед. изм." value={line.unit} placeholder="шт, л" onChange={(e) => set({ unit: e.target.value })} />
        </div>
        {regulation.length > 0 && (
          <fieldset className="checks">
            <legend>Пункты регламента</legend>
            {regulation.map((r) => (
              <Checkbox
                key={r.id}
                label={r.name}
                checked={line.regulationItemIds.includes(r.id)}
                onChange={(on) =>
                  set({ regulationItemIds: on ? [...line.regulationItemIds, r.id] : line.regulationItemIds.filter((x) => x !== r.id) })
                }
              />
            ))}
          </fieldset>
        )}
      </details>
    </div>
  );
}

export const LineEditor = memo(LineEditorImpl);
