import { useRef, useState } from 'react';
import { hrefFor } from '../../app/routes';
import { parseDraftText } from '../../core/draftSchema';
import type { Id } from '../../core/model';
import { getDb } from '../../db/db';
import { addPagesToDraft, createDraftFromJson, createDraftFromScans } from '../../db/drafts';
import { ScanPicker } from '../scans/ScanPicker';

/**
 * "Добавить документ" (SPEC section 6): camera, gallery or PDF. Everything picked at once is one
 * document; pages are compressed, stored and a draft "ждёт распознавания" is created.
 * With `draftId` the pages are appended to that draft instead ("Добавить страницу").
 */
export function AddDocument({ draftId }: { draftId?: Id }) {
  return (
    <ScanPicker
      primary={!draftId}
      cameraLabel={draftId ? 'Сфотографировать страницу' : 'Сфотографировать'}
      filesLabel={draftId ? 'Добавить страницу из файла' : 'Выбрать фото или PDF'}
      onStored={async (scanIds) => {
        const db = getDb();
        if (draftId) {
          await addPagesToDraft(db, draftId, scanIds);
        } else {
          const id = await createDraftFromScans(db, scanIds);
          window.location.hash = `/inbox/${id}`;
        }
      }}
    />
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
