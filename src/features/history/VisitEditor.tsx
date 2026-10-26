import { useCallback, useMemo, useState } from 'react';
import { usePageHeader } from '../../app/pageHeader';
import { hrefFor } from '../../app/routes';
import type { VisitBundle } from '../../core/bundle';
import { formatDate } from '../../core/format';
import { VISIT_KIND_LABELS } from '../../core/labels';
import type { Id, LineKind, Shop } from '../../core/model';
import { VISIT_TEMPLATES } from '../../core/templates';
import {
  applyTemplate,
  bundleToForm,
  checkVisitForm,
  copyVisitToForm,
  emptyDocument,
  emptyLine,
  emptyVisitForm,
  nameHintsFrom,
  updateLine,
  type DocumentForm,
  type LineForm,
  type VisitForm,
} from '../../core/visitForm';
import { getDb } from '../../db/db';
import { componentTree, useComponents, useRegulationItems, useVisitBundle, useVisitBundles } from '../../db/hooks';
import { saveVisitForm } from '../../db/visits';
import { ConfirmDialog } from '../../ui/Dialog';
import { TextAreaField, TextField } from '../../ui/Field';
import { CopyIcon, PlusIcon } from '../../ui/icons';
import { DocumentEditor } from './DocumentEditor';

const NAMES_LIST_ID = 'line-name-hints';
const SHOPS_LIST_ID = 'shop-hints';

/** Visit editor: `editId` = null for a new visit. Waits for data, then mounts the form once. */
export function VisitEditor({ editId }: { editId: Id | null }) {
  const bundles = useVisitBundles();
  const existing = useVisitBundle(editId);
  usePageHeader(editId ? 'Изменить визит' : 'Новый визит', editId ? hrefFor(`/history/${editId}`) : hrefFor('/history'));

  if (bundles === undefined || existing === undefined) return <p className="muted">Загрузка…</p>;
  if (editId && existing === null) {
    return (
      <p>
        Визит не найден — возможно, он удалён. <a href={hrefFor('/history')}>К истории</a>
      </p>
    );
  }
  return <VisitFormView key={editId ?? 'new'} existing={existing} bundles={bundles} />;
}

function distinctShops(bundles: VisitBundle[]): Shop[] {
  const seen = new Map<string, Shop>();
  for (const { visit } of bundles) {
    const name = visit.shop.name?.trim();
    if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), visit.shop);
  }
  return [...seen.values()];
}

