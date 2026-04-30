import { describe, expect, it } from 'vitest';

import {
  REDACTION_PLACEHOLDER,
  assertReplaySafe,
  findUnsafeMatchesInString,
  findUnsafeStrings,
  isReplaySafeString,
  redactArgs,
  redactEnv,
  redactString,
  redactValue,
} from './redaction.js';

describe('findUnsafeMatchesInString', () => {
  it('detects unix absolute paths under sensitive roots', () => {
    const matches = findUnsafeMatchesInString('error at /Users/alice/secret/key.txt opening file');
    expect(matches.map((entry) => entry.id)).toContain('unix-abs-path');
  });

  it('detects home-relative paths', () => {
    const matches = findUnsafeMatchesInString('see ~/.aws/credentials');
    expect(matches.map((entry) => entry.id)).toContain('home-relative-path');
  });

  it('detects windows absolute paths', () => {
    const matches = findUnsafeMatchesInString('C:\\Users\\alice\\secret.json');
    expect(matches.map((entry) => entry.id)).toContain('windows-abs-path');
  });

  it('detects bearer tokens', () => {
    const matches = findUnsafeMatchesInString('Authorization: Bearer abcdef0123456789');
    expect(matches.map((entry) => entry.id)).toContain('bearer-token');
  });

  it('detects sk- API tokens', () => {
    const matches = findUnsafeMatchesInString(
      'export OPENAI_API_KEY=sk-thisissecret_abcdef1234567890',
    );
    expect(matches.map((entry) => entry.id)).toContain('sk-token');
  });

  it('detects AWS access keys', () => {
    const matches = findUnsafeMatchesInString('use AKIAIOSFODNN7EXAMPLE for the api');
    expect(matches.map((entry) => entry.id)).toContain('aws-access-key');
  });

  it('detects github tokens', () => {
    const matches = findUnsafeMatchesInString('token=ghp_AbCdEfGhIjKlMnOpQrStUvWxYz0123');
    expect(matches.map((entry) => entry.id)).toContain('github-token');
  });

  it('detects PEM private key blocks', () => {
    const matches = findUnsafeMatchesInString('-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBALhO');
    expect(matches.map((entry) => entry.id)).toContain('private-key-block');
  });

  it('detects JWT tokens', () => {
    const matches = findUnsafeMatchesInString(
      'jwt=eyJabc12345.eyJpYXQ_payloadGoesHere.signaturePart',
    );
    expect(matches.map((entry) => entry.id)).toContain('jwt-token');
  });

  it('detects URLs with embedded credentials', () => {
    const matches = findUnsafeMatchesInString('connect to https://user:pass@example.com/db');
    expect(matches.map((entry) => entry.id)).toContain('url-credentials');
  });

  it('returns no matches for benign strings', () => {
    expect(findUnsafeMatchesInString('alpha shoots bravo at (8,5)').length).toBe(0);
    expect(findUnsafeMatchesInString('sha256:abc123def456').length).toBe(0);
    expect(findUnsafeMatchesInString('contender alpha-1 collected health-mid').length).toBe(0);
  });
});

describe('isReplaySafeString', () => {
  it('returns false when unsafe material is present', () => {
    expect(isReplaySafeString('/Users/alice/code')).toBe(false);
  });

  it('returns true for safe strings', () => {
    expect(isReplaySafeString('match-id-42')).toBe(true);
    expect(isReplaySafeString('sha256:0123abcd')).toBe(true);
  });
});

describe('redactString', () => {
  it('replaces unsafe substrings with the placeholder', () => {
    const redacted = redactString('saw /Users/alice/path and Bearer abcdef123456789012');
    expect(redacted.includes('/Users/alice')).toBe(false);
    expect(redacted.includes('Bearer abcdef')).toBe(false);
    expect(redacted.includes(REDACTION_PLACEHOLDER)).toBe(true);
  });

  it('leaves benign strings untouched', () => {
    expect(redactString('alpha turned 90 degrees')).toBe('alpha turned 90 degrees');
  });
});

describe('redactValue', () => {
  it('walks objects and arrays recursively', () => {
    const redacted = redactValue({
      command: ['/Users/alice/cli', '--token', 'sk-abc1234567890123456'],
      env: { HOME: '/Users/alice' },
    });
    const flat = JSON.stringify(redacted);
    expect(flat.includes('/Users/alice')).toBe(false);
    expect(flat.includes('sk-abc')).toBe(false);
    expect(flat.includes(REDACTION_PLACEHOLDER)).toBe(true);
  });
});

describe('redactEnv', () => {
  it('redacts every value not in the allow list', () => {
    const redacted = redactEnv(
      {
        OPENAI_API_KEY: 'sk-secret-1234567890123456',
        HOME: '/Users/alice',
        PATH: '/usr/local/bin:/usr/bin',
        UNDEFINED_VAR: undefined,
      },
      { allowNames: ['PATH'] },
    );
    expect(redacted.OPENAI_API_KEY).toBe(REDACTION_PLACEHOLDER);
    expect(redacted.HOME).toBe(REDACTION_PLACEHOLDER);
    expect(redacted.PATH).toBe(REDACTION_PLACEHOLDER); // still scrubbed because absolute paths
    expect(redacted).not.toHaveProperty('UNDEFINED_VAR');
  });

  it('uses the default allow list when none is provided', () => {
    const redacted = redactEnv({ HOME: '/Users/alice', NODE_ENV: 'test' });
    expect(redacted.HOME).toBe(REDACTION_PLACEHOLDER);
    expect(redacted.NODE_ENV).toBe('test');
  });
});

describe('redactArgs', () => {
  it('strips path and credential fragments while keeping flag names', () => {
    const out = redactArgs(['--config', '/Users/alice/cfg.json', '--token=sk-abc1234567890123456']);
    expect(out[0]).toBe('--config');
    expect(out[1]).toBe(REDACTION_PLACEHOLDER);
    expect(out[2]?.startsWith('--token=')).toBe(true);
    expect(out[2]?.includes('sk-abc')).toBe(false);
  });
});

describe('findUnsafeStrings + assertReplaySafe', () => {
  it('walks nested objects and arrays', () => {
    const matches = findUnsafeStrings({
      contenders: [
        { id: 'alpha', notes: 'see ~/.aws/credentials for setup' },
        { id: 'bravo', notes: 'safe note' },
      ],
    });
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]?.path).toEqual(['contenders', 0, 'notes']);
  });

  it('throws via assertReplaySafe when unsafe strings are present', () => {
    expect(() =>
      assertReplaySafe('artifact', { adapterId: 'bot', cwd: '/Users/alice/repo' }),
    ).toThrow(/unsafe material/);
  });

  it('does nothing when input is safe', () => {
    expect(() =>
      assertReplaySafe('artifact', { adapterId: 'bot', match: 'match-1' }),
    ).not.toThrow();
  });

  it('skips string fields listed in skipPaths', () => {
    expect(() =>
      assertReplaySafe(
        'artifact',
        { hash: 'sha256:abc', allowed: '/Users/alice' },
        { skipPaths: new Set(['allowed']) },
      ),
    ).not.toThrow();
  });
});
