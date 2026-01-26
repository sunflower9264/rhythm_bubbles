/**
 * @file BubbleArea.ts
 * @description 泡泡区域组件，只负责泡泡的生成、布局和动画
 * @author YourName
 * @date 2026-01-24
 */

import { _decorator, Component, Node, Prefab, UITransform, log } from 'cc';
import { BubblePool, BubbleType } from '../utils/BubblePool';
import { BubbleItem, BubbleState, IBubbleClickData } from './BubbleItem';
import { GameEvent, EventName } from '../data/GameEvent';
import { ILevelConfig, GameMode, getLevelConfig } from '../data/LevelConfig';
import { getGenerator } from '../utils/GeneratorFactory';
import { IBubbleGenerateResult } from '../utils/IBubbleGenerator';
import { IGameMode, IGameModeContext, IGameModeCallbacks, IBubbleData } from '../modes/IGameMode';
import { createGameMode } from '../modes/GameModeFactory';

const { ccclass, property } = _decorator;

// ========== 布局信息接口 ==========

/** 布局信息接口 */
interface ILayoutInfo {
  cellWidth: number;
  cellHeight: number;
  bubbleScale: number;
  startX: number;
  startY: number;
}

// ========== 泡泡区域管理器 ==========

@ccclass('BubbleArea')
export class BubbleArea extends Component {

  // ========== 单例 ==========
  private static _instance: BubbleArea = null;

  public static get instance(): BubbleArea {
    return this._instance;
  }

  // ========== 属性定义 ==========
  @property({ type: Node, tooltip: '泡泡生成区域' })
  private bubbleArea: Node = null;

  @property({ type: Prefab, tooltip: '高亮泡泡预制体' })
  private highlightBubblePrefab: Prefab = null;

  @property({ type: Prefab, tooltip: '普通泡泡预制体' })
  private normalBubblePrefab: Prefab = null;

  // ========== 常量 ==========
  private readonly BUBBLE_SIZE: number = 120;
  private readonly BUBBLE_SCALE_RATIO: number = 0.9;

  // ========== 私有变量 ==========
  private _bubblePool: BubblePool = null;
  private _bubbleList: IBubbleData[] = [];
  private _highlightBubbles: IBubbleData[] = [];
  private _currentConfig: ILevelConfig = null;
  private _generateResult: IBubbleGenerateResult = null;
  private _layoutInfo: ILayoutInfo = null;

  /** 当前游戏模式管理器 */
  private _gameMode: IGameMode = null;

  // ========== 生命周期 ==========
  protected onLoad(): void {
    if (BubbleArea._instance === null) {
      BubbleArea._instance = this;
    } else {
      this.destroy();
      return;
    }
    this._bubblePool = new BubblePool(this.normalBubblePrefab, this.highlightBubblePrefab);
  }

  protected onEnable(): void {
    this.registerEvents();
  }

  protected onDisable(): void {
    this.unregisterEvents();
  }

  protected onDestroy(): void {
    if (BubbleArea._instance === this) {
      BubbleArea._instance = null;
    }
    this.clearBubbles();
    this._bubblePool?.clearAll();
    this._gameMode?.cleanup();
  }

  // ========== 公共方法 ==========

  /**
   * 加载关卡并生成泡泡
   * @param mode 游戏模式
   * @param level 关卡数
   * @param lastHighlightCount 上一关的高亮数量（用于保证递增）
   * @returns 生成结果信息
   */
  public loadLevel(mode: GameMode, level: number, lastHighlightCount: number = 0): {
    highlightIndices: number[];
    clickOrder?: number[];
    highlightCount: number;
  } {
    log(`[BubbleArea] 加载关卡: 模式=${mode}, 关卡=${level}`);

    // 清理上一关的资源
    this.cleanupCurrentMode();
    this.clearBubbles();

    // 获取关卡配置
    this._currentConfig = getLevelConfig(mode, level);
    const generator = getGenerator(this._currentConfig.mode);
    this._generateResult = generator.generate(this._currentConfig, lastHighlightCount);

    // 计算布局
    this._layoutInfo = this.calculateLayout();
    const { types } = this._generateResult;

    // 记忆模式和顺序模式下，全部生成普通泡泡
    const isMemoryOrSequence = mode === GameMode.MEMORY || mode === GameMode.SEQUENCE;

    // 创建所有泡泡
    let index = 0;
    for (let row = 0; row < this._currentConfig.rows; row++) {
      for (let col = 0; col < this._currentConfig.cols; col++) {
        const originalType = types[index];
        const actualType = isMemoryOrSequence ? BubbleType.NORMAL : originalType;
        const bubbleData = this.createAndPlaceBubble(actualType, row, col, index, this._layoutInfo);

        // 记录哪些位置是"正确答案"
        if (originalType === BubbleType.HIGHLIGHT) {
          this._highlightBubbles.push(bubbleData);
        }

        index++;
      }
    }

    log(`[BubbleArea] 关卡 ${level} - 模式: ${mode}, 高亮数量: ${this._highlightBubbles.length}`);

    // 初始化游戏模式（不启动，等 GameManager 设置好数据后调用 startMode）
    this.initGameMode();

    // 返回生成结果
    return {
      highlightIndices: this._highlightBubbles.map(b => b.index),
      clickOrder: this._generateResult?.clickOrder,
      highlightCount: this._highlightBubbles.length,
    };
  }

