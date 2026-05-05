import type { ActionProvider } from '@fps-arena-bench/contracts';
import { ChaserBot, PickupSeekerBot, RandomBot } from '@fps-arena-bench/bots';

export interface ProviderFactoryRequest {
  readonly contenderId: string;
  readonly adapterId: string;
  readonly displayName: string | undefined;
  readonly seed: number;
}

export type ProviderFactory = (request: ProviderFactoryRequest) => ActionProvider;

const stringSeed = (seed: number, contenderId: string): number => {
  let hash = seed >>> 0;
  for (let index = 0; index < contenderId.length; index += 1) {
    hash = ((hash << 5) - hash + contenderId.charCodeAt(index)) >>> 0;
  }
  return hash >>> 0;
};

const buildOptions = (
  request: ProviderFactoryRequest,
): { seed: number; adapterId: string; displayName?: string } => {
  const seed = stringSeed(request.seed, request.contenderId);
  const base: { seed: number; adapterId: string; displayName?: string } = {
    seed,
    adapterId: request.adapterId,
  };
  if (request.displayName !== undefined) {
    base.displayName = request.displayName;
  }
  return base;
};

const BUILTIN_FACTORIES: Readonly<Record<string, ProviderFactory>> = {
  'baseline-random': (request) => new RandomBot(buildOptions(request)),
  'random-bot': (request) => new RandomBot(buildOptions(request)),
  'baseline-chaser': (request) => new ChaserBot(buildOptions(request)),
  'chaser-bot': (request) => new ChaserBot(buildOptions(request)),
  'baseline-pickup-seeker': (request) => new PickupSeekerBot(buildOptions(request)),
  'pickup-seeker-bot': (request) => new PickupSeekerBot(buildOptions(request)),
};

export const BUILTIN_ADAPTER_IDS: readonly string[] = Object.freeze(Object.keys(BUILTIN_FACTORIES));

export interface ProviderRegistry {
  has(adapterId: string): boolean;
  build(request: ProviderFactoryRequest): ActionProvider;
}

export const createBuiltinRegistry = (
  overrides: Readonly<Record<string, ProviderFactory>> = {},
): ProviderRegistry => {
  const merged: Record<string, ProviderFactory> = { ...BUILTIN_FACTORIES, ...overrides };
  return {
    has: (adapterId) => Object.prototype.hasOwnProperty.call(merged, adapterId),
    build: (request) => {
      const factory = merged[request.adapterId];
      if (factory === undefined) {
        throw new Error(
          `No adapter registered for adapterId "${request.adapterId}". ` +
            `Built-in adapters: ${BUILTIN_ADAPTER_IDS.join(', ')}.`,
        );
      }
      return factory(request);
    },
  };
};
