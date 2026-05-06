import {
  createNodeClaudeCliProviderFactory,
  createOllamaProviderFactory,
} from '@fps-arena-bench/adapters';

import type { ProviderFactory } from './registry.js';

export interface EnvProviderOverrides {
  readonly FPS_ARENA_OLLAMA_MODEL?: string;
  readonly FPS_ARENA_OLLAMA_BASE_URL?: string;
  readonly FPS_ARENA_OLLAMA_TIMEOUT_MS?: string;
  readonly FPS_ARENA_ENABLE_CLAUDE_CLI?: string;
  readonly FPS_ARENA_CLAUDE_COMMAND?: string;
  readonly FPS_ARENA_CLAUDE_TIMEOUT_MS?: string;
}

const parsePositiveInteger = (value: string | undefined): number | undefined => {
  if (value === undefined || !/^[1-9][0-9]*$/.test(value)) {
    return undefined;
  }
  return Number.parseInt(value, 10);
};

const isEnabled = (value: string | undefined): boolean =>
  value === '1' || value?.toLowerCase() === 'true';

const isNonEmpty = (value: string | undefined): value is string =>
  value !== undefined && value.trim().length > 0;

export const buildEnvProviderOverrides = (
  env: EnvProviderOverrides,
): Readonly<Record<string, ProviderFactory>> => {
  const overrides: Record<string, ProviderFactory> = {};

  if (isNonEmpty(env.FPS_ARENA_OLLAMA_MODEL)) {
    const timeout = parsePositiveInteger(env.FPS_ARENA_OLLAMA_TIMEOUT_MS);
    overrides.ollama = createOllamaProviderFactory({
      model: env.FPS_ARENA_OLLAMA_MODEL,
      ...(isNonEmpty(env.FPS_ARENA_OLLAMA_BASE_URL)
        ? { baseUrl: env.FPS_ARENA_OLLAMA_BASE_URL }
        : {}),
      ...(timeout !== undefined ? { requestTimeoutMs: timeout } : {}),
    });
  }

  if (isEnabled(env.FPS_ARENA_ENABLE_CLAUDE_CLI)) {
    const timeout = parsePositiveInteger(env.FPS_ARENA_CLAUDE_TIMEOUT_MS);
    overrides['claude-cli'] = createNodeClaudeCliProviderFactory({
      ...(isNonEmpty(env.FPS_ARENA_CLAUDE_COMMAND)
        ? { command: env.FPS_ARENA_CLAUDE_COMMAND }
        : {}),
      ...(timeout !== undefined ? { requestTimeoutMs: timeout } : {}),
    });
  }

  return overrides;
};
