/**
 * @file GameManager.ts
 * @description 游戏主管理器，控制游戏状态、关卡流程、倒计时
 * @author YourName
 * @date 2026-01-24
 */

import { _decorator, Component, Prefab, instantiate, find, Node, log, director } from 'cc';
import { GameEvent, EventName } from '../data/GameEvent';
import { IBubbleClickData } from '../components/BubbleItem';
import { BubbleType } from '../utils/BubblePool';
import { GameMode } from '../data/LevelConfig';
import { AudioManager, SFXType } from './AudioManager';
import { GameOverMenu } from '../components/GameOverMenu';
import { BubbleArea } from '../components/BubbleArea';

const { ccclass, property } = _decorator;

/** 游戏状态枚举 */
export enum GameState {
  /** 空闲/等待开始 */
  IDLE = 0,
  /** 游戏进行中 */
  PLAYING = 1,
  /** 暂停 */
  PAUSED = 2,
  /** 游戏结束 */
  GAME_OVER = 3,
  /** 显示序列中（顺序模式） */
  SHOWING_SEQUENCE = 4,
  /** 闪烁中（记忆模式） */
  FLASHING = 5,
  /** 准备中（生成泡泡后等待模式就绪） */
  PREPARING = 6,
}

@ccclass('GameManager')
export class GameManager extends Component {

  // ========== 单例 ==========
  private static _instance: GameManager = null;

  public static get instance(): GameManager {
    return this._instance;
  }

  // ========== 属性定义 ==========
  @property({ type: Prefab, tooltip: '游戏结束菜单预制体' })
  private gameOverMenuPrefab: Prefab = null;

  // ========== 私有变量 ==========
  private _state: GameState = GameState.IDLE;
  private _score: number = 0;
  private _currentLevel: number = 1;
  private _currentMode: GameMode = GameMode.CLASSIC;

  /** 顺序模式：期望的点击顺序 */
  private _expectedClickOrder: number[] = [];
  /** 顺序模式：当前点击索引 */
  private _currentClickIndex: number = 0;

  /** 剩余需要点击的高亮泡泡数量 */
  private _remainingHighlights: number = 0;
  /** 高亮泡泡索引集合 */
  private _highlightIndices: Set<number> = new Set();
  /** 原始高亮泡泡索引数组（顺序模式使用，不会被修改） */
  private _originalHighlightIndices: number[] = [];
  /** 上一关的高亮数量（用于保证递增） */
  private _lastHighlightCount: number = 0;

  /** 游戏结束菜单节点 */
  private _gameOverMenuNode: Node = null;

  // ========== 倒计时相关 ==========
  /** 倒计时总时间（秒） */
  private _countdownTime: number = 0;
  /** 剩余时间（秒） */
  private _remainingTime: number = 0;
  /** 暂停前的剩余时间 */
  private _pausedRemainingTime: number = 0;

  // ========== 生命周期 ==========
  protected onLoad(): void {
    if (GameManager._instance === null) {
      GameManager._instance = this;
    } else {
      this.destroy();
      return;
    }
  }

  protected start(): void {
    // 检查是否从启动场景传入了游戏模式
    const selectedMode = (director as any)._selectedGameMode;
    if (selectedMode !== undefined) {
      log(`[GameManager] 检测到选择的游戏模式: ${selectedMode}`);
      delete (director as any)._selectedGameMode;
      this.startGameWithMode(selectedMode);
    } else {
      log(`[GameManager] 未检测到游戏模式，使用默认经典模式`);
      this.startGameWithMode(GameMode.CLASSIC);
    }
  }

  protected onEnable(): void {
    this.registerEvents();
  }

  protected onDisable(): void {
    this.unregisterEvents();
  }

  protected onDestroy(): void {
    // 停止背景音乐
    if (AudioManager.instance) {
      AudioManager.instance.stopBGM();
    }

    if (GameManager._instance === this) {
      GameManager._instance = null;
    }
  }

  // ========== 公共属性 ==========

  public get state(): GameState {
    return this._state;
  }

  public get score(): number {
    return this._score;
  }

  public get currentLevel(): number {
    return this._currentLevel;
  }

  public get currentMode(): GameMode {
    return this._currentMode;
  }

