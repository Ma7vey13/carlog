import { useMemo, useState } from 'react';
import { hrefFor } from '../../app/routes';
import type { VisitBundle } from '../../core/bundle';
import { allConfirmed, confirmationKey, runChecks, type Check, type ReviewDecision } from '../../core/checks';
import { todayIso } from '../../core/dates';
import { formatDate } from '../../core/format';
import type { DraftV1 } from '../../core/draftSchema';
import { draftToForm } from '../../core/draftToForm';
import { mileagePoints } from '../../core/mileage';
import type { Draft, ExpectedPartRule, Id, MatchRule, MileageEntry } from '../../core/model';
import { checkVisitForm, emptyDocument, emptyVisitForm, nameHintsFrom } from '../../core/visitForm';
import { getDb } from '../../db/db';
import { rejectDraft, saveReviewedDraft } from '../../db/drafts';
import {
  componentTree,
  useComponents,
  useExpectedPartRules,
  useMatchRules,
  useMileage,
  useRegulationItems,
  useScans,
  useVisitBundles,
} from '../../db/hooks';
import { ConfirmDialog } from '../../ui/Dialog';
import { distinctShops, useVisitFormState, VisitFields } from '../history/VisitFields';
import { ChecksPanel } from './ChecksPanel';
import { ScanViewer } from './ScanViewer';

/** Review screen (SPEC section 7): scan next to the editable document, with automatic checks. */
export function ReviewScreen({ draft }: { draft: Draft }) {
  const bundles = useVisitBundles();
  const mileage = useMileage();
  const rules = useExpectedPartRules();
  const matchRules = useMatchRules();
  if (!bundles || !mileage || !rules || !matchRules) return <p className="muted">Загрузка…</p>;
  return <ReviewForm draft={draft} bundles={bundles} mileage={mileage} rules={rules} matchRules={matchRules} />;
}

interface FormProps {
  draft: Draft;
  bundles: VisitBundle[];
  mileage: MileageEntry[];
  rules: ExpectedPartRule[];
  matchRules: MatchRule[];
}

function focusFieldByLabel(text: string) {
  const label = [...document.querySelectorAll('label')].find((l) => l.textContent === text);
  const input = label?.htmlFor ? document.getElementById(label.htmlFor) : null;
  input?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  (input as HTMLInputElement | null)?.focus({ preventScroll: true });
}

