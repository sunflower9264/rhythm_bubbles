/**
 * @file SequenceMode.ts
 * @description 顺序模式 - 按顺序逐渐显示高亮泡泡，需要按顺序点击
 * @author YourName
 * @date 2026-01-24
 */

import { log } from 'cc';
import { IGameMode, IGameModeContext, IGameModeCallbacks, ClickResult, IBubbleData } from './IGameMode';
import { GameEvent, EventName } from '../data/GameEvent';
import { BubbleState } from '../components/BubbleItem';

/**
 * 顺序模式管理器
 * - 所有泡泡初始显示为普通泡泡
 * - 高亮泡泡按顺序逐个亮起
 * - 全部亮起后隐藏
 * - 玩家需要按照显示顺序依次点击
 */
export class SequenceMode implements IGameMode {

  // ========== 属性 ==========
  public readonly name: string = 'SequenceMode';

  // ========== 私有变量 ==========
  private _context: IGameModeContext = null;
  private _callbacks: IGameModeCallbacks = null;

  /** 高亮泡泡索引集合 */
  private _highlightIndices: Set<number> = new Set();
  /** 剩余需要点击的高亮数量 */
  private _remainingCount: number = 0;
  /** 期望的点击顺序（存储的是 highlightPositions 数组的索引） */
  private _expectedClickOrder: number[] = [];
  /** 当前点击索引 */
  private _currentClickIndex: number = 0;
  /** 是否正在显示序列 */
  private _isShowingSequence: boolean = false;

  // ========== 公共方法 ==========

  /**
   * 初始化模式
   */
  public init(context: IGameModeContext, callbacks: IGameModeCallbacks): void {
    this._context = context;
    this._callbacks = callbacks;

    // 重置状态
    this.reset();

    // 设置高亮索引和点击顺序
    const { highlightPositions, clickOrder } = context.generateResult;
    highlightPositions.forEach(pos => {
      this._highlightIndices.add(pos.index);
    });
    this._remainingCount = highlightPositions.length;
    this._expectedClickOrder = clickOrder || [];

    log(`[SequenceMode] 初始化完成，高亮数量: ${this._remainingCount}, 点击顺序: ${this._expectedClickOrder}`);
  }

  /**
   * 开始模式 - 进入序列显示流程
   */
  public start(): void {
    log(`[SequenceMode] 开始显示序列`);
    this.startShowingSequence();
  }

  /**
   * 检查点击是否正确
   */
  public checkClick(positionIndex: number): ClickResult {
    // 显示序列期间不允许点击
    if (this._isShowingSequence) {
      return ClickResult.IGNORED;
    }

    // 检查是否按顺序点击
    if (this._currentClickIndex >= this._expectedClickOrder.length) {
      return ClickResult.WRONG;
    }

    // 获取期望的高亮泡泡位置索引
    const expectedOrderIndex = this._expectedClickOrder[this._currentClickIndex];
    const highlightArray = this._context.generateResult.highlightPositions;
    const expectedPosition = highlightArray[expectedOrderIndex];

    if (positionIndex === expectedPosition.index) {
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
    this._currentClickIndex++;

    log(`[SequenceMode] 正确点击，当前索引: ${this._currentClickIndex}, 剩余: ${this._remainingCount}`);

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
    this._expectedClickOrder = [];
    this._currentClickIndex = 0;
    this._isShowingSequence = false;
  }

  /**
   * 清理资源
   */
  public cleanup(): void {
    // 取消所有调度
    this._context?.unscheduleAllCallbacks();

    // 回收所有临时高亮节点
    this._context?.highlightBubbles.forEach(data => {
      if (data.flashNode) {
        this._context.recycleFlashNode(data.flashNode);
        data.flashNode = null;
      }
    });

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
   * 开始显示序列
   */
  private startShowingSequence(): void {
    const { sequenceInterval = 300 } = this._context.config;
    const { highlightPositions, clickOrder } = this._context.generateResult;

    this._isShowingSequence = true;
    GameEvent.emit(EventName.SEQUENCE_SHOW_START);

    // 创建临时高亮泡泡用于显示顺序
    this.createFlashHighlights();
    // 先隐藏所有临时高亮
    this.hideAllFlashHighlights();

    // 使用索引变量逐个显示
    this.showSequenceByIndex(0, highlightPositions, clickOrder, sequenceInterval);
  }

  /**
   * 按索引显示序列中的一个高亮
   */
  private showSequenceByIndex(
    currentIndex: number,
    highlightPositions: any[],
    clickOrder: number[],
    sequenceInterval: number
  ): void {
    if (currentIndex >= highlightPositions.length) {
      // 全部显示完成，等待一会后隐藏并开始游戏
      this.scheduleFinishSequence(sequenceInterval);
      return;
    }

    // 按 clickOrder 的顺序显示
    const orderIndex = clickOrder[currentIndex];
    const position = highlightPositions[orderIndex];
    const bubbleData = this.getBubbleByIndex(position.index);

    if (bubbleData && bubbleData.flashNode) {
      // 显示这个位置的临时高亮泡泡
      bubbleData.flashNode.active = true;
      log(`[SequenceMode] 显示第 ${currentIndex + 1} 个高亮，位置索引: ${position.index}`);
    }

    // 调度显示下一个
    this._context.scheduleOnce(() => {
      this.showSequenceByIndex(currentIndex + 1, highlightPositions, clickOrder, sequenceInterval);
    }, sequenceInterval / 1000);
  }

  /**
   * 调度结束序列显示
   */
  private scheduleFinishSequence(sequenceInterval: number): void {
    this._context.scheduleOnce(() => {
      this.finishShowingSequence();
    }, sequenceInterval / 1000);
  }

  /**
   * 序列显示结束
   */
  private finishShowingSequence(): void {
    // 移除所有临时高亮泡泡
    this.removeFlashHighlights();

    this._isShowingSequence = false;
    GameEvent.emit(EventName.SEQUENCE_READY);

    log(`[SequenceMode] 序列显示结束，准备开始游戏`);

    // 通知准备就绪
    this._callbacks.onReady();
  }

  /**
   * 创建临时高亮泡泡
   */
  private createFlashHighlights(): void {
    this._context.highlightBubbles.forEach(data => {
      if (!data.flashNode) {
        const flashNode = this._context.createFlashNode(data);
        flashNode.active = false;

        // 禁用临时高亮泡泡的点击
        const flashItem = flashNode.getComponent('BubbleItem');
        if (flashItem) {
          (flashItem as any).setState(BubbleState.DISABLED);
        }

        data.flashNode = flashNode;
      }
    });
  }

  /**
   * 隐藏所有临时高亮泡泡
   */
  private hideAllFlashHighlights(): void {
    this._context.highlightBubbles.forEach(data => {
      if (data.flashNode) {
        data.flashNode.active = false;
      }
    });
  }

  /**
   * 移除所有临时高亮泡泡
   */
  private removeFlashHighlights(): void {
    this._context.highlightBubbles.forEach(data => {
      if (data.flashNode) {
        this._context.recycleFlashNode(data.flashNode);
        data.flashNode = null;
      }
    });
  }

  /**
   * 根据索引获取泡泡数据
   */
  private getBubbleByIndex(index: number): IBubbleData | null {
    return this._context.bubbleList.find(b => b.index === index) || null;
  }
}
