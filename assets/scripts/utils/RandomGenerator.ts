/**
 * @file RandomGenerator.ts
 * @description 随机模式泡泡生成器（4-6关）
 *              随机数量和位置的高亮泡泡
 * @author YourName
 * @date 2026-01-24
 */

import { ILevelConfig } from '../data/LevelConfig';
import { BubbleType } from './BubblePool';
import { BaseBubbleGenerator, IBubbleGenerateResult, IBubblePosition } from './IBubbleGenerator';

/**
 * 随机模式生成器
 * 特点：高亮泡泡数量在范围内随机，位置完全随机
 */
export class RandomGenerator extends BaseBubbleGenerator {

  generate(config: ILevelConfig, lastHighlightCount?: number): IBubbleGenerateResult {
    const { rows, cols, minHighlight = 3, maxHighlight = 5, highlightCount } = config;
    const total = rows * cols;
    const types = this.createInitialTypes(total);
    const highlightPositions: IBubblePosition[] = [];

    // 确定高亮数量
    let count: number;
    if (highlightCount !== undefined) {
      // 固定数量
      count = highlightCount;
    } else {
      // 随机数量，但不能少于上一关
      const effectiveMin = lastHighlightCount !== undefined
        ? Math.max(minHighlight, lastHighlightCount)
        : minHighlight;
      count = this.randomRange(effectiveMin, maxHighlight);
    }

    // 确保不超过总格子数
    count = Math.min(count, total);

    // 随机选择高亮位置
    const highlightIndices = this.getRandomIndices(total, count);

    // 设置高亮泡泡
    for (const index of highlightIndices) {
      types[index] = BubbleType.HIGHLIGHT;
      highlightPositions.push(this.indexToPosition(index, cols));
    }

    return { types, highlightPositions };
  }
}
