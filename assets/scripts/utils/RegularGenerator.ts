/**
 * @file RegularGenerator.ts
 * @description 规则模式泡泡生成器（1-3关）
 *              同一行的高亮泡泡连续排列，不参杂普通泡泡
 * @author YourName
 * @date 2026-01-24
 */

import { ILevelConfig } from '../data/LevelConfig';
import { BubbleType } from './BubblePool';
import { BaseBubbleGenerator, IBubbleGenerateResult, IBubblePosition } from './IBubbleGenerator';

/**
 * 规则模式生成器
 * 特点：每行的高亮泡泡是连续的，不会被普通泡泡分隔
 */
export class RegularGenerator extends BaseBubbleGenerator {

  generate(config: ILevelConfig): IBubbleGenerateResult {
    const { rows, cols, highlightCount = 2 } = config;
    const total = rows * cols;
    const types = this.createInitialTypes(total);
    const highlightPositions: IBubblePosition[] = [];

    // 计算每行分配多少个高亮泡泡
    const highlightsPerRow = this.distributeHighlights(rows, highlightCount);

    // 为每行生成连续的高亮泡泡
    for (let row = 0; row < rows; row++) {
      const countInRow = highlightsPerRow[row];
      if (countInRow === 0) continue;

      // 随机选择起始列（确保不会超出边界）
      const maxStartCol = cols - countInRow;
      const startCol = Math.floor(Math.random() * (maxStartCol + 1));

      // 设置连续的高亮泡泡
      for (let i = 0; i < countInRow; i++) {
        const col = startCol + i;
        const index = this.positionToIndex(row, col, cols);
        types[index] = BubbleType.HIGHLIGHT;
        highlightPositions.push({ row, col, index });
      }
    }

    return { types, highlightPositions };
  }

  /**
   * 将高亮泡泡数量分配到各行
   */
  private distributeHighlights(rows: number, total: number): number[] {
    const distribution = new Array(rows).fill(0);
    let remaining = total;

    // 随机选择要放置高亮泡泡的行
    const rowIndices = this.shuffle(Array.from({ length: rows }, (_, i) => i));

    for (const rowIndex of rowIndices) {
      if (remaining <= 0) break;

      // 每行至少放1个，最多放剩余的数量
      const maxForRow = Math.min(remaining, 3); // 限制每行最多3个
      const countForRow = this.randomRange(1, maxForRow);

      distribution[rowIndex] = countForRow;
      remaining -= countForRow;
    }

    // 如果还有剩余，继续分配
    while (remaining > 0) {
      for (let i = 0; i < rows && remaining > 0; i++) {
        if (distribution[i] < 3) { // 每行最多3个
          distribution[i]++;
          remaining--;
        }
      }
    }

    return distribution;
  }
}
