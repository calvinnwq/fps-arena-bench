import type { ActionProvider, ActionRequest } from '@fps-arena-bench/contracts';
import { renderActionPrompt } from '@fps-arena-bench/contracts';
import { redactString } from '@fps-arena-bench/replay';
import {
  SCHEMA_VERSION,
  type Action,
  type AdapterError,
  type AdapterMetadata,
} from '@fps-arena-bench/schemas';

import { ADAPTER_DEFAULT_MAX_OUTPUT_BYTES, parseActionResponse } from './parse-action.js';
import type { SpawnLike, SpawnLikeOptions, SpawnLikeOutcome } from './claude-cli.js';

export type { SpawnLike, SpawnLikeOptions, SpawnLikeOutcome };

export const CODEX_CLI_DEFAULT_ADAPTER_ID = 'codex-cli';
export const CODEX_CLI_DEFAULT_COMMAND = 'codex';
export const CODEX_CLI_DEFAULT_ARGS: readonly string[] = ['exec', '--full-auto', '--quiet'];
export const CODEX_CLI_DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
export const CODEX_CLI_DEFAULT_TEMP_DIR_PREFIX = 'fps-arena-bench-codex-cli-';
export const CODEX_CLI_DEFAULT_ENV_ALLOWLIST: readonly string[] = ['PATH', 'HOME'];

export interface CodexCliFileSystem {
  mkdtemp(prefix: string): Promise<string>;
  rm(path: string): Promise<void>;
}

export interface CodexCliAdapterOptions {
  readonly spawnImpl: SpawnLike;
  readonly fs: CodexCliFileSystem;
  readonly command?: string;
  readonly args?: readonly string[];
  readonly adapterId?: string;
  readonly displayName?: string;
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

export class CodexCliAdapterError extends Error {
  readonly adapterError: AdapterError;
  readonly fallbackAction: Action | undefined;

  constructor(adapterError: AdapterError, fallbackAction?: Action) {
    super(`[codex-cli-adapter:${adapterError.code}] ${adapterError.message}`);
    this.name = 'CodexCliAdapterError';
    this.adapterError = adapterError;
    this.fallbackAction = fallbackAction;
  }
}

const buildError = (
  adapterId: string,
  code: AdapterError['code'],
  message: string,
  retryable: boolean,
): AdapterError => ({
  schemaVersion: SCHEMA_VERSION,
  adapterId,
  code,
  message: redactString(message),
  retryable,
});

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
};

const truncate = (input: string, maxLength = 200): string =>
  input.length > maxLength ? `${input.slice(0, maxLength)}…` : input;

const getProcessEnv = (): Record<string, string | undefined> => {
  const candidate = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env;
  return candidate ?? {};
};

export class CodexCliAdapter implements ActionProvider {
  readonly metadata: AdapterMetadata;
  private readonly spawnImpl: SpawnLike;
  private readonly fs: CodexCliFileSystem;
  private readonly command: string;
  private readonly args: readonly string[];
  private readonly requestTimeoutMs: number;
  private readonly maxStdoutBytes: number;
  private readonly maxStderrBytes: number;
  private readonly tempDirPrefix: string;
  private readonly envAllowlist: readonly string[];
  private readonly additionalEnv: Record<string, string>;
  private readonly getEnv: () => Record<string, string | undefined>;
  private readonly onPromptRendered: ((prompt: string, request: ActionRequest) => void) | undefined;
  private readonly fallbackAction: Action | undefined;

  constructor(options: CodexCliAdapterOptions) {
    if (
      options === null ||
      typeof options !== 'object' ||
      typeof options.spawnImpl !== 'function' ||
      options.fs === undefined
    ) {
      throw new Error(
        'CodexCliAdapter requires both a spawnImpl function and a CodexCliFileSystem implementation.',
      );
    }
    const adapterId = options.adapterId ?? CODEX_CLI_DEFAULT_ADAPTER_ID;
    this.metadata = {
      schemaVersion: SCHEMA_VERSION,
      adapterId,
      kind: 'harness',
      displayName: options.displayName ?? 'Codex CLI Harness',
      supportedActionSchema: SCHEMA_VERSION,
      description:
        'Cold subprocess Codex CLI harness adapter that requests strict JSON actions per turn.',
    };
    this.spawnImpl = options.spawnImpl;
    this.fs = options.fs;
    this.command = options.command ?? CODEX_CLI_DEFAULT_COMMAND;
    this.args = options.args ?? CODEX_CLI_DEFAULT_ARGS;
    this.requestTimeoutMs = options.requestTimeoutMs ?? CODEX_CLI_DEFAULT_REQUEST_TIMEOUT_MS;
    this.maxStdoutBytes = options.maxStdoutBytes ?? ADAPTER_DEFAULT_MAX_OUTPUT_BYTES;
    this.maxStderrBytes = options.maxStderrBytes ?? ADAPTER_DEFAULT_MAX_OUTPUT_BYTES;
    this.tempDirPrefix = options.tempDirPrefix ?? CODEX_CLI_DEFAULT_TEMP_DIR_PREFIX;
    this.envAllowlist = options.envAllowlist ?? CODEX_CLI_DEFAULT_ENV_ALLOWLIST;
    this.additionalEnv = options.additionalEnv ?? {};
    this.getEnv = options.getEnv ?? getProcessEnv;
    this.onPromptRendered = options.onPromptRendered;
    this.fallbackAction = options.fallbackAction;
  }

