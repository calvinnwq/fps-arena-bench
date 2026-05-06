import { existsSync, statSync } from 'node:fs';
import { execPath } from 'node:process';
import { describe, expect, it } from 'vitest';

import {
  NODE_SPAWN_KILL_GRACE_MS,
  createNodeClaudeCliFileSystem,
  createNodeSpawnLike,
} from './claude-cli-node.js';
import type { SpawnLikeOptions } from './claude-cli.js';

const baseSpawnOptions = (
  overrides: Partial<SpawnLikeOptions> & { args?: readonly string[] } = {},
): SpawnLikeOptions => ({
  command: overrides.command ?? execPath,
  args: overrides.args ?? ['-e', 'process.stdout.write("ok")'],
  cwd: overrides.cwd ?? process.cwd(),
  env: overrides.env ?? { PATH: process.env.PATH ?? '' },
  stdin: overrides.stdin ?? '',
  signal: overrides.signal ?? new AbortController().signal,
  maxStdoutBytes: overrides.maxStdoutBytes ?? 4096,
  maxStderrBytes: overrides.maxStderrBytes ?? 4096,
});

describe('createNodeSpawnLike', () => {
  it('returns kind:exit with code 0 and stdout from a clean run', async () => {
    const spawnImpl = createNodeSpawnLike();
    const outcome = await spawnImpl(baseSpawnOptions());
    expect(outcome.kind).toBe('exit');
    if (outcome.kind !== 'exit') throw new Error('expected exit');
    expect(outcome.code).toBe(0);
    expect(outcome.stdout).toBe('ok');
    expect(outcome.stderr).toBe('');
  });

  it('forwards stdin to the child process', async () => {
    const spawnImpl = createNodeSpawnLike();
    const outcome = await spawnImpl(
      baseSpawnOptions({
        args: [
          '-e',
          'let buf="";process.stdin.on("data",c=>buf+=c);process.stdin.on("end",()=>process.stdout.write(buf))',
        ],
        stdin: 'hello-stdin',
      }),
    );
    expect(outcome.kind).toBe('exit');
    if (outcome.kind !== 'exit') throw new Error('expected exit');
    expect(outcome.stdout).toBe('hello-stdin');
  });

  it('captures non-zero exit code and stderr separately', async () => {
    const spawnImpl = createNodeSpawnLike();
    const outcome = await spawnImpl(
      baseSpawnOptions({
        args: ['-e', 'process.stderr.write("boom");process.exit(7)'],
      }),
    );
    expect(outcome.kind).toBe('exit');
    if (outcome.kind !== 'exit') throw new Error('expected exit');
    expect(outcome.code).toBe(7);
    expect(outcome.stdout).toBe('');
    expect(outcome.stderr).toBe('boom');
  });

  it('returns kind:spawn-error when the command does not exist', async () => {
    const spawnImpl = createNodeSpawnLike();
    const outcome = await spawnImpl(
      baseSpawnOptions({
        command: '/nonexistent/path/to/claude-binary-xyz',
        args: [],
      }),
    );
    expect(outcome.kind).toBe('spawn-error');
    if (outcome.kind !== 'spawn-error') throw new Error('expected spawn-error');
    expect(outcome.message).toMatch(/ENOENT|not found|spawn/i);
  });

  it('returns kind:output-cap when stdout exceeds maxStdoutBytes', async () => {
    const spawnImpl = createNodeSpawnLike({ killGraceMs: 50 });
    const outcome = await spawnImpl(
      baseSpawnOptions({
        args: [
          '-e',
          'const big="x".repeat(8192);for(let i=0;i<10;i++){process.stdout.write(big)};setInterval(()=>{},1000)',
        ],
        maxStdoutBytes: 64,
      }),
    );
    expect(outcome.kind).toBe('output-cap');
    if (outcome.kind !== 'output-cap') throw new Error('expected output-cap');
    expect(outcome.stream).toBe('stdout');
  }, 10_000);

  it('returns kind:output-cap when stderr exceeds maxStderrBytes', async () => {
    const spawnImpl = createNodeSpawnLike({ killGraceMs: 50 });
    const outcome = await spawnImpl(
      baseSpawnOptions({
        args: [
          '-e',
          'const big="y".repeat(8192);for(let i=0;i<10;i++){process.stderr.write(big)};setInterval(()=>{},1000)',
        ],
        maxStderrBytes: 64,
      }),
    );
    expect(outcome.kind).toBe('output-cap');
    if (outcome.kind !== 'output-cap') throw new Error('expected output-cap');
    expect(outcome.stream).toBe('stderr');
  }, 10_000);

  it('returns kind:aborted when the signal fires during execution', async () => {
    const controller = new AbortController();
    const spawnImpl = createNodeSpawnLike({ killGraceMs: 50 });
    const promise = spawnImpl(
      baseSpawnOptions({
        args: ['-e', 'setInterval(()=>{},1000)'],
        signal: controller.signal,
      }),
    );
    setTimeout(() => controller.abort(), 50);
    const outcome = await promise;
    expect(outcome.kind).toBe('aborted');
  }, 10_000);

  it('preserves non-abort process termination signals', async () => {
    const spawnImpl = createNodeSpawnLike({ killGraceMs: 50 });
    const outcome = await spawnImpl(
      baseSpawnOptions({
        args: ['-e', 'process.kill(process.pid, "SIGTERM")'],
      }),
    );
    expect(outcome.kind).toBe('exit');
    if (outcome.kind !== 'exit') throw new Error('expected exit');
    expect(outcome.signal).toBe('SIGTERM');
    expect(outcome.code).not.toBe(0);
  }, 10_000);

  it('runs in the configured cwd', async () => {
    const spawnImpl = createNodeSpawnLike();
    const outcome = await spawnImpl(
      baseSpawnOptions({
        args: ['-e', 'process.stdout.write(process.cwd())'],
        cwd: process.cwd(),
      }),
    );
    expect(outcome.kind).toBe('exit');
    if (outcome.kind !== 'exit') throw new Error('expected exit');
    expect(outcome.stdout).toBe(process.cwd());
  });

  it('passes only the provided env (no parent env leak)', async () => {
    const spawnImpl = createNodeSpawnLike();
    const outcome = await spawnImpl(
      baseSpawnOptions({
        args: [
          '-e',
          'process.stdout.write(JSON.stringify({path:process.env.PATH??null,leak:process.env.NODE_TEST_LEAK??null,custom:process.env.CUSTOM_KEY??null}))',
        ],
        env: { PATH: '/usr/bin', CUSTOM_KEY: 'visible' },
      }),
    );
    expect(outcome.kind).toBe('exit');
    if (outcome.kind !== 'exit') throw new Error('expected exit');
    const parsed = JSON.parse(outcome.stdout) as Record<string, string | null>;
    expect(parsed.path).toBe('/usr/bin');
    expect(parsed.custom).toBe('visible');
    expect(parsed.leak).toBeNull();
  });

  it('exposes a default kill grace constant', () => {
    expect(NODE_SPAWN_KILL_GRACE_MS).toBeGreaterThan(0);
  });
});

