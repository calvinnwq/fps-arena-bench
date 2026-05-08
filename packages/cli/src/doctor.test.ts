import { describe, expect, it } from 'vitest';

import { isReplaySafeString } from '@fps-arena-bench/replay';

import {
  DOCTOR_ADAPTER_SPECS,
  type CommandCheckResult,
  type CommandAvailabilityChecker,
  createNodeCommandChecker,
  runDoctor,
} from './doctor.js';

const found = (): CommandCheckResult => ({ status: 'found' });
const notFound = (): CommandCheckResult => ({ status: 'not-found' });
const timedOut = (): CommandCheckResult => ({ status: 'timed-out' });

const allFoundChecker: CommandAvailabilityChecker = async () => found();
const allMissingChecker: CommandAvailabilityChecker = async () => notFound();
const allTimedOutChecker: CommandAvailabilityChecker = async () => timedOut();
const claudeUnavailableChecker: CommandAvailabilityChecker = async (command) =>
  command === 'claude' ? notFound() : found();

const emptyEnv = () => ({});

const harnessEntriesFor = (result: Awaited<ReturnType<typeof runDoctor>>) =>
  result.adapters.filter((_, i) => DOCTOR_ADAPTER_SPECS[i]?.kind === 'harness');

describe('runDoctor', () => {
  it('classifies non-zero version probes as failed', async () => {
    const checker = createNodeCommandChecker({ probeTimeoutMs: 1_000 });

    await expect(checker(process.execPath, ['-e', 'process.exit(7)'])).resolves.toEqual({
      status: 'failed',
    });
  });

  it('all harness entries are installed and allReady is true when checker finds all commands', async () => {
    const result = await runDoctor({ checkCommand: allFoundChecker, getEnv: emptyEnv });
    for (const entry of harnessEntriesFor(result)) {
      expect(entry.status).toBe('installed');
    }
    expect(result.allReady).toBe(true);
  });

  it('all harness entries are unavailable and allReady is false when checker misses all commands', async () => {
    const result = await runDoctor({ checkCommand: allMissingChecker, getEnv: emptyEnv });
    for (const entry of harnessEntriesFor(result)) {
      expect(entry.status).toBe('unavailable');
    }
    expect(result.allReady).toBe(false);
  });

  it('produces mixed statuses when only claude is unavailable', async () => {
    const result = await runDoctor({ checkCommand: claudeUnavailableChecker, getEnv: emptyEnv });
    const byId = Object.fromEntries(result.adapters.map((e) => [e.adapterId, e]));

    expect(byId['claude-cli']?.status).toBe('unavailable');
    expect(byId['codex-cli']?.status).toBe('installed');
    expect(byId['opencode-cli']?.status).toBe('installed');
    expect(result.allReady).toBe(false);
  });

  it('classifies probe failures and timeouts as misconfigured', async () => {
    const result = await runDoctor({ checkCommand: allTimedOutChecker, getEnv: emptyEnv });
    for (const entry of harnessEntriesFor(result)) {
      expect(entry.status).toBe('misconfigured');
      expect(entry.reason).toMatch(/version probe/);
    }
    expect(result.allReady).toBe(false);
  });

  it('classifies invalid harness timeout environment values as misconfigured without probing', async () => {
    const commands: string[] = [];
    const checker: CommandAvailabilityChecker = async (command) => {
      commands.push(command);
      return found();
    };

    const result = await runDoctor({
      checkCommand: checker,
      getEnv: () => ({ FPS_ARENA_CODEX_TIMEOUT_MS: '0' }),
    });

    expect(result.adapters.find((entry) => entry.adapterId === 'codex-cli')?.status).toBe(
      'misconfigured',
    );
    expect(commands).not.toContain('codex');
    expect(result.allReady).toBe(false);
  });

  it('uses configured command environment overrides without leaking unsafe paths in public output', async () => {
    const checked: string[] = [];
    const checker: CommandAvailabilityChecker = async (command) => {
      checked.push(command);
      return notFound();
    };
    const result = await runDoctor({
      checkCommand: checker,
      getEnv: () => ({ FPS_ARENA_CLAUDE_COMMAND: '/Users/example/bin/claude' }),
    });

    expect(checked).toContain('/Users/example/bin/claude');
    const claude = result.adapters.find((entry) => entry.adapterId === 'claude-cli');
    expect(claude?.reason).toContain('configured CLI command');
    expect(claude?.reason).not.toContain('/Users/example/bin/claude');
  });

  it('built-in adapters are always installed regardless of checker', async () => {
    const result = await runDoctor({ checkCommand: allMissingChecker, getEnv: emptyEnv });
    const builtinEntries = result.adapters.filter(
      (_, i) => DOCTOR_ADAPTER_SPECS[i]?.kind === 'builtin',
    );
    expect(builtinEntries.length).toBeGreaterThan(0);
    for (const entry of builtinEntries) {
      expect(entry.status).toBe('installed');
      expect(entry.reason).toBe('Built-in adapter, no external dependencies.');
    }
  });

  it('reason strings for unavailable default harness adapters contain the default command name', async () => {
    const result = await runDoctor({ checkCommand: allMissingChecker, getEnv: emptyEnv });
    const harnessSpecs = DOCTOR_ADAPTER_SPECS.filter((s) => s.kind === 'harness');
    const harnessEntries = harnessEntriesFor(result);

    for (let i = 0; i < harnessEntries.length; i++) {
      const entry = harnessEntries[i];
      const spec = harnessSpecs[i];
      expect(entry).toBeDefined();
      expect(spec).toBeDefined();
      if (entry !== undefined && spec !== undefined && spec.command !== undefined) {
        expect(entry.reason).toContain(spec.command);
      }
    }
  });

  it('public diagnostics contain no absolute paths or unsafe content', async () => {
    const resultAllTrue = await runDoctor({ checkCommand: allFoundChecker, getEnv: emptyEnv });
    const resultAllFalse = await runDoctor({ checkCommand: allMissingChecker, getEnv: emptyEnv });

    for (const entry of [...resultAllTrue.adapters, ...resultAllFalse.adapters]) {
      expect(isReplaySafeString(entry.reason)).toBe(true);
      expect(isReplaySafeString(entry.adapterId)).toBe(true);
      expect(isReplaySafeString(entry.displayName)).toBe(true);
      for (const detail of entry.publicDiagnostics) {
        expect(isReplaySafeString(detail)).toBe(true);
      }
      expect(entry.privateDiagnostics).toBeUndefined();
    }
  });

  it('includes private diagnostics only when explicitly requested', async () => {
    const result = await runDoctor({
      checkCommand: allFoundChecker,
      getEnv: () => ({ FPS_ARENA_ENABLE_CLAUDE_CLI: '1' }),
      includePrivateDiagnostics: true,
    });
    const claude = result.adapters.find((entry) => entry.adapterId === 'claude-cli');
    expect(claude?.privateDiagnostics).toEqual(
      expect.arrayContaining(['FPS_ARENA_ENABLE_CLAUDE_CLI=enabled']),
    );
  });

  it('result contains an entry for every spec in DOCTOR_ADAPTER_SPECS', async () => {
    const result = await runDoctor({ checkCommand: allFoundChecker, getEnv: emptyEnv });
    expect(result.adapters).toHaveLength(DOCTOR_ADAPTER_SPECS.length);
    for (const spec of DOCTOR_ADAPTER_SPECS) {
      const entry = result.adapters.find((e) => e.adapterId === spec.adapterId);
      expect(entry).toBeDefined();
      expect(entry?.displayName).toBe(spec.displayName);
    }
  });
});