  /**
   * 获取当前高亮泡泡数量
   */
  public get highlightCount(): number {
    return this._highlightBubbles.length;
  }

  /**
   * 清空所有泡泡
   */
  public clearBubbles(): void {
    this._bubbleList.forEach(data => {
      // 回收临时高亮节点
      if (data.flashNode) {
        this._bubblePool.recycleBubble(data.flashNode, BubbleType.HIGHLIGHT);
        data.flashNode = null;
      }
      this._bubblePool.recycleBubble(data.node, data.type);
    });
    this._bubbleList = [];
    this._highlightBubbles = [];
  }

  // ========== 游戏模式管理 ==========

  /**
   * 清理当前模式
   */
  private cleanupCurrentMode(): void {
    if (this._gameMode) {
      this._gameMode.cleanup();
      this._gameMode = null;
    }
  }

  /**
   * 初始化游戏模式（只初始化，不启动）
   */
  private initGameMode(): void {
    // 创建游戏模式实例
    this._gameMode = createGameMode(this._currentConfig.mode);

    // 创建模式上下文
    const context: IGameModeContext = {
      config: this._currentConfig,
      generateResult: this._generateResult,
      bubbleList: this._bubbleList,
      highlightBubbles: this._highlightBubbles,
      createFlashNode: this.createFlashNode.bind(this),
      recycleFlashNode: this.recycleFlashNode.bind(this),
      scheduleOnce: this.scheduleOnce.bind(this),
      unscheduleAllCallbacks: this.unscheduleAllCallbacks.bind(this),
    };

    // 创建回调
    const callbacks: IGameModeCallbacks = {
      onReady: this.onModeReady.bind(this),
      onCorrectClick: () => { },
      onWrongClick: () => { },
      onAllCleared: () => { },
    };

    // 初始化模式
    this._gameMode.init(context, callbacks);
  }

  /**
   * 启动当前游戏模式（由 GameManager 调用）
   */
  public startMode(): void {
    if (this._gameMode) {
      this._gameMode.start();
    }
  }

  /**
   * 创建临时高亮泡泡节点
   */
  private createFlashNode(bubbleData: IBubbleData): Node {
    const flashNode = this._bubblePool.getBubble(BubbleType.HIGHLIGHT);
    flashNode.setScale(this._layoutInfo.bubbleScale, this._layoutInfo.bubbleScale, 1);
    flashNode.setPosition(bubbleData.node.position.clone());
    flashNode.parent = this.bubbleArea;
    flashNode.active = false;

    // 初始化临时高亮泡泡
    let flashItem = flashNode.getComponent(BubbleItem);
    if (!flashItem) {
      flashItem = flashNode.addComponent(BubbleItem);
    }
    flashItem.init(BubbleType.HIGHLIGHT, bubbleData.row, bubbleData.col, bubbleData.index);

    return flashNode;
  }

  /**
   * 回收临时高亮泡泡节点
   */
  private recycleFlashNode(node: Node): void {
    this._bubblePool.recycleBubble(node, BubbleType.HIGHLIGHT);
  }

  // ========== 模式回调处理 ==========

  /**
   * 模式准备就绪（记忆/顺序模式闪烁完成后调用）
   */
  private onModeReady(): void {
    log(`[BubbleArea] 模式准备就绪`);
    // 发送事件通知 GameManager
    GameEvent.emit(EventName.MODE_READY);
  }

