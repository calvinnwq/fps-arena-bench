import {
  ActionSchema,
  AdapterErrorSchema,
  SCHEMA_VERSION,
  type Action,
  type AdapterError,
} from '@fps-arena-bench/schemas';

export const ADAPTER_DEFAULT_MAX_OUTPUT_BYTES = 16 * 1024;

export interface ParseActionOptions {
  readonly adapterId: string;
  readonly maxOutputBytes?: number;
}

export type ParseActionResult =
  | { readonly ok: true; readonly action: Action }
  | { readonly ok: false; readonly error: AdapterError };

const PATH_LIKE_PATTERN =
  /(?:^|(?<=[\s"'`,(:=]))\/(?:Users|home|root|var|etc|opt|tmp|private|Library|System|mnt|usr\/local|srv|run)\/[^\s"'`,]*/g;

const sanitizeMessage = (message: string): string =>
  message.replace(PATH_LIKE_PATTERN, '[REDACTED]');

const utf8ByteLength = (input: string): number => {
  // Avoid Buffer/Node-only APIs to keep this isomorphic.
  return new TextEncoder().encode(input).length;
};

const buildError = (
  adapterId: string,
  code: AdapterError['code'],
  message: string,
  retryable: boolean,
): AdapterError =>
  AdapterErrorSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    adapterId,
    code,
    message: sanitizeMessage(message),
    retryable,
  });

export function parseActionResponse(
  rawOutput: string,
  options: ParseActionOptions,
): ParseActionResult {
  const adapterId = options.adapterId;
  const maxBytes = options.maxOutputBytes ?? ADAPTER_DEFAULT_MAX_OUTPUT_BYTES;

  if (utf8ByteLength(rawOutput) > maxBytes) {
    return {
      ok: false,
      error: buildError(
        adapterId,
        'output-cap',
        `Adapter output exceeds maximum allowed size of ${maxBytes} bytes.`,
        false,
      ),
    };
  }

  const trimmed = rawOutput.trim();
  if (trimmed.length === 0) {
    return {
      ok: false,
      error: buildError(adapterId, 'invalid-json', 'Adapter output was empty.', true),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      ok: false,
      error: buildError(
        adapterId,
        'invalid-json',
        'Adapter output was not a single parseable JSON value.',
        true,
      ),
    };
  }

  const validation = ActionSchema.safeParse(parsed);
  if (!validation.success) {
    const detail = validation.error.issues
      .slice(0, 3)
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
        return `${path}: ${issue.message}`;
      })
      .join('; ');
    return {
      ok: false,
      error: buildError(
        adapterId,
        'schema-failure',
        `Adapter output did not match action schema (${detail}).`,
        true,
      ),
    };
  }

  return { ok: true, action: validation.data };
}
