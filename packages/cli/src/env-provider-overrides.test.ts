import { describe, expect, it } from 'vitest';

import {
  ClaudeCliAdapter,
  CodexCliAdapter,
  OpenCodeCliAdapter,
  OllamaAdapter,
} from '@fps-arena-bench/adapters';

import { buildEnvProviderOverrides } from './env-provider-overrides.js';

describe('buildEnvProviderOverrides', () => {
  it('returns no overrides when no local adapter environment is configured', () => {
    expect(buildEnvProviderOverrides({})).toEqual({});
  });

  it('enables the Ollama provider factory when a model is configured', () => {
    const overrides = buildEnvProviderOverrides({
      FPS_ARENA_OLLAMA_MODEL: 'llama3.1',
      FPS_ARENA_OLLAMA_BASE_URL: 'http://127.0.0.1:11435',
      FPS_ARENA_OLLAMA_TIMEOUT_MS: '45000',
    });

    const provider = overrides.ollama?.({
      contenderId: 'alpha',
      adapterId: 'ollama',
      displayName: 'Local Ollama',
      seed: 1,
    });

    expect(provider).toBeInstanceOf(OllamaAdapter);
    expect(provider?.metadata.adapterId).toBe('ollama');
    expect(provider?.metadata.kind).toBe('local');
    expect(provider?.metadata.displayName).toBe('Local Ollama');
  });

  it('enables the Claude CLI provider factory only when explicitly requested', () => {
    const disabled = buildEnvProviderOverrides({ FPS_ARENA_CLAUDE_COMMAND: 'claude' });
    expect(disabled['claude-cli']).toBeUndefined();

    const enabled = buildEnvProviderOverrides({
      FPS_ARENA_ENABLE_CLAUDE_CLI: '1',
      FPS_ARENA_CLAUDE_COMMAND: 'claude',
      FPS_ARENA_CLAUDE_TIMEOUT_MS: '60000',
    });

    const provider = enabled['claude-cli']?.({
      contenderId: 'alpha',
      adapterId: 'claude-cli',
      displayName: 'Claude Local',
      seed: 1,
    });

    expect(provider).toBeInstanceOf(ClaudeCliAdapter);
    expect(provider?.metadata.adapterId).toBe('claude-cli');
    expect(provider?.metadata.kind).toBe('harness');
    expect(provider?.metadata.displayName).toBe('Claude Local');
  });

  it('enables the Codex CLI provider factory only when explicitly requested', () => {
    const disabled = buildEnvProviderOverrides({ FPS_ARENA_CODEX_COMMAND: 'codex' });
    expect(disabled['codex-cli']).toBeUndefined();

    const enabled = buildEnvProviderOverrides({
      FPS_ARENA_ENABLE_CODEX_CLI: '1',
      FPS_ARENA_CODEX_COMMAND: 'codex',
      FPS_ARENA_CODEX_TIMEOUT_MS: '60000',
    });

    const provider = enabled['codex-cli']?.({
      contenderId: 'alpha',
      adapterId: 'codex-cli',
      displayName: 'Codex Local',
      seed: 1,
    });

    expect(provider).toBeInstanceOf(CodexCliAdapter);
    expect(provider?.metadata.adapterId).toBe('codex-cli');
    expect(provider?.metadata.kind).toBe('harness');
    expect(provider?.metadata.displayName).toBe('Codex Local');
  });

  it('enables the OpenCode CLI provider factory only when explicitly requested', () => {
    const disabled = buildEnvProviderOverrides({ FPS_ARENA_OPENCODE_COMMAND: 'opencode' });
    expect(disabled['opencode-cli']).toBeUndefined();

    const enabled = buildEnvProviderOverrides({
      FPS_ARENA_ENABLE_OPENCODE_CLI: '1',
      FPS_ARENA_OPENCODE_COMMAND: 'opencode',
      FPS_ARENA_OPENCODE_TIMEOUT_MS: '60000',
    });

    const provider = enabled['opencode-cli']?.({
      contenderId: 'alpha',
      adapterId: 'opencode-cli',
      displayName: 'OpenCode Local',
      seed: 1,
    });

    expect(provider).toBeInstanceOf(OpenCodeCliAdapter);
    expect(provider?.metadata.adapterId).toBe('opencode-cli');
    expect(provider?.metadata.kind).toBe('harness');
    expect(provider?.metadata.displayName).toBe('OpenCode Local');
  });

  it('ignores invalid timeout values instead of rejecting CLI startup', () => {
    const overrides = buildEnvProviderOverrides({
      FPS_ARENA_OLLAMA_MODEL: 'llama3.1',
      FPS_ARENA_OLLAMA_TIMEOUT_MS: 'not-a-number',
      FPS_ARENA_ENABLE_CLAUDE_CLI: 'true',
      FPS_ARENA_CLAUDE_TIMEOUT_MS: '-1',
      FPS_ARENA_ENABLE_CODEX_CLI: 'true',
      FPS_ARENA_CODEX_TIMEOUT_MS: 'bad',
      FPS_ARENA_ENABLE_OPENCODE_CLI: 'true',
      FPS_ARENA_OPENCODE_TIMEOUT_MS: 'also-bad',
    });

    expect(overrides.ollama).toBeDefined();
    expect(overrides['claude-cli']).toBeDefined();
    expect(overrides['codex-cli']).toBeDefined();
    expect(overrides['opencode-cli']).toBeDefined();
  });
});
