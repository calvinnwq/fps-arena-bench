import {
  loadReplayFromString,
  loadReplayFromValue,
  type LoadReplayError,
} from './loader.js';
import { ReplayPlayer } from './player.js';
import { buildReplaySummary, type ReplaySummary } from './summary.js';
import type { ReplayTimeline, TimelineFrame } from './timeline.js';

export type ViewerSnapshot =
  | { readonly status: 'idle' }
  | { readonly status: 'error'; readonly error: LoadReplayError }
  | {
      readonly status: 'ready';
      readonly timeline: ReplayTimeline;
      readonly summary: ReplaySummary;
      readonly frame: TimelineFrame;
      readonly tick: number;
      readonly totalTicks: number;
      readonly isPlaying: boolean;
      readonly speed: number;
      readonly atStart: boolean;
      readonly atEnd: boolean;
    };

export type ViewerListener = (snapshot: ViewerSnapshot) => void;

const IDLE_SNAPSHOT: ViewerSnapshot = { status: 'idle' };

export class ReplayViewer {
  private snapshot: ViewerSnapshot = IDLE_SNAPSHOT;
  private player: ReplayPlayer | null = null;
  private timeline: ReplayTimeline | null = null;
  private summary: ReplaySummary | null = null;
  private playerUnsubscribe: (() => void) | null = null;
  private readonly listeners = new Set<ViewerListener>();

  getSnapshot(): ViewerSnapshot {
    return this.snapshot;
  }

  subscribe(listener: ViewerListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  loadFromString(input: string): ViewerSnapshot {
    const result = loadReplayFromString(input);
    return this.applyLoadResult(result);
  }

  loadFromValue(value: unknown): ViewerSnapshot {
    const result = loadReplayFromValue(value);
    return this.applyLoadResult(result);
  }

  unload(): void {
    if (this.snapshot.status === 'idle') return;
    this.disposePlayer();
    this.snapshot = IDLE_SNAPSHOT;
    this.emit();
  }

  play(): void {
    this.player?.play();
  }

  pause(): void {
    this.player?.pause();
  }

  togglePlayPause(): void {
    this.player?.togglePlayPause();
  }

  step(delta = 1): void {
    this.player?.step(delta);
  }

  seek(tick: number): void {
    this.player?.seek(tick);
  }

  setSpeed(speed: number): void {
    this.player?.setSpeed(speed);
  }

  reset(): void {
    this.player?.reset();
  }

  advance(deltaMs: number): void {
    this.player?.advance(deltaMs);
  }

  private applyLoadResult(
    result: ReturnType<typeof loadReplayFromString>,
  ): ViewerSnapshot {
    this.disposePlayer();

    if (!result.ok) {
      this.snapshot = { status: 'error', error: result.error };
      this.emit();
      return this.snapshot;
    }

    const timeline = result.timeline;
    const summary = buildReplaySummary(timeline);
    const player = new ReplayPlayer(timeline);
    this.timeline = timeline;
    this.summary = summary;
    this.player = player;
    this.playerUnsubscribe = player.subscribe(() => {
      this.refreshReadySnapshot();
      this.emit();
    });
    this.snapshot = this.buildReadySnapshot();
    this.emit();
    return this.snapshot;
  }

  private buildReadySnapshot(): ViewerSnapshot {
    const player = this.player!;
    const timeline = this.timeline!;
    const summary = this.summary!;
    const playerSnap = player.getSnapshot();
    return {
      status: 'ready',
      timeline,
      summary,
      frame: playerSnap.frame,
      tick: playerSnap.tick,
      totalTicks: timeline.frames.length - 1,
      isPlaying: playerSnap.isPlaying,
      speed: playerSnap.speed,
      atStart: playerSnap.atStart,
      atEnd: playerSnap.atEnd,
    };
  }

  private refreshReadySnapshot(): void {
    if (!this.player) return;
    this.snapshot = this.buildReadySnapshot();
  }

  private disposePlayer(): void {
    if (this.playerUnsubscribe) {
      this.playerUnsubscribe();
      this.playerUnsubscribe = null;
    }
    this.player = null;
    this.timeline = null;
    this.summary = null;
  }

  private emit(): void {
    if (this.listeners.size === 0) return;
    const snap = this.snapshot;
    for (const listener of this.listeners) {
      listener(snap);
    }
  }
}
