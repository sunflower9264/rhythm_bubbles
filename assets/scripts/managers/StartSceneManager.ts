/**
 * @file StartSceneManager.ts
 * @description 启动场景管理器，处理游戏模式选择
 * @author YourName
 * @date 2026-01-25
 */

import { _decorator, Component, Node, director, log, Prefab, instantiate } from 'cc';
import { GameMode } from '../data/LevelConfig';
import { SettingsMenu } from '../components/SettingsMenu';

const { ccclass, property } = _decorator;

/**
 * 启动场景管理器
 * 在 Start 场景中挂载此组件，处理三个游戏模式按钮的点击事件
 */
@ccclass('StartSceneManager')
export class StartSceneManager extends Component {

  // ========== 属性定义 ==========
  @property({ type: Node, tooltip: '经典模式按钮' })
  private btnClassic: Node = null;

  @property({ type: Node, tooltip: '记忆模式按钮' })
  private btnMemory: Node = null;

  @property({ type: Node, tooltip: '顺序模式按钮' })
  private btnSequence: Node = null;

  @property({ type: Node, tooltip: '设置按钮' })
  private btnSettings: Node = null;

  @property({ type: Prefab, tooltip: '设置菜单预制体' })
  private settingsMenuPrefab: Prefab = null;

  // ========== 私有变量 ==========
  private _settingsMenuInstance: Node = null;

  // ========== 生命周期 ==========
  protected onLoad(): void {
    this.registerEvents();
  }

  // ========== 事件处理 ==========

  /**
   * 注册按钮点击事件
   */
  private registerEvents(): void {
    if (this.btnClassic) {
      this.btnClassic.on(Node.EventType.TOUCH_END, this.onClassicModeClick, this);
    }
    if (this.btnMemory) {
      this.btnMemory.on(Node.EventType.TOUCH_END, this.onMemoryModeClick, this);
    }
    if (this.btnSequence) {
      this.btnSequence.on(Node.EventType.TOUCH_END, this.onSequenceModeClick, this);
    }
    if (this.btnSettings) {
      this.btnSettings.on(Node.EventType.TOUCH_END, this.onSettingsClick, this);
    }
  }

  /**
   * 点击经典模式按钮
   */
  private onClassicModeClick(): void {
    log('[StartScene] 选择经典模式');
    this.startGame(GameMode.CLASSIC);
  }

  /**
   * 点击记忆模式按钮
   */
  private onMemoryModeClick(): void {
    log('[StartScene] 选择记忆模式');
    this.startGame(GameMode.MEMORY);
  }

  /**
   * 点击顺序模式按钮
   */
  private onSequenceModeClick(): void {
    log('[StartScene] 选择顺序模式');
    this.startGame(GameMode.SEQUENCE);
  }

  /**
   * 点击设置按钮
   */
  private onSettingsClick(): void {
    log('[StartScene] 打开设置');

    if (!this._settingsMenuInstance && this.settingsMenuPrefab) {
      this._settingsMenuInstance = instantiate(this.settingsMenuPrefab);
      this.node.parent.addChild(this._settingsMenuInstance);
    }

    if (this._settingsMenuInstance) {
      const settingsMenu = this._settingsMenuInstance.getComponent(SettingsMenu);
      settingsMenu?.show(false); // Start场景显示遮罩
    }
  }

  /**
   * 开始游戏并跳转到加载场景
   * @param mode 游戏模式
   */
  private startGame(mode: GameMode): void {
    // 暂存选择的游戏模式到 director 的临时数据
    (director as any)._selectedGameMode = mode;

    // 跳转到加载场景
    director.loadScene('Loading', (err) => {
      if (err) {
        log('[StartScene] 场景加载失败:', err);
      } else {
        log('[StartScene] 成功跳转到加载场景');
      }
    });
  }
}
