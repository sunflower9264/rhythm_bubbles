/**
 * @file UIManager.ts
 * @description UI管理器，负责更新关卡、倒计时、得分等UI显示
 * @author YourName
 * @date 2026-01-25
 */

import { _decorator, Component, Node, Label, log } from 'cc';
import { GameEvent, EventName } from '../data/GameEvent';

const { ccclass, property } = _decorator;

@ccclass('UIManager')
export class UIManager extends Component {

  // ========== 单例 ==========
  private static _instance: UIManager = null;

  public static get instance(): UIManager {
    return this._instance;
  }

  // ========== 属性定义 ==========
  @property({ type: Label, tooltip: '关卡数字显示' })
  private levelNumLabel: Label = null;

  @property({ type: Label, tooltip: '倒计时数字显示' })
  private timeNumLabel: Label = null;

  @property({ type: Label, tooltip: '得分数字显示' })
  private scoreNumLabel: Label = null;

  // ========== 私有变量 ==========
  private _currentLevel: number = 1;
  private _currentScore: number = 0;
  private _remainingTime: number = 0;

  // ========== 生命周期 ==========
  protected onLoad(): void {
    if (UIManager._instance === null) {
      UIManager._instance = this;
    } else {
      this.destroy();
      return;
    }

    this.initUI();
  }

  protected onEnable(): void {
    this.registerEvents();
  }

  protected onDisable(): void {
    this.unregisterEvents();
  }

  protected onDestroy(): void {
    if (UIManager._instance === this) {
      UIManager._instance = null;
    }
  }

  // ========== 公共方法 ==========

  /**
   * 更新关卡显示
   * @param level 关卡号
   */
  public updateLevel(level: number): void {
    this._currentLevel = level;
    if (this.levelNumLabel) {
      this.levelNumLabel.string = level.toString();
    }
  }

  /**
   * 更新得分显示
   * @param score 分数
   */
  public updateScore(score: number): void {
    this._currentScore = score;
    if (this.scoreNumLabel) {
      this.scoreNumLabel.string = score.toString();
    }
  }

  /**
   * 更新倒计时显示
   * @param time 剩余时间（秒）
   */
  public updateTime(time: number): void {
    this._remainingTime = time;
    if (this.timeNumLabel) {
      this.timeNumLabel.string = time.toString();
    }
  }

  /**
   * 获取当前关卡
   */
  public get currentLevel(): number {
    return this._currentLevel;
  }

  /**
   * 获取当前得分
   */
  public get currentScore(): number {
    return this._currentScore;
  }

  /**
   * 获取剩余时间
   */
  public get remainingTime(): number {
    return this._remainingTime;
  }

  // ========== 私有方法 ==========

  /**
   * 初始化UI
   */
  private initUI(): void {
    this.updateLevel(1);
    this.updateScore(0);
    this.updateTime(0);
  }

  // ========== 事件处理 ==========

  private registerEvents(): void {
    GameEvent.on(EventName.LEVEL_INFO_UPDATE, this.onLevelUpdate, this);
    GameEvent.on(EventName.SCORE_UPDATE, this.onScoreUpdate, this);
    GameEvent.on(EventName.TIME_UPDATE, this.onTimeUpdate, this);
    GameEvent.on(EventName.GAME_START, this.onGameStart, this);
  }

  private unregisterEvents(): void {
    GameEvent.off(EventName.LEVEL_INFO_UPDATE, this.onLevelUpdate, this);
    GameEvent.off(EventName.SCORE_UPDATE, this.onScoreUpdate, this);
    GameEvent.off(EventName.TIME_UPDATE, this.onTimeUpdate, this);
    GameEvent.off(EventName.GAME_START, this.onGameStart, this);
  }

  private onLevelUpdate(level: number): void {
    log(`[UIManager] 关卡更新: ${level}`);
    this.updateLevel(level);
  }

  private onScoreUpdate(score: number): void {
    log(`[UIManager] 得分更新: ${score}`);
    this.updateScore(score);
  }

  private onTimeUpdate(time: number): void {
    this.updateTime(time);
  }

  private onGameStart(): void {
    log(`[UIManager] 游戏开始，重置UI`);
    this.updateLevel(1);
    this.updateScore(0);
    this.updateTime(0);
  }
}