  // ========== 布局计算 ==========

  private calculateLayout(): ILayoutInfo {
    const { rows, cols } = this._currentConfig;
    const transform = this.bubbleArea.getComponent(UITransform);
    const areaWidth = transform.width;
    const areaHeight = transform.height;

    const cellWidth = areaWidth / cols;
    const cellHeight = areaHeight / rows;
    const bubbleSize = Math.min(cellWidth, cellHeight) * this.BUBBLE_SCALE_RATIO;

    return {
      cellWidth,
      cellHeight,
      bubbleScale: bubbleSize / this.BUBBLE_SIZE,
      startX: -areaWidth / 2 + cellWidth / 2,
      startY: areaHeight / 2 - cellHeight / 2,
    };
  }

  // ========== 泡泡操作 ==========

  private createAndPlaceBubble(
    type: BubbleType,
    row: number,
    col: number,
    index: number,
    layout: ILayoutInfo
  ): IBubbleData {
    const node = this._bubblePool.getBubble(type);
    const posX = layout.startX + col * layout.cellWidth;
    const posY = layout.startY - row * layout.cellHeight;

    node.setScale(layout.bubbleScale, layout.bubbleScale, 1);
    node.setPosition(posX, posY, 0);
    node.parent = this.bubbleArea;

    // 获取或添加 BubbleItem 组件
    let item = node.getComponent(BubbleItem);
    if (!item) {
      item = node.addComponent(BubbleItem);
    }
    item.init(type, row, col, index);

    const bubbleData: IBubbleData = { row, col, index, type, node, item };
    this._bubbleList.push(bubbleData);

    return bubbleData;
  }

  /**
   * 根据索引获取泡泡数据
   */
  private getBubbleByIndex(index: number): IBubbleData | null {
    return this._bubbleList.find(b => b.index === index) || null;
  }

  // ========== 事件处理 ==========

  private registerEvents(): void {
    GameEvent.on(EventName.BUBBLE_CORRECT, this.onBubbleCorrect, this);
    GameEvent.on(EventName.BUBBLE_WRONG, this.onBubbleWrong, this);
  }

  private unregisterEvents(): void {
    GameEvent.off(EventName.BUBBLE_CORRECT, this.onBubbleCorrect, this);
    GameEvent.off(EventName.BUBBLE_WRONG, this.onBubbleWrong, this);
  }

  /**
   * 处理正确点击事件（由 GameManager 发出）
   */
  private onBubbleCorrect(data: IBubbleClickData): void {
    log(`[BubbleArea] 收到正确点击事件: ${data.index}`);

    // 找到对应的泡泡数据并处理动画
    const bubbleData = this.getBubbleByIndex(data.index);
    if (bubbleData) {
      // 移除临时高亮节点（如果有）
      if (bubbleData.flashNode) {
        this._bubblePool.recycleBubble(bubbleData.flashNode, BubbleType.HIGHLIGHT);
        bubbleData.flashNode = null;
      }

      // 禁用泡泡
      bubbleData.item.setState(BubbleState.DISABLED);

      // 播放泡泡动画
      bubbleData.item.playClickAnimation(() => {
        bubbleData.item.setState(BubbleState.CLEARED);
      });
    }
  }

  /**
   * 处理错误点击事件（由 GameManager 发出）
   */
  private onBubbleWrong(data: IBubbleClickData): void {
    log(`[BubbleArea] 收到错误点击事件: ${data.index}`);

    // 找到对应的泡泡数据
    const bubbleData = this.getBubbleByIndex(data.index);
    if (bubbleData) {
      // 播放错误动画
      bubbleData.item.playClickAnimation();
    }
  }

  /**
   * 检查是否还有高亮泡泡未点击
   */
  public hasRemainingHighlights(): boolean {
    return this._highlightBubbles.some(data => {
      return data.item.state !== BubbleState.CLEARED &&
        data.item.state !== BubbleState.DISABLED;
    });
  }

  // ========== 暂停和恢复 ==========

  /**
   * 暂停游戏模式
   */
  public pauseMode(): void {
    if (this._gameMode && this._gameMode.pause) {
      this._gameMode.pause();
    }
  }

  /**
   * 恢复游戏模式
   */
  public resumeMode(): void {
    if (this._gameMode && this._gameMode.resume) {
      this._gameMode.resume();
    }
  }
}
