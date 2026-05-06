import { describe, expect, it, vi } from 'vitest';

import { SCHEMA_VERSION } from '@fps-arena-bench/schemas';

import { OpenCodeCliAdapter, type SpawnLike, type OpenCodeCliFileSystem } from './opencode-cli.js';
import {
  createOpenCodeCliProviderFactory,
  type CreateOpenCodeCliProviderFactoryOptions,
} from './opencode-cli-factory.js';

const makeFakeFs = (): OpenCodeCliFileSystem => ({
  mkdtemp: async (prefix: string) => `${prefix}fake-1`,
  rm: async () => undefined,
});

describe('createOpenCodeCliProviderFactory', () => {
  it('returns a factory that creates OpenCodeCliAdapter instances', () => {
    const spawnImpl = vi.fn<SpawnLike>();
    const fs = makeFakeFs();
    const factory = createOpenCodeCliProviderFactory({ spawnImpl, fs });
    const provider = factory({
      contenderId: 'alpha',
      adapterId: 'opencode-cli',
      displayName: undefined,
      seed: 1,
    });
    expect(provider).toBeInstanceOf(OpenCodeCliAdapter);
  });

  it('wires adapterId from the factory request into adapter metadata', () => {
    const spawnImpl = vi.fn<SpawnLike>();
    const fs = makeFakeFs();
    const factory = createOpenCodeCliProviderFactory({ spawnImpl, fs });
    const provider = factory({
      contenderId: 'alpha',
      adapterId: 'opencode-cli-custom',
      displayName: undefined,
      seed: 1,
    });
    expect(provider.metadata.adapterId).toBe('opencode-cli-custom');
  });

  it('wires displayName from the factory request when provided', () => {
    const spawnImpl = vi.fn<SpawnLike>();
    const fs = makeFakeFs();
    const factory = createOpenCodeCliProviderFactory({ spawnImpl, fs });
    const provider = factory({
      contenderId: 'alpha',
      adapterId: 'opencode-cli',
      displayName: 'My OpenCode Agent',
      seed: 1,
    });
    expect(provider.metadata.displayName).toBe('My OpenCode Agent');
  });

  it('passes base options (command, requestTimeoutMs) through to the adapter', async () => {
    const baseOptions: CreateOpenCodeCliProviderFactoryOptions = {
      spawnImpl: vi.fn<SpawnLike>(async () => ({
        kind: 'exit',
        code: 0,
        stdout: JSON.stringify({ schemaVersion: SCHEMA_VERSION, type: 'noop' }),
        stderr: '',
      })),
      fs: makeFakeFs(),
      command: '/custom/opencode',
      requestTimeoutMs: 5000,
    };
    const factory = createOpenCodeCliProviderFactory(baseOptions);
    const provider = factory({
      contenderId: 'alpha',
      adapterId: 'opencode-cli',
      displayName: undefined,
      seed: 1,
    });
    expect(provider.metadata.kind).toBe('harness');
    expect(provider.metadata.schemaVersion).toBe(SCHEMA_VERSION);
  });
});
