import type { BubbleState, GameMode, LevelConfig } from './types';

const MAX_TARGETS = 8;
const INITIAL_TARGETS = 2;

export type RandomSource = () => number;

export function createSeededRandom(seed = Date.now()): RandomSource {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

export function createLevelConfig(
  mode: GameMode,
  level: number,
  lastTargetCount: number,
  random: RandomSource,
): LevelConfig {
  const rows = 4;
  const cols = 4;
  const minTargets = Math.min(INITIAL_TARGETS + Math.floor((level - 1) / 2), MAX_TARGETS);
  const maxTargets = Math.min(minTargets + 1 + Math.floor(level / 3), MAX_TARGETS);
  const effectiveMin = Math.min(Math.max(minTargets, lastTargetCount), maxTargets);
  const targetCount = effectiveMin + Math.floor(random() * (maxTargets - effectiveMin + 1));
  const extraSeconds = mode === 'classic' ? 3 : 5;

  return {
    level,
    mode,
    rows,
    cols,
    targetCount,
    timeLimitMs: (targetCount * 2 + extraSeconds) * 1000,
    flashCount: 1,
    flashDurationMs: 900,
    sequenceIntervalMs: 300,
  };
}

export function createBubbles(config: LevelConfig, random: RandomSource): BubbleState[] {
  const total = config.rows * config.cols;
  const available = Array.from({ length: total }, (_, index) => index);
  const targetIndices: number[] = [];

  while (targetIndices.length < config.targetCount) {
    const choice = Math.floor(random() * available.length);
    const [index] = available.splice(choice, 1);
    targetIndices.push(index);
  }

  const orderByIndex = new Map(targetIndices.map((index, order) => [index, order]));
  return Array.from({ length: total }, (_, index) => {
    const order = orderByIndex.get(index) ?? null;
    return {
      index,
      row: Math.floor(index / config.cols),
      col: index % config.cols,
      isTarget: order !== null,
      cleared: false,
      order,
    };
  });
}
