/**
 * @file GameModeFactory.ts
 * @description 游戏模式工厂，根据配置创建对应的游戏模式实例
 * @author YourName
 * @date 2026-01-24
 */

import { IGameMode } from './IGameMode';
import { GameMode } from '../data/LevelConfig';
import { ClassicMode } from './ClassicMode';
import { MemoryMode } from './MemoryMode';
import { SequenceMode } from './SequenceMode';

/**
 * 根据游戏模式类型获取对应的模式管理器实例
 * @param mode 游戏模式类型
 * @returns 游戏模式管理器实例
 */
export function createGameMode(mode: GameMode): IGameMode {
  switch (mode) {
    case GameMode.CLASSIC:
      return new ClassicMode();

    case GameMode.MEMORY:
      return new MemoryMode();

    case GameMode.SEQUENCE:
      return new SequenceMode();

    default:
      // 默认使用经典模式
      return new ClassicMode();
  }
}
