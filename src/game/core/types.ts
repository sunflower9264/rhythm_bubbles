export type GamePhase = 'menu' | 'playing' | 'paused' | 'transition' | 'reward' | 'game-over' | 'victory';

export type EnemyAttackState = 'charging' | 'windup' | 'recovery';
export type EnemyMechanicState = 'inactive' | 'active' | 'staggered';
export type EnemyId = 'jelly' | 'angler' | 'hermit' | 'manta' | 'puffer';
export type EnemyMechanic = 'sequence' | 'capture' | 'shell' | 'sweep' | 'guard';

export type GameEffect =
  | 'none'
  | 'start'
  | 'correct'
  | 'mistake'
  | 'mistake-overflow'
  | 'board-clear'
  | 'enemy-windup'
  | 'enemy-impact'
  | 'enemy-recover'
  | 'enemy-staggered'
  | 'enemy-countered'
  | 'enemy-break'
  | 'counter-miss'
  | 'timeout-impact'
  | 'encounter-win'
  | 'next-round'
  | 'reward'
  | 'reward-picked'
  | 'victory'
  | 'countdown'
  | 'pause'
  | 'resume'
  | 'home';

export interface LevelConfig {
  level: number;
  rows: number;
  cols: number;
  targetCount: number;
}

export interface BubbleState {
  index: number;
  row: number;
  col: number;
  isTarget: boolean;
  cleared: boolean;
}

export type RewardId = 'power' | 'heart' | 'shield' | 'time';

export interface RewardChoice {
  id: RewardId;
  title: string;
  description: string;
}

export interface SessionSnapshot {
  phase: GamePhase;
  previousPhase: GamePhase | null;
  score: number;
  level: number;
  rows: number;
  cols: number;
  remainingTargets: number;
  targetCount: number;
  bubbles: BubbleState[];
  visibleTargetIndices: number[];
  lastSelectedIndex: number | null;
  battle: number;
  board: number;
  boardTapCount: number;
  boardTapLimit: number;
  totalBattles: number;
  enemyId: EnemyId;
  enemyOrder: EnemyId[];
  enemyName: string;
  enemyTexture: string;
  enemyMechanic: EnemyMechanic;
  enemyMechanicState: EnemyMechanicState;
  enemyHp: number;
  maxEnemyHp: number;
  enemyAttack: number;
  enemyAttackState: EnemyAttackState;
  enemyAttackProgress: number;
  enemyAttackCooldownMs: number;
  enemyAttackWindupMs: number;
  enemyIntentTargets: number[];
  enemyIntentCursor: number;
  enemyHazardRow: number | null;
  enemyPoise: number;
  maxEnemyPoise: number;
  enemyPhase: 1 | 2;
  lastAttackReduction: number;
  mistakeDamage: number;
  mistakeCount: number;
  mistakeLimit: number;
  enemyIsBoss: boolean;
  playerHp: number;
  maxPlayerHp: number;
  shield: number;
  maxShield: number;
  attackPower: number;
  combo: number;
  comboRemainingMs: number;
  comboWindowMs: number;
  lastDamage: number;
  lastEnemyDamage: number;
  lastBlockedDamage: number;
  rewardChoices: RewardChoice[];
}

export interface SessionUpdate {
  snapshot: SessionSnapshot;
  effect: GameEffect;
  effectIndex?: number;
}
