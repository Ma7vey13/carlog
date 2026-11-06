import { useEffect, useState } from 'react';
import { usePageHeader } from '../../app/pageHeader';
import { hrefFor } from '../../app/routes';
import { getDb } from '../../db/db';
import { useRecognitionSettings } from '../../db/hooks';
import { forgetRecognitionKey, saveRecognitionSettings } from '../../db/recognition';
import { checkKey, loadFreeVisionModels, RECOGNIZE_ERROR_TEXT, RecognizeError, type FreeModel } from '../../recognize/openrouter';
import { ConfirmDialog } from '../../ui/Dialog';
import { SelectField, TextField } from '../../ui/Field';

/** The free models, loaded once per screen; null while loading, an error text on failure. */
export function useFreeModels(enabled = true): { models: FreeModel[] | null; error: string | null; reload: () => void } {
  const [models, setModels] = useState<FreeModel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setModels(null);
    setError(null);
    loadFreeVisionModels()
      .then((m) => alive && setModels(m))
      .catch((err: unknown) => alive && setError(err instanceof RecognizeError ? RECOGNIZE_ERROR_TEXT[err.kind] : 'Не удалось загрузить список моделей.'));
    return () => {
      alive = false;
    };
  }, [n, enabled]);
  return { models, error, reload: () => setN((x) => x + 1) };
}

const mask = (key: string) => (key.length > 12 ? `${key.slice(0, 6)}…${key.slice(-4)}` : '••••');

/** "Ещё → Распознавание" (D-100): the owner's OpenRouter key and the model. */
export function RecognitionScreen() {
  usePageHeader('Распознавание', hrefFor('/more'));
  const settings = useRecognitionSettings();
  const { models, error: modelsError, reload } = useFreeModels();
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmForget, setConfirmForget] = useState(false);

  if (!settings) return <p className="muted">Загрузка…</p>;

  const verify = async (apiKey: string) => {
    setBusy(true);
    setStatus(null);
    try {
      const info = await checkKey(apiKey);
      const spend = info.limit === 0 ? 'тратить деньги ключ не может' : info.limit === null ? 'лимит трат не задан — лучше поставить 0' : `лимит трат ${info.limit}`;
      setStatus({ ok: true, text: `Ключ работает${info.label ? ` («${info.label}»)` : ''}: ${spend}.` });
    } catch (err) {
      setStatus({ ok: false, text: err instanceof RecognizeError ? RECOGNIZE_ERROR_TEXT[err.kind] : 'Не удалось проверить ключ.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <p className="notice notice--info">
        <strong>Тест.</strong> Кнопка «Распознать» в черновике отправляет снимок бесплатной нейросети через OpenRouter и сама заполняет черновик.
        Без ключа приложение работает как раньше.
      </p>

      <section className="card" aria-label="Как получить ключ">
        <h2 className="card__title">Как получить ключ — один раз</h2>
        <ol className="steps">
          <li>
            <p>
              Откройте <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer">openrouter.ai</a> и войдите через Google или почту
              (кнопка Sign in). Проверьте, открывается ли сайт без VPN.
            </p>
          </li>
          <li>
            <p>
              <strong>Settings → Privacy:</strong> включите переключатели про бесплатные модели (free endpoints / free models). Без них OpenRouter не даёт
              бесплатные модели.
            </p>
          </li>
          <li>
            <p>
              <strong>Keys → Create Key:</strong> название «Бортжурнал», в поле <strong>Credit limit</strong> поставьте <strong>0</strong> — тогда
              ключ никогда не потратит деньги. Нажмите Create и скопируйте ключ (он начинается с «sk-or-» и показывается один раз).
            </p>
          </li>
          <li>
            <p>Вставьте ключ ниже и нажмите «Сохранить».</p>
          </li>
        </ol>
      </section>

      <section className="card" aria-label="Ключ OpenRouter">
        <h2 className="card__title">Ключ OpenRouter</h2>
        {settings.apiKey ? (
          <>
            <p data-testid="recognition-key">
              Сохранён на этом устройстве: <code>{mask(settings.apiKey)}</code>
            </p>
            <div className="btn-row">
              <button type="button" className="btn btn--secondary" disabled={busy} onClick={() => void verify(settings.apiKey!)}>
                {busy ? 'Проверяю…' : 'Проверить ключ'}
              </button>
              <button type="button" className="btn btn--danger-outline" onClick={() => setConfirmForget(true)}>
                Удалить ключ
              </button>
            </div>
          </>
        ) : (
          <form
            className="stack-sm"
            onSubmit={(e) => {
              e.preventDefault();
              const k = key.trim();
              if (!k) return;
              void saveRecognitionSettings(getDb(), { apiKey: k }).then(() => {
                setKey('');
                void verify(k);
              });
            }}
          >
            <TextField
              label="Ключ"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-or-v1-…"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <button type="submit" className="btn btn--primary" style={{ justifySelf: 'start' }} disabled={!key.trim()}>
              Сохранить
            </button>
          </form>
        )}
        {status && (
          <p className={status.ok ? 'hint' : 'inline-error'} role="status" data-testid="recognition-status">
            {status.text}
          </p>
        )}
        <p className="hint">Ключ хранится только на этом устройстве: не синхронизируется и не попадает в резервную копию. На другом устройстве вставьте его отдельно.</p>
      </section>

      <section className="card" aria-label="Модель">
        <h2 className="card__title">Модель</h2>
        {models ? (
          <SelectField
            label="Какой нейросетью распознавать"
            value={settings.model ?? ''}
            hint="Бесплатные модели, которые умеют читать фото. Если одна ошибается или не отвечает — попробуйте другую."
            onChange={(e) => void saveRecognitionSettings(getDb(), { model: e.target.value || null })}
          >
            <option value="">Автоматически: {models[0]?.name ?? 'первая доступная'}</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </SelectField>
        ) : modelsError ? (
          <div className="stack-sm">
            <p className="inline-error">{modelsError}</p>
            <button type="button" className="btn btn--secondary" style={{ justifySelf: 'start' }} onClick={reload}>
              Загрузить снова
            </button>
          </div>
        ) : (
          <p className="muted">Загружаю список бесплатных моделей…</p>
        )}
      </section>

      <p className="hint">
        Снимок документа уходит компании, которая запускает выбранную модель; бесплатные модели могут сохранять запросы. Это то же, что отправить фото в
        чат-ИИ. В историю ничего не попадёт без вашей проверки.
      </p>

      <ConfirmDialog
        open={confirmForget}
        title="Удалить ключ?"
        confirmLabel="Удалить"
        danger
        onConfirm={() => {
          setConfirmForget(false);
          setStatus(null);
          void forgetRecognitionKey(getDb());
        }}
        onCancel={() => setConfirmForget(false)}
      >
        <p>Кнопка «Распознать» пропадёт с этого устройства. Сам ключ на openrouter.ai останется — удалить его можно там же.</p>
      </ConfirmDialog>
    </div>
  );
}
