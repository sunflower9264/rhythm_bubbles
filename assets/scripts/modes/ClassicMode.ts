/**
 * @file ClassicMode.ts
 * @description 经典模式（规则模式/随机模式）- 随机生成高亮泡泡，点击高亮泡泡得分
 * @author YourName
 * @date 2026-01-24
 */

import { log } from 'cc';
import { IGameMode, IGameModeContext, IGameModeCallbacks, ClickResult, IBubbleData } from './IGameMode';
import { BubbleType } from '../utils/BubblePool';

/**
 * 经典模式管理器
 * - 规则模式：同一行高亮泡泡连续排列
 * - 随机模式：随机数量和位置的高亮泡泡
 * - 点击高亮泡泡即可得分，无需按顺序
 */
export class ClassicMode implements IGameMode {

  // ========== 属性 ==========
  public readonly name: string = 'ClassicMode';

  // ========== 私有变量 ==========
  private _context: IGameModeContext = null;
  private _callbacks: IGameModeCallbacks = null;

  /** 高亮泡泡索引集合 */
  private _highlightIndices: Set<number> = new Set();
  /** 剩余需要点击的高亮数量 */
  private _remainingCount: number = 0;

  // ========== 公共方法 ==========

  /**
   * 初始化模式
   */
  public init(context: IGameModeContext, callbacks: IGameModeCallbacks): void {
    this._context = context;
    this._callbacks = callbacks;

    // 重置状态
    this.reset();

    // 设置高亮索引
    const { highlightPositions } = context.generateResult;
    highlightPositions.forEach(pos => {
      this._highlightIndices.add(pos.index);
    });
    this._remainingCount = highlightPositions.length;

    log(`[ClassicMode] 初始化完成，高亮数量: ${this._remainingCount}`);
  }

  /**
   * 开始模式
   */
  public start(): void {
    log(`[ClassicMode] 开始游戏`);
    this._callbacks.onReady();
  }

  /**
   * 检查点击是否正确
   */
  public checkClick(positionIndex: number): ClickResult {
    // 经典模式下，点击高亮泡泡才是正确的
    const bubbleData = this.getBubbleByIndex(positionIndex);
    if (!bubbleData) {
      return ClickResult.IGNORED;
    }

    // 检查是否是高亮泡泡
    const isHighlight = bubbleData.type === BubbleType.HIGHLIGHT;
    const isInHighlightSet = this._highlightIndices.has(positionIndex);

    if (isHighlight && isInHighlightSet) {
      return ClickResult.CORRECT;
    }

    return ClickResult.WRONG;
  }

  /**
   * 处理正确点击后的逻辑
   */
  public handleCorrectClick(positionIndex: number): void {
    // 从集合中移除
    this._highlightIndices.delete(positionIndex);
    this._remainingCount--;

    log(`[ClassicMode] 正确点击，剩余: ${this._remainingCount}`);

    this._callbacks.onCorrectClick(positionIndex);

    // 检查是否全部清除
    if (this._remainingCount <= 0) {
      this._callbacks.onAllCleared();
    }
  }

  /**
   * 重置模式状态
   */
  public reset(): void {
    this._highlightIndices.clear();
    this._remainingCount = 0;
  }

  /**
   * 清理资源
   */
  public cleanup(): void {
    this.reset();
    this._context = null;
    this._callbacks = null;
  }

  /**
   * 获取剩余需要点击的数量
   */
  public getRemainingCount(): number {
    return this._remainingCount;
  }

  // ========== 私有方法 ==========

  /**
   * 根据索引获取泡泡数据
   */
  private getBubbleByIndex(index: number): IBubbleData | null {
    return this._context.bubbleList.find(b => b.index === index) || null;
  }
}
