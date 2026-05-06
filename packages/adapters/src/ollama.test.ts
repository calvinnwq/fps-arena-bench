import { describe, expect, it, vi } from 'vitest';

import { ACTION_PROMPT_TEMPLATE_VERSION } from '@fps-arena-bench/contracts';
import { SCHEMA_VERSION, type Action, type Observation } from '@fps-arena-bench/schemas';

import {
  FetchLike,
  FetchLikeResponse,
  OLLAMA_DEFAULT_ADAPTER_ID,
  OLLAMA_DEFAULT_BASE_URL,
  OLLAMA_DEFAULT_REQUEST_TIMEOUT_MS,
  OLLAMA_GENERATE_PATH,
  OllamaAdapter,
  OllamaAdapterError,
} from './ollama.js';

const baseObservation: Observation = {
  schemaVersion: SCHEMA_VERSION,
  rulesetVersion: 'ruleset.v0.1',
  matchId: 'ollama-test',
  tick: 0,
  self: {
    contenderId: 'alpha',
    position: { x: 4, y: 5 },
    headingDegrees: 90,
    health: 80,
    ammo: 5,
  },
  visiblePlayers: [],
  visiblePickups: [],
  visibleWalls: [],
  score: { alpha: 0, bravo: 0 },
};

const NOOP_ACTION: Action = { schemaVersion: SCHEMA_VERSION, type: 'noop' };

const respondWith = (
  body: unknown,
  options: { ok?: boolean; status?: number } = {},
): FetchLikeResponse => {
  const ok = options.ok ?? true;
  const status = options.status ?? 200;
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok,
    status,
    text: () => Promise.resolve(text),
  };
};

const ollamaResponse = (raw: string): FetchLikeResponse =>
  respondWith({ model: 'llama3', response: raw, done: true });

const buildRequest = (signal?: AbortSignal): Parameters<OllamaAdapter['decide']>[0] => {
  const base = { observation: baseObservation, contenderId: 'alpha', tick: 0 };
  return signal === undefined ? base : { ...base, signal };
};

