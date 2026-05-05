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
