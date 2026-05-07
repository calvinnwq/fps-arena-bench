import { spawn } from 'node:child_process';

import {
  CLAUDE_CLI_DEFAULT_ADAPTER_ID,
  CLAUDE_CLI_DEFAULT_COMMAND,
  CLAUDE_CLI_DEFAULT_REQUEST_TIMEOUT_MS,
  CODEX_CLI_DEFAULT_ADAPTER_ID,
  CODEX_CLI_DEFAULT_COMMAND,
  CODEX_CLI_DEFAULT_REQUEST_TIMEOUT_MS,
  OPENCODE_CLI_DEFAULT_ADAPTER_ID,
  OPENCODE_CLI_DEFAULT_COMMAND,
  OPENCODE_CLI_DEFAULT_REQUEST_TIMEOUT_MS,
} from '@fps-arena-bench/adapters';
import { isReplaySafeString, redactString } from '@fps-arena-bench/replay';

export type DoctorStatus = 'installed' | 'unavailable' | 'misconfigured';

export interface DoctorAdapterEntry {
  readonly adapterId: string;
  readonly displayName: string;
  readonly status: DoctorStatus;
  readonly reason: string;
  readonly publicDiagnostics: readonly string[];
  readonly privateDiagnostics?: readonly string[];
}

export interface DoctorResult {
  readonly adapters: readonly DoctorAdapterEntry[];
  readonly allReady: boolean;
}

export type CommandCheckStatus = 'found' | 'not-found' | 'failed' | 'timed-out';

export interface CommandCheckResult {
  readonly status: CommandCheckStatus;
}

export type CommandAvailabilityChecker = (
  command: string,
  args?: readonly string[],
) => Promise<CommandCheckResult>;

export interface DoctorAdapterSpec {
  readonly adapterId: string;
  readonly displayName: string;
  readonly kind: 'builtin' | 'harness';
  readonly command?: string;
  readonly versionArgs?: readonly string[];
  readonly installHint?: string;
  readonly envEnableName?: string;
  readonly envCommandName?: string;
  readonly envTimeoutName?: string;
  readonly defaultTimeoutMs?: number;
}

export const DOCTOR_ADAPTER_SPECS: readonly DoctorAdapterSpec[] = Object.freeze([
  {
    adapterId: 'baseline-random',
    displayName: 'Random Bot',
    kind: 'builtin',
  },
  {
    adapterId: 'baseline-chaser',
    displayName: 'Chaser Bot',
    kind: 'builtin',
  },
  {
    adapterId: 'baseline-pickup-seeker',
    displayName: 'Pickup Seeker Bot',
    kind: 'builtin',
  },
  {
    adapterId: 'mock',
    displayName: 'Mock Adapter',
    kind: 'builtin',
  },
  {
    adapterId: CLAUDE_CLI_DEFAULT_ADAPTER_ID,
    displayName: 'Claude CLI Harness',
    kind: 'harness',
    command: CLAUDE_CLI_DEFAULT_COMMAND,
    versionArgs: ['--version'],
    installHint: 'https://docs.anthropic.com/en/docs/claude-code',
    envEnableName: 'FPS_ARENA_ENABLE_CLAUDE_CLI',
    envCommandName: 'FPS_ARENA_CLAUDE_COMMAND',
    envTimeoutName: 'FPS_ARENA_CLAUDE_TIMEOUT_MS',
    defaultTimeoutMs: CLAUDE_CLI_DEFAULT_REQUEST_TIMEOUT_MS,
  },
  {
    adapterId: CODEX_CLI_DEFAULT_ADAPTER_ID,
    displayName: 'Codex CLI Harness',
    kind: 'harness',
    command: CODEX_CLI_DEFAULT_COMMAND,
    versionArgs: ['--version'],
    installHint: 'https://github.com/openai/codex',
    envEnableName: 'FPS_ARENA_ENABLE_CODEX_CLI',
    envCommandName: 'FPS_ARENA_CODEX_COMMAND',
    envTimeoutName: 'FPS_ARENA_CODEX_TIMEOUT_MS',
    defaultTimeoutMs: CODEX_CLI_DEFAULT_REQUEST_TIMEOUT_MS,
  },
  {
    adapterId: OPENCODE_CLI_DEFAULT_ADAPTER_ID,
    displayName: 'OpenCode CLI Harness',
    kind: 'harness',
    command: OPENCODE_CLI_DEFAULT_COMMAND,
    versionArgs: ['--version'],
    installHint: 'https://opencode.ai',
    envEnableName: 'FPS_ARENA_ENABLE_OPENCODE_CLI',
    envCommandName: 'FPS_ARENA_OPENCODE_COMMAND',
    envTimeoutName: 'FPS_ARENA_OPENCODE_TIMEOUT_MS',
    defaultTimeoutMs: OPENCODE_CLI_DEFAULT_REQUEST_TIMEOUT_MS,
  },
]);