  async decide(request: ActionRequest): Promise<Action> {
    const adapterId = this.metadata.adapterId;
    const externalSignal = request.signal;
    if (externalSignal?.aborted === true) {
      throw new CodexCliAdapterError(
        buildError(adapterId, 'aborted', 'Adapter request was aborted before dispatch.', false),
      );
    }

    const prompt = renderActionPrompt(request.observation);
    if (this.onPromptRendered !== undefined) {
      this.onPromptRendered(prompt, request);
    }

    const timeoutController = new AbortController();
    const onExternalAbort = (): void => {
      timeoutController.abort(externalSignal?.reason ?? 'external-abort');
    };
    if (externalSignal !== undefined) {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
    const timeoutHandle = setTimeout(() => {
      timeoutController.abort('timeout');
    }, this.requestTimeoutMs);
    const cleanupTimers = (): void => {
      clearTimeout(timeoutHandle);
      if (externalSignal !== undefined) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    };

    let tempDir: string;
    try {
      tempDir = await this.fs.mkdtemp(this.tempDirPrefix);
    } catch (caught) {
      cleanupTimers();
      throw new CodexCliAdapterError(
        buildError(
          adapterId,
          'process-error',
          `Could not create per-request temp directory: ${errorMessage(caught)}`,
          true,
        ),
      );
    }

    try {
      return await this.runSubprocess(
        adapterId,
        prompt,
        tempDir,
        externalSignal,
        timeoutController.signal,
      );
    } finally {
      cleanupTimers();
      try {
        await this.fs.rm(tempDir);
      } catch {
        // Cleanup failures are intentionally swallowed; per ADR 0001 they would only
        // leak local paths if surfaced and belong in opt-in private channels.
      }
    }
  }

  private async runSubprocess(
    adapterId: string,
    prompt: string,
    cwd: string,
    externalSignal: AbortSignal | undefined,
    signal: AbortSignal,
  ): Promise<Action> {
    let outcome: SpawnLikeOutcome;
    try {
      outcome = await this.spawnImpl({
        command: this.command,
        args: [...this.args, prompt],
        cwd,
        env: this.buildEnv(),
        stdin: '',
        signal,
        maxStdoutBytes: this.maxStdoutBytes,
        maxStderrBytes: this.maxStderrBytes,
      });
    } catch (caught) {
      throw new CodexCliAdapterError(
        buildError(
          adapterId,
          'process-error',
          `Codex CLI spawn threw: ${errorMessage(caught)}`,
          true,
        ),
      );
    }

    if (outcome.kind === 'aborted') {
      if (externalSignal?.aborted === true) {
        throw new CodexCliAdapterError(
          buildError(adapterId, 'aborted', 'Adapter request was aborted by caller.', false),
        );
      }
      throw new CodexCliAdapterError(
        buildError(
          adapterId,
          'timeout',
          `Adapter request exceeded timeout of ${this.requestTimeoutMs}ms.`,
          true,
        ),
      );
    }

    if (outcome.kind === 'output-cap') {
      throw new CodexCliAdapterError(
        buildError(
          adapterId,
          'output-cap',
          `Adapter ${outcome.stream} exceeded its configured byte cap.`,
          false,
        ),
      );
    }

    if (outcome.kind === 'spawn-error') {
      throw new CodexCliAdapterError(
        buildError(
          adapterId,
          'process-error',
          `Codex CLI failed to start: ${outcome.message}`,
          true,
        ),
        this.fallbackAction,
      );
    }

    if (outcome.signal !== undefined) {
      throw new CodexCliAdapterError(
        buildError(
          adapterId,
          'process-error',
          `Codex CLI exited due to signal ${outcome.signal}: ${truncate(outcome.stderr.trim()) || 'no stderr'}`,
          true,
        ),
        this.fallbackAction,
      );
    }

    if (outcome.code !== 0) {
      throw new CodexCliAdapterError(
        buildError(
          adapterId,
          'process-error',
          `Codex CLI exited with code ${outcome.code}: ${truncate(outcome.stderr.trim()) || 'no stderr'}`,
          true,
        ),
        this.fallbackAction,
      );
    }

    const parseResult = parseActionResponse(outcome.stdout, {
      adapterId,
      maxOutputBytes: this.maxStdoutBytes,
    });
    if (!parseResult.ok) {
      throw new CodexCliAdapterError(parseResult.error, this.fallbackAction);
    }

    return parseResult.action;
  }

  private buildEnv(): Record<string, string> {
    const hostEnv = this.getEnv();
    const env: Record<string, string> = {};
    for (const key of this.envAllowlist) {
      const value = hostEnv[key];
      if (typeof value === 'string') {
        env[key] = value;
      }
    }
    for (const [key, value] of Object.entries(this.additionalEnv)) {
      env[key] = value;
    }
    return env;
  }
}
