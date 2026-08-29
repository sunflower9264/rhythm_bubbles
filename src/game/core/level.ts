import type { BubbleState, LevelConfig } from './types';

const MAX_TARGETS = 8;
const INITIAL_TARGETS = 2;
export const BOARD_ROWS = 4;
export const BOARD_COLS = 4;

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
  level: number,
  lastTargetCount: number,
  random: RandomSource,
): LevelConfig {
  const minTargets = Math.min(INITIAL_TARGETS + Math.floor((level - 1) / 2), MAX_TARGETS);
  const maxTargets = Math.min(minTargets + 1 + Math.floor(level / 3), MAX_TARGETS);
  const effectiveMin = Math.min(Math.max(minTargets, lastTargetCount), maxTargets);
  const targetCount = effectiveMin + Math.floor(random() * (maxTargets - effectiveMin + 1));
  return {
    level,
    rows: BOARD_ROWS,
    cols: BOARD_COLS,
    targetCount,
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

  const targets = new Set(targetIndices);
  return Array.from({ length: total }, (_, index) => {
    return {
      index,
      row: Math.floor(index / config.cols),
      col: index % config.cols,
      isTarget: targets.has(index),
      cleared: false,
    };
  });
}
