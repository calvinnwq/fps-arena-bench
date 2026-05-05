export interface ParsedRunArgs {
  readonly command: 'run';
  readonly configPath: string;
  readonly mapPath: string;
  readonly outDir: string;
  readonly snapshotIntervalTicks?: number;
  readonly quiet: boolean;
}

export interface ParsedHelpArgs {
  readonly command: 'help';
}

export type ParsedCommand = ParsedRunArgs | ParsedHelpArgs;

export class ArgsError extends Error {}

const HELP_TEXT = `fps-arena-bench - deterministic local arena FPS bench runner

Usage:
  fps-arena-bench run --config|-c <path> --map|-m <path> --out|--out-dir|-o <dir>
                      [--snapshot-interval <ticks>] [--quiet]
  fps-arena-bench help|--help|-h

Examples:
  fps-arena-bench run \\
    -c configs/examples/bot-duel.json \\
    -m maps/default-arena.json \\
    -o replays/bot-duel \\
    -q
`;

export const helpText = (): string => HELP_TEXT;

const requireValue = (flag: string, value: string | undefined): string => {
  if (value === undefined || value === '') {
    throw new ArgsError(`Flag ${flag} requires a value.`);
  }
  return value;
};

const parsePositiveInteger = (flag: string, value: string): number => {
  if (!/^[0-9]+$/.test(value)) {
    throw new ArgsError(`Flag ${flag} expects a positive integer, received "${value}".`);
  }
  const parsed = Number.parseInt(value, 10);
  if (parsed <= 0) {
    throw new ArgsError(`Flag ${flag} expects a positive integer, received "${value}".`);
  }
  return parsed;
};

export function parseArgs(argv: readonly string[]): ParsedCommand {
  if (argv.length === 0) {
    return { command: 'help' };
  }
  const [command, ...rest] = argv;
  if (command === 'help' || command === '--help' || command === '-h') {
    return { command: 'help' };
  }
  if (command !== 'run') {
    throw new ArgsError(`Unknown command "${command}". Run "fps-arena-bench help" for usage.`);
  }

  let configPath: string | undefined;
  let mapPath: string | undefined;
  let outDir: string | undefined;
  let snapshotIntervalTicks: number | undefined;
  let quiet = false;

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index] ?? '';
    switch (token) {
      case '--config':
      case '-c':
        configPath = requireValue(token, rest[index + 1]);
        index += 1;
        break;
      case '--map':
      case '-m':
        mapPath = requireValue(token, rest[index + 1]);
        index += 1;
        break;
      case '--out':
      case '--out-dir':
      case '-o':
        outDir = requireValue(token, rest[index + 1]);
        index += 1;
        break;
      case '--snapshot-interval':
        snapshotIntervalTicks = parsePositiveInteger(token, requireValue(token, rest[index + 1]));
        index += 1;
        break;
      case '--quiet':
      case '-q':
        quiet = true;
        break;
      default:
        throw new ArgsError(`Unknown argument "${token}". Run "fps-arena-bench help" for usage.`);
    }
  }

  if (configPath === undefined) {
    throw new ArgsError('Flag --config <path> is required.');
  }
  if (mapPath === undefined) {
    throw new ArgsError('Flag --map <path> is required.');
  }
  if (outDir === undefined) {
    throw new ArgsError('Flag --out <dir> is required.');
  }

  return {
    command: 'run',
    configPath,
    mapPath,
    outDir,
    ...(snapshotIntervalTicks !== undefined ? { snapshotIntervalTicks } : {}),
    quiet,
  };
}
