/**
 * @file GameOverMenu.ts
 * @description 游戏失败菜单组件，处理游戏结束后的按钮交互
 * @author YourName
 * @date 2026-01-26
 */

import { _decorator, Component, Node, Button, Label, director, log } from 'cc';
import { GameEvent, EventName } from '../data/GameEvent';

const { ccclass, property } = _decorator;

@ccclass('GameOverMenu')
export class GameOverMenu extends Component {

  // ========== 属性定义 ==========
  @property({ type: Button, tooltip: '重新开始按钮' })
  private btnRestart: Button = null;

  @property({ type: Button, tooltip: '返回主菜单按钮' })
  private btnMainMenu: Button = null;

  @property({ type: Label, tooltip: '最终分数显示' })
  private lblScore: Label = null;

  @property({ type: Label, tooltip: '到达关卡显示' })
  private lblLevel: Label = null;

  // ========== 生命周期 ==========
  protected onLoad(): void {
    this.registerButtonEvents();
    this.registerGameEvents();
  }

  // ========== 公共方法 ==========

  /**
   * 显示游戏结束菜单
   * @param score 最终分数
   * @param level 到达的关卡
   */
  public show(score: number = 0, level: number = 1): void {
    this.node.active = true;
    this.updateDisplay(score, level);
  }

  /**
   * 隐藏游戏结束菜单
   */
  public hide(): void {
    this.node.active = false;
  }

  // ========== 私有方法 ==========

  private registerButtonEvents(): void {
    if (this.btnRestart) {
      this.btnRestart.node.on(Button.EventType.CLICK, this.onRestartClick, this);
    }
    if (this.btnMainMenu) {
      this.btnMainMenu.node.on(Button.EventType.CLICK, this.onMainMenuClick, this);
    }
  }

  private registerGameEvents(): void {
    GameEvent.on(EventName.GAME_RESTART, this.onGameRestart, this);
  }

  /**
   * 更新显示内容
   */
  private updateDisplay(score: number, level: number): void {
    if (this.lblScore) {
      this.lblScore.string = `${score}`;
    }
    if (this.lblLevel) {
      this.lblLevel.string = `${level}`;
    }
  }

  // ========== 事件回调 ==========

  /**
   * 重新开始按钮点击
   */
  private onRestartClick(): void {
    log('[GameOverMenu] 重新开始');
    // 发送重新开始事件
    GameEvent.emit(EventName.GAME_RESTART);
  }

  /**
   * 返回主菜单按钮点击
   */
  private onMainMenuClick(): void {
    log('[GameOverMenu] 返回主菜单');
    // 加载主菜单场景
    director.loadScene('Start');
  }

  /**
   * 游戏重新开始回调，销毁自己
   */
  private onGameRestart(): void {
    this.node.destroy();
  }
}
