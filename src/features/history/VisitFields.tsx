// The visit form shared by manual entry (history) and the review screen (inbox):
// SPEC section 6В — manual entry is "the same form as the review screen, but empty".

import { useCallback, useMemo, useState } from 'react';
import type { VisitBundle } from '../../core/bundle';
import { VISIT_KIND_LABELS } from '../../core/labels';
import type { Component, LineKind, RegulationItem, Shop } from '../../core/model';
import { emptyDocument, emptyLine, updateLine, type DocumentForm, type LineForm, type NameHint, type VisitForm } from '../../core/visitForm';
import { TextAreaField, TextField } from '../../ui/Field';
import { PlusIcon } from '../../ui/icons';
import { DocumentEditor } from './DocumentEditor';

export const NAMES_LIST_ID = 'line-name-hints';
const SHOPS_LIST_ID = 'shop-hints';

export function distinctShops(bundles: readonly VisitBundle[]): Shop[] {
  const seen = new Map<string, Shop>();
  for (const { visit } of bundles) {
    const name = visit.shop.name?.trim();
    if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), visit.shop);
  }
  return [...seen.values()];
}

export interface VisitFormHandlers {
  setField: <K extends keyof VisitForm>(key: K, value: VisitForm[K]) => void;
  onShopName: (name: string) => void;
  onDocChange: (docKey: string, patch: Partial<DocumentForm>) => void;
  onDocRemove: (docKey: string) => void;
  onAddDocument: () => void;
  onAddLine: (docKey: string, kind: LineKind, preset?: Partial<LineForm>) => void;
  onLineChange: (docKey: string, lineKey: string, patch: Partial<LineForm>) => void;
  onLineRemove: (docKey: string, lineKey: string) => void;
}

/** Form state with the edit handlers; `edit` marks the form dirty. */
export function useVisitFormState(initial: () => VisitForm, hints: readonly NameHint[], shops: readonly Shop[], regulation: readonly RegulationItem[] = []) {
  const [form, setForm] = useState<VisitForm>(initial);
  const [dirty, setDirty] = useState(false);

  const edit = useCallback((fn: (f: VisitForm) => VisitForm) => {
    setForm(fn);
    setDirty(true);
  }, []);

  const mapDoc = (docKey: string, fn: (d: DocumentForm) => DocumentForm) =>
    edit((f) => ({ ...f, documents: f.documents.map((d) => (d.key === docKey ? fn(d) : d)) }));

  const handlers: VisitFormHandlers = {
    setField: (key, value) => edit((f) => ({ ...f, [key]: value })),
    onShopName: (name) =>
      edit((f) => {
        const known = shops.find((s) => s.name?.toLowerCase() === name.trim().toLowerCase());
        if (!known) return { ...f, shopName: name };
        return {
          ...f,
          shopName: name,
          shopInn: f.shopInn || (known.inn ?? ''),
          shopAddress: f.shopAddress || (known.address ?? ''),
          shopPhone: f.shopPhone || (known.phone ?? ''),
        };
      }),
    onDocChange: (docKey, patch) => mapDoc(docKey, (d) => ({ ...d, ...patch })),
    onDocRemove: (docKey) => edit((f) => ({ ...f, documents: f.documents.filter((d) => d.key !== docKey) })),
    onAddDocument: () => edit((f) => ({ ...f, documents: [...f.documents, emptyDocument('invoice')] })),
    onAddLine: (docKey, kind, preset) =>
      mapDoc(docKey, (d) => {
        let line = emptyLine(kind);
        if (preset?.rawName) line = updateLine(line, { rawName: preset.rawName }, hints, regulation);
        return { ...d, lines: [...d.lines, { ...line, ...preset }] };
      }),
    onLineChange: (docKey, lineKey, patch) =>
      mapDoc(docKey, (d) => ({ ...d, lines: d.lines.map((l) => (l.key === lineKey ? updateLine(l, patch, hints, regulation) : l)) })),
    onLineRemove: (docKey, lineKey) => mapDoc(docKey, (d) => ({ ...d, lines: d.lines.filter((l) => l.key !== lineKey) })),
  };

  return { form, setForm, dirty, setDirty, edit, handlers };
}

