import { useMemo, useState } from 'react';
import { hrefFor, type Route } from '../../app/routes';
import { formatDate, formatLocalDate } from '../../core/format';
import { DOCUMENT_TYPE_LABELS, DRAFT_STATUS_LABELS } from '../../core/labels';
import type { Draft } from '../../core/model';
import { getDb } from '../../db/db';
import { ARCHIVE_KEEP_DAYS, archivedAtOf, clearArchive, isOpenDraft, rejectAllOpenDrafts, restoreAllRejectedDrafts, restoreDraft } from '../../db/drafts';
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
  const [confirmClear, setConfirmClear] = useState(false);
  const [cleared, setCleared] = useState<string | null>(null);

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
          <p className="hint">Записи удаляются из архива сами через {ARCHIVE_KEEP_DAYS} дней. Сохранённые визиты и их сканы остаются в «Истории».</p>
          <div className="btn-row">
            <button type="button" className="btn btn--danger-outline" onClick={() => setConfirmClear(true)}>
              Очистить архив
            </button>
            {rejectedCount > 1 && (
              <button type="button" className="btn btn--secondary archive__restore-all" onClick={() => void restoreAllRejectedDrafts(getDb())}>
                Вернуть все отклонённые ({rejectedCount})
              </button>
            )}
          </div>
          <ul className="feed" aria-label="Архив">
            {archived.map((d) => (
              <li key={d.id} className="archive__row">
                <DraftRow draft={d} />
                <span className="hint" data-testid="archive-until">
                  В архиве с {formatLocalDate(archivedAtOf(d))}, удалится {formatLocalDate(archiveEnd(d))}
                </span>
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
      {cleared && (
        <p className="notice notice--info" role="status" data-testid="archive-cleared">
          {cleared}
        </p>
      )}

      <ConfirmDialog
        open={confirmClear}
        title="Очистить архив?"
        confirmLabel={`Удалить ${archived.length}`}
        danger
        onConfirm={() => {
          setConfirmClear(false);
          void clearArchive(getDb()).then((r) => setCleared(`Архив очищен: записей — ${r.drafts}, сканов — ${r.scans}.`));
        }}
        onCancel={() => setConfirmClear(false)}
      >
        <p>
          Из архива удалятся все записи ({archived.length}). Сканы отклонённых документов удалятся с устройства, вернуть их будет нельзя. Сохранённые
          визиты и их сканы останутся в «Истории».
        </p>
      </ConfirmDialog>
    </div>
  );
}

/** When the draft leaves the archive by itself. */
function archiveEnd(d: Draft): string {
  return new Date(Date.parse(archivedAtOf(d)) + ARCHIVE_KEEP_DAYS * 86_400_000).toISOString();
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
