/**
 * @file SequenceGenerator.ts
 * @description 顺序模式泡泡生成器（10+关）
 *              高亮泡泡按顺序亮起后统一熄灭，需要按顺序点击
 * @author YourName
 * @date 2026-01-24
 */

import { ILevelConfig } from '../data/LevelConfig';
import { BubbleType } from './BubblePool';
import { BaseBubbleGenerator, IBubbleGenerateResult, IBubblePosition } from './IBubbleGenerator';

/**
 * 顺序模式生成器
 * 特点：生成随机位置的高亮泡泡，并生成点击顺序
 * 顺序显示逻辑由 Bubble.ts 控制
 */
export class SequenceGenerator extends BaseBubbleGenerator {

  generate(config: ILevelConfig, lastHighlightCount?: number): IBubbleGenerateResult {
    const { rows, cols, minHighlight = 3, maxHighlight = 5, highlightCount } = config;
    const total = rows * cols;
    const types = this.createInitialTypes(total);
    const highlightPositions: IBubblePosition[] = [];

    // 确定高亮数量
    let count: number;
    if (highlightCount !== undefined) {
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

    // 生成点击顺序（就是 highlightPositions 数组的索引顺序）
    const clickOrder = Array.from({ length: highlightPositions.length }, (_, i) => i);

    return { types, highlightPositions, clickOrder };
  }
}