interface VisitFieldsProps {
  form: VisitForm;
  handlers: VisitFormHandlers;
  hints: readonly NameHint[];
  shops: readonly Shop[];
  components: readonly Component[];
  tree: Array<{ component: Component; depth: number }>;
  regulation: RegulationItem[];
  issues: Record<string, string>;
  warnings: Record<string, string>;
  /** Review screen extras: highlighted lines, "Запомнить для похожих строк". */
  review?: { flaggedLineKeys: ReadonlySet<string> };
  /** Hide the visit header (date, odometer, shop) when the document joins an existing visit. */
  hideVisitHeader?: boolean;
}

export function VisitFields(props: VisitFieldsProps) {
  const { form, handlers, hints, shops, tree, regulation, issues, warnings, review } = props;
  const shopsList = useMemo(() => shops.filter((s) => s.name), [shops]);

  return (
    <>
      <datalist id={NAMES_LIST_ID}>
        {hints.map((h) => (
          <option key={h.rawName} value={h.rawName} />
        ))}
      </datalist>
      <datalist id={SHOPS_LIST_ID}>
        {shopsList.map((s) => (
          <option key={s.name} value={s.name ?? ''} />
        ))}
      </datalist>

      {!props.hideVisitHeader && (
        <section className="card" aria-label="Визит">
          <div className="grid2">
            <TextField
              label="Дата визита"
              type="date"
              required
              value={form.date}
              error={issues.date}
              warning={warnings.date}
              onChange={(e) => handlers.setField('date', e.target.value)}
            />
            <TextField label="Пробег, км" inputMode="numeric" value={form.odometer} error={issues.odometer} onChange={(e) => handlers.setField('odometer', e.target.value)} />
          </div>

          <div className="segmented segmented--2" role="radiogroup" aria-label="Кто делал">
            {(['service', 'self'] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={form.kind === k} className="segmented__item" onClick={() => handlers.setField('kind', k)}>
                {VISIT_KIND_LABELS[k]}
              </button>
            ))}
          </div>

          {form.kind === 'service' && (
            <>
              <TextField label="Сервис" list={SHOPS_LIST_ID} autoComplete="off" value={form.shopName} onChange={(e) => handlers.onShopName(e.target.value)} />
              <details className="line__more" open={!!(form.shopInn || form.shopAddress || form.shopPhone)}>
                <summary>Реквизиты сервиса</summary>
                <div className="grid2">
                  <TextField label="ИНН" inputMode="numeric" value={form.shopInn} onChange={(e) => handlers.setField('shopInn', e.target.value)} />
                  <TextField label="Телефон" inputMode="tel" value={form.shopPhone} onChange={(e) => handlers.setField('shopPhone', e.target.value)} />
                </div>
                <TextField label="Адрес" value={form.shopAddress} onChange={(e) => handlers.setField('shopAddress', e.target.value)} />
              </details>
            </>
          )}

          <TextAreaField label="Заметки" rows={2} value={form.notes} onChange={(e) => handlers.setField('notes', e.target.value)} />
        </section>
      )}

      {form.documents.map((doc, i) => (
        <DocumentEditor
          key={doc.key}
          doc={doc}
          index={i}
          count={form.documents.length}
          tree={tree}
          regulation={regulation}
          namesListId={NAMES_LIST_ID}
          issues={issues}
          warnings={warnings}
          review={review}
          onChange={handlers.onDocChange}
          onRemove={handlers.onDocRemove}
          onAddLine={handlers.onAddLine}
          onLineChange={handlers.onLineChange}
          onLineRemove={handlers.onLineRemove}
        />
      ))}

      {!review && (
        <button type="button" className="btn btn--secondary" onClick={handlers.onAddDocument}>
          <PlusIcon width={18} height={18} /> Ещё документ
        </button>
      )}
    </>
  );
}
