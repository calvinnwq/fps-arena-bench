export const ADAPTER_PACKAGE_VERSION = '0.0.0';

export { ADAPTER_DEFAULT_MAX_OUTPUT_BYTES, parseActionResponse } from './parse-action.js';
export type { ParseActionOptions, ParseActionResult } from './parse-action.js';

export { MockAdapter, MockAdapterError, simulateMockResponse } from './mock.js';
export type { MockAdapterOptions, SimulateMockResponseInput } from './mock.js';

export {
  OLLAMA_DEFAULT_ADAPTER_ID,
  OLLAMA_DEFAULT_BASE_URL,
  OLLAMA_DEFAULT_REQUEST_TIMEOUT_MS,
  OLLAMA_GENERATE_PATH,
  OllamaAdapter,
  OllamaAdapterError,
} from './ollama.js';
export type { FetchLike, FetchLikeResponse, OllamaAdapterOptions } from './ollama.js';

export { createOllamaProviderFactory } from './ollama-factory.js';
export type {
  CreateOllamaProviderFactoryOptions,
  OllamaProviderFactory,
  OllamaProviderFactoryRequest,
} from './ollama-factory.js';

export {
  CLAUDE_CLI_DEFAULT_ADAPTER_ID,
  CLAUDE_CLI_DEFAULT_ARGS,
  CLAUDE_CLI_DEFAULT_COMMAND,
  CLAUDE_CLI_DEFAULT_ENV_ALLOWLIST,
  CLAUDE_CLI_DEFAULT_REQUEST_TIMEOUT_MS,
  CLAUDE_CLI_DEFAULT_TEMP_DIR_PREFIX,
  ClaudeCliAdapter,
  ClaudeCliAdapterError,
} from './claude-cli.js';
export type {
  ClaudeCliAdapterOptions,
  ClaudeCliFileSystem,
  SpawnLike,
  SpawnLikeOptions,
  SpawnLikeOutcome,
} from './claude-cli.js';

export {
  NODE_SPAWN_KILL_GRACE_MS,
  createNodeClaudeCliFileSystem,
  createNodeSpawnLike,
} from './claude-cli-node.js';
export type { NodeClaudeCliFileSystemOptions, NodeSpawnLikeOptions } from './claude-cli-node.js';

export {
  createClaudeCliProviderFactory,
  createNodeClaudeCliProviderFactory,
} from './claude-cli-factory.js';
export type {
  ClaudeCliProviderFactory,
  ClaudeCliProviderFactoryRequest,
  CreateClaudeCliProviderFactoryOptions,
  CreateNodeClaudeCliProviderFactoryOptions,
} from './claude-cli-factory.js';

export {
  CODEX_CLI_DEFAULT_ADAPTER_ID,
  CODEX_CLI_DEFAULT_ARGS,
  CODEX_CLI_DEFAULT_COMMAND,
  CODEX_CLI_DEFAULT_ENV_ALLOWLIST,
  CODEX_CLI_DEFAULT_REQUEST_TIMEOUT_MS,
  CODEX_CLI_DEFAULT_TEMP_DIR_PREFIX,
  CodexCliAdapter,
  CodexCliAdapterError,
} from './codex-cli.js';
export type { CodexCliAdapterOptions, CodexCliFileSystem } from './codex-cli.js';

export {
  createCodexCliProviderFactory,
  createNodeCodexCliProviderFactory,
} from './codex-cli-factory.js';
export type {
  CodexCliProviderFactory,
  CodexCliProviderFactoryRequest,
  CreateCodexCliProviderFactoryOptions,
  CreateNodeCodexCliProviderFactoryOptions,
} from './codex-cli-factory.js';

export {
  OPENCODE_CLI_DEFAULT_ADAPTER_ID,
  OPENCODE_CLI_DEFAULT_ARGS,
  OPENCODE_CLI_DEFAULT_COMMAND,
  OPENCODE_CLI_DEFAULT_ENV_ALLOWLIST,
  OPENCODE_CLI_DEFAULT_REQUEST_TIMEOUT_MS,
  OPENCODE_CLI_DEFAULT_TEMP_DIR_PREFIX,
  OpenCodeCliAdapter,
  OpenCodeCliAdapterError,
} from './opencode-cli.js';
export type { OpenCodeCliAdapterOptions, OpenCodeCliFileSystem } from './opencode-cli.js';

export {
  createOpenCodeCliProviderFactory,
  createNodeOpenCodeCliProviderFactory,
} from './opencode-cli-factory.js';
export type {
  OpenCodeCliProviderFactory,
  OpenCodeCliProviderFactoryRequest,
  CreateOpenCodeCliProviderFactoryOptions,
  CreateNodeOpenCodeCliProviderFactoryOptions,
} from './opencode-cli-factory.js';