  // ========== 游戏流程 ==========

  /**
   * 以指定游戏模式开始游戏
   */
  public startGameWithMode(mode: GameMode, startLevel: number = 1): void {
    log(`[GameManager] 以模式 ${mode} 开始游戏，关卡: ${startLevel}`);

    // 停止之前的倒计时
    this.stopCountdown();

    // 重置状态
    this._currentMode = mode;
    this._currentLevel = startLevel;
    this._score = 0;
    this._lastHighlightCount = 0;
    this._state = GameState.PREPARING;

    // 播放背景音乐
    if (AudioManager.instance) {
      AudioManager.instance.playBGM('game_bgm', true);
    }

    // 发送初始UI更新事件
    GameEvent.emit(EventName.GAME_START);
    GameEvent.emit(EventName.SCORE_UPDATE, this._score);
    GameEvent.emit(EventName.LEVEL_INFO_UPDATE, this._currentLevel);

    // 加载关卡
    this.loadLevel(this._currentLevel);
  }

  /**
   * 加载关卡
   */
  private loadLevel(level: number): void {
    log(`[GameManager] 加载关卡 ${level}`);
    this._currentLevel = level;
    this._state = GameState.PREPARING;

    // 通过 BubbleArea 生成泡泡
    if (!BubbleArea.instance) {
      log('[GameManager] 错误: BubbleArea 实例不存在');
      return;
    }

    const result = BubbleArea.instance.loadLevel(
      this._currentMode,
      level,
      this._lastHighlightCount
    );

    // 设置关卡信息
    this._highlightIndices = new Set(result.highlightIndices);
    this._originalHighlightIndices = [...result.highlightIndices];
    this._remainingHighlights = result.highlightCount;
    this._lastHighlightCount = result.highlightCount;
    this._currentClickIndex = 0;

    if (result.clickOrder) {
      this._expectedClickOrder = [...result.clickOrder];
    } else {
      this._expectedClickOrder = [];
    }

    log(`[GameManager] 关卡信息: 高亮数量=${result.highlightCount}, 高亮索引=${result.highlightIndices}`);

    // 数据设置完成后，启动游戏模式
    BubbleArea.instance.startMode();
  }

  /**
   * 进入下一关
   */
  private nextLevel(): void {
    this._currentLevel++;
    log(`[GameManager] 进入关卡 ${this._currentLevel}`);

    // 播放过关音效
    if (AudioManager.instance) {
      AudioManager.instance.playSFX(SFXType.LEVEL_COMPLETE);
    }

    GameEvent.emit(EventName.LEVEL_INFO_UPDATE, this._currentLevel);

    // 加载新关卡
    this.loadLevel(this._currentLevel);
  }

  /**
   * 游戏结束
   */
  public gameOver(): void {
    log('[GameManager] 游戏结束');
    this._state = GameState.GAME_OVER;
    this.stopCountdown();

    // 播放失败音效
    if (AudioManager.instance) {
      AudioManager.instance.playSFX(SFXType.LEVEL_FAILED);
    }

    // 显示游戏结束菜单
    this.showGameOverMenu();

    GameEvent.emit(EventName.GAME_OVER, {
      score: this._score,
      level: this._currentLevel,
    });
  }

  /**
   * 显示游戏结束菜单
   */
  private showGameOverMenu(): void {
    if (this._gameOverMenuNode) {
      this._gameOverMenuNode.destroy();
      this._gameOverMenuNode = null;
    }

    if (!this.gameOverMenuPrefab) {
      log('[GameManager] 游戏结束菜单预制体未设置');
      return;
    }

    this._gameOverMenuNode = instantiate(this.gameOverMenuPrefab);

    const popupLayer = find('Canvas/PopupLayer');
    if (popupLayer) {
      this._gameOverMenuNode.parent = popupLayer;
    } else {
      const canvas = find('Canvas');
      if (canvas) {
        this._gameOverMenuNode.parent = canvas;
      }
    }

    const menuComp = this._gameOverMenuNode.getComponent(GameOverMenu);
    if (menuComp) {
      menuComp.show(this._score, this._currentLevel);
    }
  }