export interface CreateNodeCommandCheckerOptions {
  readonly probeTimeoutMs?: number;
}

const DEFAULT_PROBE_TIMEOUT_MS = 3_000;

export function createNodeCommandChecker(
  options: CreateNodeCommandCheckerOptions = {},
): CommandAvailabilityChecker {
  const probeTimeoutMs = options.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
  return (
    command: string,
    args: readonly string[] = ['--version'],
  ): Promise<CommandCheckResult> => {
    return new Promise((resolve_) => {
      let settled = false;
      let timeout: NodeJS.Timeout | undefined;
      const settle = (value: CommandCheckResult): void => {
        if (!settled) {
          settled = true;
          if (timeout !== undefined) {
            clearTimeout(timeout);
          }
          resolve_(value);
        }
      };

      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(command, args, {
          stdio: 'ignore',
          shell: false,
        });
      } catch {
        settle({ status: 'failed' });
        return;
      }

      timeout = setTimeout(() => {
        child.kill('SIGTERM');
        settle({ status: 'timed-out' });
      }, probeTimeoutMs);

      child.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') {
          settle({ status: 'not-found' });
        } else {
          settle({ status: 'failed' });
        }
      });

      child.on('close', () => {
        settle({ status: 'found' });
      });
    });
  };
}

export interface RunDoctorOptions {
  readonly checkCommand: CommandAvailabilityChecker;
  readonly getEnv?: () => Record<string, string | undefined>;
  readonly includePrivateDiagnostics?: boolean;
}

const isEnabled = (value: string | undefined): boolean =>
  value === '1' || value?.toLowerCase() === 'true';

const isNonEmpty = (value: string | undefined): value is string =>
  value !== undefined && value.trim().length > 0;

const parsePositiveInteger = (value: string | undefined): number | undefined => {
  if (value === undefined || !/^[1-9][0-9]*$/.test(value)) {
    return undefined;
  }
  return Number.parseInt(value, 10);
};

const isInvalidPositiveInteger = (value: string | undefined): boolean =>
  value !== undefined && parsePositiveInteger(value) === undefined;

const safeCommandLabel = (command: string, fallback: string): string => {
  if (/^[A-Za-z0-9._-]+$/.test(command)) {
    return `"${command}"`;
  }
  return fallback;
};

const publicString = (value: string): string => {
  const redacted = redactString(value);
  return isReplaySafeString(redacted) ? redacted : '[redacted unsafe diagnostic]';
};

const makeEntry = (entry: DoctorAdapterEntry): DoctorAdapterEntry => ({
  ...entry,
  reason: publicString(entry.reason),
  publicDiagnostics: entry.publicDiagnostics.map(publicString),
  ...(entry.privateDiagnostics !== undefined
    ? { privateDiagnostics: entry.privateDiagnostics.map((detail) => redactString(detail)) }
    : {}),
});

