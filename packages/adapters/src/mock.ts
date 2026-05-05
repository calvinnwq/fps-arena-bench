import type { ActionProvider, ActionRequest } from '@fps-arena-bench/contracts';
import { renderActionPrompt } from '@fps-arena-bench/contracts';
import {
  SCHEMA_VERSION,
  type Action,
  type AdapterError,
  type AdapterMetadata,
  type Observation,
} from '@fps-arena-bench/schemas';

import { ADAPTER_DEFAULT_MAX_OUTPUT_BYTES, parseActionResponse } from './parse-action.js';

export class MockAdapterError extends Error {
  readonly adapterError: AdapterError;

  constructor(adapterError: AdapterError) {
    super(`[mock-adapter:${adapterError.code}] ${adapterError.message}`);
    this.name = 'MockAdapterError';
    this.adapterError = adapterError;
  }
}

export interface MockAdapterOptions {
  readonly seed: number;
  readonly adapterId?: string;
  readonly displayName?: string;
  /** Optional cap on simulated raw output bytes; defaults to {@link ADAPTER_DEFAULT_MAX_OUTPUT_BYTES}. */
  readonly maxOutputBytes?: number;
  /** Hook invoked with the rendered prompt before each decision; useful for tests. */
  readonly onPromptRendered?: (prompt: string, request: ActionRequest) => void;
  /** Override that returns a raw model output string for testing parse-failure paths. */
  readonly simulate?: (request: ActionRequest, prompt: string) => string;
}

export interface SimulateMockResponseInput {
  readonly observation: Observation;
  readonly seed: number;
  readonly tick?: number;
}

const buildAbortedError = (adapterId: string): AdapterError => ({
  schemaVersion: SCHEMA_VERSION,
  adapterId,
  code: 'aborted',
  message: 'Adapter request was aborted before producing an action.',
  retryable: false,
});

const stringSeed = (seed: number, contenderId: string, tick: number): number => {
  let hash = (seed ^ tick) >>> 0;
  for (let index = 0; index < contenderId.length; index += 1) {
    hash = ((hash << 5) - hash + contenderId.charCodeAt(index)) >>> 0;
  }
  return hash >>> 0;
};

// Tiny xorshift32 keyed on a numeric seed, matching the deterministic pattern used elsewhere in the workspace.
const nextU32 = (state: { value: number }): number => {
  let x = state.value;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.value = x >>> 0;
  return state.value;
};

const nextIntBelow = (state: { value: number }, upperExclusive: number): number => {
  if (upperExclusive <= 0) return 0;
  return nextU32(state) % upperExclusive;
};

const MOVE_DIRECTIONS: readonly { x: -1 | 0 | 1; y: -1 | 0 | 1 }[] = [
  { x: -1, y: -1 },
  { x: -1, y: 0 },
  { x: -1, y: 1 },
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: 1, y: -1 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
];

const TURN_DEGREES: readonly (-90 | 0 | 90 | 180)[] = [-90, 0, 90, 180];

const chooseAction = (input: SimulateMockResponseInput): Action => {
  const { observation } = input;
  const tick = input.tick ?? observation.tick;
  const seedHash = stringSeed(input.seed, observation.self.contenderId, tick);
  const rngState = { value: seedHash === 0 ? 1 : seedHash };

  const visiblePlayers = observation.visiblePlayers ?? [];
  const ammo = observation.self.ammo ?? 0;
  const visiblePickups = observation.visiblePickups ?? [];

  // If we can shoot a visible enemy, prefer it (deterministic policy).
  if (ammo > 0 && visiblePlayers.length > 0) {
    const target = visiblePlayers[nextIntBelow(rngState, visiblePlayers.length)]!;
    return {
      schemaVersion: SCHEMA_VERSION,
      type: 'shoot',
      target: { x: target.position.x, y: target.position.y },
    };
  }

  // Otherwise, mix between move/turn/noop based on rng. With a visible pickup, prefer move.
  const choice = visiblePickups.length > 0 ? 0 : nextIntBelow(rngState, 4);
  switch (choice) {
    case 0: {
      const direction = MOVE_DIRECTIONS[nextIntBelow(rngState, MOVE_DIRECTIONS.length)]!;
      return { schemaVersion: SCHEMA_VERSION, type: 'move', direction };
    }
    case 1: {
      const degrees = TURN_DEGREES[nextIntBelow(rngState, TURN_DEGREES.length)]!;
      return { schemaVersion: SCHEMA_VERSION, type: 'turn', degrees };
    }
    case 2: {
      // Noop is a stable, schema-valid fallback when no useful action is identifiable.
      return { schemaVersion: SCHEMA_VERSION, type: 'noop' };
    }
    default: {
      const direction = MOVE_DIRECTIONS[nextIntBelow(rngState, MOVE_DIRECTIONS.length)]!;
      return { schemaVersion: SCHEMA_VERSION, type: 'move', direction };
    }
  }
};

export function simulateMockResponse(input: SimulateMockResponseInput): string {
  return JSON.stringify(chooseAction(input));
}

const defaultSimulate =
  (seed: number) =>
  (request: ActionRequest): string =>
    simulateMockResponse({ observation: request.observation, seed, tick: request.tick });

export class MockAdapter implements ActionProvider {
  readonly metadata: AdapterMetadata;
  private readonly seed: number;
  private readonly maxOutputBytes: number;
  private readonly onPromptRendered: ((prompt: string, request: ActionRequest) => void) | undefined;
  private readonly simulate: (request: ActionRequest, prompt: string) => string;

  constructor(options: MockAdapterOptions) {
    const adapterId = options.adapterId ?? 'mock';
    this.metadata = {
      schemaVersion: SCHEMA_VERSION,
      adapterId,
      kind: 'mock',
      displayName: options.displayName ?? 'Deterministic Mock Adapter',
      supportedActionSchema: SCHEMA_VERSION,
      description:
        'Deterministic mock adapter that exercises the renderActionPrompt → JSON → parse loop.',
    };
    this.seed = options.seed;
    this.maxOutputBytes = options.maxOutputBytes ?? ADAPTER_DEFAULT_MAX_OUTPUT_BYTES;
    this.onPromptRendered = options.onPromptRendered;
    this.simulate = options.simulate ?? defaultSimulate(options.seed);
  }

  decide(request: ActionRequest): Action {
    if (request.signal?.aborted) {
      throw new MockAdapterError(buildAbortedError(this.metadata.adapterId));
    }
    const prompt = renderActionPrompt(request.observation);
    if (this.onPromptRendered !== undefined) {
      this.onPromptRendered(prompt, request);
    }
    const raw = this.simulate(request, prompt);
    const parsed = parseActionResponse(raw, {
      adapterId: this.metadata.adapterId,
      maxOutputBytes: this.maxOutputBytes,
    });
    if (!parsed.ok) {
      throw new MockAdapterError(parsed.error);
    }
    return parsed.action;
  }
}