function VisitFormView({ existing, bundles }: { existing: VisitBundle | null; bundles: VisitBundle[] }) {
  const [form, setForm] = useState<VisitForm>(() => (existing ? bundleToForm(existing) : emptyVisitForm()));
  const [dirty, setDirty] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<null | 'warnings' | 'cancel' | 'copy'>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const components = useComponents();
  const regulation = useRegulationItems() ?? [];
  const tree = useMemo(() => componentTree(components ?? []), [components]);
  const otherBundles = useMemo(() => bundles.filter((b) => b.visit.id !== existing?.visit.id), [bundles, existing]);
  const hints = useMemo(() => nameHintsFrom(otherBundles), [otherBundles]);
  const shops = useMemo(() => distinctShops(otherBundles), [otherBundles]);
  const lastVisit = otherBundles[0] ?? null;

  const check = useMemo(() => checkVisitForm(form), [form]);
  const issues = useMemo(() => (submitted ? Object.fromEntries(check.errors.map((e) => [e.path, e.message])) : {}), [check, submitted]);
  const warnings = useMemo(() => Object.fromEntries(check.warnings.map((w) => [w.path, w.message])), [check]);

  // --- state updates -------------------------------------------------------------------------
  const edit = useCallback((fn: (f: VisitForm) => VisitForm) => {
    setForm(fn);
    setDirty(true);
  }, []);

  const setField = <K extends keyof VisitForm>(key: K, value: VisitForm[K]) => edit((f) => ({ ...f, [key]: value }));

  const mapDoc = (docKey: string, fn: (d: DocumentForm) => DocumentForm) =>
    edit((f) => ({ ...f, documents: f.documents.map((d) => (d.key === docKey ? fn(d) : d)) }));

  const onDocChange = (docKey: string, patch: Partial<DocumentForm>) => mapDoc(docKey, (d) => ({ ...d, ...patch }));
  const onDocRemove = (docKey: string) => edit((f) => ({ ...f, documents: f.documents.filter((d) => d.key !== docKey) }));
  const onAddLine = (docKey: string, kind: LineKind) => mapDoc(docKey, (d) => ({ ...d, lines: [...d.lines, emptyLine(kind)] }));
  const onLineChange = (docKey: string, lineKey: string, patch: Partial<LineForm>) =>
    mapDoc(docKey, (d) => ({ ...d, lines: d.lines.map((l) => (l.key === lineKey ? updateLine(l, patch, hints) : l)) }));
  const onLineRemove = (docKey: string, lineKey: string) => mapDoc(docKey, (d) => ({ ...d, lines: d.lines.filter((l) => l.key !== lineKey) }));

  const onShopName = (name: string) =>
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
    });

  const copyLast = () => {
    if (!lastVisit) return;
    setForm(copyVisitToForm(lastVisit));
    setDirty(true);
    setConfirm(null);
  };

  // --- save / cancel ---------------------------------------------------------------------------
  const doSave = async () => {
    setConfirm(null);
    setSaving(true);
    setSaveError(null);
    try {
      const id = await saveVisitForm(getDb(), form, existing);
      window.location.replace(hrefFor(`/history/${id}`));
    } catch (err) {
      console.error(err);
      setSaveError('Не удалось сохранить. Попробуйте ещё раз; если не выйдет — перезапустите приложение.');
      setSaving(false);
    }
  };

  const onSave = () => {
    setSubmitted(true);
    if (check.errors.length) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"], .notice--error')?.focus());
      return;
    }
    if (check.warnings.length) setConfirm('warnings');
    else void doSave();
  };

  const leave = () => {
    window.location.hash = existing ? `/history/${existing.visit.id}` : '/history';
  };
  const onCancel = () => (dirty ? setConfirm('cancel') : leave());

  const generalErrors = submitted ? check.errors.filter((e) => e.path === 'lines') : [];

  return (
    <form
      className="stack editor"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <datalist id={NAMES_LIST_ID}>
        {hints.map((h) => (
          <option key={h.rawName} value={h.rawName} />
        ))}
      </datalist>
      <datalist id={SHOPS_LIST_ID}>
        {shops.map((s) => (
          <option key={s.name} value={s.name ?? ''} />
        ))}
      </datalist>

      {!existing && (
        <section className="card card--tools" aria-label="Быстрое заполнение">
          <div className="btn-row">
            <select
              className="input input--compact"
              aria-label="Вставить шаблон"
              value=""
              onChange={(e) => {
                const t = VISIT_TEMPLATES.find((x) => x.id === e.target.value);
                if (t) edit((f) => applyTemplate(f, t, hints));
              }}
            >
              <option value="">Вставить шаблон…</option>
              {VISIT_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn--secondary" disabled={!lastVisit} onClick={() => (dirty ? setConfirm('copy') : copyLast())}>
              <CopyIcon width={18} height={18} /> Скопировать прошлый визит
            </button>
          </div>
        </section>
      )}

      <section className="card" aria-label="Визит">
        <div className="grid2">
          <TextField label="Дата визита" type="date" required value={form.date} error={issues.date} warning={warnings.date} onChange={(e) => setField('date', e.target.value)} />
          <TextField
            label="Пробег, км"
            inputMode="numeric"
            value={form.odometer}
            error={issues.odometer}
            onChange={(e) => setField('odometer', e.target.value)}
          />
        </div>

        <div className="segmented segmented--2" role="radiogroup" aria-label="Кто делал">
          {(['service', 'self'] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={form.kind === k} className="segmented__item" onClick={() => setField('kind', k)}>
              {VISIT_KIND_LABELS[k]}
            </button>
          ))}
        </div>

        {form.kind === 'service' && (
          <>
            <TextField label="Сервис" list={SHOPS_LIST_ID} autoComplete="off" value={form.shopName} onChange={(e) => onShopName(e.target.value)} />
            <details className="line__more" open={!!(form.shopInn || form.shopAddress || form.shopPhone)}>
              <summary>Реквизиты сервиса</summary>
              <div className="grid2">
                <TextField label="ИНН" inputMode="numeric" value={form.shopInn} onChange={(e) => setField('shopInn', e.target.value)} />
                <TextField label="Телефон" inputMode="tel" value={form.shopPhone} onChange={(e) => setField('shopPhone', e.target.value)} />
              </div>
              <TextField label="Адрес" value={form.shopAddress} onChange={(e) => setField('shopAddress', e.target.value)} />
            </details>
          </>
        )}

        <TextAreaField label="Заметки" rows={2} value={form.notes} onChange={(e) => setField('notes', e.target.value)} />
      </section>

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
          onChange={onDocChange}
          onRemove={onDocRemove}
          onAddLine={onAddLine}
          onLineChange={onLineChange}
          onLineRemove={onLineRemove}
        />
      ))}

      <button
        type="button"
        className="btn btn--secondary"
        onClick={() => edit((f) => ({ ...f, documents: [...f.documents, emptyDocument('invoice')] }))}
      >
        <PlusIcon width={18} height={18} /> Ещё документ
      </button>

      <div className="savebar">
        {submitted && check.errors.length > 0 && (
          <div className="notice notice--error" role="alert" tabIndex={-1} data-testid="form-errors">
            {generalErrors.length > 0 ? generalErrors[0]!.message : `Исправьте ошибки: ${check.errors.length}`}
          </div>
        )}
        {saveError && (
          <div className="notice notice--error" role="alert">
            {saveError}
          </div>
        )}
        <div className="savebar__buttons">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Отмена
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Сохраняю…' : 'Сохранить визит'}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirm === 'warnings'}
        title="Сохранить с предупреждениями?"
        confirmLabel="Сохранить"
        onConfirm={() => void doSave()}
        onCancel={() => setConfirm(null)}
      >
        <ul className="plain-list">
          {check.warnings.map((w) => (
            <li key={w.path}>{w.message}</li>
          ))}
        </ul>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'cancel'}
        title="Выйти без сохранения?"
        confirmLabel="Выйти"
        danger
        onConfirm={leave}
        onCancel={() => setConfirm(null)}
      >
        <p>Введённые данные пропадут.</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'copy'}
        title="Заменить введённое?"
        confirmLabel="Скопировать"
        onConfirm={copyLast}
        onCancel={() => setConfirm(null)}
      >
        <p>
          Форма заполнится данными визита от {lastVisit ? formatDate(lastVisit.visit.date) : ''}. Уже введённое пропадёт.
        </p>
      </ConfirmDialog>
    </form>
  );
}
