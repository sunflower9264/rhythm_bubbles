/**
 * @file PauseMenu.ts
 * @description 暂停菜单组件，处理暂停菜单的显示和按钮交互
 * @author YourName
 * @date 2026-01-26
 */

import { _decorator, Component, Node, Button, director, log, Prefab, instantiate } from 'cc';
import { GameEvent, EventName } from '../data/GameEvent';
import { AudioManager, SFXType } from '../managers/AudioManager';
import { SettingsMenu } from './SettingsMenu';

const { ccclass, property } = _decorator;

@ccclass('PauseMenu')
export class PauseMenu extends Component {

  // ========== 属性定义 ==========
  @property({ type: Button, tooltip: '继续游戏按钮' })
  private btnResume: Button = null;

  @property({ type: Button, tooltip: '重新开始按钮' })
  private btnRestart: Button = null;

  @property({ type: Button, tooltip: '返回主菜单按钮' })
  private btnMainMenu: Button = null;

  @property({ type: Button, tooltip: '设置按钮' })
  private btnSettings: Button = null;

  @property({ type: Prefab, tooltip: '设置菜单预制体' })
  private settingsMenuPrefab: Prefab = null;

  // ========== 私有变量 ==========
  private _settingsMenuInstance: Node = null;

  // ========== 生命周期 ==========
  protected onLoad(): void {
    this.registerButtonEvents();
  }

  // ========== 公共方法 ==========

  /**
   * 显示暂停菜单
   */
  public show(): void {
    this.node.active = true;
  }

  /**
   * 隐藏暂停菜单
   */
  public hide(): void {
    this.node.active = false;
  }

  // ========== 私有方法 ==========

  private registerButtonEvents(): void {
    if (this.btnResume) {
      this.btnResume.node.on(Button.EventType.CLICK, this.onResumeClick, this);
    }
    if (this.btnRestart) {
      this.btnRestart.node.on(Button.EventType.CLICK, this.onRestartClick, this);
    }
    if (this.btnMainMenu) {
      this.btnMainMenu.node.on(Button.EventType.CLICK, this.onMainMenuClick, this);
    }
    if (this.btnSettings) {
      this.btnSettings.node.on(Button.EventType.CLICK, this.onSettingsClick, this);
    }
  }

  // ========== 事件回调 ==========

  /**
   * 继续游戏按钮点击
   */
  private onResumeClick(): void {
    log('[PauseMenu] 继续游戏');
    this.hide();
    AudioManager.instance.resumeBGM();
    GameEvent.emit(EventName.GAME_RESUME);
  }

  /**
   * 重新开始按钮点击
   */
  private onRestartClick(): void {
    log('[PauseMenu] 重新开始');
    this.hide();
    // 发送重新开始事件
    GameEvent.emit(EventName.GAME_RESTART);
  }

  /**
   * 返回主菜单按钮点击
   */
  private onMainMenuClick(): void {
    log('[PauseMenu] 返回主菜单');
    this.hide();
    // 加载主菜单场景
    director.loadScene('Start');
  }

  /**
   * 设置按钮点击
   */
  private onSettingsClick(): void {
    log('[PauseMenu] 打开设置菜单');

    if (!this._settingsMenuInstance && this.settingsMenuPrefab) {
      // 实例化设置菜单预制体
      this._settingsMenuInstance = instantiate(this.settingsMenuPrefab);
      this.node.parent.addChild(this._settingsMenuInstance);
    }

    if (this._settingsMenuInstance) {
      const settingsMenu = this._settingsMenuInstance.getComponent(SettingsMenu);
      settingsMenu?.show(true); // 从暂停菜单打开时隐藏设置菜单的遮罩
    }
  }
}
