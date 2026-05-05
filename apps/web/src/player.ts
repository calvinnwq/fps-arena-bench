import type { ReplayTimeline, TimelineFrame } from './timeline.js';

export const DEFAULT_PLAYER_SPEED = 10;
export const PLAYER_MIN_SPEED = 0.25;
export const PLAYER_MAX_SPEED = 64;

export interface ReplayPlayerSnapshot {
  readonly tick: number;
  readonly isPlaying: boolean;
  readonly speed: number;
  readonly atStart: boolean;
  readonly atEnd: boolean;
  readonly frame: TimelineFrame;
}

export interface ReplayPlayerOptions {
  readonly initialTick?: number;
  readonly initialSpeed?: number;
}

export type ReplayPlayerListener = (snapshot: ReplayPlayerSnapshot) => void;

const requireFiniteInteger = (value: number, label: string): void => {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new RangeError(`${label} must be a finite integer (received ${value}).`);
  }
};

const requireFinite = (value: number, label: string): void => {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number (received ${value}).`);
  }
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

export class ReplayPlayer {
  readonly timeline: ReplayTimeline;
  private readonly lastTick: number;
  private currentTick: number;
  private playing: boolean;
  private currentSpeed: number;
  private subTickProgress: number;
  private readonly listeners: Set<ReplayPlayerListener>;

  constructor(timeline: ReplayTimeline, options: ReplayPlayerOptions = {}) {
    if (timeline.frames.length === 0) {
      throw new RangeError('ReplayPlayer requires a timeline with at least one frame.');
    }
    this.timeline = timeline;
    this.lastTick = timeline.frames.length - 1;

    if (options.initialTick !== undefined) {
      requireFinite(options.initialTick, 'initialTick');
    }
    if (options.initialSpeed !== undefined) {
      requireFinite(options.initialSpeed, 'initialSpeed');
    }

    this.currentTick = clamp(
      Math.trunc(options.initialTick ?? 0),
      0,
      this.lastTick,
    );
    this.currentSpeed = clamp(
      options.initialSpeed ?? DEFAULT_PLAYER_SPEED,
      PLAYER_MIN_SPEED,
      PLAYER_MAX_SPEED,
    );
    this.playing = false;
    this.subTickProgress = 0;
    this.listeners = new Set();
  }

  getSnapshot(): ReplayPlayerSnapshot {
    return {
      tick: this.currentTick,
      isPlaying: this.playing,
      speed: this.currentSpeed,
      atStart: this.currentTick === 0,
      atEnd: this.currentTick === this.lastTick,
      frame: this.timeline.frames[this.currentTick]!,
    };
  }

  play(): void {
    if (this.playing) return;
    if (this.currentTick === this.lastTick) return;
    this.playing = true;
    this.subTickProgress = 0;
    this.emit();
  }

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    this.subTickProgress = 0;
    this.emit();
  }

  togglePlayPause(): void {
    if (this.playing) {
      this.pause();
    } else {
      this.play();
    }
  }

  step(delta = 1): void {
    requireFiniteInteger(delta, 'delta');
    if (delta === 0) return;
    const target = clamp(this.currentTick + delta, 0, this.lastTick);
    if (target === this.currentTick) return;
    this.currentTick = target;
    this.subTickProgress = 0;
    if (this.currentTick === this.lastTick) {
      this.playing = false;
    }
    this.emit();
  }

  seek(tick: number): void {
    requireFiniteInteger(tick, 'tick');
    const target = clamp(tick, 0, this.lastTick);
    const wasPlaying = this.playing;
    this.playing = false;
    this.subTickProgress = 0;
    if (target === this.currentTick && !wasPlaying) {
      return;
    }
    this.currentTick = target;
    this.emit();
  }

  setSpeed(speed: number): void {
    if (!Number.isFinite(speed) || speed <= 0) {
      throw new RangeError(`speed must be a positive finite number (received ${speed}).`);
    }
    const clamped = clamp(speed, PLAYER_MIN_SPEED, PLAYER_MAX_SPEED);
    if (clamped === this.currentSpeed) return;
    this.currentSpeed = clamped;
    this.subTickProgress = 0;
    this.emit();
  }

  reset(): void {
    const changed =
      this.currentTick !== 0 ||
      this.playing ||
      this.currentSpeed !== DEFAULT_PLAYER_SPEED ||
      this.subTickProgress !== 0;
    this.currentTick = 0;
    this.playing = false;
    this.currentSpeed = DEFAULT_PLAYER_SPEED;
    this.subTickProgress = 0;
    if (changed) this.emit();
  }

  advance(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) {
      throw new RangeError(`deltaMs must be a non-negative finite number (received ${deltaMs}).`);
    }
    if (!this.playing) return;
    if (deltaMs === 0) return;

    this.subTickProgress += (this.currentSpeed * deltaMs) / 1000;
    const ticksToAdvance = Math.floor(this.subTickProgress);
    if (ticksToAdvance <= 0) return;
    this.subTickProgress -= ticksToAdvance;

    const target = clamp(this.currentTick + ticksToAdvance, 0, this.lastTick);
    if (target === this.currentTick) {
      // Already at the end; reaching here means we never moved.
      return;
    }
    this.currentTick = target;
    if (this.currentTick === this.lastTick) {
      this.playing = false;
      this.subTickProgress = 0;
    }
    this.emit();
  }

  subscribe(listener: ReplayPlayerListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    if (this.listeners.size === 0) return;
    const snap = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snap);
    }
  }
}
