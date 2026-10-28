import { useMemo, useState } from 'react';
import { usePageHeader } from '../../app/pageHeader';
import { hrefFor } from '../../app/routes';
import type { VisitBundle } from '../../core/bundle';
import { formatDate } from '../../core/format';
import type { Id } from '../../core/model';
import { VISIT_TEMPLATES } from '../../core/templates';
import { applyTemplate, bundleToForm, checkVisitForm, copyVisitToForm, emptyVisitForm, nameHintsFrom } from '../../core/visitForm';
import { getDb } from '../../db/db';
import { componentTree, useComponents, useRegulationItems, useVisitBundle, useVisitBundles } from '../../db/hooks';
import { saveVisitForm } from '../../db/visits';
import { ConfirmDialog } from '../../ui/Dialog';
import { CopyIcon } from '../../ui/icons';
import { distinctShops, useVisitFormState, VisitFields } from './VisitFields';

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

function VisitFormView({ existing, bundles }: { existing: VisitBundle | null; bundles: VisitBundle[] }) {
  const otherBundles = useMemo(() => bundles.filter((b) => b.visit.id !== existing?.visit.id), [bundles, existing]);
  const hints = useMemo(() => nameHintsFrom(otherBundles), [otherBundles]);
  const shops = useMemo(() => distinctShops(otherBundles), [otherBundles]);
  const lastVisit = otherBundles[0] ?? null;

  const regulation = useRegulationItems() ?? [];
  const { form, setForm, dirty, setDirty, edit, handlers } = useVisitFormState(() => (existing ? bundleToForm(existing) : emptyVisitForm()), hints, shops, regulation);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<null | 'warnings' | 'cancel' | 'copy'>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const components = useComponents() ?? [];
  const tree = useMemo(() => componentTree(components), [components]);

  const check = useMemo(() => checkVisitForm(form), [form]);
  const issues = useMemo(() => (submitted ? Object.fromEntries(check.errors.map((e) => [e.path, e.message])) : {}), [check, submitted]);
  const warnings = useMemo(() => Object.fromEntries(check.warnings.map((w) => [w.path, w.message])), [check]);

  const copyLast = () => {
    if (!lastVisit) return;
    setForm(copyVisitToForm(lastVisit));
    setDirty(true);
    setConfirm(null);
  };

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
      {!existing && (
        <section className="card card--tools" aria-label="Быстрое заполнение">
          <div className="btn-row">
            <select
              className="input input--compact"
              aria-label="Вставить шаблон"
              value=""
              onChange={(e) => {
                const t = VISIT_TEMPLATES.find((x) => x.id === e.target.value);
                if (t) edit((f) => applyTemplate(f, t, hints, regulation));
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

      <VisitFields
        form={form}
        handlers={handlers}
        hints={hints}
        shops={shops}
        components={components}
        tree={tree}
        regulation={regulation}
        issues={issues}
        warnings={warnings}
      />

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

      <ConfirmDialog open={confirm === 'warnings'} title="Сохранить с предупреждениями?" confirmLabel="Сохранить" onConfirm={() => void doSave()} onCancel={() => setConfirm(null)}>
        <ul className="plain-list">
          {check.warnings.map((w) => (
            <li key={w.path}>{w.message}</li>
          ))}
        </ul>
      </ConfirmDialog>
      <ConfirmDialog open={confirm === 'cancel'} title="Выйти без сохранения?" confirmLabel="Выйти" danger onConfirm={leave} onCancel={() => setConfirm(null)}>
        <p>Введённые данные пропадут.</p>
      </ConfirmDialog>
      <ConfirmDialog open={confirm === 'copy'} title="Заменить введённое?" confirmLabel="Скопировать" onConfirm={copyLast} onCancel={() => setConfirm(null)}>
        <p>Форма заполнится данными визита от {lastVisit ? formatDate(lastVisit.visit.date) : ''}. Уже введённое пропадёт.</p>
      </ConfirmDialog>
    </form>
  );
}
