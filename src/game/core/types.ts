export type GameMode = 'classic' | 'memory' | 'sequence';

export type GamePhase = 'menu' | 'preview' | 'playing' | 'paused' | 'transition' | 'game-over';

export type GameEffect =
  | 'none'
  | 'start'
  | 'correct'
  | 'wrong'
  | 'level-up'
  | 'countdown'
  | 'pause'
  | 'resume'
  | 'home';

export interface LevelConfig {
  level: number;
  mode: GameMode;
  rows: number;
  cols: number;
  targetCount: number;
  timeLimitMs: number;
  flashCount: number;
  flashDurationMs: number;
  sequenceIntervalMs: number;
}

export interface BubbleState {
  index: number;
  row: number;
  col: number;
  isTarget: boolean;
  cleared: boolean;
  order: number | null;
}

export interface SessionSnapshot {
  phase: GamePhase;
  previousPhase: GamePhase | null;
  mode: GameMode | null;
  score: number;
  level: number;
  rows: number;
  cols: number;
  remainingTimeMs: number;
  timeLimitMs: number;
  remainingTargets: number;
  targetCount: number;
  bubbles: BubbleState[];
  visibleTargetIndices: number[];
  expectedIndex: number | null;
  lastSelectedIndex: number | null;
  previewProgress: number;
}

export interface SessionUpdate {
  snapshot: SessionSnapshot;
  effect: GameEffect;
  effectIndex?: number;
}
