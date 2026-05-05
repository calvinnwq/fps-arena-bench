import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ClaudeCliAdapter,
  type ClaudeCliFileSystem,
  type SpawnLike,
  type SpawnLikeOptions,
  type SpawnLikeOutcome,
} from './claude-cli.js';
import {
  createClaudeCliProviderFactory,
  createNodeClaudeCliProviderFactory,
  type ClaudeCliProviderFactoryRequest,
} from './claude-cli-factory.js';

const validActionStdout = '{"schemaVersion":"fps-arena-bench.schema.v0.1","type":"noop"}';

const createSuccessSpawn = (): SpawnLike =>
  vi.fn<SpawnLike>(
    async (_options: SpawnLikeOptions): Promise<SpawnLikeOutcome> => ({
      kind: 'exit',
      code: 0,
      stdout: validActionStdout,
      stderr: '',
    }),
  );

const createMockFs = (): ClaudeCliFileSystem => ({
  mkdtemp: vi.fn(async (prefix: string) => `/tmp/${prefix}stub`),
  rm: vi.fn(async () => undefined),
});

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

describe('createClaudeCliProviderFactory', () => {
  it('returns a function that builds a ClaudeCliAdapter using the request adapterId', () => {
    const factory = createClaudeCliProviderFactory({
      spawnImpl: createSuccessSpawn(),
      fs: createMockFs(),
    });
    const provider = factory({
      contenderId: 'alpha',
      adapterId: 'claude-cli',
      displayName: undefined,
      seed: 7,
    });
    expect(provider).toBeInstanceOf(ClaudeCliAdapter);
    expect(provider.metadata.adapterId).toBe('claude-cli');
    expect(provider.metadata.kind).toBe('harness');
  });

  it('honors a per-request displayName override', () => {
    const factory = createClaudeCliProviderFactory({
      spawnImpl: createSuccessSpawn(),
      fs: createMockFs(),
    });
    const provider = factory({
      contenderId: 'alpha',
      adapterId: 'claude-cli',
      displayName: 'Claude Alpha',
      seed: 7,
    });
    expect(provider.metadata.displayName).toBe('Claude Alpha');
  });

  it('falls back to default displayName when request displayName is undefined', () => {
    const factory = createClaudeCliProviderFactory({
      spawnImpl: createSuccessSpawn(),
      fs: createMockFs(),
    });
    const provider = factory({
      contenderId: 'alpha',
      adapterId: 'claude-cli',
      displayName: undefined,
      seed: 7,
    });
    expect(provider.metadata.displayName).toBe('Claude CLI Harness');
  });

  it('forwards command/args/timeouts/env options to ClaudeCliAdapter via decide()', async () => {
    const spawnImpl = vi.fn<SpawnLike>(async () => ({
      kind: 'exit',
      code: 0,
      stdout: validActionStdout,
      stderr: '',
    }));
    const factory = createClaudeCliProviderFactory({
      spawnImpl,
      fs: createMockFs(),
      command: 'my-claude',
      args: ['--print', '--no-color'],
      requestTimeoutMs: 12_345,
      envAllowlist: ['PATH'],
      additionalEnv: { CUSTOM: 'value' },
      getEnv: () => ({ PATH: '/usr/bin' }),
    });
    const provider = factory({
      contenderId: 'alpha',
      adapterId: 'claude-cli',
      displayName: undefined,
      seed: 7,
    });
    const action = await provider.decide({
      contenderId: 'alpha',
      tick: 0,
      observation: stubObservation,
    });
    expect(action.type).toBe('noop');
    expect(spawnImpl).toHaveBeenCalledTimes(1);
    const callArg = spawnImpl.mock.calls[0]?.[0];
    expect(callArg).toBeDefined();
    expect(callArg?.command).toBe('my-claude');
    expect(callArg?.args).toEqual(['--print', '--no-color']);
    expect(callArg?.env).toEqual({ PATH: '/usr/bin', CUSTOM: 'value' });
  });

  it('builds a fresh ClaudeCliAdapter on each call (one per contender)', () => {
    const factory = createClaudeCliProviderFactory({
      spawnImpl: createSuccessSpawn(),
      fs: createMockFs(),
    });
    const a = factory({
      contenderId: 'alpha',
      adapterId: 'claude-cli',
      displayName: 'A',
      seed: 7,
    });
    const b = factory({
      contenderId: 'bravo',
      adapterId: 'claude-cli',
      displayName: 'B',
      seed: 7,
    });
    expect(a).not.toBe(b);
    expect(a.metadata.displayName).toBe('A');
    expect(b.metadata.displayName).toBe('B');
  });

  it('produces a function that is structurally compatible with the CLI ProviderFactory shape', () => {
    const factory = createClaudeCliProviderFactory({
      spawnImpl: createSuccessSpawn(),
      fs: createMockFs(),
    });
    const request: ClaudeCliProviderFactoryRequest = {
      contenderId: 'alpha',
      adapterId: 'claude-cli',
      displayName: 'Alpha',
      seed: 7,
    };
    const provider = factory(request);
    expect(provider).toBeInstanceOf(ClaudeCliAdapter);
    expect(provider.metadata.kind).toBe('harness');
  });
});

describe('createNodeClaudeCliProviderFactory', () => {
  let originalProcessEnv: NodeJS.ProcessEnv | undefined;

  beforeEach(() => {
    originalProcessEnv = process.env;
  });

  afterEach(() => {
    if (originalProcessEnv !== undefined) {
      process.env = originalProcessEnv;
    }
  });

  it('builds a ClaudeCliAdapter pre-wired with Node spawn + filesystem when spawnImpl/fs not provided', () => {
    const factory = createNodeClaudeCliProviderFactory();
    const provider = factory({
      contenderId: 'alpha',
      adapterId: 'claude-cli',
      displayName: undefined,
      seed: 7,
    });
    expect(provider).toBeInstanceOf(ClaudeCliAdapter);
    expect(provider.metadata.adapterId).toBe('claude-cli');
  });

  it('forwards user options (command/args/requestTimeoutMs) to the underlying adapter', async () => {
    const factory = createNodeClaudeCliProviderFactory({
      command: '/bin/echo',
      args: [validActionStdout],
      requestTimeoutMs: 5_000,
    });
    const provider = factory({
      contenderId: 'alpha',
      adapterId: 'claude-cli',
      displayName: 'Claude Alpha',
      seed: 7,
    });
    expect(provider.metadata.displayName).toBe('Claude Alpha');
    const action = await provider.decide({
      contenderId: 'alpha',
      tick: 0,
      observation: stubObservation,
    });
    expect(action.type).toBe('noop');
  });
});
