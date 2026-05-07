import { describe, expect, it } from 'vitest';

import { ArgsError, parseArgs } from './args.js';

describe('parseArgs', () => {
  it('returns help when invoked with no arguments', () => {
    expect(parseArgs([])).toEqual({ command: 'help' });
  });

  it('returns help for help/-h/--help', () => {
    expect(parseArgs(['help'])).toEqual({ command: 'help' });
    expect(parseArgs(['--help'])).toEqual({ command: 'help' });
    expect(parseArgs(['-h'])).toEqual({ command: 'help' });
  });

  it('parses run command with required flags', () => {
    expect(parseArgs(['run', '--config', 'a.json', '--map', 'b.json', '--out', 'out'])).toEqual({
      command: 'run',
      configPath: 'a.json',
      mapPath: 'b.json',
      outDir: 'out',
      quiet: false,
    });
  });

  it('parses run command with snapshot interval and quiet flag and short aliases', () => {
    expect(
      parseArgs([
        'run',
        '-c',
        'a.json',
        '-m',
        'b.json',
        '-o',
        'out',
        '--snapshot-interval',
        '5',
        '--quiet',
      ]),
    ).toEqual({
      command: 'run',
      configPath: 'a.json',
      mapPath: 'b.json',
      outDir: 'out',
      snapshotIntervalTicks: 5,
      quiet: true,
    });
  });

  it('throws ArgsError when --config is missing', () => {
    expect(() => parseArgs(['run', '--map', 'b.json', '--out', 'out'])).toThrow(ArgsError);
  });

  it('throws ArgsError when an unknown flag is provided', () => {
    expect(() =>
      parseArgs(['run', '--config', 'a.json', '--map', 'b.json', '--out', 'out', '--mystery']),
    ).toThrow(/--mystery/);
  });

  it('throws ArgsError on unknown command', () => {
    expect(() => parseArgs(['warp'])).toThrow(/warp/);
  });

  it('parses batch command with required flags', () => {
    expect(parseArgs(['batch', '--config', 'b.json', '--out', 'out'])).toEqual({
      command: 'batch',
      configPath: 'b.json',
      outDir: 'out',
      overwrite: false,
      quiet: false,
    });
  });

  it('parses batch command with overwrite, snapshot-interval, and quiet flags', () => {
    expect(
      parseArgs([
        'batch',
        '-c',
        'b.json',
        '-o',
        'out',
        '--snapshot-interval',
        '5',
        '--overwrite',
        '--quiet',
      ]),
    ).toEqual({
      command: 'batch',
      configPath: 'b.json',
      outDir: 'out',
      snapshotIntervalTicks: 5,
      overwrite: true,
      quiet: true,
    });
  });

  it('rejects --map flag when used with batch command', () => {
    expect(() => parseArgs(['batch', '-c', 'b.json', '-o', 'out', '--map', 'm.json'])).toThrow(
      /--map.*only valid for the run command/,
    );
  });

  it('rejects --overwrite flag when used with run command', () => {
    expect(() =>
      parseArgs(['run', '-c', 'b.json', '-m', 'm.json', '-o', 'out', '--overwrite']),
    ).toThrow(/--overwrite.*only valid for the batch command/);
  });

  it('rejects non-positive snapshot interval', () => {
    expect(() =>
      parseArgs([
        'run',
        '--config',
        'a.json',
        '--map',
        'b.json',
        '--out',
        'out',
        '--snapshot-interval',
        '0',
      ]),
    ).toThrow(ArgsError);
    expect(() =>
      parseArgs([
        'run',
        '--config',
        'a.json',
        '--map',
        'b.json',
        '--out',
        'out',
        '--snapshot-interval',
        '-3',
      ]),
    ).toThrow(ArgsError);
  });
});
