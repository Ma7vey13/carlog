import { useMemo, useState } from 'react';
import { hrefFor, type Route } from '../../app/routes';
import { formatDate, formatLocalDate } from '../../core/format';
import { DOCUMENT_TYPE_LABELS, DRAFT_STATUS_LABELS } from '../../core/labels';
import type { Draft } from '../../core/model';
import { getDb } from '../../db/db';
import { isOpenDraft, rejectAllOpenDrafts, restoreAllRejectedDrafts, restoreDraft } from '../../db/drafts';
import { useDrafts, useScans } from '../../db/hooks';
import { ConfirmDialog } from '../../ui/Dialog';
import { EmptyState } from '../../ui/EmptyState';
import { InboxIcon } from '../../ui/icons';
import { ScanThumb } from '../review/ScanViewer';
import { AddDocument, ImportJson, inboxHref } from './AddDocument';
import { DraftScreen } from './DraftScreen';

/** Inbox router: list, `/inbox/<draftId>`. */
export function InboxScreen({ route }: { route: Route }) {
  const [first] = route.rest;
  if (first) return <DraftScreen id={first} />;
  return <InboxList />;
}

function InboxList() {
  const drafts = useDrafts();
  const open = useMemo(() => (drafts ?? []).filter(isOpenDraft), [drafts]);
  const archived = useMemo(() => (drafts ?? []).filter((d) => !isOpenDraft(d)), [drafts]);
  const rejectedCount = archived.filter((d) => d.status === 'rejected').length;
  const [confirmRejectAll, setConfirmRejectAll] = useState(false);

  if (drafts === undefined) return <p className="muted">Загрузка…</p>;

  return (
    <div className="stack">
      <section className="card">
        <h2 className="card__title">Добавить документ</h2>
        <p className="hint">Заказ-наряд, акт, накладная или чек. Несколько фото, выбранных разом, — это страницы одного документа.</p>
        <AddDocument />
        <ImportJson />
      </section>

      {open.length === 0 ? (
        <EmptyState icon={<InboxIcon />} title="Входящих нет">
          <p>Добавьте скан — он появится здесь и будет ждать распознавания и проверки.</p>
        </EmptyState>
      ) : (
        <>
          {open.length > 1 && (
            <div className="inbox-toolbar">
              <span className="muted">Черновиков: {open.length}</span>
              <button type="button" className="btn btn--danger-outline" onClick={() => setConfirmRejectAll(true)}>
                Отклонить все
              </button>
            </div>
          )}
          <ul className="feed" aria-label="Черновики">
            {open.map((d) => (
              <li key={d.id}>
                <DraftRow draft={d} />
              </li>
            ))}
          </ul>
        </>
      )}

      <ConfirmDialog
        open={confirmRejectAll}
        title="Отклонить все черновики?"
        confirmLabel={`Отклонить ${open.length}`}
        danger
        onConfirm={() => {
          setConfirmRejectAll(false);
          void rejectAllOpenDrafts(getDb());
        }}
        onCancel={() => setConfirmRejectAll(false)}
      >
        <p>
          В архив уйдут все черновики ({open.length}). Сканы сохранятся, а черновики можно будет вернуть — по одному или кнопкой «Вернуть все отклонённые».
        </p>
      </ConfirmDialog>

      {archived.length > 0 && (
        <details className="card archive">
          <summary>Архив ({archived.length})</summary>
          {rejectedCount > 1 && (
            <button type="button" className="btn btn--secondary archive__restore-all" onClick={() => void restoreAllRejectedDrafts(getDb())}>
              Вернуть все отклонённые ({rejectedCount})
            </button>
          )}
          <ul className="feed" aria-label="Архив">
            {archived.map((d) => (
              <li key={d.id} className="archive__row">
                <DraftRow draft={d} />
                {d.status === 'accepted' && d.visitId && (
                  <a className="btn btn--ghost" href={hrefFor(`/history/${d.visitId}`)}>
                    К визиту
                  </a>
                )}
                {d.status === 'rejected' && (
                  <button type="button" className="btn btn--ghost" onClick={() => void restoreDraft(getDb(), d.id)}>
                    Вернуть во входящие
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function DraftRow({ draft }: { draft: Draft }) {
  const scans = useScans(draft.scanIds.slice(0, 1));
  const payload = draft.payload as { document?: { type?: keyof typeof DOCUMENT_TYPE_LABELS; number?: string | null; date?: string | null } } | null;
  const doc = payload?.document;
  const title = doc?.type ? `${DOCUMENT_TYPE_LABELS[doc.type]}${doc.number ? ` № ${doc.number}` : ''}${doc.date ? ` от ${formatDate(doc.date)}` : ''}` : 'Документ';
  const pages = draft.scanIds.length;
  return (
    <a className="draft-row" href={inboxHref(draft.id)} data-testid="draft-row">
      <ScanThumb scan={scans?.[0]} />
      <span className="draft-row__body">
        <span className="draft-row__title">{title}</span>
        <span className="muted">
          {pages ? `${pages} стр. · ` : 'без скана · '}добавлен {formatLocalDate(draft.createdAt)}
        </span>
      </span>
      <span className={`chip chip--${draft.status}`}>{DRAFT_STATUS_LABELS[draft.status]}</span>
    </a>
  );
}