function ReviewForm({ draft, bundles, mileage, rules, matchRules }: FormProps) {
  const payload = draft.payload as DraftV1 | null;
  const hints = useMemo(() => nameHintsFrom(bundles), [bundles]);
  const shops = useMemo(() => distinctShops(bundles), [bundles]);
  const { form, handlers } = useVisitFormState(
    () =>
      payload
        ? draftToForm(payload, { hints, rules: matchRules, scanIds: draft.scanIds })
        : { ...emptyVisitForm(), documents: [{ ...emptyDocument('work_order'), scanIds: draft.scanIds }] },
    hints,
    shops,
  );

  const scans = useScans(draft.scanIds);
  const components = useComponents() ?? [];
  const regulation = useRegulationItems() ?? [];
  const tree = useMemo(() => componentTree(components), [components]);

  const [decision, setDecision] = useState<ReviewDecision>({ mode: 'new' });
  const [replaceIds, setReplaceIds] = useState<Id[]>([]);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<'scan' | 'data'>('data');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);

  const points = useMemo(() => mileagePoints(mileage), [mileage]);
  const checks = useMemo(
    () => runChecks(form, { history: bundles, mileage: points, rules, today: todayIso(), decision }),
    [form, bundles, points, rules, decision],
  );
  const formCheck = useMemo(() => checkVisitForm(form), [form]);
  const issues = useMemo(() => (submitted ? Object.fromEntries(formCheck.errors.map((e) => [e.path, e.message])) : {}), [formCheck, submitted]);
  const flaggedLineKeys = useMemo(
    () => new Set(checks.filter((c) => c.lineKey && !confirmed.has(confirmationKey(c))).map((c) => c.lineKey!)),
    [checks, confirmed],
  );
  const openCount = checks.filter((c) => !confirmed.has(confirmationKey(c))).length;
  const ready = allConfirmed(checks, confirmed) && formCheck.errors.length === 0;
  const target = decision.mode === 'new' ? null : bundles.find((b) => b.visit.id === decision.visitId);

  const confirm = (check: Check, on: boolean) =>
    setConfirmed((prev) => {
      const next = new Set(prev);
      if (on) next.add(confirmationKey(check));
      else next.delete(confirmationKey(check));
      return next;
    });

  const choose = (d: ReviewDecision, ids: Id[], check: Check) => {
    setDecision(d);
    setReplaceIds(d.mode === 'replace' ? ids : []);
    if (check.kind === 'duplicate') confirm(check, true);
  };

  const showLine = (lineKey: string) => {
    setTab('data');
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-line-key="${lineKey}"]`);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el?.classList.add('line--pulse');
      setTimeout(() => el?.classList.remove('line--pulse'), 1200);
    });
  };

  const save = async () => {
    setSubmitted(true);
    if (!ready) return;
    setSaving(true);
    setSaveError(null);
    try {
      const visitId = await saveReviewedDraft(getDb(), { draftId: draft.id, form, decision, replaceDocumentIds: replaceIds });
      window.location.replace(hrefFor(`/history/${visitId}`));
    } catch (err) {
      console.error(err);
      setSaveError('Не удалось сохранить. Попробуйте ещё раз.');
      setSaving(false);
    }
  };

  const docKey = form.documents[0]?.key;

  return (
    <div className="review" data-tab={tab}>
      <div className="review__tabs segmented segmented--2" role="tablist" aria-label="Скан или данные">
        <button type="button" role="tab" aria-selected={tab === 'scan'} className="segmented__item" onClick={() => setTab('scan')}>
          Скан{scans?.length ? ` (${scans.length})` : ''}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'data'} className="segmented__item" onClick={() => setTab('data')}>
          Данные{openCount ? ` · ${openCount} замеч.` : ''}
        </button>
      </div>

      <div className="review__scan">{scans?.length ? <ScanViewer scans={scans} /> : <p className="muted card">Документ без скана.</p>}</div>

      <form
        className="review__data stack editor"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <ChecksPanel
          checks={checks}
          confirmed={confirmed}
          decision={decision}
          onConfirm={confirm}
          onDecision={choose}
          onAddCustomerPart={(check) => {
            if (docKey && check.partName) handlers.onAddLine(docKey, 'part', { rawName: check.partName, qty: '', customerPart: true });
          }}
          onPurchaseOnly={(key) => handlers.onDocChange(key, { purchaseOnly: true })}
          onEnterMileage={() => {
            setTab('data');
            requestAnimationFrame(() => focusFieldByLabel('Пробег, км'));
          }}
          onShowLine={showLine}
        />

        {target && (
          <div className="notice notice--info" data-testid="decision-note">
            {decision.mode === 'replace' ? 'Строки заменят документ в визите' : 'Документ будет добавлен к визиту'} от {formatDate(target.visit.date)}.{' '}
            <button type="button" className="link-btn" onClick={() => setDecision({ mode: 'new' })}>
              Отменить
            </button>
          </div>
        )}

        {payload && payload.notes.length > 0 && (
          <div className="notice notice--warning">
            <p className="notice__title">Заметки распознавателя</p>
            <ul className="plain-list">
              {payload.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
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
          warnings={{}}
          review={{ flaggedLineKeys }}
        />

        <div className="savebar">
          {submitted && formCheck.errors.length > 0 && (
            <div className="notice notice--error" role="alert">
              Исправьте ошибки: {formCheck.errors.map((e) => e.message).join('; ')}
            </div>
          )}
          {saveError && (
            <div className="notice notice--error" role="alert">
              {saveError}
            </div>
          )}
          <div className="savebar__buttons">
            <button type="button" className="btn btn--ghost" onClick={() => setConfirmReject(true)}>
              Отклонить
            </button>
            <button type="submit" className="btn btn--primary" disabled={saving || !ready} data-testid="save-review">
              {saving ? 'Сохраняю…' : openCount ? `Подтвердите замечания: ${openCount}` : 'Сохранить визит'}
            </button>
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={confirmReject}
        title="Отклонить черновик?"
        confirmLabel="Отклонить"
        danger
        onConfirm={() => {
          setConfirmReject(false);
          void rejectDraft(getDb(), draft.id).then(() => window.location.replace(hrefFor('/inbox')));
        }}
        onCancel={() => setConfirmReject(false)}
      >
        <p>Черновик уйдёт в архив, сканы сохранятся. Его можно будет вернуть.</p>
      </ConfirmDialog>
    </div>
  );
}
