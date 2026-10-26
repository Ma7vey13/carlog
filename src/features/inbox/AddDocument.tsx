import { useRef, useState } from 'react';
import { hrefFor } from '../../app/routes';
import { parseDraftText } from '../../core/draftSchema';
import type { Id } from '../../core/model';
import { getDb } from '../../db/db';
import { addPagesToDraft, createDraftFromJson, createDraftFromScans } from '../../db/drafts';
import { storeScans } from '../../db/scans';
import { processFiles, ScanError } from '../../scan/process';
import { PlusIcon } from '../../ui/icons';

/**
 * "Добавить документ" (SPEC section 6): camera, gallery or PDF. Everything picked at once is one
 * document; pages are compressed, stored and a draft "ждёт распознавания" is created.
 * With `draftId` the pages are appended to that draft instead ("Добавить страницу").
 */
export function AddDocument({ draftId }: { draftId?: Id }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFiles = async (list: FileList | null) => {
    const files = [...(list ?? [])];
    if (!files.length) return;
    setError(null);
    setProgress('Обрабатываю…');
    try {
      const pages = await processFiles(files, setProgress);
      setProgress('Сохраняю…');
      const db = getDb();
      const scanIds = await storeScans(db, pages);
      if (draftId) {
        await addPagesToDraft(db, draftId, scanIds);
      } else {
        const id = await createDraftFromScans(db, scanIds);
        window.location.hash = `/inbox/${id}`;
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof ScanError ? err.message : 'Не удалось обработать файл. Попробуйте ещё раз или выберите другой файл.');
    } finally {
      setProgress(null);
      if (cameraRef.current) cameraRef.current.value = '';
      if (filesRef.current) filesRef.current.value = '';
    }
  };

  return (
    <div className="stack">
      <div className="btn-row">
        <button type="button" className={draftId ? 'btn btn--secondary' : 'btn btn--primary'} disabled={!!progress} onClick={() => cameraRef.current?.click()}>
          <PlusIcon width={18} height={18} /> {draftId ? 'Сфотографировать страницу' : 'Сфотографировать'}
        </button>
        <button type="button" className="btn btn--secondary" disabled={!!progress} onClick={() => filesRef.current?.click()}>
          {draftId ? 'Добавить страницу из файла' : 'Выбрать фото или PDF'}
        </button>
      </div>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        data-testid="camera-input"
        onChange={(e) => void onFiles(e.target.files)}
      />
      <input
        ref={filesRef}
        type="file"
        accept="image/*,application/pdf,.pdf"
        multiple
        hidden
        data-testid="files-input"
        onChange={(e) => void onFiles(e.target.files)}
      />
      {progress && (
        <p className="muted" role="status">
          {progress}
        </p>
      )}
      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** "Импорт JSON-файла": a draft file (from a chat, Claude Code or another device). */
export function ImportJson({ draftId, onImported }: { draftId?: Id; onImported?: (payload: unknown) => void | Promise<void> }) {
  const ref = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setErrors([]);
    const result = parseDraftText(await file.text());
    if (ref.current) ref.current.value = '';
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    if (onImported) await onImported(result.draft);
    else if (!draftId) {
      const id = await createDraftFromJson(getDb(), result.draft);
      window.location.hash = `/inbox/${id}`;
    }
  };

  return (
    <div className="stack">
      <button type="button" className="btn btn--secondary" onClick={() => ref.current?.click()}>
        Импорт JSON-файла
      </button>
      <input ref={ref} type="file" accept=".json,application/json,text/plain" hidden data-testid="json-input" onChange={(e) => void onFile(e.target.files?.[0])} />
      {errors.length > 0 && <IssueList title="Файл не подходит" errors={errors} />}
    </div>
  );
}

export function IssueList({ title, errors }: { title: string; errors: string[] }) {
  const shown = errors.slice(0, 12);
  return (
    <div className="notice notice--error" role="alert" data-testid="draft-errors">
      <p className="notice__title">{title}</p>
      <ul className="plain-list">
        {shown.map((e, i) => (
          <li key={i}>{e}</li>
        ))}
      </ul>
      {errors.length > shown.length && <p className="notice__hint">…и ещё {errors.length - shown.length}</p>}
    </div>
  );
}

export const inboxHref = (id: Id) => hrefFor(`/inbox/${id}`);
