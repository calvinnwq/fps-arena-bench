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

export const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434';
export const OLLAMA_DEFAULT_ADAPTER_ID = 'ollama';
export const OLLAMA_DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
export const OLLAMA_GENERATE_PATH = '/api/generate';

export interface FetchLikeResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly body?: ReadableStream<Uint8Array> | null;
  text(): Promise<string>;
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<FetchLikeResponse>;

export interface OllamaAdapterOptions {
  readonly model: string;
  readonly baseUrl?: string;
  readonly adapterId?: string;
  readonly displayName?: string;
  readonly requestTimeoutMs?: number;
  readonly maxOutputBytes?: number;
  readonly fetchImpl?: FetchLike;
  readonly onPromptRendered?: (prompt: string, request: ActionRequest) => void;
  readonly fallbackAction?: Action;
  readonly temperature?: number;
}

export class OllamaAdapterError extends Error {
  readonly adapterError: AdapterError;
  readonly fallbackAction: Action | undefined;

  constructor(adapterError: AdapterError, fallbackAction?: Action) {
    super(`[ollama-adapter:${adapterError.code}] ${adapterError.message}`);
    this.name = 'OllamaAdapterError';
    this.adapterError = adapterError;
    this.fallbackAction = fallbackAction;
  }
}

const bodyByteLimit = (maxOutputBytes: number): number => Math.max(maxOutputBytes * 4, 1024 * 1024);

const readCappedResponseText = async (
  adapterId: string,
  response: FetchLikeResponse,
  maxBytes: number,
): Promise<string> => {
  if (response.body === undefined || response.body === null) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      throw new OllamaAdapterError(
        buildError(adapterId, 'output-cap', 'Ollama response body exceeded byte cap.', false),
      );
    }
    return text;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new OllamaAdapterError(
          buildError(
            adapterId,
            'output-cap',
            'Ollama response body exceeded byte cap.',
            false,
          ),
        );
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
};

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

const joinUrl = (base: string, path: string): string => {
  const trimmedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const prefixedPath = path.startsWith('/') ? path : `/${path}`;
  return `${trimmedBase}${prefixedPath}`;
};

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
};

const getGlobalFetch = (): FetchLike | undefined => {
  const candidate = (globalThis as { fetch?: unknown }).fetch;
  if (typeof candidate !== 'function') return undefined;
  return candidate as FetchLike;
};

export class OllamaAdapter implements ActionProvider {
  readonly metadata: AdapterMetadata;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly requestTimeoutMs: number;
  private readonly maxOutputBytes: number;
  private readonly fetchImpl: FetchLike;
  private readonly onPromptRendered: ((prompt: string, request: ActionRequest) => void) | undefined;
  private readonly fallbackAction: Action | undefined;
  private readonly temperature: number | undefined;

  constructor(options: OllamaAdapterOptions) {
    if (typeof options.model !== 'string' || options.model.length === 0) {
      throw new Error('OllamaAdapter requires a non-empty model name.');
    }
    const adapterId = options.adapterId ?? OLLAMA_DEFAULT_ADAPTER_ID;
    this.metadata = {
      schemaVersion: SCHEMA_VERSION,
      adapterId,
      kind: 'local',
      displayName: options.displayName ?? `Ollama (${options.model})`,
      supportedActionSchema: SCHEMA_VERSION,
      description: 'Ollama local HTTP adapter that requests strict JSON actions.',
    };
    this.model = options.model;
    this.baseUrl = options.baseUrl ?? OLLAMA_DEFAULT_BASE_URL;
    this.requestTimeoutMs = options.requestTimeoutMs ?? OLLAMA_DEFAULT_REQUEST_TIMEOUT_MS;
    this.maxOutputBytes = options.maxOutputBytes ?? ADAPTER_DEFAULT_MAX_OUTPUT_BYTES;
    const fetchImpl = options.fetchImpl ?? getGlobalFetch();
    if (fetchImpl === undefined) {
      throw new Error(
        'OllamaAdapter could not resolve a fetch implementation; provide options.fetchImpl on environments without global fetch.',
      );
    }
    this.fetchImpl = fetchImpl;
    this.onPromptRendered = options.onPromptRendered;
    this.fallbackAction = options.fallbackAction;
    this.temperature = options.temperature;
  }

