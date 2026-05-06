import { describe, expect, it, vi } from 'vitest';

import { SCHEMA_VERSION } from '@fps-arena-bench/schemas';

import { CodexCliAdapter, type SpawnLike, type CodexCliFileSystem } from './codex-cli.js';
import {
  createCodexCliProviderFactory,
  type CreateCodexCliProviderFactoryOptions,
} from './codex-cli-factory.js';

const makeFakeFs = (): CodexCliFileSystem => ({
  mkdtemp: async (prefix: string) => `${prefix}fake-1`,
  rm: async () => undefined,
});

describe('createCodexCliProviderFactory', () => {
  it('returns a factory that creates CodexCliAdapter instances', () => {
    const spawnImpl = vi.fn<SpawnLike>();
    const fs = makeFakeFs();
    const factory = createCodexCliProviderFactory({ spawnImpl, fs });
    const provider = factory({
      contenderId: 'alpha',
      adapterId: 'codex-cli',
      displayName: undefined,
      seed: 1,
    });
    expect(provider).toBeInstanceOf(CodexCliAdapter);
  });

  it('wires adapterId from the factory request into adapter metadata', () => {
    const spawnImpl = vi.fn<SpawnLike>();
    const fs = makeFakeFs();
    const factory = createCodexCliProviderFactory({ spawnImpl, fs });
    const provider = factory({
      contenderId: 'alpha',
      adapterId: 'codex-cli-custom',
      displayName: undefined,
      seed: 1,
    });
    expect(provider.metadata.adapterId).toBe('codex-cli-custom');
  });

  it('wires displayName from the factory request when provided', () => {
    const spawnImpl = vi.fn<SpawnLike>();
    const fs = makeFakeFs();
    const factory = createCodexCliProviderFactory({ spawnImpl, fs });
    const provider = factory({
      contenderId: 'alpha',
      adapterId: 'codex-cli',
      displayName: 'My Codex Agent',
      seed: 1,
    });
    expect(provider.metadata.displayName).toBe('My Codex Agent');
  });

  it('passes base options (command, requestTimeoutMs) through to the adapter', async () => {
    const baseOptions: CreateCodexCliProviderFactoryOptions = {
      spawnImpl: vi.fn<SpawnLike>(async () => ({
        kind: 'exit',
        code: 0,
        stdout: JSON.stringify({ schemaVersion: SCHEMA_VERSION, type: 'noop' }),
        stderr: '',
      })),
      fs: makeFakeFs(),
      command: '/custom/codex',
      requestTimeoutMs: 5000,
    };
    const factory = createCodexCliProviderFactory(baseOptions);
    const provider = factory({
      contenderId: 'alpha',
      adapterId: 'codex-cli',
      displayName: undefined,
      seed: 1,
    });
    expect(provider.metadata.kind).toBe('harness');
    expect(provider.metadata.schemaVersion).toBe(SCHEMA_VERSION);
  });
});
