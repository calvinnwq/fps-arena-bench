import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type {
  ClaudeCliFileSystem,
  SpawnLike,
  SpawnLikeOptions,
  SpawnLikeOutcome,
} from './claude-cli.js';

export const NODE_SPAWN_KILL_GRACE_MS = 200;

export interface NodeSpawnLikeOptions {
  readonly killGraceMs?: number;
}

const decode = (chunk: Buffer | string): string =>
  typeof chunk === 'string' ? chunk : chunk.toString('utf8');

const byteLength = (input: Buffer | string): number =>
  typeof input === 'string' ? Buffer.byteLength(input, 'utf8') : input.length;

const killTree = (child: ChildProcess, graceMs: number): void => {
  if (child.killed || child.exitCode !== null || child.signalCode !== null) return;
  try {
    child.kill('SIGTERM');
  } catch {
    // Process may already be gone; SIGKILL fallback below still runs.
  }
  if (graceMs <= 0) {
    try {
      child.kill('SIGKILL');
    } catch {
      // Process may already be gone.
    }
    return;
  }
  const sigkillTimer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      try {
        child.kill('SIGKILL');
      } catch {
        // Process may already be gone.
      }
    }
  }, graceMs);
  if (typeof sigkillTimer.unref === 'function') sigkillTimer.unref();
};

export const createNodeSpawnLike = (factoryOptions: NodeSpawnLikeOptions = {}): SpawnLike => {
  const killGraceMs = factoryOptions.killGraceMs ?? NODE_SPAWN_KILL_GRACE_MS;
  return (options: SpawnLikeOptions): Promise<SpawnLikeOutcome> =>
    new Promise<SpawnLikeOutcome>((resolve) => {
      let settled = false;
      const settle = (outcome: SpawnLikeOutcome): void => {
        if (settled) return;
        settled = true;
        if (options.signal !== undefined) {
          options.signal.removeEventListener('abort', onAbort);
        }
        resolve(outcome);
      };

      let child: ChildProcess;
      try {
        child = spawn(options.command, [...options.args], {
          cwd: options.cwd,
          env: { ...options.env },
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        });
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        resolve({ kind: 'spawn-error', message });
        return;
      }

      let stdout = '';
      let stderr = '';
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let outputCapStream: 'stdout' | 'stderr' | null = null;

      const triggerOutputCap = (stream: 'stdout' | 'stderr'): void => {
        if (outputCapStream !== null) return;
        outputCapStream = stream;
        killTree(child, killGraceMs);
      };

      const onStdout = (chunk: Buffer | string): void => {
        const incoming = byteLength(chunk);
        if (stdoutBytes + incoming > options.maxStdoutBytes) {
          const remaining = Math.max(0, options.maxStdoutBytes - stdoutBytes);
          if (remaining > 0) {
            const text = decode(chunk);
            stdout += text.slice(0, remaining);
            stdoutBytes += Buffer.byteLength(text.slice(0, remaining), 'utf8');
          }
          triggerOutputCap('stdout');
          return;
        }
        stdout += decode(chunk);
        stdoutBytes += incoming;
      };

      const onStderr = (chunk: Buffer | string): void => {
        const incoming = byteLength(chunk);
        if (stderrBytes + incoming > options.maxStderrBytes) {
          const remaining = Math.max(0, options.maxStderrBytes - stderrBytes);
          if (remaining > 0) {
            const text = decode(chunk);
            stderr += text.slice(0, remaining);
            stderrBytes += Buffer.byteLength(text.slice(0, remaining), 'utf8');
          }
          triggerOutputCap('stderr');
          return;
        }
        stderr += decode(chunk);
        stderrBytes += incoming;
      };

      const onAbort = (): void => {
        killTree(child, killGraceMs);
      };
      if (options.signal !== undefined) {
        if (options.signal.aborted) {
          killTree(child, killGraceMs);
        } else {
          options.signal.addEventListener('abort', onAbort, { once: true });
        }
      }

      child.stdout?.on('data', onStdout);
      child.stderr?.on('data', onStderr);

      child.on('error', (error: Error) => {
        settle({ kind: 'spawn-error', message: error.message });
      });

      child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
        if (outputCapStream !== null) {
          settle({ kind: 'output-cap', stream: outputCapStream, stdout, stderr });
          return;
        }
        if (options.signal?.aborted === true) {
          settle({ kind: 'aborted', stdout, stderr });
          return;
        }
        if (signal !== null) {
          settle({ kind: 'exit', code: code ?? 1, signal, stdout, stderr });
          return;
        }
        settle({ kind: 'exit', code: code ?? 0, stdout, stderr });
      });

      const stdin = child.stdin;
      if (stdin !== null) {
        stdin.on('error', () => {
          // Ignore EPIPE if process exits before consuming all stdin.
        });
        stdin.end(options.stdin);
      }
    });
};

export interface NodeClaudeCliFileSystemOptions {
  readonly tempRoot?: string;
}

export const createNodeClaudeCliFileSystem = (
  options: NodeClaudeCliFileSystemOptions = {},
): ClaudeCliFileSystem => {
  const tempRoot = options.tempRoot ?? tmpdir();
  return {
    mkdtemp: async (prefix: string): Promise<string> => mkdtemp(join(tempRoot, prefix)),
    rm: async (path: string): Promise<void> => {
      await rm(path, { recursive: true, force: true });
    },
  };
};
