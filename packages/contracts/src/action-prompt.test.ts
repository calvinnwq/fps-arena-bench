import { describe, expect, test } from 'vitest';

import { ObservationSchema, SCHEMA_VERSION } from '@fps-arena-bench/schemas';

import {
  ACTION_PROMPT_TEMPLATE_VERSION,
  actionPromptDryRunObservations,
  renderActionPrompt,
} from './index.js';

describe('action prompt template', () => {
  test('renders deterministically from a representative observation fixture', () => {
    const observation = actionPromptDryRunObservations[0];
    const firstRender = renderActionPrompt(observation);
    const secondRender = renderActionPrompt(observation);

    expect(firstRender).toBe(secondRender);
    expect(firstRender).toMatchSnapshot();
  });

  test('pins schema, ruleset, and template versions in the prompt', () => {
    const observation = actionPromptDryRunObservations[0];
    const prompt = renderActionPrompt(observation);

    expect(prompt).toContain(`Prompt template version: ${ACTION_PROMPT_TEMPLATE_VERSION}`);
    expect(prompt).toContain(`Schema version: ${SCHEMA_VERSION}`);
    expect(prompt).toContain(`Ruleset version: ${observation.rulesetVersion}`);
  });

  test('contains strict action JSON guidance and safe examples only', () => {
    const prompt = renderActionPrompt(actionPromptDryRunObservations[0]);

    expect(prompt).toContain('Return exactly one JSON object');
    expect(prompt).toContain('"type": "move"');
    expect(prompt).toContain('"type": "shoot"');
    expect(prompt).toContain('"type": "turn"');
    expect(prompt).toContain('"type": "noop"');
    expect(prompt).toContain('Do not include chain-of-thought, rationale, markdown, or prose.');
    expect(prompt).toContain('timeout, invalid JSON, or schema-invalid action');
  });

  test('contains no local paths or secret-shaped strings', () => {
    const prompt = renderActionPrompt(actionPromptDryRunObservations[0]);

    expect(prompt).not.toMatch(/\/Users\//);
    expect(prompt).not.toMatch(/[A-Z_]*(?:TOKEN|SECRET|KEY|PASSWORD)[A-Z_]*/);
  });

  test('exports offline dry-run observations that can render without live model calls', () => {
    expect(actionPromptDryRunObservations).toHaveLength(2);

    for (const observation of actionPromptDryRunObservations) {
      expect(ObservationSchema.parse(observation)).toEqual(observation);
      expect(renderActionPrompt(observation)).toContain(JSON.stringify(observation, null, 2));
    }
  });
});
