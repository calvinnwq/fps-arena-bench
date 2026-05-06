import type { ActionRequest } from '@fps-arena-bench/contracts';
import type { Action } from '@fps-arena-bench/schemas';

import {
  OpenCodeCliAdapter,
  type OpenCodeCliAdapterOptions,
  type OpenCodeCliFileSystem,
  type SpawnLike,
} from './opencode-cli.js';
import {
  createNodeClaudeCliFileSystem,
  createNodeSpawnLike,
  type NodeClaudeCliFileSystemOptions,
  type NodeSpawnLikeOptions,
} from './claude-cli-node.js';

export interface OpenCodeCliProviderFactoryRequest {
  readonly contenderId: string;
  readonly adapterId: string;
  readonly displayName: string | undefined;
  readonly seed: number;
}

export type OpenCodeCliProviderFactory = (
  request: OpenCodeCliProviderFactoryRequest,
) => OpenCodeCliAdapter;

export interface CreateOpenCodeCliProviderFactoryOptions {
  readonly spawnImpl: SpawnLike;
  readonly fs: OpenCodeCliFileSystem;
  readonly command?: string;
  readonly args?: readonly string[];
  readonly requestTimeoutMs?: number;
  readonly maxStdoutBytes?: number;
  readonly maxStderrBytes?: number;
  readonly tempDirPrefix?: string;
  readonly envAllowlist?: readonly string[];
  readonly additionalEnv?: Record<string, string>;
  readonly getEnv?: () => Record<string, string | undefined>;
  readonly onPromptRendered?: (prompt: string, request: ActionRequest) => void;
  readonly fallbackAction?: Action;
}

const buildAdapterOptions = (
  base: CreateOpenCodeCliProviderFactoryOptions,
  request: OpenCodeCliProviderFactoryRequest,
): OpenCodeCliAdapterOptions => {
  const options: {
    -readonly [K in keyof OpenCodeCliAdapterOptions]: OpenCodeCliAdapterOptions[K];
  } = {
    spawnImpl: base.spawnImpl,
    fs: base.fs,
    adapterId: request.adapterId,
  };
  if (request.displayName !== undefined) options.displayName = request.displayName;
  if (base.command !== undefined) options.command = base.command;
  if (base.args !== undefined) options.args = base.args;
  if (base.requestTimeoutMs !== undefined) options.requestTimeoutMs = base.requestTimeoutMs;
  if (base.maxStdoutBytes !== undefined) options.maxStdoutBytes = base.maxStdoutBytes;
  if (base.maxStderrBytes !== undefined) options.maxStderrBytes = base.maxStderrBytes;
  if (base.tempDirPrefix !== undefined) options.tempDirPrefix = base.tempDirPrefix;
  if (base.envAllowlist !== undefined) options.envAllowlist = base.envAllowlist;
  if (base.additionalEnv !== undefined) options.additionalEnv = base.additionalEnv;
  if (base.getEnv !== undefined) options.getEnv = base.getEnv;
  if (base.onPromptRendered !== undefined) options.onPromptRendered = base.onPromptRendered;
  if (base.fallbackAction !== undefined) options.fallbackAction = base.fallbackAction;
  return options;
};

export const createOpenCodeCliProviderFactory = (
  options: CreateOpenCodeCliProviderFactoryOptions,
): OpenCodeCliProviderFactory => {
  return (request) => new OpenCodeCliAdapter(buildAdapterOptions(options, request));
};

export interface CreateNodeOpenCodeCliProviderFactoryOptions
  extends Omit<CreateOpenCodeCliProviderFactoryOptions, 'spawnImpl' | 'fs'> {
  readonly spawnLikeOptions?: NodeSpawnLikeOptions;
  readonly fileSystemOptions?: NodeClaudeCliFileSystemOptions;
}

export const createNodeOpenCodeCliProviderFactory = (
  options: CreateNodeOpenCodeCliProviderFactoryOptions = {},
): OpenCodeCliProviderFactory => {
  const spawnImpl = createNodeSpawnLike(options.spawnLikeOptions ?? {});
  const fs = createNodeClaudeCliFileSystem(options.fileSystemOptions ?? {});
  const base: CreateOpenCodeCliProviderFactoryOptions = {
    spawnImpl,
    fs,
    ...(options.command !== undefined ? { command: options.command } : {}),
    ...(options.args !== undefined ? { args: options.args } : {}),
    ...(options.requestTimeoutMs !== undefined
      ? { requestTimeoutMs: options.requestTimeoutMs }
      : {}),
    ...(options.maxStdoutBytes !== undefined ? { maxStdoutBytes: options.maxStdoutBytes } : {}),
    ...(options.maxStderrBytes !== undefined ? { maxStderrBytes: options.maxStderrBytes } : {}),
    ...(options.tempDirPrefix !== undefined ? { tempDirPrefix: options.tempDirPrefix } : {}),
    ...(options.envAllowlist !== undefined ? { envAllowlist: options.envAllowlist } : {}),
    ...(options.additionalEnv !== undefined ? { additionalEnv: options.additionalEnv } : {}),
    ...(options.getEnv !== undefined ? { getEnv: options.getEnv } : {}),
    ...(options.onPromptRendered !== undefined
      ? { onPromptRendered: options.onPromptRendered }
      : {}),
    ...(options.fallbackAction !== undefined ? { fallbackAction: options.fallbackAction } : {}),
  };
  return createOpenCodeCliProviderFactory(base);
};