export async function runDoctor(options: RunDoctorOptions): Promise<DoctorResult> {
  const { checkCommand } = options;
  const includePrivateDiagnostics = options.includePrivateDiagnostics ?? false;
  const env = options.getEnv?.() ?? process.env;
  const entries: DoctorAdapterEntry[] = [];

  for (const spec of DOCTOR_ADAPTER_SPECS) {
    if (spec.kind === 'builtin') {
      entries.push(
        makeEntry({
          adapterId: spec.adapterId,
          displayName: spec.displayName,
          status: 'installed',
          reason: 'Built-in adapter, no external dependencies.',
          publicDiagnostics: ['No external CLI command, credentials, or local paths are required.'],
        }),
      );
      continue;
    }

    const defaultCommand = spec.command ?? spec.adapterId;
    const envCommand = spec.envCommandName !== undefined ? env[spec.envCommandName] : undefined;
    const command = isNonEmpty(envCommand) ? envCommand.trim() : defaultCommand;
    const commandLabel = safeCommandLabel(command, 'configured CLI command');
    const timeoutValue =
      spec.envTimeoutName !== undefined
        ? parsePositiveInteger(env[spec.envTimeoutName])
        : undefined;
    const timeoutMs = timeoutValue ?? spec.defaultTimeoutMs;
    const enableFlag = spec.envEnableName;
    const enableValue = enableFlag !== undefined ? env[enableFlag] : undefined;
    const timeoutFlag = spec.envTimeoutName;
    const privateDiagnostics = includePrivateDiagnostics
      ? [
          `commandSource=${isNonEmpty(envCommand) ? spec.envCommandName : 'default'}`,
          `command=${command}`,
          ...(enableFlag !== undefined
            ? [`${enableFlag}=${isEnabled(enableValue) ? 'enabled' : 'not-enabled'}`]
            : []),
          ...(timeoutFlag !== undefined && timeoutMs !== undefined
            ? [`${timeoutFlag}=${timeoutMs}`]
            : []),
        ]
      : undefined;

    if (timeoutFlag !== undefined && isInvalidPositiveInteger(env[timeoutFlag])) {
      entries.push(
        makeEntry({
          adapterId: spec.adapterId,
          displayName: spec.displayName,
          status: 'misconfigured',
          reason: `${timeoutFlag} must be a positive integer timeout in milliseconds.`,
          publicDiagnostics: [
            'Invalid timeout configuration is ignored by run/batch; fix it before comparing latency or reliability.',
            'No raw prompts, model output, credentials, auth paths, absolute paths, or full environment values were inspected.',
          ],
          ...(privateDiagnostics !== undefined ? { privateDiagnostics } : {}),
        }),
      );
      continue;
    }

    const check = await checkCommand(command, spec.versionArgs ?? ['--version']);
    if (check.status === 'found') {
      entries.push(
        makeEntry({
          adapterId: spec.adapterId,
          displayName: spec.displayName,
          status: 'installed',
          reason: `CLI command ${commandLabel} responded to the lightweight version probe.`,
          publicDiagnostics: [
            enableFlag === undefined || isEnabled(enableValue)
              ? 'Packaged CLI registration is enabled for run/batch.'
              : `Set ${enableFlag}=1 to register this harness for packaged run/batch commands.`,
            timeoutMs !== undefined
              ? `Default request timeout budget is ${timeoutMs} ms unless overridden.`
              : 'Request timeout budget is adapter-defined unless overridden.',
            'Doctor does not run a benchmark match and does not capture CLI stdout/stderr.',
          ],
          ...(privateDiagnostics !== undefined ? { privateDiagnostics } : {}),
        }),
      );
      continue;
    }

    if (check.status === 'not-found') {
      const hint = spec.installHint !== undefined ? ` Install from: ${spec.installHint}` : '';
      entries.push(
        makeEntry({
          adapterId: spec.adapterId,
          displayName: spec.displayName,
          status: 'unavailable',
          reason: `CLI command ${commandLabel} was not found in PATH.${hint}`,
          publicDiagnostics: [
            'Install the CLI and authenticate it outside FPS Arena Bench before using this harness.',
            'No provider OAuth/login flow or credential storage is performed by doctor.',
          ],
          ...(privateDiagnostics !== undefined ? { privateDiagnostics } : {}),
        }),
      );
      continue;
    }

    entries.push(
      makeEntry({
        adapterId: spec.adapterId,
        displayName: spec.displayName,
        status: 'misconfigured',
        reason:
          check.status === 'timed-out'
            ? `CLI command ${commandLabel} did not finish the lightweight version probe in time.`
            : `CLI command ${commandLabel} could not be started for the lightweight version probe.`,
        publicDiagnostics: [
          'Verify the CLI can run a version command in the current shell before using this harness.',
          'Doctor ignores probe output and does not persist private diagnostics unless explicitly printed.',
        ],
        ...(privateDiagnostics !== undefined ? { privateDiagnostics } : {}),
      }),
    );
  }

  const allReady = entries
    .filter((_, i) => DOCTOR_ADAPTER_SPECS[i]?.kind === 'harness')
    .every((entry) => entry.status === 'installed');

  return { adapters: entries, allReady };
}
