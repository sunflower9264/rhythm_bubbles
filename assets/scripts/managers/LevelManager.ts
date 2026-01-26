/**
 * @file LevelManager.ts
 * @description 关卡管理器，负责关卡配置加载和进度管理
 * @author YourName
 * @date 2026-01-24
 */

import { _decorator, Component } from 'cc';
import { GameEvent, EventName } from '../data/GameEvent';
import { ILevelConfig, getLevelConfig, GameMode } from '../data/LevelConfig';

const { ccclass, property } = _decorator;

@ccclass('LevelManager')
export class LevelManager extends Component {

  // ========== 单例 ==========
  private static _instance: LevelManager = null;

  public static get instance(): LevelManager {
    return this._instance;
  }

  // ========== 私有变量 ==========
  private _currentLevel: number = 1;
  private _currentMode: GameMode = GameMode.CLASSIC;
  private _currentConfig: ILevelConfig = null;
  private _highestLevel: number = 1;

  // ========== 生命周期 ==========
  protected onLoad(): void {
    if (LevelManager._instance === null) {
      LevelManager._instance = this;
    } else {
      this.destroy();
      return;
    }

    this.loadProgress();
  }

  protected onEnable(): void {
    this.registerEvents();
  }

  protected onDisable(): void {
    this.unregisterEvents();
  }

  protected onDestroy(): void {
    if (LevelManager._instance === this) {
      LevelManager._instance = null;
    }
  }

  // ========== 公共方法 ==========

  /**
   * 获取当前关卡号
   */
  public get currentLevel(): number {
    return this._currentLevel;
  }

  /**
   * 获取当前关卡配置
   */
  public get currentConfig(): ILevelConfig {
    return this._currentConfig;
  }

  /**
   * 获取最高通关关卡
   */
  public get highestLevel(): number {
    return this._highestLevel;
  }

  /**
   * 获取当前游戏模式
   */
  public get currentMode(): GameMode {
    return this._currentMode;
  }

  /**
   * 设置游戏模式
   */
  public setMode(mode: GameMode): void {
    this._currentMode = mode;
  }

  /**
   * 加载指定关卡
   */
  public loadLevel(level: number, mode?: GameMode): ILevelConfig {
    this._currentLevel = level;
    if (mode !== undefined) {
      this._currentMode = mode;
    }
    this._currentConfig = getLevelConfig(this._currentMode, level);

    GameEvent.emit(EventName.LEVEL_INFO_UPDATE, {
      level: this._currentLevel,
      config: this._currentConfig,
    });

    return this._currentConfig;
  }

  /**
   * 加载下一关
   */
  public loadNextLevel(): ILevelConfig {
    return this.loadLevel(this._currentLevel + 1);
  }

  /**
   * 重新加载当前关卡
   */
  public reloadCurrentLevel(): ILevelConfig {
    return this.loadLevel(this._currentLevel);
  }

  /**
   * 标记当前关卡完成
   */
  public completeCurrentLevel(): void {
    if (this._currentLevel > this._highestLevel) {
      this._highestLevel = this._currentLevel;
      this.saveProgress();
    }
  }

  /**
   * 重置进度
   */
  public resetProgress(): void {
    this._currentLevel = 1;
    this._highestLevel = 1;
    this._currentConfig = null;
    this.saveProgress();
  }

  /**
   * 获取关卡配置（静态方法，方便外部调用）
   */
  public static getConfig(mode: GameMode, level: number): ILevelConfig {
    return getLevelConfig(mode, level);
  }

  // ========== 私有方法 ==========

  private registerEvents(): void {
    GameEvent.on(EventName.LEVEL_START, this.onLevelStart, this);
    GameEvent.on(EventName.LEVEL_COMPLETE, this.onLevelComplete, this);
  }

  private unregisterEvents(): void {
    GameEvent.off(EventName.LEVEL_START, this.onLevelStart, this);
    GameEvent.off(EventName.LEVEL_COMPLETE, this.onLevelComplete, this);
  }

  private onLevelStart(level: number): void {
    this.loadLevel(level);
  }

  private onLevelComplete(): void {
    this.completeCurrentLevel();
  }

  /**
   * 加载存档进度
   */
  private loadProgress(): void {
    // 从本地存储加载进度
    const savedLevel = localStorage.getItem('meowpop_highest_level');
    if (savedLevel) {
      this._highestLevel = parseInt(savedLevel, 10) || 1;
    }
  }

  /**
   * 保存进度
   */
  private saveProgress(): void {
    localStorage.setItem('meowpop_highest_level', this._highestLevel.toString());
  }
}
