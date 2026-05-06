import { describe, expect, it, vi } from 'vitest';

import { SCHEMA_VERSION } from '@fps-arena-bench/schemas';

import {
  type FetchLike,
  type FetchLikeResponse,
  OllamaAdapter,
  OLLAMA_DEFAULT_BASE_URL,
} from './ollama.js';
import {
  createOllamaProviderFactory,
  type OllamaProviderFactoryRequest,
} from './ollama-factory.js';

const stubObservation = {
  schemaVersion: 'fps-arena-bench.schema.v0.1' as const,
  rulesetVersion: 'ruleset.v0.1',
  matchId: 'm1',
  tick: 0,
  self: {
    contenderId: 'alpha',
    position: { x: 0, y: 0 },
    headingDegrees: 0,
    health: 100,
    ammo: 5,
  },
  visiblePlayers: [],
  visiblePickups: [],
  visibleWalls: [],
  score: { alpha: 0 },
};

const response = (body: unknown): FetchLikeResponse => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify(body),
});

const request: OllamaProviderFactoryRequest = {
  contenderId: 'alpha',
  adapterId: 'ollama',
  displayName: undefined,
  seed: 7,
};

describe('createOllamaProviderFactory', () => {
  it('returns a function that builds an OllamaAdapter using the request adapterId', () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      response({ response: JSON.stringify({ schemaVersion: SCHEMA_VERSION, type: 'noop' }) }),
    );
    const factory = createOllamaProviderFactory({ model: 'llama3', fetchImpl });

    const provider = factory(request);

    expect(provider).toBeInstanceOf(OllamaAdapter);
    expect(provider.metadata.adapterId).toBe('ollama');
    expect(provider.metadata.kind).toBe('local');
  });

  it('honors a per-request displayName override', () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      response({ response: JSON.stringify({ schemaVersion: SCHEMA_VERSION, type: 'noop' }) }),
    );
    const factory = createOllamaProviderFactory({ model: 'llama3', fetchImpl });

    const provider = factory({ ...request, displayName: 'Local Llama' });

    expect(provider.metadata.displayName).toBe('Local Llama');
  });

  it('forwards model, endpoint, timeout, fallback, and temperature options through decide()', async () => {
    const fallbackAction = { schemaVersion: SCHEMA_VERSION, type: 'noop' } as const;
    const fetchImpl = vi.fn<FetchLike>(async () =>
      response({ response: JSON.stringify({ schemaVersion: SCHEMA_VERSION, type: 'noop' }) }),
    );
    const factory = createOllamaProviderFactory({
      model: 'llama3.2',
      baseUrl: 'http://127.0.0.1:11434/',
      requestTimeoutMs: 12_345,
      fetchImpl,
      fallbackAction,
      temperature: 0,
    });
    const provider = factory(request);

    const action = await provider.decide({
      contenderId: 'alpha',
      tick: 0,
      observation: stubObservation,
    });

    expect(action.type).toBe('noop');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('http://127.0.0.1:11434/api/generate');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body ?? '{}')).toMatchObject({
      model: 'llama3.2',
      stream: false,
      format: 'json',
      options: { temperature: 0 },
    });
  });

  it('falls back to the default base URL when none is configured', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      response({ response: JSON.stringify({ schemaVersion: SCHEMA_VERSION, type: 'noop' }) }),
    );
    const factory = createOllamaProviderFactory({ model: 'llama3', fetchImpl });
    const provider = factory(request);

    await provider.decide({
      contenderId: 'alpha',
      tick: 0,
      observation: stubObservation,
    });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe(`${OLLAMA_DEFAULT_BASE_URL}/api/generate`);
  });
});