  /**
   * 暂停游戏
   */
  public pauseGame(): void {
    if (this._state === GameState.PLAYING) {
      log('[GameManager] 游戏暂停');
      this._state = GameState.PAUSED;

      // 保存剩余时间并停止倒计时
      this._pausedRemainingTime = this._remainingTime;
      this.unschedule(this.onCountdownTick);

      // 通知 BubbleArea 暂停
      if (BubbleArea.instance) {
        BubbleArea.instance.pauseMode();
      }

      GameEvent.emit(EventName.GAME_PAUSE);
    }
  }

  /**
   * 恢复游戏
   */
  public resumeGame(): void {
    if (this._state === GameState.PAUSED) {
      log('[GameManager] 游戏恢复');
      this._state = GameState.PLAYING;

      // 恢复倒计时
      if (this._pausedRemainingTime > 0) {
        this._remainingTime = this._pausedRemainingTime;
        this.schedule(this.onCountdownTick, 1.0);
      }

      // 通知 BubbleArea 恢复
      if (BubbleArea.instance) {
        BubbleArea.instance.resumeMode();
      }

      GameEvent.emit(EventName.GAME_RESUME);
    }
  }

  /**
   * 增加分数
   */
  public addScore(points: number): void {
    this._score += points;
    GameEvent.emit(EventName.SCORE_UPDATE, this._score);
  }

  // ========== 倒计时管理 ==========

  /**
   * 计算倒计时时间（基于高亮数量）
   */
  private calculateCountdownTime(): number {
    const highlightCount = this._remainingHighlights;
    // 基础时间：每个高亮泡泡2秒
    const baseTime = highlightCount * 2;
    // 额外时间：根据模式增加
    let extraTime = 0;
    switch (this._currentMode) {
      case GameMode.CLASSIC:
        extraTime = 3;
        break;
      case GameMode.MEMORY:
        extraTime = 5;
        break;
      case GameMode.SEQUENCE:
        extraTime = 5;
        break;
    }
    return baseTime + extraTime;
  }

  /**
   * 启动倒计时
   */
  private startCountdown(): void {
    this._countdownTime = this.calculateCountdownTime();
    this._remainingTime = this._countdownTime;

    log(`[GameManager] 启动倒计时: ${this._countdownTime}秒`);

    GameEvent.emit(EventName.TIME_UPDATE, this._remainingTime);

    this.unschedule(this.onCountdownTick);
    this.schedule(this.onCountdownTick, 1.0);
  }

  /**
   * 停止倒计时
   */
  private stopCountdown(): void {
    this.unschedule(this.onCountdownTick);
    log(`[GameManager] 停止倒计时`);
  }

  /**
   * 倒计时每秒回调
   */
  private onCountdownTick(): void {
    this._remainingTime--;
    GameEvent.emit(EventName.TIME_UPDATE, this._remainingTime);

    log(`[GameManager] 倒计时: ${this._remainingTime}秒`);

    if (this._remainingTime <= 0) {
      this.stopCountdown();
      this.onTimeUp();
    }
  }

  /**
   * 倒计时结束处理
   */
  private onTimeUp(): void {
    log(`[GameManager] 倒计时结束！`);

    // 检查是否还有高亮泡泡未点击
    if (BubbleArea.instance && BubbleArea.instance.hasRemainingHighlights()) {
      log(`[GameManager] 还有高亮泡泡未点击，游戏失败！`);
      GameEvent.emit(EventName.TIME_UP);
      this.gameOver();
    }
  }

  // ========== 事件处理 ==========

  private registerEvents(): void {
    GameEvent.on(EventName.BUBBLE_CLICK, this.onBubbleClick, this);
    GameEvent.on(EventName.GAME_RESTART, this.onGameRestart, this);
    GameEvent.on(EventName.MODE_READY, this.onModeReady, this);
    GameEvent.on(EventName.GAME_PAUSE, this.onGamePause, this);
    GameEvent.on(EventName.GAME_RESUME, this.onGameResume, this);
  }

  private unregisterEvents(): void {
    GameEvent.off(EventName.BUBBLE_CLICK, this.onBubbleClick, this);
    GameEvent.off(EventName.GAME_RESTART, this.onGameRestart, this);
    GameEvent.off(EventName.MODE_READY, this.onModeReady, this);
    GameEvent.off(EventName.GAME_PAUSE, this.onGamePause, this);
    GameEvent.off(EventName.GAME_RESUME, this.onGameResume, this);
  }

