// Settings of recognition through OpenRouter (D-100). Local to this device: the key is not synced
// and not in backups (meta is neither), so each device gets its own.

import type { CarlogDB } from './db';

export interface RecognitionSettings {
  apiKey: string | null;
  /** null: the first of the preferred free models that is available. */
  model: string | null;
}

const KEY = 'recognition.openrouter';

export async function loadRecognitionSettings(db: CarlogDB): Promise<RecognitionSettings> {
  const value = (await db.meta.get(KEY))?.value as Partial<RecognitionSettings> | undefined;
  return { apiKey: value?.apiKey ?? null, model: value?.model ?? null };
}

export async function saveRecognitionSettings(db: CarlogDB, patch: Partial<RecognitionSettings>): Promise<void> {
  await db.transaction('rw', db.meta, async () => {
    const next = { ...(await loadRecognitionSettings(db)), ...patch };
    if (next.apiKey !== null) next.apiKey = next.apiKey.trim() || null;
    await db.meta.put({ key: KEY, value: next });
  });
}

export async function forgetRecognitionKey(db: CarlogDB): Promise<void> {
  await saveRecognitionSettings(db, { apiKey: null });
}
