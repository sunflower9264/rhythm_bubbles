/**
 * @file IBubbleGenerator.ts
 * @description 泡泡生成器接口定义
 * @author YourName
 * @date 2026-01-24
 */

import { ILevelConfig } from '../data/LevelConfig';
import { BubbleType } from './BubblePool';

/** 泡泡位置数据 */
export interface IBubblePosition {
  /** 行索引 */
  row: number;
  /** 列索引 */
  col: number;
  /** 在数组中的索引 */
  index: number;
}

/** 泡泡生成结果 */
export interface IBubbleGenerateResult {
  /** 所有泡泡的类型数组（按行列顺序） */
  types: BubbleType[];
  /** 高亮泡泡的位置列表 */
  highlightPositions: IBubblePosition[];
  /** 点击顺序（顺序模式使用，存储高亮位置的索引） */
  clickOrder?: number[];
}

/** 泡泡生成器接口 */
export interface IBubbleGenerator {
  /**
   * 生成泡泡布局
   * @param config 关卡配置
   * @param lastHighlightCount 上一关的高亮数量（用于保证递增）
   * @returns 生成结果
   */
  generate(config: ILevelConfig, lastHighlightCount?: number): IBubbleGenerateResult;
}

/**
 * 生成器基类，提供通用工具方法
 */
export abstract class BaseBubbleGenerator implements IBubbleGenerator {

  abstract generate(config: ILevelConfig, lastHighlightCount?: number): IBubbleGenerateResult;

  /**
   * 创建初始化的泡泡类型数组（全部为普通类型）
   */
  protected createInitialTypes(total: number): BubbleType[] {
    return new Array(total).fill(BubbleType.NORMAL);
  }

  /**
   * 将索引转换为位置
   */
  protected indexToPosition(index: number, cols: number): IBubblePosition {
    return {
      row: Math.floor(index / cols),
      col: index % cols,
      index,
    };
  }

  /**
   * 将位置转换为索引
   */
  protected positionToIndex(row: number, col: number, cols: number): number {
    return row * cols + col;
  }

  /**
   * 随机获取指定数量的不重复索引
   */
  protected getRandomIndices(total: number, count: number): number[] {
    const indices: number[] = [];
    const available = Array.from({ length: total }, (_, i) => i);

    const validCount = Math.min(count, total);
    for (let i = 0; i < validCount; i++) {
      const randomIndex = Math.floor(Math.random() * available.length);
      indices.push(available[randomIndex]);
      available.splice(randomIndex, 1);
    }

    return indices;
  }

  /**
   * 在范围内生成随机整数
   */
  protected randomRange(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * 洗牌算法
   */
  protected shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}