  /**
   * 模式准备就绪（由 BubbleArea 发出）
   */
  private onModeReady(): void {
    log(`[GameManager] 模式准备就绪，开始游戏`);
    this._state = GameState.PLAYING;
    this.startCountdown();
  }

  /**
   * 处理游戏暂停事件
   */
  private onGamePause(): void {
    this.pauseGame();
  }

  /**
   * 处理游戏恢复事件
   */
  private onGameResume(): void {
    this.resumeGame();
  }

  /**
   * 处理游戏重新开始
   */
  private onGameRestart(): void {
    log('[GameManager] 游戏重新开始');

    // 销毁游戏结束菜单
    if (this._gameOverMenuNode) {
      this._gameOverMenuNode.destroy();
      this._gameOverMenuNode = null;
    }

    // 重新开始游戏
    this.startGameWithMode(this._currentMode);
  }

  /**
   * 处理泡泡点击
   */
  private onBubbleClick(data: IBubbleClickData): void {
    log(`[GameManager] onBubbleClick: index=${data.index}, state=${this._state}, highlightIndices=${Array.from(this._highlightIndices)}`);

    if (this._state !== GameState.PLAYING) {
      log(`[GameManager] 点击被忽略 - 状态不是 PLAYING (当前: ${this._state})`);
      return;
    }

    const isHighlight = data.type === BubbleType.HIGHLIGHT;
    const positionIndex = data.index;

    let isCorrect = false;

    switch (this._currentMode) {
      case GameMode.CLASSIC:
        // 经典模式：泡泡必须是高亮类型且在高亮索引中
        isCorrect = isHighlight && this._highlightIndices.has(positionIndex);
        break;
      case GameMode.MEMORY:
        // 记忆模式：所有泡泡都显示为普通类型，只根据位置索引判定
        isCorrect = this._highlightIndices.has(positionIndex);
        break;
      case GameMode.SEQUENCE:
        // 顺序模式：按顺序点击，使用位置索引判定
        isCorrect = this.checkSequenceClick(positionIndex);
        break;
    }

    if (isCorrect) {
      this.handleCorrectClick(data);
    } else {
      this.handleWrongClick(data);
    }
  }

  /**
   * 检查顺序模式的点击是否正确
   */
  private checkSequenceClick(positionIndex: number): boolean {
    if (this._currentClickIndex >= this._expectedClickOrder.length) {
      return false;
    }

    const expectedHighlightIndex = this._expectedClickOrder[this._currentClickIndex];
    // 使用原始高亮索引数组（不会随点击而改变）
    const expectedPositionIndex = this._originalHighlightIndices[expectedHighlightIndex];

    return positionIndex === expectedPositionIndex;
  }

  /**
   * 处理正确点击
   */
  private handleCorrectClick(data: IBubbleClickData): void {
    if (AudioManager.instance) {
      AudioManager.instance.playSFX(SFXType.BUBBLE_PRESS);
    }

    this._highlightIndices.delete(data.index);
    this._remainingHighlights--;

    if (this._currentMode === GameMode.SEQUENCE) {
      this._currentClickIndex++;
    }

    this.addScore(10);

    GameEvent.emit(EventName.BUBBLE_CORRECT, data);

    if (this._remainingHighlights <= 0) {
      this.onAllHighlightsCleared();
    }
  }

  /**
   * 处理错误点击
   */
  private handleWrongClick(data: IBubbleClickData): void {
    if (AudioManager.instance) {
      AudioManager.instance.playSFX(SFXType.BUBBLE_PRESS);
    }

    GameEvent.emit(EventName.BUBBLE_WRONG, data);
    this.gameOver();
  }

  /**
   * 所有高亮泡泡已清除
   */
  private onAllHighlightsCleared(): void {
    log('[GameManager] 所有高亮泡泡已清除');
    this.stopCountdown();

    GameEvent.emit(EventName.ALL_HIGHLIGHT_CLEARED);

    // 延迟进入下一关
    this.scheduleOnce(() => {
      this.nextLevel();
    }, 0.8);
  }
}
