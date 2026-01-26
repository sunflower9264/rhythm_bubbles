/**
 * @file MemoryMode.ts
 * @description 记忆模式 - 高亮泡泡闪烁后显示成普通泡泡，凭记忆点击
 * @author YourName
 * @date 2026-01-24
 */

import { log, Node } from 'cc';
import { IGameMode, IGameModeContext, IGameModeCallbacks, ClickResult, IBubbleData } from './IGameMode';
import { GameEvent, EventName } from '../data/GameEvent';
import { BubbleState } from '../components/BubbleItem';
import { BubbleType } from '../utils/BubblePool';

/**
 * 记忆模式管理器
 * - 所有泡泡初始显示为普通泡泡
 * - 高亮泡泡位置会闪烁显示几次
 * - 闪烁结束后，玩家需要凭记忆点击高亮位置
 */
export class MemoryMode implements IGameMode {

  // ========== 属性 ==========
  public readonly name: string = 'MemoryMode';

  // ========== 私有变量 ==========
  private _context: IGameModeContext = null;
  private _callbacks: IGameModeCallbacks = null;

  /** 高亮泡泡索引集合 */
  private _highlightIndices: Set<number> = new Set();
  /** 剩余需要点击的高亮数量 */
  private _remainingCount: number = 0;
  /** 是否正在闪烁 */
  private _isFlashing: boolean = false;

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

    log(`[MemoryMode] 初始化完成，高亮数量: ${this._remainingCount}`);
  }

  /**
   * 开始模式 - 进入闪烁流程
   */
  public start(): void {
    log(`[MemoryMode] 开始闪烁`);
    this.startFlashing();
  }

  /**
   * 检查点击是否正确
   */
  public checkClick(positionIndex: number): ClickResult {
    // 闪烁期间不允许点击
    if (this._isFlashing) {
      return ClickResult.IGNORED;
    }

    // 记忆模式下，基于位置索引判定
    if (this._highlightIndices.has(positionIndex)) {
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

    log(`[MemoryMode] 正确点击，剩余: ${this._remainingCount}`);

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
    this._isFlashing = false;
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
   * 开始闪烁流程
   */
  private startFlashing(): void {
    const { flashCount = 3, flashDuration = 500 } = this._context.config;

    this._isFlashing = true;
    GameEvent.emit(EventName.FLASH_START);

    // 创建临时高亮泡泡用于闪烁
    this.createFlashHighlights();

    let currentFlash = 0;

    const doFlash = () => {
      if (currentFlash >= flashCount) {
        // 闪烁结束
        this.finishFlashing();
        return;
      }

      // 显示高亮泡泡
      this.showFlashHighlights();

      this._context.scheduleOnce(() => {
        // 隐藏高亮泡泡
        this.hideFlashHighlights();

        this._context.scheduleOnce(() => {
          currentFlash++;
          doFlash();
        }, flashDuration / 1000);
      }, flashDuration / 1000);
    };

    // 开始闪烁
    doFlash();
  }

  /**
   * 闪烁结束
   */
  private finishFlashing(): void {
    // 移除临时高亮泡泡
    this.removeFlashHighlights();

    this._isFlashing = false;
    GameEvent.emit(EventName.FLASH_END);

    log(`[MemoryMode] 闪烁结束，准备开始游戏`);

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
   * 显示临时高亮泡泡
   */
  private showFlashHighlights(): void {
    this._context.highlightBubbles.forEach(data => {
      if (data.flashNode) {
        data.flashNode.active = true;
      }
    });
  }

  /**
   * 隐藏临时高亮泡泡
   */
  private hideFlashHighlights(): void {
    this._context.highlightBubbles.forEach(data => {
      if (data.flashNode) {
        data.flashNode.active = false;
      }
    });
  }

  /**
   * 移除临时高亮泡泡
   */
  private removeFlashHighlights(): void {
    this._context.highlightBubbles.forEach(data => {
      if (data.flashNode) {
        this._context.recycleFlashNode(data.flashNode);
        data.flashNode = null;
      }
    });
  }
}
