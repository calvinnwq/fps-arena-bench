import type { ActionProvider } from '@fps-arena-bench/contracts';
import { describe, expect, it } from 'vitest';

import { ChaserBot } from './chaser-bot.js';
import { PickupSeekerBot } from './pickup-seeker-bot.js';
import { RandomBot } from './random-bot.js';
import { runBotMatch } from './run-match.js';
import { buildBotTestMap, buildBotTestMatchConfig } from './test-fixtures.js';

interface MatchupSpec {
  readonly label: string;
  readonly buildAlpha: (seed: number) => ActionProvider;
  readonly buildBravo: (seed: number) => ActionProvider;
}

const MATCHUPS: readonly MatchupSpec[] = [
  {
    label: 'random-vs-random',
    buildAlpha: (seed) => new RandomBot({ seed }),
    buildBravo: (seed) => new RandomBot({ seed: seed + 1 }),
  },
  {
    label: 'chaser-vs-pickup-seeker',
    buildAlpha: (seed) => new ChaserBot({ seed }),
    buildBravo: (seed) => new PickupSeekerBot({ seed: seed + 1 }),
  },
  {
    label: 'random-vs-chaser',
    buildAlpha: (seed) => new RandomBot({ seed }),
    buildBravo: (seed) => new ChaserBot({ seed: seed + 1 }),
  },
  {
    label: 'random-vs-pickup-seeker',
    buildAlpha: (seed) => new RandomBot({ seed }),
    buildBravo: (seed) => new PickupSeekerBot({ seed: seed + 1 }),
  },
];

describe('bot-vs-bot 100 match suite', () => {
  it('runs 100 bot-vs-bot matches with zero schema violations', { timeout: 60_000 }, async () => {
    const map = buildBotTestMap();
    const labels = new Set<string>();
    const winners: Array<string | null> = [];
    const endReasons: Record<string, number> = {};
    let totalSchemaViolations = 0;
    let totalProviderErrors = 0;

    for (let index = 0; index < 100; index += 1) {
      const matchup = MATCHUPS[index % MATCHUPS.length]!;
      labels.add(matchup.label);
      const seed = 1_000 + index;
      const config = buildBotTestMatchConfig({
        id: `bot-suite-${index}`,
        mapId: map.id,
        mapVersion: map.version,
        seed,
        maxTicks: 200,
      });
      const providers = new Map<string, ActionProvider>([
        ['alpha', matchup.buildAlpha(seed)],
        ['bravo', matchup.buildBravo(seed)],
      ]);
      const result = await runBotMatch({ config, map, providers });
      totalSchemaViolations += result.schemaViolations;
      totalProviderErrors += result.providerErrors;
      winners.push(result.state.winner);
      const reason = result.state.endReason ?? 'in-progress';
      endReasons[reason] = (endReasons[reason] ?? 0) + 1;
    }

    expect(totalSchemaViolations).toBe(0);
    expect(totalProviderErrors).toBe(0);
    expect(labels.size).toBe(MATCHUPS.length);
    // Verify the suite produces meaningful spread across outcomes for calibration signal.
    const distinctOutcomes = new Set(winners);
    expect(distinctOutcomes.size).toBeGreaterThan(1);
    // There must be at least two different end reasons (or the same one across many) to
    // confirm the engine is actually being exercised; assert at least one of the live reasons.
    const liveReasons = ['last-survivor', 'mutual-elimination', 'max-ticks-reached'].filter(
      (key) => (endReasons[key] ?? 0) > 0,
    );
    expect(liveReasons.length).toBeGreaterThan(0);
  });
});
