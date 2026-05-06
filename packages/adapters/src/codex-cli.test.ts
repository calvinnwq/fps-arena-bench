import { describe, expect, it, vi } from 'vitest';

import { ACTION_PROMPT_TEMPLATE_VERSION } from '@fps-arena-bench/contracts';
import { SCHEMA_VERSION, type Action, type Observation } from '@fps-arena-bench/schemas';

import {
  CODEX_CLI_DEFAULT_ADAPTER_ID,
  CODEX_CLI_DEFAULT_ARGS,
  CODEX_CLI_DEFAULT_COMMAND,
  CODEX_CLI_DEFAULT_ENV_ALLOWLIST,
  CODEX_CLI_DEFAULT_REQUEST_TIMEOUT_MS,
  CodexCliAdapter,
  CodexCliAdapterError,
  type CodexCliFileSystem,
  type SpawnLike,
  type SpawnLikeOptions,
  type SpawnLikeOutcome,
} from './codex-cli.js';

const baseObservation: Observation = {
  schemaVersion: SCHEMA_VERSION,
  rulesetVersion: 'ruleset.v0.1',
  matchId: 'codex-cli-test',
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

const buildRequest = (
  signal?: AbortSignal,
): { observation: Observation; contenderId: string; tick: number; signal?: AbortSignal } => {
  const base = { observation: baseObservation, contenderId: 'alpha', tick: 0 };
  return signal === undefined ? base : { ...base, signal };
};

interface FakeFsRecord {
  readonly mkdtempCalls: string[];
  readonly rmCalls: string[];
  readonly created: Set<string>;
}

const makeFakeFs = (): { fs: CodexCliFileSystem; record: FakeFsRecord } => {
  const record: FakeFsRecord = {
    mkdtempCalls: [],
    rmCalls: [],
    created: new Set(),
  };
  let counter = 0;
  const fs: CodexCliFileSystem = {
    mkdtemp: async (prefix: string): Promise<string> => {
      record.mkdtempCalls.push(prefix);
      counter += 1;
      const path = `${prefix}fake-${counter}`;
      record.created.add(path);
      return path;
    },
    rm: async (path: string): Promise<void> => {
      record.rmCalls.push(path);
      record.created.delete(path);
    },
  };
  return { fs, record };
};

const exitWith = (code: number, stdout: string, stderr = ''): SpawnLikeOutcome => ({
  kind: 'exit',
  code,
  stdout,
  stderr,
});

describe('CodexCliAdapter', () => {
  it('exposes harness metadata with a stable adapterId', () => {
    const spawnImpl = vi.fn<SpawnLike>();
    const { fs } = makeFakeFs();
    const adapter = new CodexCliAdapter({ spawnImpl, fs });
    expect(adapter.metadata.kind).toBe('harness');
    expect(adapter.metadata.adapterId).toBe(CODEX_CLI_DEFAULT_ADAPTER_ID);
    expect(adapter.metadata.supportedActionSchema).toBe(SCHEMA_VERSION);
    expect(adapter.metadata.schemaVersion).toBe(SCHEMA_VERSION);
    expect(adapter.metadata.displayName).toMatch(/codex/i);
  });

  it('accepts custom adapterId and displayName', () => {
    const spawnImpl = vi.fn<SpawnLike>();
    const { fs } = makeFakeFs();
    const adapter = new CodexCliAdapter({
      spawnImpl,
      fs,
      adapterId: 'codex-cli-custom',
      displayName: 'Codex CLI Custom',
    });
    expect(adapter.metadata.adapterId).toBe('codex-cli-custom');
    expect(adapter.metadata.displayName).toBe('Codex CLI Custom');
  });

  it('spawns the configured command with prompt-on-stdin in a per-request temp directory', async () => {
    const spawnImpl = vi.fn<SpawnLike>(async () => exitWith(0, JSON.stringify(NOOP_ACTION)));
    const { fs, record } = makeFakeFs();
    const adapter = new CodexCliAdapter({ spawnImpl, fs });
    await adapter.decide(buildRequest());

    expect(spawnImpl).toHaveBeenCalledTimes(1);
    const opts: SpawnLikeOptions = spawnImpl.mock.calls[0]![0];
    expect(opts.command).toBe(CODEX_CLI_DEFAULT_COMMAND);
    expect(opts.args).toEqual([...CODEX_CLI_DEFAULT_ARGS]);
    expect(opts.cwd).toMatch(/fake-1$/);
    expect(typeof opts.stdin).toBe('string');
    expect(opts.stdin.length).toBeGreaterThan(0);
    expect(opts.stdin).toContain(`Prompt template version: ${ACTION_PROMPT_TEMPLATE_VERSION}`);
    expect(record.mkdtempCalls.length).toBe(1);
  });

  it('honors a custom command and args', async () => {
    const spawnImpl = vi.fn<SpawnLike>(async () => exitWith(0, JSON.stringify(NOOP_ACTION)));
    const { fs } = makeFakeFs();
    const adapter = new CodexCliAdapter({
      spawnImpl,
      fs,
      command: '/usr/local/bin/codex',
      args: ['--full-auto', '--quiet', '--model', 'gpt-4'],
    });
    await adapter.decide(buildRequest());
    const opts: SpawnLikeOptions = spawnImpl.mock.calls[0]![0];
    expect(opts.command).toBe('/usr/local/bin/codex');
    expect(opts.args).toEqual(['--full-auto', '--quiet', '--model', 'gpt-4']);
  });

  it('parses a JSON action from stdout on a clean zero-exit run', async () => {
    const spawnImpl = vi.fn<SpawnLike>(async () =>
      exitWith(0, JSON.stringify({ schemaVersion: SCHEMA_VERSION, type: 'turn', degrees: 90 })),
    );
    const { fs } = makeFakeFs();
    const adapter = new CodexCliAdapter({ spawnImpl, fs });
    const action = await adapter.decide(buildRequest());
    expect(action).toEqual({ schemaVersion: SCHEMA_VERSION, type: 'turn', degrees: 90 });
  });

  it('passes only the explicit env allowlist (defaults to PATH/HOME from process.env)', async () => {
    const spawnImpl = vi.fn<SpawnLike>(async () => exitWith(0, JSON.stringify(NOOP_ACTION)));
    const { fs } = makeFakeFs();
    const getEnv = (): Record<string, string | undefined> => ({
      PATH: '/usr/bin',
      HOME: '/home/test',
      OPENAI_API_KEY: 'sk-secret',
      AWS_SECRET_ACCESS_KEY: 'should-not-leak',
    });
    const adapter = new CodexCliAdapter({ spawnImpl, fs, getEnv });
    await adapter.decide(buildRequest());
    const opts: SpawnLikeOptions = spawnImpl.mock.calls[0]![0];
    expect(Object.keys(opts.env).sort()).toEqual([...CODEX_CLI_DEFAULT_ENV_ALLOWLIST].sort());
    expect(opts.env.PATH).toBe('/usr/bin');
    expect(opts.env.HOME).toBe('/home/test');
    expect(opts.env).not.toHaveProperty('OPENAI_API_KEY');
    expect(opts.env).not.toHaveProperty('AWS_SECRET_ACCESS_KEY');
  });

  it('passes a custom env allowlist plus additionalEnv', async () => {
    const spawnImpl = vi.fn<SpawnLike>(async () => exitWith(0, JSON.stringify(NOOP_ACTION)));
    const { fs } = makeFakeFs();
    const adapter = new CodexCliAdapter({
      spawnImpl,
      fs,
      envAllowlist: ['PATH'],
      additionalEnv: { CODEX_DEBUG: '1' },
      getEnv: () => ({ PATH: '/usr/bin', HOME: '/h' }),
    });
    await adapter.decide(buildRequest());
    const opts: SpawnLikeOptions = spawnImpl.mock.calls[0]![0];
    expect(opts.env.PATH).toBe('/usr/bin');
    expect(opts.env.CODEX_DEBUG).toBe('1');
    expect(opts.env).not.toHaveProperty('HOME');
  });

  it('omits env keys that are missing from the host environment', async () => {
    const spawnImpl = vi.fn<SpawnLike>(async () => exitWith(0, JSON.stringify(NOOP_ACTION)));
    const { fs } = makeFakeFs();
    const adapter = new CodexCliAdapter({
      spawnImpl,
      fs,
      envAllowlist: ['PATH', 'NOT_SET'],
      getEnv: () => ({ PATH: '/usr/bin' }),
    });
    await adapter.decide(buildRequest());
    const opts: SpawnLikeOptions = spawnImpl.mock.calls[0]![0];
    expect(Object.keys(opts.env)).toEqual(['PATH']);
  });

  it('cleans up the temp directory after a successful run', async () => {
    const spawnImpl = vi.fn<SpawnLike>(async () => exitWith(0, JSON.stringify(NOOP_ACTION)));
    const { fs, record } = makeFakeFs();
    const adapter = new CodexCliAdapter({ spawnImpl, fs });
    await adapter.decide(buildRequest());
    expect(record.rmCalls.length).toBe(1);
    expect(record.created.size).toBe(0);
  });

  it('cleans up the temp directory even when the run fails', async () => {
    const spawnImpl = vi.fn<SpawnLike>(async () => exitWith(1, '', 'boom'));
    const { fs, record } = makeFakeFs();
    const adapter = new CodexCliAdapter({ spawnImpl, fs });
    await expect(adapter.decide(buildRequest())).rejects.toBeInstanceOf(CodexCliAdapterError);
    expect(record.rmCalls.length).toBe(1);
    expect(record.created.size).toBe(0);
  });

  it('invokes onPromptRendered with the rendered prompt before spawn', async () => {
    const seenPrompts: string[] = [];
    const spawnImpl = vi.fn<SpawnLike>(async () => exitWith(0, JSON.stringify(NOOP_ACTION)));
    const { fs } = makeFakeFs();
    const adapter = new CodexCliAdapter({
      spawnImpl,
      fs,
      onPromptRendered: (prompt) => seenPrompts.push(prompt),
    });
    await adapter.decide(buildRequest());
    expect(seenPrompts).toHaveLength(1);
    expect(seenPrompts[0]).toContain(`Prompt template version: ${ACTION_PROMPT_TEMPLATE_VERSION}`);
  });

  it('throws aborted error before spawn when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const spawnImpl = vi.fn<SpawnLike>();
    const { fs, record } = makeFakeFs();
    const adapter = new CodexCliAdapter({ spawnImpl, fs });
    await expect(adapter.decide(buildRequest(controller.signal))).rejects.toMatchObject({
      adapterError: { code: 'aborted', retryable: false },
    });
    expect(spawnImpl).not.toHaveBeenCalled();
    expect(record.mkdtempCalls.length).toBe(0);
  });

  it('classifies external-signal abort during spawn as aborted', async () => {
    const controller = new AbortController();
    const spawnImpl: SpawnLike = (options: SpawnLikeOptions) =>
      new Promise<SpawnLikeOutcome>((resolve) => {
        const onAbort = (): void => resolve({ kind: 'aborted', stdout: '', stderr: '' });
        if (options.signal.aborted) {
          onAbort();
          return;
        }
        options.signal.addEventListener('abort', onAbort);
      });
    const { fs, record } = makeFakeFs();
    const adapter = new CodexCliAdapter({ spawnImpl, fs });
    const promise = adapter.decide(buildRequest(controller.signal));
    const observed = promise.catch((error: unknown) => error);
    controller.abort();
    const error = await observed;
    expect(error).toBeInstanceOf(CodexCliAdapterError);
    if (!(error instanceof CodexCliAdapterError)) throw error;
    expect(error.adapterError.code).toBe('aborted');
    expect(error.adapterError.retryable).toBe(false);
    expect(record.rmCalls).toHaveLength(1);
  });

  it('classifies an internal timeout as timeout (not aborted)', async () => {
    vi.useFakeTimers();
    try {
      const spawnImpl: SpawnLike = (options: SpawnLikeOptions) =>
        new Promise<SpawnLikeOutcome>((resolve) => {
          options.signal.addEventListener('abort', () => {
            resolve({ kind: 'aborted', stdout: '', stderr: '' });
          });
        });
      const { fs, record } = makeFakeFs();
      const adapter = new CodexCliAdapter({ spawnImpl, fs, requestTimeoutMs: 50 });
      const promise = adapter.decide(buildRequest());
      const observed = promise.catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(60);
      const error = await observed;
      expect(error).toBeInstanceOf(CodexCliAdapterError);
      if (!(error instanceof CodexCliAdapterError)) throw error;
      expect(error.adapterError.code).toBe('timeout');
      expect(error.adapterError.retryable).toBe(true);
      expect(record.rmCalls).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('classifies an output-cap on stdout as output-cap (non-retryable)', async () => {
    const spawnImpl: SpawnLike = async () => ({
      kind: 'output-cap',
      stream: 'stdout',
      stdout: 'x'.repeat(64),
      stderr: '',
    });
    const { fs } = makeFakeFs();
    const adapter = new CodexCliAdapter({ spawnImpl, fs, maxStdoutBytes: 32 });
    await expect(adapter.decide(buildRequest())).rejects.toMatchObject({
      adapterError: { code: 'output-cap', retryable: false },
    });
  });

  it('classifies an output-cap on stderr as output-cap', async () => {
    const spawnImpl: SpawnLike = async () => ({
      kind: 'output-cap',
      stream: 'stderr',
      stdout: '',
      stderr: 'y'.repeat(64),
    });
    const { fs } = makeFakeFs();
    const adapter = new CodexCliAdapter({ spawnImpl, fs, maxStderrBytes: 32 });
    await expect(adapter.decide(buildRequest())).rejects.toMatchObject({
      adapterError: { code: 'output-cap', retryable: false },
    });
  });

  it('classifies a non-zero exit as process-error (retryable)', async () => {
    const spawnImpl: SpawnLike = async () => exitWith(2, '', 'fatal error');
    const { fs } = makeFakeFs();
    const adapter = new CodexCliAdapter({ spawnImpl, fs });
    await expect(adapter.decide(buildRequest())).rejects.toMatchObject({
      adapterError: { code: 'process-error', retryable: true },
    });
  });

  it('classifies a spawn error as process-error', async () => {
    const spawnImpl: SpawnLike = async () => ({
      kind: 'spawn-error',
      message: 'ENOENT: spawn /usr/bin/codex',
    });
    const { fs, record } = makeFakeFs();
    const adapter = new CodexCliAdapter({ spawnImpl, fs });
    await expect(adapter.decide(buildRequest())).rejects.toMatchObject({
      adapterError: { code: 'process-error', retryable: true },
    });
    expect(record.rmCalls).toHaveLength(1);
  });

  it('redacts /Users paths from process-error messages', async () => {
    const spawnImpl: SpawnLike = async () => ({
      kind: 'spawn-error',
      message: 'failed to spawn /Users/somebody/.bin/codex: ENOENT',
    });
    const { fs } = makeFakeFs();
    const adapter = new CodexCliAdapter({ spawnImpl, fs });
    try {
      await adapter.decide(buildRequest());
      throw new Error('expected throw');
    } catch (error) {
      if (!(error instanceof CodexCliAdapterError)) throw error;
      expect(error.adapterError.message).not.toContain('/Users/somebody');
    }
  });

  it('redacts /home, /private, and /root paths from process-error messages', async () => {
    const cases: Array<{ message: string; sensitive: string }> = [
      { message: 'spawn failed: /home/alice/.local/bin/codex: ENOENT', sensitive: '/home/alice' },
      { message: 'mkdtemp failed: /private/tmp/fps-arena-xyz', sensitive: '/private/tmp' },
      { message: 'spawn failed: /root/.config/codex/settings', sensitive: '/root/.config' },
    ];
    for (const { message, sensitive } of cases) {
      const spawnImpl: SpawnLike = async () => ({ kind: 'spawn-error', message });
      const { fs } = makeFakeFs();
      const adapter = new CodexCliAdapter({ spawnImpl, fs });
      try {
        await adapter.decide(buildRequest());
        throw new Error('expected throw');
      } catch (error) {
        if (!(error instanceof CodexCliAdapterError)) throw error;
        expect(error.adapterError.message).not.toContain(sensitive);
      }
    }
  });

  it('classifies invalid JSON stdout as invalid-json', async () => {
    const spawnImpl: SpawnLike = async () => exitWith(0, 'sure here is the action: {nope}');
    const { fs } = makeFakeFs();
    const adapter = new CodexCliAdapter({ spawnImpl, fs });
    await expect(adapter.decide(buildRequest())).rejects.toMatchObject({
      adapterError: { code: 'invalid-json', retryable: true },
    });
  });

  it('classifies schema-invalid stdout as schema-failure', async () => {
    const spawnImpl: SpawnLike = async () =>
      exitWith(0, JSON.stringify({ schemaVersion: SCHEMA_VERSION, type: 'fly' }));
    const { fs } = makeFakeFs();
    const adapter = new CodexCliAdapter({ spawnImpl, fs });
    await expect(adapter.decide(buildRequest())).rejects.toMatchObject({
      adapterError: { code: 'schema-failure', retryable: true },
    });
  });

  it('surfaces fallbackAction when stdout fails to parse and a fallback is configured', async () => {
    const spawnImpl: SpawnLike = async () => exitWith(0, 'not parseable');
    const { fs } = makeFakeFs();
    const fallback: Action = { schemaVersion: SCHEMA_VERSION, type: 'noop' };
    const adapter = new CodexCliAdapter({ spawnImpl, fs, fallbackAction: fallback });
    await expect(adapter.decide(buildRequest())).rejects.toMatchObject({
      fallbackAction: fallback,
    });
  });

  it('surfaces fallbackAction when subprocess exits non-zero and a fallback is configured', async () => {
    const spawnImpl: SpawnLike = async () => exitWith(1, '', 'crash');
    const { fs } = makeFakeFs();
    const fallback: Action = {
      schemaVersion: SCHEMA_VERSION,
      type: 'move',
      direction: { x: 1, y: 0 },
    };
    const adapter = new CodexCliAdapter({ spawnImpl, fs, fallbackAction: fallback });
    await expect(adapter.decide(buildRequest())).rejects.toMatchObject({
      fallbackAction: fallback,
    });
  });

  it('exposes default request timeout matching the documented default', () => {
    expect(CODEX_CLI_DEFAULT_REQUEST_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it('rejects construction when both spawnImpl and fs are absent', () => {
    expect(() => new CodexCliAdapter({} as never)).toThrow();
  });
});
