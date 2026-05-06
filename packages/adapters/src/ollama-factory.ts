import type { ActionRequest } from '@fps-arena-bench/contracts';
import type { Action } from '@fps-arena-bench/schemas';

import { type FetchLike, OllamaAdapter, type OllamaAdapterOptions } from './ollama.js';

export interface OllamaProviderFactoryRequest {
  readonly contenderId: string;
  readonly adapterId: string;
  readonly displayName: string | undefined;
  readonly seed: number;
}

export type OllamaProviderFactory = (request: OllamaProviderFactoryRequest) => OllamaAdapter;

export interface CreateOllamaProviderFactoryOptions {
  readonly model: string;
  readonly baseUrl?: string;
  readonly requestTimeoutMs?: number;
  readonly maxOutputBytes?: number;
  readonly fetchImpl?: FetchLike;
  readonly onPromptRendered?: (prompt: string, request: ActionRequest) => void;
  readonly fallbackAction?: Action;
  readonly temperature?: number;
}

const buildAdapterOptions = (
  base: CreateOllamaProviderFactoryOptions,
  request: OllamaProviderFactoryRequest,
): OllamaAdapterOptions => {
  const options: { -readonly [K in keyof OllamaAdapterOptions]: OllamaAdapterOptions[K] } = {
    model: base.model,
    adapterId: request.adapterId,
  };
  if (request.displayName !== undefined) options.displayName = request.displayName;
  if (base.baseUrl !== undefined) options.baseUrl = base.baseUrl;
  if (base.requestTimeoutMs !== undefined) options.requestTimeoutMs = base.requestTimeoutMs;
  if (base.maxOutputBytes !== undefined) options.maxOutputBytes = base.maxOutputBytes;
  if (base.fetchImpl !== undefined) options.fetchImpl = base.fetchImpl;
  if (base.onPromptRendered !== undefined) options.onPromptRendered = base.onPromptRendered;
  if (base.fallbackAction !== undefined) options.fallbackAction = base.fallbackAction;
  if (base.temperature !== undefined) options.temperature = base.temperature;
  return options;
};

export const createOllamaProviderFactory = (
  options: CreateOllamaProviderFactoryOptions,
): OllamaProviderFactory => {
  return (request) => new OllamaAdapter(buildAdapterOptions(options, request));
};