  async decide(request: ActionRequest): Promise<Action> {
    const adapterId = this.metadata.adapterId;
    if (request.signal?.aborted) {
      throw new OllamaAdapterError(
        buildError(adapterId, 'aborted', 'Adapter request was aborted before dispatch.', false),
      );
    }

    const prompt = renderActionPrompt(request.observation);
    if (this.onPromptRendered !== undefined) {
      this.onPromptRendered(prompt, request);
    }

    const url = joinUrl(this.baseUrl, OLLAMA_GENERATE_PATH);
    const body: Record<string, unknown> = {
      model: this.model,
      prompt,
      stream: false,
      format: 'json',
    };
    if (this.temperature !== undefined) {
      body.options = { temperature: this.temperature };
    }

    const timeoutController = new AbortController();
    const externalSignal = request.signal;
    const onExternalAbort = (): void => {
      timeoutController.abort(externalSignal?.reason ?? 'external-abort');
    };
    if (externalSignal !== undefined) {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        timeoutController.abort('timeout');
        reject(
          new OllamaAdapterError(
            buildError(
              adapterId,
              'timeout',
              `Adapter request exceeded timeout of ${this.requestTimeoutMs}ms.`,
              true,
            ),
          ),
        );
      }, this.requestTimeoutMs);
    });

    const runRequest = async (): Promise<Action> => {
      const response = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: timeoutController.signal,
      });

      if (!response.ok) {
        throw new OllamaAdapterError(
          buildError(
            adapterId,
            'process-error',
            `Ollama returned non-OK HTTP status ${response.status}.`,
            true,
          ),
          this.fallbackAction,
        );
      }

      let bodyText: string;
      try {
        bodyText = await readCappedResponseText(
          adapterId,
          response,
          bodyByteLimit(this.maxOutputBytes),
        );
      } catch (caught) {
        if (caught instanceof OllamaAdapterError) throw caught;
        throw new OllamaAdapterError(
          buildError(
            adapterId,
            'process-error',
            `Could not read Ollama response body: ${errorMessage(caught)}`,
            true,
          ),
        );
      }

      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(bodyText);
      } catch {
        throw new OllamaAdapterError(
          buildError(
            adapterId,
            'process-error',
            'Ollama response body was not valid JSON envelope.',
            true,
          ),
          this.fallbackAction,
        );
      }

      if (
        typeof parsedBody !== 'object' ||
        parsedBody === null ||
        typeof (parsedBody as { response?: unknown }).response !== 'string'
      ) {
        throw new OllamaAdapterError(
          buildError(
            adapterId,
            'process-error',
            'Ollama response envelope did not include a string "response" field.',
            true,
          ),
          this.fallbackAction,
        );
      }

      const rawOutput = (parsedBody as { response: string }).response;
      const parseResult = parseActionResponse(rawOutput, {
        adapterId,
        maxOutputBytes: this.maxOutputBytes,
      });

      if (!parseResult.ok) {
        throw new OllamaAdapterError(parseResult.error, this.fallbackAction);
      }

      return parseResult.action;
    };

    try {
      return await Promise.race([runRequest(), timeoutPromise]);
    } catch (caught) {
      if (externalSignal?.aborted === true) {
        throw new OllamaAdapterError(
          buildError(adapterId, 'aborted', 'Adapter request was aborted by caller.', false),
        );
      }
      if (timeoutController.signal.aborted) {
        throw new OllamaAdapterError(
          buildError(
            adapterId,
            'timeout',
            `Adapter request exceeded timeout of ${this.requestTimeoutMs}ms.`,
            true,
          ),
        );
      }
      if (caught instanceof OllamaAdapterError) throw caught;
      throw new OllamaAdapterError(
        buildError(
          adapterId,
          'process-error',
          `Ollama HTTP request failed: ${errorMessage(caught)}`,
          true,
        ),
      );
    } finally {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
      if (externalSignal !== undefined) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
  }
}
