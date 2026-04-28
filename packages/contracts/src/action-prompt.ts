import type { Observation } from '@fps-arena-bench/schemas';
import { SCHEMA_VERSION } from '@fps-arena-bench/schemas';

export const ACTION_PROMPT_TEMPLATE_VERSION = 'action-prompt.v0.1';

const ACTION_RESPONSE_RULES = `Return exactly one JSON object matching the action schema. Do not include chain-of-thought, rationale, markdown, or prose.`;

const GAME_RULES_SUMMARY = [
  'You control one arena-FPS contender for the current tick.',
  'Use visible players, pickups, walls, score, health, ammo, position, and heading to choose a tactical action.',
  'Movement directions are unit grid axes where each component is -1, 0, or 1, and move cannot be { "x": 0, "y": 0 }.',
  'Turning accepts only -90, 0, 90, or 180 degrees.',
  'Shooting targets a map position. Prefer visible opponents and conserve ammo when no useful target is visible.',
  'A timeout, invalid JSON, or schema-invalid action counts against reliability and may be replaced by the configured fallback action.',
].join('\n');

const ACTION_EXAMPLES = [
  {
    schemaVersion: SCHEMA_VERSION,
    type: 'move',
    direction: { x: 1, y: 0 },
  },
  {
    schemaVersion: SCHEMA_VERSION,
    type: 'shoot',
    target: { x: 8, y: 5 },
  },
  {
    schemaVersion: SCHEMA_VERSION,
    type: 'turn',
    degrees: 90,
  },
  {
    schemaVersion: SCHEMA_VERSION,
    type: 'noop',
  },
];

const visibleOpponentObservation = {
  schemaVersion: SCHEMA_VERSION,
  rulesetVersion: 'ruleset-v0.1',
  matchId: 'action-prompt-dry-run',
  tick: 12,
  self: {
    contenderId: 'alpha',
    position: { x: 4, y: 5 },
    headingDegrees: 90,
    health: 85,
    ammo: 7,
  },
  visiblePlayers: [
    {
      contenderId: 'bravo',
      position: { x: 8, y: 5 },
      headingDegrees: 270,
      health: 65,
    },
  ],
  visiblePickups: [{ id: 'health-mid', type: 'health', position: { x: 8, y: 8 } }],
  visibleWalls: [{ id: 'cover-north', x: 7, y: 6, width: 2, height: 1 }],
  score: { alpha: 1, bravo: 0 },
} satisfies Observation;

const observationWithLowResources = {
  ...visibleOpponentObservation,
  tick: 42,
  self: {
    ...visibleOpponentObservation.self,
    health: 35,
    ammo: 1,
  },
  visiblePlayers: [],
  visiblePickups: [
    { id: 'health-mid', type: 'health', position: { x: 8, y: 8 }, respawnTicks: 50 },
    { id: 'ammo-east', type: 'ammo', position: { x: 12, y: 4 } },
  ],
  score: { alpha: 0, bravo: 2 },
} satisfies Observation;

export const actionPromptDryRunObservations = [
  visibleOpponentObservation,
  observationWithLowResources,
] as const satisfies readonly Observation[];

export function renderActionPrompt(observation: Observation): string {
  const observationJson = JSON.stringify(observation, null, 2);
  const examplesJson = ACTION_EXAMPLES.map((example) => JSON.stringify(example, null, 2)).join(
    '\n',
  );

  return [
    'Role: tactical controller for FPS Arena Bench.',
    `Prompt template version: ${ACTION_PROMPT_TEMPLATE_VERSION}`,
    `Schema version: ${observation.schemaVersion}`,
    `Ruleset version: ${observation.rulesetVersion}`,
    '',
    'Objective:',
    'Choose the single best legal action for this tick. Favor survival, useful damage, pickup timing, and map control without assuming hidden state.',
    '',
    'Game rules summary:',
    GAME_RULES_SUMMARY,
    '',
    'Observation format:',
    'The observation is a JSON object containing schemaVersion, rulesetVersion, matchId, tick, self, visiblePlayers, visiblePickups, visibleWalls, and score.',
    'Only visible entities are included. Missing opponent ammo means it was not observed.',
    '',
    'Required response:',
    ACTION_RESPONSE_RULES,
    '',
    'Valid action examples:',
    examplesJson,
    '',
    'Current observation:',
    observationJson,
  ].join('\n');
}
