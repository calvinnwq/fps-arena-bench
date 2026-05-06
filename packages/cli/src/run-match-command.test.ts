import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { ActionProvider, ActionRequest } from '@fps-arena-bench/contracts';
import {
  createClaudeCliProviderFactory,
  createOllamaProviderFactory,
  type ClaudeCliFileSystem,
  type FetchLike,
  type SpawnLike,
} from '@fps-arena-bench/adapters';
import {
  SCHEMA_VERSION,
  validateMatchConfig,
  validateMap,
  validateReplaySafeArtifact,
  type Action,
  type AdapterMetadata,
  type ResultSummary,
} from '@fps-arena-bench/schemas';

import { runMatchCommand } from './run-match-command.js';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const defaultMapPath = join(repoRoot, 'maps/default-arena.json');
const defaultConfigPath = join(repoRoot, 'configs/examples/bot-duel.json');
const claudeCliConfigPath = join(repoRoot, 'configs/examples/claude-cli-vs-baseline.json');
const ollamaConfigPath = join(repoRoot, 'configs/examples/ollama-vs-baseline.json');

const makeTempDir = (label: string): string => mkdtempSync(join(tmpdir(), `fps-cli-${label}-`));

class DelayedBot implements ActionProvider {
  readonly metadata: AdapterMetadata = {
    schemaVersion: SCHEMA_VERSION,
    adapterId: 'delayed-bot',
    kind: 'bot',
    displayName: 'Delayed Bot',
    supportedActionSchema: SCHEMA_VERSION,
  };

  async decide(_request: ActionRequest): Promise<Action> {
    await new Promise((resolve) => setTimeout(resolve, 1));
    return { schemaVersion: SCHEMA_VERSION, type: 'noop' };
  }
}

