import { describe, expect, it } from 'vitest';
import { checkKey, freeVisionModels, loadFreeVisionModels, RecognizeError, recognizeImages } from './openrouter';

const model = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `${id} (free)`,
  pricing: { prompt: '0', completion: '0' },
  architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
  ...extra,
});

const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

describe('OpenRouter', () => {
  it('lists free models that read photos, preferred first', () => {
    const list = freeVisionModels([
      model('openrouter/free'),
      model('some/other-vl:free'),
      model('google/gemma-4-31b-it:free'),
      model('paid/vision', { pricing: { prompt: '0.000001', completion: '0' } }),
      model('text/only:free', { architecture: { input_modalities: ['text'], output_modalities: ['text'] } }),
      model('google/lyria-3-pro-preview', { architecture: { input_modalities: ['text', 'image'], output_modalities: ['text', 'audio'] } }),
      model('nvidia/nemotron-3.5-super-vl:free'),
    ]);
    expect(list.map((m) => m.id)).toEqual(['google/gemma-4-31b-it:free', 'nvidia/nemotron-3.5-super-vl:free', 'some/other-vl:free', 'openrouter/free']);
    expect(list[0]!.name).toBe('google/gemma-4-31b-it:free');
  });

  it('loads the list without a key', async () => {
    let url = '';
    const fetchFn = (async (u: string) => {
      url = u;
      return new Response(JSON.stringify({ data: [model('google/gemma-4-31b-it:free')] }));
    }) as unknown as typeof fetch;
    expect((await loadFreeVisionModels(fetchFn)).length).toBe(1);
    expect(url).toBe('https://openrouter.ai/api/v1/models');
  });

  it('sends the prompt and the pages, returns the answer text', async () => {
    let sent: { headers: Record<string, string>; body: { model: string; messages: Array<{ content: unknown[] }> } } | null = null;
    const fetchFn = (async (_u: string, init: RequestInit) => {
      sent = { headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) };
      return new Response(JSON.stringify({ choices: [{ message: { content: '```json\n{}\n```' } }] }));
    }) as unknown as typeof fetch;
    const text = await recognizeImages({ apiKey: 'sk-or-test', model: 'm:free', prompt: 'Распознай', images: ['data:image/jpeg;base64,AA', 'data:image/jpeg;base64,BB'] }, fetchFn);
    expect(text).toContain('json');
    expect(sent!.headers.Authorization).toBe('Bearer sk-or-test');
    expect(sent!.body.model).toBe('m:free');
    expect(sent!.body.messages[0]!.content).toEqual([
      { type: 'text', text: 'Распознай' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AA' } },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,BB' } },
    ]);
  });

  it('tells the failures apart', async () => {
    const opts = { apiKey: 'k', model: 'm', prompt: 'p', images: [] };
    const kind = (p: Promise<unknown>) => p.then(() => null, (e: RecognizeError) => e.kind);
    expect(await kind(recognizeImages(opts, reply(401, { error: { message: 'No auth' } })))).toBe('auth');
    expect(await kind(recognizeImages(opts, reply(429, { error: { message: 'Rate limit' } })))).toBe('limit');
    expect(await kind(recognizeImages(opts, reply(404, { error: { message: 'No endpoints found matching your data policy' } })))).toBe('policy');
    expect(await kind(recognizeImages(opts, reply(502, { error: { message: 'Provider down' } })))).toBe('model');
    expect(await kind(recognizeImages(opts, reply(200, { error: { code: 429, message: 'busy' } })))).toBe('limit');
    expect(await kind(recognizeImages(opts, reply(200, { choices: [{ message: { content: '' } }] })))).toBe('empty');
    const offline = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await kind(recognizeImages(opts, offline))).toBe('network');
  });

  it('checks a key', async () => {
    expect(await checkKey('k', reply(200, { data: { label: 'Бортжурнал', limit: 0, usage: 0, is_free_tier: true } }))).toEqual({ label: 'Бортжурнал', limit: 0, usage: 0, freeTier: true });
    await expect(checkKey('bad', reply(401, {}))).rejects.toMatchObject({ kind: 'auth' });
  });
});
