export const REDACTION_PLACEHOLDER = '[REDACTED]';

export interface UnsafePattern {
  readonly id: string;
  readonly description: string;
  readonly pattern: RegExp;
}

const buildPattern = (
  id: string,
  description: string,
  source: string,
  flags = 'g',
): UnsafePattern => ({
  id,
  description,
  pattern: new RegExp(source, flags),
});

export const UNSAFE_PATTERNS: readonly UnsafePattern[] = [
  buildPattern(
    'unix-abs-path',
    'Unix absolute path under a known sensitive root.',
    String.raw`(?:^|(?<=[\s"'\`,(:=]))\/(?:Users|home|root|var|etc|opt|tmp|private|Library|System|mnt|usr/local|srv|run)\/[^\s"'\`,]*`,
  ),
  buildPattern(
    'home-relative-path',
    'Home-relative path (~/...).',
    String.raw`(?<![A-Za-z0-9_])~\/[^\s"'\`,]*`,
  ),
  buildPattern(
    'windows-abs-path',
    'Windows absolute path.',
    String.raw`(?<![A-Za-z0-9])[A-Za-z]:\\[^\s"'\`,]*`,
  ),
  buildPattern(
    'bearer-token',
    'HTTP bearer authorization token.',
    String.raw`\bBearer\s+[A-Za-z0-9._\-+/=]{8,}`,
    'gi',
  ),
  buildPattern('sk-token', 'API key with sk-* prefix.', String.raw`\bsk-[A-Za-z0-9_\-]{16,}\b`),
  buildPattern('aws-access-key', 'AWS access key id.', String.raw`\b(?:AKIA|ASIA)[A-Z0-9]{16}\b`),
  buildPattern(
    'github-token',
    'GitHub personal access token.',
    String.raw`\b(?:gh[pousr])_[A-Za-z0-9]{20,}\b`,
  ),
  buildPattern(
    'private-key-block',
    'PEM private key block.',
    String.raw`-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----`,
  ),
  buildPattern(
    'jwt-token',
    'JSON Web Token.',
    String.raw`\beyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\b`,
  ),
  buildPattern(
    'url-credentials',
    'URL with embedded user:password credentials.',
    String.raw`\b[a-z][a-z0-9+.\-]*:\/\/[^\s/@:"']+:[^\s/@:"']+@[^\s"']+`,
    'gi',
  ),
];

export interface UnsafeMatch {
  readonly id: string;
  readonly description: string;
  readonly value: string;
  readonly index: number;
  readonly path: readonly (string | number)[];
}

export function findUnsafeMatchesInString(
  input: string,
  path: readonly (string | number)[] = [],
): UnsafeMatch[] {
  const matches: UnsafeMatch[] = [];
  for (const { id, description, pattern } of UNSAFE_PATTERNS) {
    const local = new RegExp(pattern.source, pattern.flags);
    let result: RegExpExecArray | null;
    while ((result = local.exec(input)) !== null) {
      matches.push({
        id,
        description,
        value: result[0],
        index: result.index,
        path: [...path],
      });
      if (result[0].length === 0) {
        local.lastIndex += 1;
      }
    }
  }
  return matches;
}

export function isReplaySafeString(input: string): boolean {
  return findUnsafeMatchesInString(input).length === 0;
}

export function redactString(input: string, placeholder: string = REDACTION_PLACEHOLDER): string {
  let output = input;
  for (const { pattern } of UNSAFE_PATTERNS) {
    output = output.replace(new RegExp(pattern.source, pattern.flags), placeholder);
  }
  return output;
}

export interface FindUnsafeStringsOptions {
  readonly skipPaths?: ReadonlySet<string>;
}

const joinPath = (path: readonly (string | number)[]): string => path.map(String).join('.');

export function findUnsafeStrings(
  value: unknown,
  options: FindUnsafeStringsOptions = {},
): UnsafeMatch[] {
  const skip = options.skipPaths ?? new Set<string>();
  const matches: UnsafeMatch[] = [];

  const walk = (node: unknown, path: readonly (string | number)[]): void => {
    if (skip.has(joinPath(path))) {
      return;
    }
    if (typeof node === 'string') {
      for (const match of findUnsafeMatchesInString(node, path)) {
        matches.push(match);
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const [index, item] of node.entries()) {
        walk(item, [...path, index]);
      }
      return;
    }
    if (node !== null && typeof node === 'object') {
      for (const [key, item] of Object.entries(node)) {
        walk(item, [...path, key]);
      }
    }
  };

  walk(value, []);
  return matches;
}

export function assertReplaySafe(
  label: string,
  value: unknown,
  options: FindUnsafeStringsOptions = {},
): void {
  const matches = findUnsafeStrings(value, options);
  if (matches.length === 0) {
    return;
  }
  const detail = matches
    .slice(0, 5)
    .map((match) => `${match.id} at ${joinPath(match.path) || '<root>'}`)
    .join('; ');
  const more = matches.length > 5 ? `; (+${matches.length - 5} more)` : '';
  throw new Error(`${label} contains unsafe material: ${detail}${more}`);
}

export function redactValue<T>(value: T, placeholder: string = REDACTION_PLACEHOLDER): T {
  if (typeof value === 'string') {
    return redactString(value, placeholder) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, placeholder)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const next: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      next[key] = redactValue(entry, placeholder);
    }
    return next as unknown as T;
  }
  return value;
}

const DEFAULT_ALLOWED_ENV_NAMES: readonly string[] = ['PATH', 'NODE_ENV', 'TZ', 'LANG', 'LC_ALL'];

export interface RedactEnvOptions {
  readonly allowNames?: readonly string[];
  readonly placeholder?: string;
}

export function redactEnv(
  env: Readonly<Record<string, string | undefined>>,
  options: RedactEnvOptions = {},
): Record<string, string> {
  const allow = new Set([...(options.allowNames ?? DEFAULT_ALLOWED_ENV_NAMES)]);
  const placeholder = options.placeholder ?? REDACTION_PLACEHOLDER;
  const out: Record<string, string> = {};
  for (const name of Object.keys(env).sort()) {
    if (env[name] === undefined) {
      continue;
    }
    out[name] = allow.has(name) ? redactString(env[name]!, placeholder) : placeholder;
  }
  return out;
}

export function redactArgs(
  args: readonly string[],
  placeholder: string = REDACTION_PLACEHOLDER,
): string[] {
  return args.map((arg) => redactString(arg, placeholder));
}
