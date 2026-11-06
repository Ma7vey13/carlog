// Recognition through OpenRouter (D-100, a test at the owner's request): free models that read
// photos, called straight from the browser with the owner's own key. No server of ours in between.
// The key stays on this device; the scan goes to the company that runs the chosen model.

export const OPENROUTER_API = 'https://openrouter.ai/api/v1';

/** Tried first when the owner has not picked a model: strong on printed Russian text and tables. */
export const PREFERRED_MODELS = ['google/gemma-4-31b-it:free', 'nvidia/nemotron-3.5-super-vl:free', 'google/gemma-4-26b-a4b-it:free'];

/** OpenRouter's own router over free models: the last resort in the list. */
const FREE_ROUTER = 'openrouter/free';

export interface FreeModel {
  id: string;
  name: string;
}

interface RawModel {
  id?: unknown;
  name?: unknown;
  pricing?: Record<string, unknown>;
  architecture?: { input_modalities?: unknown; output_modalities?: unknown };
}

const isZero = (v: unknown) => v === undefined || v === null || Number(v) === 0;

/** Free models that take a picture and answer in text, preferred ones first. */
export function freeVisionModels(raw: readonly RawModel[]): FreeModel[] {
  const out: FreeModel[] = [];
  for (const m of raw) {
    if (typeof m.id !== 'string') continue;
    const p = m.pricing ?? {};
    const inputs = Array.isArray(m.architecture?.input_modalities) ? m.architecture.input_modalities : [];
    const outputs = Array.isArray(m.architecture?.output_modalities) ? m.architecture.output_modalities : ['text'];
    if (!isZero(p.prompt) || !isZero(p.completion) || !isZero(p.image) || !isZero(p.request)) continue;
    if (!inputs.includes('image') || !outputs.includes('text') || outputs.length !== 1) continue;
    out.push({ id: m.id, name: typeof m.name === 'string' ? m.name.replace(/\s*\(free\)\s*$/i, '') : m.id });
  }
  const rank = (id: string) => {
    const i = PREFERRED_MODELS.indexOf(id);
    if (i >= 0) return i;
    return id === FREE_ROUTER ? 1000 : 100;
  };
  return out.sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name));
}

export type RecognizeErrorKind = 'auth' | 'limit' | 'policy' | 'model' | 'network' | 'timeout' | 'empty';

export class RecognizeError extends Error {
  constructor(
    readonly kind: RecognizeErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'RecognizeError';
  }
}

/** What the owner should do, in Russian, for each kind of failure. */
export const RECOGNIZE_ERROR_TEXT: Record<RecognizeErrorKind, string> = {
  auth: 'Ключ не подошёл. Проверьте его в «Ещё → Распознавание» или создайте новый на openrouter.ai.',
  limit: 'Бесплатный лимит на сегодня исчерпан или модель перегружена. Попробуйте позже или другую модель.',
  policy:
    'OpenRouter не даёт бесплатные модели с вашими настройками приватности. На openrouter.ai → Settings → Privacy включите доступ к бесплатным моделям (см. «Ещё → Распознавание»).',
  model: 'Модель сейчас не ответила. Попробуйте ещё раз или выберите другую.',
  network: 'Нет связи с openrouter.ai. Проверьте интернет; если сайт не открывается без VPN — включите VPN.',
  timeout: 'Модель не ответила за 3 минуты. Попробуйте ещё раз или выберите другую.',
  empty: 'Модель прислала пустой ответ. Попробуйте ещё раз или выберите другую.',
};

type FetchFn = typeof fetch;

function headers(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    // Shown in the owner's OpenRouter activity list.
    'X-Title': 'Bortzhurnal',
  };
}

async function errorFrom(res: Response): Promise<RecognizeError> {
  let message = '';
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    message = body.error?.message ?? '';
  } catch {
    // not JSON
  }
  if (res.status === 401 || res.status === 403) return new RecognizeError('auth', message || 'unauthorized');
  if (res.status === 402 || res.status === 429) return new RecognizeError('limit', message || 'limit');
  if (res.status === 404 && /data policy|privacy|no endpoints/i.test(message)) return new RecognizeError('policy', message);
  return new RecognizeError('model', message || `HTTP ${res.status}`);
}

async function call(fetchFn: FetchFn, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetchFn(url, init);
  } catch (err) {
    if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'TimeoutError')) throw new RecognizeError('timeout', 'timeout');
    throw new RecognizeError('network', err instanceof Error ? err.message : 'network');
  }
}

/** Free models that read photos. Needs no key. */
export async function loadFreeVisionModels(fetchFn: FetchFn = fetch): Promise<FreeModel[]> {
  const res = await call(fetchFn, `${OPENROUTER_API}/models`, { method: 'GET' });
  if (!res.ok) throw await errorFrom(res);
  const body = (await res.json()) as { data?: RawModel[] };
  return freeVisionModels(body.data ?? []);
}

export interface KeyInfo {
  label: string;
  /** Credit limit of the key; 0 means it can never spend money. */
  limit: number | null;
  usage: number;
  freeTier: boolean;
}

/** "Проверить ключ". */
export async function checkKey(apiKey: string, fetchFn: FetchFn = fetch): Promise<KeyInfo> {
  const res = await call(fetchFn, `${OPENROUTER_API}/key`, { method: 'GET', headers: headers(apiKey) });
  if (!res.ok) throw await errorFrom(res);
  const { data } = (await res.json()) as { data?: { label?: string; limit?: number | null; usage?: number; is_free_tier?: boolean } };
  return { label: data?.label ?? '', limit: data?.limit ?? null, usage: data?.usage ?? 0, freeTier: data?.is_free_tier ?? true };
}

const TIMEOUT_MS = 180_000;

/** Sends the prompt and the pages; returns the model's answer as text. */
export async function recognizeImages(
  opts: { apiKey: string; model: string; prompt: string; images: readonly string[] },
  fetchFn: FetchFn = fetch,
): Promise<string> {
  const body = {
    model: opts.model,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: opts.prompt }, ...opts.images.map((url) => ({ type: 'image_url', image_url: { url } }))],
      },
    ],
  };
  const res = await call(fetchFn, `${OPENROUTER_API}/chat/completions`, {
    method: 'POST',
    headers: headers(opts.apiKey),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw await errorFrom(res);
  const json = (await res.json()) as { error?: { message?: string; code?: number }; choices?: Array<{ message?: { content?: unknown } }> };
  if (json.error) {
    const code = json.error.code ?? 0;
    if (code === 429 || code === 402) throw new RecognizeError('limit', json.error.message ?? 'limit');
    throw new RecognizeError('model', json.error.message ?? 'error');
  }
  const content = json.choices?.[0]?.message?.content;
  const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map((p: { text?: string }) => p?.text ?? '').join('') : '';
  if (!text.trim()) throw new RecognizeError('empty', 'empty');
  return text;
}

/** A page as a data URL for the request. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('read'));
    reader.readAsDataURL(blob);
  });
}
