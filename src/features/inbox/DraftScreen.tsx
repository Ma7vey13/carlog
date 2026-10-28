import { useState } from 'react';
import { usePageHeader } from '../../app/pageHeader';
import { hrefFor } from '../../app/routes';
import { buildChatPrompt } from '../../core/draftPrompt';
import { DRAFT_STATUS_LABELS } from '../../core/labels';
import { parseDraftText } from '../../core/draftSchema';
import type { Draft, Id } from '../../core/model';
import { getDb } from '../../db/db';
import { rejectDraft, restoreDraft, setDraftPayload, splitDraftByPages, startManualReview } from '../../db/drafts';
import { useDraft, useScans } from '../../db/hooks';
import { copyText, shareScans } from '../../scan/share';
import { ConfirmDialog } from '../../ui/Dialog';
import { TextAreaField } from '../../ui/Field';
import { helpHref } from '../help/guides';
import { ReviewScreen } from '../review/ReviewScreen';
import { ScanViewer } from '../review/ScanViewer';
import { AddDocument, ImportJson, IssueList } from './AddDocument';

export function DraftScreen({ id }: { id: Id }) {
  const draft = useDraft(id);
  usePageHeader(draft?.status === 'ready' ? 'Проверка документа' : 'Черновик', hrefFor('/inbox'));

  if (draft === undefined) return <p className="muted">Загрузка…</p>;
  if (draft === null || draft.deleted) {
    return (
      <p>
        Черновик не найден. <a href={hrefFor('/inbox')}>Во входящие</a>
      </p>
    );
  }
  if (draft.status === 'ready') return <ReviewScreen key={draft.id + draft.updatedAt} draft={draft} />;
  if (draft.status === 'pending') return <RecognizeView draft={draft} />;
  return <ArchivedView draft={draft} />;
}

/** Waiting for recognition: method Б (any chat AI), JSON import, manual entry (SPEC section 6). */
function RecognizeView({ draft }: { draft: Draft }) {
  const scans = useScans(draft.scanIds);
  const [answer, setAnswer] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);
  const [confirmSplit, setConfirmSplit] = useState(false);
  const prompt = buildChatPrompt();

  const copyPrompt = async () => setCopied((await copyText(prompt)) ? 'ok' : 'failed');

  const openScan = async () => {
    if (!scans?.length) return;
    const result = await shareScans(scans);
    setShareNote(result === 'downloaded' ? 'Страницы сохранены в «Загрузки» — прикрепите их в чат.' : null);
  };

  const submit = async () => {
    const result = parseDraftText(answer);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    await setDraftPayload(getDb(), draft.id, result.draft);
  };

  return (
    <div className="stack review-pending">
      <ScanViewer scans={scans ?? []} />

      <section className="card" aria-label="Распознать через чат">
        <h2 className="card__title">Распознать через чат-ИИ</h2>
        <ol className="steps">
          <li>
            <p>Скопируйте промпт и вставьте его в чат (Gemini, Claude и т. п.).</p>
            <button type="button" className="btn btn--primary" onClick={() => void copyPrompt()}>
              Скопировать промпт
            </button>
            {copied === 'ok' && (
              <p className="hint" role="status">
                Промпт скопирован.
              </p>
            )}
            {copied === 'failed' && (
              <TextAreaField label="Не удалось скопировать — выделите текст и скопируйте вручную" rows={6} readOnly value={prompt} onFocus={(e) => e.currentTarget.select()} />
            )}
          </li>
          <li>
            <p>Прикрепите к сообщению скан.</p>
            <button type="button" className="btn btn--secondary" disabled={!scans?.length} onClick={() => void openScan()}>
              Открыть скан
            </button>
            {shareNote && <p className="hint">{shareNote}</p>}
          </li>
          <li>
            <p>Вставьте ответ чата целиком — приложение само найдёт в нём JSON.</p>
            <TextAreaField label="Вставить результат" rows={6} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="```json { … } ```" />
            <button type="button" className="btn btn--primary" disabled={!answer.trim()} onClick={() => void submit()}>
              Проверить и продолжить
            </button>
            {errors.length > 0 && <IssueList title="Ответ не подходит — попросите чат исправить или поправьте сами" errors={errors} />}
          </li>
        </ol>
        <ImportJson draftId={draft.id} onImported={(payload) => setDraftPayload(getDb(), draft.id, payload as never)} />
      </section>

      <section className="card" aria-label="Другие действия">
        <h2 className="card__title">Ещё</h2>
        {draft.scanIds.length > 1 && (
          <>
            <p className="hint">
              В файле {draft.scanIds.length} стр. Если это разные документы (например, архив накладных одним PDF) — разделите: каждая страница
              станет отдельным черновиком.
            </p>
            <button type="button" className="btn btn--secondary" style={{ justifySelf: 'start' }} onClick={() => setConfirmSplit(true)}>
              Это разные документы — разделить по страницам
            </button>
          </>
        )}
        <AddDocument draftId={draft.id} />
        <div className="btn-row">
          <button type="button" className="btn btn--secondary" onClick={() => void startManualReview(getDb(), draft.id)}>
            Ввести вручную
          </button>
          <button type="button" className="btn btn--danger-outline" onClick={() => setConfirmReject(true)}>
            Отклонить
          </button>
        </div>
        <p className="hint">
          Есть подписка на Claude? Отправьте сканы («Ещё → Отправить») и распознайте их пачкой на компьютере командой /parse-scans —{' '}
          <a href={helpHref('claude')}>инструкция</a>.
        </p>
      </section>

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
      <ConfirmDialog
        open={confirmSplit}
        title="Разделить по страницам?"
        confirmLabel="Разделить"
        onConfirm={() => {
          setConfirmSplit(false);
          void splitDraftByPages(getDb(), draft.id).then(() => window.location.replace(hrefFor('/inbox')));
        }}
        onCancel={() => setConfirmSplit(false)}
      >
        <p>Получится {draft.scanIds.length} отдельных черновиков — по одному на страницу. Многостраничный документ так делить не нужно.</p>
      </ConfirmDialog>
    </div>
  );
}

function ArchivedView({ draft }: { draft: Draft }) {
  const scans = useScans(draft.scanIds);
  return (
    <div className="stack">
      <section className="card">
        <p>
          <span className={`chip chip--${draft.status}`}>{DRAFT_STATUS_LABELS[draft.status]}</span>
        </p>
        {draft.status === 'accepted' && draft.visitId && (
          <a className="btn btn--primary" href={hrefFor(`/history/${draft.visitId}`)}>
            Открыть визит
          </a>
        )}
        {draft.status === 'rejected' && (
          <button type="button" className="btn btn--secondary" onClick={() => void restoreDraft(getDb(), draft.id)}>
            Вернуть во входящие
          </button>
        )}
      </section>
      <ScanViewer scans={scans ?? []} />
    </div>
  );
}
