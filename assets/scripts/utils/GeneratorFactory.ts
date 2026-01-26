/**
 * @file GeneratorFactory.ts
 * @description 泡泡生成器工厂，根据游戏模式创建对应的生成器
 * @author YourName
 * @date 2026-01-24
 */

import { GameMode } from '../data/LevelConfig';
import { IBubbleGenerator } from './IBubbleGenerator';
import { RegularGenerator } from './RegularGenerator';
import { RandomGenerator } from './RandomGenerator';
import { MemoryGenerator } from './MemoryGenerator';
import { SequenceGenerator } from './SequenceGenerator';

/** 生成器缓存 */
const generatorCache: Map<GameMode, IBubbleGenerator> = new Map();

/**
 * 获取指定模式的生成器
 * @param mode 游戏模式
 * @returns 对应的生成器实例
 */
export function getGenerator(mode: GameMode): IBubbleGenerator {
  // 检查缓存
  if (generatorCache.has(mode)) {
    return generatorCache.get(mode);
  }

  // 创建新的生成器
  let generator: IBubbleGenerator;

  switch (mode) {
    case GameMode.CLASSIC:
      generator = new RandomGenerator();
      break;
    case GameMode.MEMORY:
      generator = new MemoryGenerator();
      break;
    case GameMode.SEQUENCE:
      generator = new SequenceGenerator();
      break;
    default:
      generator = new RandomGenerator();
      break;
  }

  // 缓存并返回
  generatorCache.set(mode, generator);
  return generator;
}

/**
 * 清除生成器缓存
 */
export function clearGeneratorCache(): void {
  generatorCache.clear();
}
