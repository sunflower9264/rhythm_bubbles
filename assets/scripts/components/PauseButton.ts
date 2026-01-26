/**
 * @file PauseButton.ts
 * @description 暂停按钮组件，处理暂停按钮点击和暂停菜单的显示
 * @author YourName
 * @date 2026-01-26
 */

import { _decorator, Component, Node, Button, Prefab, instantiate, log, find } from 'cc';
import { GameEvent, EventName } from '../data/GameEvent';
import { AudioManager } from '../managers/AudioManager';

const { ccclass, property } = _decorator;

@ccclass('PauseButton')
export class PauseButton extends Component {

  // ========== 属性定义 ==========
  @property({ type: Prefab, tooltip: '暂停菜单预制体' })
  private pauseMenuPrefab: Prefab = null;

  // ========== 私有变量 ==========
  private _pauseMenuNode: Node = null;
  private _isPaused: boolean = false;

  // ========== 生命周期 ==========
  protected onLoad(): void {
    this.registerButtonEvents();
  }

  protected onEnable(): void {
    this.registerGameEvents();
  }

  protected onDisable(): void {
    this.unregisterGameEvents();
  }

  protected onDestroy(): void {
    this.destroyPauseMenu();
  }

  // ========== 私有方法 ==========

  private registerButtonEvents(): void {
    const button = this.node.getComponent(Button);
    if (button) {
      this.node.on(Button.EventType.CLICK, this.onPauseClick, this);
    }
  }

  private registerGameEvents(): void {
    GameEvent.on(EventName.GAME_RESUME, this.onGameResume, this);
    GameEvent.on(EventName.GAME_OVER, this.onGameOver, this);
    GameEvent.on(EventName.GAME_RESTART, this.onGameRestart, this);
  }

  private unregisterGameEvents(): void {
    GameEvent.off(EventName.GAME_RESUME, this.onGameResume, this);
    GameEvent.off(EventName.GAME_OVER, this.onGameOver, this);
    GameEvent.off(EventName.GAME_RESTART, this.onGameRestart, this);
  }

  /**
   * 创建暂停菜单
   */
  private createPauseMenu(): void {
    if (this._pauseMenuNode || !this.pauseMenuPrefab) {
      return;
    }

    this._pauseMenuNode = instantiate(this.pauseMenuPrefab);

    // 放到 PopupLayer 下，确保显示在最上层
    const popupLayer = find('Canvas/PopupLayer');
    if (popupLayer) {
      this._pauseMenuNode.parent = popupLayer;
    } else {
      log('[PauseButton] 未找到 PopupLayer 节点');
      this._pauseMenuNode.parent = this.node.parent;
    }
  }

  /**
   * 销毁暂停菜单
   */
  private destroyPauseMenu(): void {
    if (this._pauseMenuNode) {
      this._pauseMenuNode.destroy();
      this._pauseMenuNode = null;
    }
  }

  /**
   * 显示暂停菜单
   */
  private showPauseMenu(): void {
    if (!this._pauseMenuNode) {
      this.createPauseMenu();
    }
    if (this._pauseMenuNode) {
      this._pauseMenuNode.active = true;
    }
  }

  /**
   * 隐藏暂停菜单
   */
  private hidePauseMenu(): void {
    if (this._pauseMenuNode) {
      this._pauseMenuNode.active = false;
    }
  }

  // ========== 事件回调 ==========

  /**
   * 暂停按钮点击
   */
  private onPauseClick(): void {
    if (this._isPaused) {
      return;
    }

    log('[PauseButton] 暂停游戏');
    this._isPaused = true;

    // 播放按钮音效
    if (AudioManager.instance) {
      AudioManager.instance.pauseBGM();
    }

    // 显示暂停菜单
    this.showPauseMenu();

    // 发送暂停事件
    GameEvent.emit(EventName.GAME_PAUSE);
  }

  /**
   * 游戏恢复回调
   */
  private onGameResume(): void {
    log('[PauseButton] 游戏恢复');
    this._isPaused = false;
    this.hidePauseMenu();
  }

  /**
   * 游戏结束回调
   */
  private onGameOver(): void {
    // 游戏结束时隐藏暂停菜单
    this._isPaused = false;
    this.hidePauseMenu();
  }

  /**
   * 游戏重新开始回调
   */
  private onGameRestart(): void {
    log('[PauseButton] 游戏重新开始');
    this._isPaused = false;
    // 销毁旧的暂停菜单，下次暂停时重新创建
    this.destroyPauseMenu();
  }
}
