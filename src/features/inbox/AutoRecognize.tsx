import { useState } from 'react';
import { hrefFor } from '../../app/routes';
import { buildChatPrompt } from '../../core/draftPrompt';
import { parseDraftText } from '../../core/draftSchema';
import { plural } from '../../core/format';
import type { Draft, Scan } from '../../core/model';
import { getDb } from '../../db/db';
import { setDraftPayload } from '../../db/drafts';
import { useRecognitionSettings } from '../../db/hooks';
import { blobToDataUrl, RECOGNIZE_ERROR_TEXT, RecognizeError, recognizeImages } from '../../recognize/openrouter';
import { scanFiles } from '../../scan/share';
import { SelectField } from '../../ui/Field';
import { useFreeModels } from '../more/RecognitionScreen';
import { IssueList } from './AddDocument';

/**
 * "Распознать" (D-100, test): the pages go to a free OpenRouter model with the chat prompt; a valid
 * answer fills the draft and the review screen opens, as after pasting a chat answer.
 */
export function AutoRecognize({ draft, scans }: { draft: Draft; scans: Scan[] | undefined }) {
  const settings = useRecognitionSettings();
  // The list is loaded only once a key is set: no requests to openrouter.ai otherwise.
  const { models } = useFreeModels(!!settings?.apiKey);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answerErrors, setAnswerErrors] = useState<string[]>([]);

  if (!settings) return null;
  if (!settings.apiKey) {
    return (
      <section className="card" aria-label="Распознать автоматически" data-testid="auto-recognize">
        <h2 className="card__title">Распознать одним нажатием</h2>
        <p className="hint">Бесплатно через OpenRouter, без копирования промпта и ответа. Нужен ключ — настройка один раз.</p>
        <a className="btn btn--secondary" href={hrefFor('/more/recognition')} style={{ justifySelf: 'start' }}>
          Настроить
        </a>
      </section>
    );
  }

  const model = picked ?? settings.model ?? models?.[0]?.id ?? null;
  const pages = scans?.length ?? 0;

  const run = async () => {
    if (!model || !scans?.length) return;
    setBusy(true);
    setError(null);
    setAnswerErrors([]);
    try {
      const images = await Promise.all((await scanFiles(scans)).map(blobToDataUrl));
      const text = await recognizeImages({ apiKey: settings.apiKey!, model, prompt: buildChatPrompt(), images });
      const result = parseDraftText(text);
      if (!result.ok) {
        setAnswerErrors(result.errors);
        return;
      }
      await setDraftPayload(getDb(), draft.id, result.draft);
    } catch (err) {
      setError(err instanceof RecognizeError ? RECOGNIZE_ERROR_TEXT[err.kind] : 'Не удалось распознать. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card" aria-label="Распознать автоматически" data-testid="auto-recognize">
      <h2 className="card__title">Распознать одним нажатием</h2>
      {models && models.length > 1 && (
        <SelectField label="Модель" value={model ?? ''} disabled={busy} onChange={(e) => setPicked(e.target.value)}>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </SelectField>
      )}
      <button type="button" className="btn btn--primary" style={{ justifySelf: 'start' }} disabled={busy || !model || !pages} onClick={() => void run()}>
        {busy ? 'Распознаю…' : 'Распознать'}
      </button>
      {busy && (
        <p className="hint" role="status">
          Отправил {pages} {plural(pages, 'страницу', 'страницы', 'страниц')}. Обычно это занимает до минуты — не закрывайте приложение.
        </p>
      )}
      {error && (
        <p className="inline-error" role="alert" data-testid="auto-recognize-error">
          {error}
        </p>
      )}
      {answerErrors.length > 0 && <IssueList title="Модель ответила не по формату — попробуйте ещё раз или другую модель" errors={answerErrors} />}
      <p className="hint">Тест. Если не получилось — ниже прежний способ через чат-ИИ.</p>
    </section>
  );
}