describe('OllamaAdapter', () => {
  it('exposes adapter metadata of kind "local" with a stable adapterId', () => {
    const fetchImpl = vi.fn<FetchLike>();
    const adapter = new OllamaAdapter({ model: 'llama3', fetchImpl });
    expect(adapter.metadata.kind).toBe('local');
    expect(adapter.metadata.adapterId).toBe(OLLAMA_DEFAULT_ADAPTER_ID);
    expect(adapter.metadata.supportedActionSchema).toBe(SCHEMA_VERSION);
    expect(adapter.metadata.schemaVersion).toBe(SCHEMA_VERSION);
    expect(adapter.metadata.displayName).toContain('llama3');
  });

  it('throws when model is missing or empty', () => {
    const fetchImpl = vi.fn<FetchLike>();
    expect(() => new OllamaAdapter({ model: '', fetchImpl })).toThrow();
  });

  it('throws when no fetch implementation is available', () => {
    const originalFetch = (globalThis as { fetch?: unknown }).fetch;
    try {
      delete (globalThis as { fetch?: unknown }).fetch;
      expect(() => new OllamaAdapter({ model: 'llama3' })).toThrow(/fetch/i);
    } finally {
      if (originalFetch !== undefined) {
        (globalThis as { fetch?: unknown }).fetch = originalFetch;
      }
    }
  });

  it('POSTs to {baseUrl}/api/generate with prompt and JSON body', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => ollamaResponse(JSON.stringify(NOOP_ACTION)));
    const adapter = new OllamaAdapter({ model: 'llama3', fetchImpl });
    await adapter.decide(buildRequest());

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`${OLLAMA_DEFAULT_BASE_URL}${OLLAMA_GENERATE_PATH}`);
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/json');
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body.model).toBe('llama3');
    expect(typeof body.prompt).toBe('string');
    expect((body.prompt as string).includes(ACTION_PROMPT_TEMPLATE_VERSION)).toBe(true);
    expect(body.stream).toBe(false);
    expect(body.format).toBe('json');
  });

  it('honors a custom baseUrl with trailing slash', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => ollamaResponse(JSON.stringify(NOOP_ACTION)));
    const adapter = new OllamaAdapter({
      model: 'llama3',
      baseUrl: 'http://example.test:9999/',
      fetchImpl,
    });
    await adapter.decide(buildRequest());
    const [url] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`http://example.test:9999${OLLAMA_GENERATE_PATH}`);
  });

  it('parses the Ollama envelope and returns the action from the response field', async () => {
    const fetchImpl = vi.fn(async () =>
      ollamaResponse(JSON.stringify({ schemaVersion: SCHEMA_VERSION, type: 'turn', degrees: 90 })),
    );
    const adapter = new OllamaAdapter({ model: 'llama3', fetchImpl });
    const action = await adapter.decide(buildRequest());
    expect(action).toEqual({ schemaVersion: SCHEMA_VERSION, type: 'turn', degrees: 90 });
  });

  it('invokes onPromptRendered with the rendered prompt before dispatch', async () => {
    const seenPrompts: string[] = [];
    const fetchImpl = vi.fn<FetchLike>(async () => ollamaResponse(JSON.stringify(NOOP_ACTION)));
    const adapter = new OllamaAdapter({
      model: 'llama3',
      fetchImpl,
      onPromptRendered: (prompt) => {
        seenPrompts.push(prompt);
      },
    });
    await adapter.decide(buildRequest());
    expect(seenPrompts).toHaveLength(1);
    expect(seenPrompts[0]).toContain(`Prompt template version: ${ACTION_PROMPT_TEMPLATE_VERSION}`);
  });

  it('throws aborted error before dispatch when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn<FetchLike>();
    const adapter = new OllamaAdapter({ model: 'llama3', fetchImpl });
    await expect(adapter.decide(buildRequest(controller.signal))).rejects.toMatchObject({
      adapterError: { code: 'aborted', retryable: false },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('classifies external-signal abort during fetch as aborted', async () => {
    const controller = new AbortController();
    const fetchImpl: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    const adapter = new OllamaAdapter({ model: 'llama3', fetchImpl });
    const promise = adapter.decide(buildRequest(controller.signal));
    const observed = promise.catch((error: unknown) => error);
    controller.abort();
    const error = await observed;
    expect(error).toBeInstanceOf(OllamaAdapterError);
    if (!(error instanceof OllamaAdapterError)) throw error;
    expect(error.adapterError.code).toBe('aborted');
  });

  it('classifies timeout when the request exceeds requestTimeoutMs', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl: FetchLike = (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        });
      const adapter = new OllamaAdapter({
        model: 'llama3',
        fetchImpl,
        requestTimeoutMs: 50,
      });
      const promise = adapter.decide(buildRequest());
      // Attach a no-op catch so the rejection is observed before the timer fires,
      // avoiding an unhandled-rejection warning from vitest.
      const observed = promise.catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(60);
      const error = await observed;
      expect(error).toBeInstanceOf(OllamaAdapterError);
      if (!(error instanceof OllamaAdapterError)) throw error;
      expect(error.adapterError.code).toBe('timeout');
      expect(error.adapterError.retryable).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('classifies non-AbortError fetch rejection as process-error', async () => {
    const fetchImpl: FetchLike = () => Promise.reject(new Error('connection refused'));
    const adapter = new OllamaAdapter({ model: 'llama3', fetchImpl });
    await expect(adapter.decide(buildRequest())).rejects.toMatchObject({
      adapterError: { code: 'process-error', retryable: true },
    });
  });

  it('redacts /Users paths from process-error messages', async () => {
    const fetchImpl: FetchLike = () =>
      Promise.reject(new Error('socket error reading /Users/somebody/secret.sock'));
    const adapter = new OllamaAdapter({ model: 'llama3', fetchImpl });
    try {
      await adapter.decide(buildRequest());
      throw new Error('expected throw');
    } catch (error) {
      if (!(error instanceof OllamaAdapterError)) throw error;
      expect(error.adapterError.message).not.toContain('/Users/somebody');
    }
  });

  it('classifies non-OK HTTP status as process-error', async () => {
    const fetchImpl: FetchLike = async () =>
      respondWith('Internal Server Error', { ok: false, status: 500 });
    const adapter = new OllamaAdapter({ model: 'llama3', fetchImpl });
    await expect(adapter.decide(buildRequest())).rejects.toMatchObject({
      adapterError: { code: 'process-error', retryable: true },
    });
  });

  it('surfaces fallbackAction when HTTP fails and a fallback is configured', async () => {
    const fetchImpl: FetchLike = async () =>
      respondWith('Internal Server Error', { ok: false, status: 503 });
    const fallback: Action = { schemaVersion: SCHEMA_VERSION, type: 'noop' };
    const adapter = new OllamaAdapter({ model: 'llama3', fetchImpl, fallbackAction: fallback });
    await expect(adapter.decide(buildRequest())).rejects.toMatchObject({ fallbackAction: fallback });
  });

  it('classifies invalid envelope JSON as process-error', async () => {
    const fetchImpl: FetchLike = async () => respondWith('not json at all');
    const adapter = new OllamaAdapter({ model: 'llama3', fetchImpl });
    await expect(adapter.decide(buildRequest())).rejects.toMatchObject({
      adapterError: { code: 'process-error' },
    });
  });

  it('classifies missing response field as process-error', async () => {
    const fetchImpl: FetchLike = async () => respondWith({ done: true });
    const adapter = new OllamaAdapter({ model: 'llama3', fetchImpl });
    await expect(adapter.decide(buildRequest())).rejects.toMatchObject({
      adapterError: { code: 'process-error' },
    });
  });

  it('classifies model output not parseable as JSON as invalid-json', async () => {
    const fetchImpl: FetchLike = async () => ollamaResponse('Sure, here you go: {not json}');
    const adapter = new OllamaAdapter({ model: 'llama3', fetchImpl });
    await expect(adapter.decide(buildRequest())).rejects.toMatchObject({
      adapterError: { code: 'invalid-json', retryable: true },
    });
  });

  it('classifies schema-invalid model output as schema-failure', async () => {
    const fetchImpl: FetchLike = async () =>
      ollamaResponse(JSON.stringify({ schemaVersion: SCHEMA_VERSION, type: 'fly' }));
    const adapter = new OllamaAdapter({ model: 'llama3', fetchImpl });
    await expect(adapter.decide(buildRequest())).rejects.toMatchObject({
      adapterError: { code: 'schema-failure', retryable: true },
    });
  });

  it('classifies oversize model output as output-cap', async () => {
    const fetchImpl: FetchLike = async () => ollamaResponse('x'.repeat(64));
    const adapter = new OllamaAdapter({
      model: 'llama3',
      fetchImpl,
      maxOutputBytes: 32,
    });
    await expect(adapter.decide(buildRequest())).rejects.toMatchObject({
      adapterError: { code: 'output-cap', retryable: false },
    });
  });

  it('surfaces fallbackAction when model output fails to parse and a fallback is configured', async () => {
    const fetchImpl: FetchLike = async () => ollamaResponse('not json at all');
    const fallback: Action = {
      schemaVersion: SCHEMA_VERSION,
      type: 'move',
      direction: { x: 1, y: 0 },
    };
    const adapter = new OllamaAdapter({ model: 'llama3', fetchImpl, fallbackAction: fallback });
    await expect(adapter.decide(buildRequest())).rejects.toMatchObject({ fallbackAction: fallback });
  });

  it('forwards temperature into the request body when provided', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => ollamaResponse(JSON.stringify(NOOP_ACTION)));
    const adapter = new OllamaAdapter({ model: 'llama3', fetchImpl, temperature: 0 });
    await adapter.decide(buildRequest());
    const [, init] = fetchImpl.mock.calls[0]!;
    const body = JSON.parse(init.body) as { options?: { temperature?: number } };
    expect(body.options?.temperature).toBe(0);
  });

  it('exposes default request timeout matching the documented default', () => {
    expect(OLLAMA_DEFAULT_REQUEST_TIMEOUT_MS).toBeGreaterThan(0);
  });
});