describe('createNodeClaudeCliFileSystem', () => {
  it('mkdtemp creates a real directory under tmpdir and rm removes it', async () => {
    const fs = createNodeClaudeCliFileSystem();
    const dir = await fs.mkdtemp('fps-arena-bench-claude-cli-test-');
    expect(existsSync(dir)).toBe(true);
    expect(statSync(dir).isDirectory()).toBe(true);
    expect(dir).toContain('fps-arena-bench-claude-cli-test-');
    await fs.rm(dir);
    expect(existsSync(dir)).toBe(false);
  });

  it('rm is idempotent on a missing path (force:true)', async () => {
    const fs = createNodeClaudeCliFileSystem();
    await expect(
      fs.rm('/nonexistent/path/that/does/not/exist/fps-arena-bench-claude-cli-test'),
    ).resolves.toBeUndefined();
  });

  it('honors a custom tempRoot when provided', async () => {
    const fs = createNodeClaudeCliFileSystem();
    const seedDir = await fs.mkdtemp('fps-arena-bench-claude-cli-root-');
    try {
      const innerFs = createNodeClaudeCliFileSystem({ tempRoot: seedDir });
      const dir = await innerFs.mkdtemp('inner-');
      expect(dir.startsWith(seedDir)).toBe(true);
      expect(existsSync(dir)).toBe(true);
      await innerFs.rm(dir);
      expect(existsSync(dir)).toBe(false);
    } finally {
      await fs.rm(seedDir);
    }
  });
});
