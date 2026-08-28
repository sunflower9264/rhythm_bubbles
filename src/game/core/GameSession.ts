import { createBubbles, createLevelConfig, createSeededRandom, type RandomSource } from './level';
import type { BubbleState, GameMode, GamePhase, SessionSnapshot, SessionUpdate } from './types';

const LEVEL_TRANSITION_MS = 800;

export class GameSession {
  private phase: GamePhase = 'menu';
  private previousPhase: GamePhase | null = null;
  private mode: GameMode | null = null;
  private score = 0;
  private level = 1;
  private bubbles: BubbleState[] = [];
  private remainingTimeMs = 0;
  private timeLimitMs = 0;
  private lastTargetCount = 0;
  private previewElapsedMs = 0;
  private transitionElapsedMs = 0;
  private sequenceCursor = 0;
  private lastSelectedIndex: number | null = null;
  private lastCountdownSecond = Number.POSITIVE_INFINITY;

  constructor(private readonly random: RandomSource = createSeededRandom()) {}

  start(mode: GameMode): SessionUpdate {
    this.mode = mode;
    this.score = 0;
    this.level = 1;
    this.lastTargetCount = 0;
    this.previousPhase = null;
    this.loadLevel();
    return this.update('start');
  }

  home(): SessionUpdate {
    this.phase = 'menu';
    this.previousPhase = null;
    this.mode = null;
    this.bubbles = [];
    this.remainingTimeMs = 0;
    return this.update('home');
  }

  restart(): SessionUpdate {
    return this.start(this.mode ?? 'classic');
  }

  pause(): SessionUpdate {
    if (this.phase !== 'playing' && this.phase !== 'preview') return this.update('none');
    this.previousPhase = this.phase;
    this.phase = 'paused';
    return this.update('pause');
  }

  resume(): SessionUpdate {
    if (this.phase !== 'paused') return this.update('none');
    this.phase = this.previousPhase ?? 'playing';
    this.previousPhase = null;
    return this.update('resume');
  }

  select(index: number): SessionUpdate {
    if (this.phase !== 'playing') return this.update('none');
    const bubble = this.bubbles[index];
    if (!bubble || bubble.cleared) return this.update('none');

    this.lastSelectedIndex = index;
    const expectedIndex = this.getExpectedIndex();
    const correct = this.mode === 'sequence' ? index === expectedIndex : bubble.isTarget;

    if (!correct) {
      this.phase = 'game-over';
      return this.update('wrong', index);
    }

    bubble.cleared = true;
    this.score += 10;
    this.sequenceCursor += this.mode === 'sequence' ? 1 : 0;

    if (this.getRemainingTargets() === 0) {
      this.phase = 'transition';
      this.transitionElapsedMs = 0;
      return this.update('level-up', index);
    }

    return this.update('correct', index);
  }

  advanceTime(milliseconds: number): SessionUpdate {
    let remaining = Math.max(0, milliseconds);
    let effect: SessionUpdate['effect'] = 'none';

    while (remaining > 0) {
      const step = Math.min(remaining, 50);
      remaining -= step;

      if (this.phase === 'preview') {
        this.previewElapsedMs += step;
        if (this.previewElapsedMs >= this.getPreviewDurationMs()) {
          this.phase = 'playing';
          this.remainingTimeMs = this.timeLimitMs;
          this.lastCountdownSecond = Math.ceil(this.remainingTimeMs / 1000);
        }
      } else if (this.phase === 'playing') {
        this.remainingTimeMs = Math.max(0, this.remainingTimeMs - step);
        const second = Math.ceil(this.remainingTimeMs / 1000);
        if (second <= 3 && second < this.lastCountdownSecond) effect = 'countdown';
        this.lastCountdownSecond = second;
        if (this.remainingTimeMs <= 0) {
          this.phase = 'game-over';
          effect = 'wrong';
          break;
        }
      } else if (this.phase === 'transition') {
        this.transitionElapsedMs += step;
        if (this.transitionElapsedMs >= LEVEL_TRANSITION_MS) {
          this.level += 1;
          this.loadLevel();
          effect = 'level-up';
        }
      } else {
        break;
      }
    }

    return this.update(effect);
  }