describe('runMatchCommand', () => {
  it('runs a baseline bot duel and writes a safe replay artifact and result summary', async () => {
    const outDir = makeTempDir('happy');
    try {
      const summary = await runMatchCommand({
        configPath: defaultConfigPath,
        mapPath: defaultMapPath,
        outDir,
      });

      expect(summary.replayPath).toBe(join(outDir, 'replay.safe.json'));
      expect(summary.resultPath).toBe(join(outDir, 'result.json'));
      expect(summary.matchId).toBe('bot-duel');
      expect(summary.ticksElapsed).toBeGreaterThan(0);
      expect(summary.placements).toHaveLength(2);
      expect(summary.schemaViolations).toBe(0);

      const replay = JSON.parse(readFileSync(summary.replayPath, 'utf8')) as unknown;
      const validatedReplay = validateReplaySafeArtifact(replay);
      expect(validatedReplay.matchId).toBe('bot-duel');
      expect(validatedReplay.config.id).toBe('bot-duel');
      expect(validatedReplay.map.id).toBe('default-arena');
      expect(validatedReplay.acceptedActions.length).toBeGreaterThan(0);

      const result = JSON.parse(readFileSync(summary.resultPath, 'utf8')) as ResultSummary;
      expect(result.matchId).toBe('bot-duel');
      expect(result.placements.map((entry) => entry.rank).sort()).toEqual([1, 2]);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('is deterministic across runs with the same config and seed', async () => {
    const outDirA = makeTempDir('detA');
    const outDirB = makeTempDir('detB');
    try {
      const summaryA = await runMatchCommand({
        configPath: defaultConfigPath,
        mapPath: defaultMapPath,
        outDir: outDirA,
      });
      const summaryB = await runMatchCommand({
        configPath: defaultConfigPath,
        mapPath: defaultMapPath,
        outDir: outDirB,
      });

      const replayA = readFileSync(summaryA.replayPath, 'utf8');
      const replayB = readFileSync(summaryB.replayPath, 'utf8');
      expect(replayA).toEqual(replayB);
    } finally {
      rmSync(outDirA, { recursive: true, force: true });
      rmSync(outDirB, { recursive: true, force: true });
    }
  });

  it('records provider decision latency in the replay artifact', async () => {
    const outDir = makeTempDir('latency');
    try {
      const summary = await runMatchCommand({
        configPath: defaultConfigPath,
        mapPath: defaultMapPath,
        outDir,
        providerOverrides: {
          'random-bot': () => new DelayedBot(),
        },
      });

      const replay = validateReplaySafeArtifact(
        JSON.parse(readFileSync(summary.replayPath, 'utf8')) as unknown,
      );
      expect(replay.acceptedActions.some((action) => action.latencyMs > 0)).toBe(true);
      expect(replay.result.latency.averageMs).toBeGreaterThan(0);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('rejects a config whose map hash does not match the loaded map file', async () => {
    const map = validateMap(JSON.parse(readFileSync(defaultMapPath, 'utf8')) as unknown);
    const config = validateMatchConfig(
      JSON.parse(readFileSync(defaultConfigPath, 'utf8')) as unknown,
    );
    void map;
    void config;

    const tampered = {
      ...JSON.parse(readFileSync(defaultConfigPath, 'utf8')),
      map: {
        id: 'default-arena',
        version: '0.1.0',
        hash: `sha256:${'0'.repeat(64)}`,
      },
    };

    const tmpConfigDir = makeTempDir('hash');
    const tamperedPath = join(tmpConfigDir, 'tampered.json');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(tamperedPath, JSON.stringify(tampered));
    const outDir = makeTempDir('hash-out');

    try {
      await expect(
        runMatchCommand({
          configPath: tamperedPath,
          mapPath: defaultMapPath,
          outDir,
        }),
      ).rejects.toThrow(/map hash/i);
    } finally {
      rmSync(tmpConfigDir, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('runs the claude-cli example end-to-end via providerOverrides with a fake subprocess', async () => {
    const outDir = makeTempDir('claude-cli');

    const created: string[] = [];
    const removed: string[] = [];
    let mkdtempCount = 0;
    const noopActionJson = JSON.stringify({ schemaVersion: SCHEMA_VERSION, type: 'noop' });

    const fakeFs: ClaudeCliFileSystem = {
      mkdtemp: async (prefix) => {
        mkdtempCount += 1;
        const path = `${prefix}fake-${mkdtempCount}`;
        created.push(path);
        return path;
      },
      rm: async (path) => {
        removed.push(path);
      },
    };

    let spawnCount = 0;
    const fakeSpawn: SpawnLike = async () => {
      spawnCount += 1;
      return { kind: 'exit', code: 0, stdout: noopActionJson, stderr: '' };
    };

    const factory = createClaudeCliProviderFactory({
      spawnImpl: fakeSpawn,
      fs: fakeFs,
    });

    try {
      const summary = await runMatchCommand({
        configPath: claudeCliConfigPath,
        mapPath: defaultMapPath,
        outDir,
        providerOverrides: { 'claude-cli': factory },
      });

      expect(summary.matchId).toBe('claude-cli-vs-baseline');
      expect(summary.schemaViolations).toBe(0);
      expect(summary.providerErrors).toBe(0);
      expect(summary.ticksElapsed).toBeGreaterThan(0);
      expect(summary.placements).toHaveLength(2);
      expect(spawnCount).toBeGreaterThan(0);
      expect(created.length).toBe(spawnCount);
      expect(removed.length).toBe(spawnCount);
      for (const path of removed) {
        expect(created).toContain(path);
      }

      const replay = validateReplaySafeArtifact(
        JSON.parse(readFileSync(summary.replayPath, 'utf8')) as unknown,
      );
      const claudeContender = replay.config.contenders.find(
        (entry) => entry.adapterId === 'claude-cli',
      );
      expect(claudeContender).toBeDefined();
      const replayJson = readFileSync(summary.replayPath, 'utf8');
      expect(replayJson).not.toContain(
        'schemaVersion": "fps-arena-bench.schema.v0.1",\n      "type": "noop"',
      );
      expect(replayJson).not.toMatch(/raw[_-]?prompt/i);
      expect(replayJson).not.toMatch(/raw[_-]?output/i);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('rejects the claude-cli example with a clear error when claude-cli is not registered', async () => {
    const outDir = makeTempDir('claude-cli-missing');
    try {
      await expect(
        runMatchCommand({
          configPath: claudeCliConfigPath,
          mapPath: defaultMapPath,
          outDir,
        }),
      ).rejects.toThrow(/claude-cli/);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('runs the ollama example end-to-end via providerOverrides with fake HTTP', async () => {
    const outDir = makeTempDir('ollama');
    const noopActionJson = JSON.stringify({ schemaVersion: SCHEMA_VERSION, type: 'noop' });
    let fetchCount = 0;
    const fetchImpl: FetchLike = async (_url, _init) => {
      fetchCount += 1;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ response: noopActionJson }),
      };
    };
    const factory = createOllamaProviderFactory({
      model: 'llama3',
      fetchImpl,
    });

    try {
      const summary = await runMatchCommand({
        configPath: ollamaConfigPath,
        mapPath: defaultMapPath,
        outDir,
        providerOverrides: { ollama: factory },
      });

      expect(summary.matchId).toBe('ollama-vs-baseline');
      expect(summary.schemaViolations).toBe(0);
      expect(summary.providerErrors).toBe(0);
      expect(fetchCount).toBeGreaterThan(0);

      const replay = validateReplaySafeArtifact(
        JSON.parse(readFileSync(summary.replayPath, 'utf8')) as unknown,
      );
      expect(replay.config.contenders.some((entry) => entry.adapterId === 'ollama')).toBe(true);
      const replayJson = readFileSync(summary.replayPath, 'utf8');
      expect(replayJson).not.toMatch(/raw[_-]?prompt/i);
      expect(replayJson).not.toMatch(/raw[_-]?output/i);
      expect(replayJson).not.toContain(noopActionJson);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('throws when a contender adapterId is not registered', async () => {
    const tampered = {
      ...JSON.parse(readFileSync(defaultConfigPath, 'utf8')),
      contenders: [
        { id: 'alpha', adapterId: 'unknown-adapter', displayName: 'Alpha' },
        { id: 'bravo', adapterId: 'chaser-bot', displayName: 'Bravo' },
      ],
    };

    const tmpConfigDir = makeTempDir('reg');
    const tamperedPath = join(tmpConfigDir, 'tampered.json');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(tamperedPath, JSON.stringify(tampered));
    const outDir = makeTempDir('reg-out');

    try {
      await expect(
        runMatchCommand({
          configPath: tamperedPath,
          mapPath: defaultMapPath,
          outDir,
        }),
      ).rejects.toThrow(/unknown-adapter/);
    } finally {
      rmSync(tmpConfigDir, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
