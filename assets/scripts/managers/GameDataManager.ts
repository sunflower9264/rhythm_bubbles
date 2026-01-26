/**
 * @file GameDataManager.ts
 * @description 游戏数据管理器（单例），管理全局游戏数据
 * @author YourName
 * @date 2026-01-25
 */

import { _decorator, Component } from 'cc';
import { GameMode } from '../data/LevelConfig';

const { ccclass } = _decorator;

/**
 * 游戏数据管理器（单例）
 * 用于在场景间传递和保存游戏数据
 */
@ccclass('GameDataManager')
export class GameDataManager extends Component {

  // ========== 单例 ==========
  private static _instance: GameDataManager = null;

  public static get instance(): GameDataManager {
    return this._instance;
  }

  // ========== 游戏数据 ==========
  /** 选择的游戏模式 */
  private _selectedGameMode: GameMode = GameMode.CLASSIC;
  /** 最高分数 */
  private _highScore: number = 0;
  /** 当前分数 */
  private _currentScore: number = 0;

  // ========== 生命周期 ==========
  protected onLoad(): void {
    if (GameDataManager._instance === null) {
      GameDataManager._instance = this;
    } else {
      this.destroy();
      return;
    }
  }

  protected onDestroy(): void {
    if (GameDataManager._instance === this) {
      GameDataManager._instance = null;
    }
  }

  // ========== 公共方法 ==========

  /**
   * 设置选择的游戏模式
   */
  public setGameMode(mode: GameMode): void {
    this._selectedGameMode = mode;
  }

  /**
   * 获取选择的游戏模式
   */
  public getGameMode(): GameMode {
    return this._selectedGameMode;
  }

  /**
   * 设置当前分数
   */
  public setCurrentScore(score: number): void {
    this._currentScore = score;
    // 更新最高分
    if (score > this._highScore) {
      this._highScore = score;
    }
  }

  /**
   * 获取当前分数
   */
  public getCurrentScore(): number {
    return this._currentScore;
  }

  /**
   * 获取最高分
   */
  public getHighScore(): number {
    return this._highScore;
  }

  /**
   * 重置游戏数据
   */
  public reset(): void {
    this._selectedGameMode = GameMode.CLASSIC;
    this._currentScore = 0;
  }
}