  getSnapshot(): SessionSnapshot {
    const config = this.currentConfig();
    return {
      phase: this.phase,
      previousPhase: this.previousPhase,
      mode: this.mode,
      score: this.score,
      level: this.level,
      rows: config?.rows ?? 0,
      cols: config?.cols ?? 0,
      remainingTimeMs: this.remainingTimeMs,
      timeLimitMs: this.timeLimitMs,
      remainingTargets: this.getRemainingTargets(),
      targetCount: this.lastTargetCount,
      bubbles: this.bubbles.map((bubble) => ({ ...bubble })),
      visibleTargetIndices: this.getVisibleTargetIndices(),
      expectedIndex: this.getExpectedIndex(),
      lastSelectedIndex: this.lastSelectedIndex,
      previewProgress: this.phase === 'preview'
        ? Math.min(1, this.previewElapsedMs / this.getPreviewDurationMs())
        : 1,
    };
  }

  private loadLevel(): void {
    if (!this.mode) return;
    const config = createLevelConfig(this.mode, this.level, this.lastTargetCount, this.random);
    this.bubbles = createBubbles(config, this.random);
    this.lastTargetCount = config.targetCount;
    this.timeLimitMs = config.timeLimitMs;
    this.remainingTimeMs = config.timeLimitMs;
    this.previewElapsedMs = 0;
    this.transitionElapsedMs = 0;
    this.sequenceCursor = 0;
    this.lastSelectedIndex = null;
    this.lastCountdownSecond = Math.ceil(config.timeLimitMs / 1000);
    this.phase = this.mode === 'classic' ? 'playing' : 'preview';
  }

  private currentConfig() {
    if (!this.mode || this.bubbles.length === 0) return null;
    const rows = this.level <= 4 ? 3 : 4;
    const cols = this.level <= 2 ? 3 : 4;
    const extraSeconds = this.mode === 'classic' ? 3 : 5;
    return {
      rows,
      cols,
      flashCount: 3,
      flashDurationMs: 300,
      sequenceIntervalMs: 300,
      timeLimitMs: (this.lastTargetCount * 2 + extraSeconds) * 1000,
    };
  }

  private getPreviewDurationMs(): number {
    const config = this.currentConfig();
    if (!config || this.mode === 'classic') return 0;
    if (this.mode === 'memory') return config.flashCount * config.flashDurationMs * 2;
    return (this.lastTargetCount + 1) * config.sequenceIntervalMs;
  }

  private getVisibleTargetIndices(): number[] {
    const remainingTargets = this.bubbles.filter((bubble) => bubble.isTarget && !bubble.cleared);
    if (this.mode === 'classic' && this.phase !== 'menu') return remainingTargets.map(({ index }) => index);
    if (this.phase !== 'preview') return [];

    if (this.mode === 'memory') {
      const segment = Math.floor(this.previewElapsedMs / 300);
      return segment % 2 === 0 ? remainingTargets.map(({ index }) => index) : [];
    }

    const visibleCount = Math.min(
      this.lastTargetCount,
      Math.floor(this.previewElapsedMs / 300) + 1,
    );
    return this.bubbles
      .filter((bubble) => bubble.isTarget && bubble.order !== null && bubble.order < visibleCount)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(({ index }) => index);
  }

  private getExpectedIndex(): number | null {
    if (this.mode !== 'sequence') return null;
    return this.bubbles.find((bubble) => bubble.order === this.sequenceCursor)?.index ?? null;
  }

  private getRemainingTargets(): number {
    return this.bubbles.filter((bubble) => bubble.isTarget && !bubble.cleared).length;
  }

  private update(effect: SessionUpdate['effect'], effectIndex?: number): SessionUpdate {
    return { snapshot: this.getSnapshot(), effect, effectIndex };
  }
}
