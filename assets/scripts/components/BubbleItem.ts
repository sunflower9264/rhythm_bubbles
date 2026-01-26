/**
 * @file BubbleItem.ts
 * @description 单个泡泡组件，处理泡泡的显示、点击和动画
 * @author YourName
 * @date 2026-01-24
 */

import { _decorator, Component, Node, Animation, Sprite, Color, SpriteFrame } from 'cc';
import { BubbleType } from '../utils/BubblePool';
import { GameEvent, EventName } from '../data/GameEvent';
import { AudioManager, SFXType } from '../managers/AudioManager';

const { ccclass, property } = _decorator;

/** 泡泡状态 */
export enum BubbleState {
  /** 正常可点击 */
  NORMAL = 0,
  /** 禁用（动画播放中或不可点击） */
  DISABLED = 1,
  /** 已消除 */
  CLEARED = 2,
  /** 隐藏（记忆模式下熄灭） */
  HIDDEN = 3,
}

/** 泡泡点击事件数据 */
export interface IBubbleClickData {
  row: number;
  col: number;
  index: number;
  type: BubbleType;
  node: Node;
}

@ccclass('BubbleItem')
export class BubbleItem extends Component {

  // ========== 私有变量 ==========
  private _type: BubbleType = BubbleType.NORMAL;
  private _state: BubbleState = BubbleState.NORMAL;
  private _row: number = 0;
  private _col: number = 0;
  private _index: number = 0;
  private _animation: Animation = null;
  private _sprite: Sprite = null;
  private _originalColor: Color = null;
  private _originalSpriteFrame: SpriteFrame = null;
  private _isHighlightVisible: boolean = true;

  // ========== 生命周期 ==========
  protected onLoad(): void {
    this.initComponents();
  }

  protected onEnable(): void {
    this.registerEvents();
  }

  protected onDisable(): void {
    this.unregisterEvents();
  }

  // ========== 公共方法 ==========

  /**
   * 初始化组件引用
   */
  private initComponents(): void {
    if (!this._sprite) {
      this._sprite = this.node.getComponent(Sprite);
      if (this._sprite) {
        this._originalColor = this._sprite.color.clone();
        // 只在第一次时保存原始精灵帧（预制体的默认状态）
        if (!this._originalSpriteFrame) {
          this._originalSpriteFrame = this._sprite.spriteFrame;
        }
      }
    }
    if (!this._animation) {
      this._animation = this.node.getComponent(Animation);
    }
  }

  /**
   * 初始化泡泡数据
   */
  public init(type: BubbleType, row: number, col: number, index: number): void {
    // 确保组件已初始化
    this.initComponents();

    this._type = type;
    this._row = row;
    this._col = col;
    this._index = index;
    this._state = BubbleState.NORMAL;
    this._isHighlightVisible = true;

    // 重置动画状态
    this.resetAnimation();

    // 恢复原始颜色
    if (this._sprite && this._originalColor) {
      this._sprite.color = this._originalColor.clone();
    }

    // 确保节点缩放正常
    this.node.setScale(1, 1, 1);
  }

  /**
   * 重置动画状态
   */
  private resetAnimation(): void {
    if (this._animation) {
      this._animation.stop();
    }
    // 恢复原始精灵帧
    if (this._sprite && this._originalSpriteFrame) {
      this._sprite.spriteFrame = this._originalSpriteFrame;
    }
  }

  /**
   * 获取泡泡类型
   */
  public get type(): BubbleType {
    return this._type;
  }

  /**
   * 获取泡泡状态
   */
  public get state(): BubbleState {
    return this._state;
  }

  /**
   * 获取泡泡状态（方法形式）
   */
  public getState(): BubbleState {
    return this._state;
  }

  /**
   * 获取行索引
   */
  public get row(): number {
    return this._row;
  }

  /**
   * 获取列索引
   */
  public get col(): number {
    return this._col;
  }

  /**
   * 获取数组索引
   */
  public get index(): number {
    return this._index;
  }

  /**
   * 获取高亮是否可见
   */
  public get isHighlightVisible(): boolean {
    return this._isHighlightVisible;
  }

  /**
   * 设置泡泡状态
   */
  public setState(state: BubbleState): void {
    this._state = state;
  }

  /**
   * 播放点击动画
   */
  public playClickAnimation(callback?: () => void): void {
    if (!this._animation) {
      callback?.();
      return;
    }

    // 根据类型播放对应动画
    const animName = this._type === BubbleType.HIGHLIGHT ? 'hilight_press' : 'normal_press';

    // 检查动画是否存在
    const clips = this._animation.clips;
    const hasAnim = clips.some(clip => clip?.name === animName);

    if (hasAnim) {
      this._animation.play(animName);

      // 动画完成后回调
      this._animation.once(Animation.EventType.FINISHED, () => {
        callback?.();
      });
    } else {
      callback?.();
    }
  }

  /**
   * 显示高亮效果（记忆模式和顺序模式使用）
   */
  public showHighlight(): void {
    this._isHighlightVisible = true;
    if (this._sprite && this._originalColor) {
      this._sprite.color = this._originalColor.clone();
    }
  }

  /**
   * 隐藏高亮效果（变成普通外观）
   */
  public hideHighlight(): void {
    this._isHighlightVisible = false;
    if (this._sprite) {
      // 将颜色变暗来模拟熄灭效果
      this._sprite.color = new Color(150, 150, 150, 255);
    }
  }

  /**
   * 重置泡泡状态
   */
  public reset(): void {
    this._state = BubbleState.NORMAL;
    this._isHighlightVisible = true;
    if (this._sprite && this._originalColor) {
      this._sprite.color = this._originalColor.clone();
    }
  }

  /**
   * 对象池回收时重置（恢复精灵帧到初始状态）
   */
  public resetForPool(): void {
    this.reset();
    // 恢复原始精灵帧
    if (this._sprite && this._originalSpriteFrame) {
      this._sprite.spriteFrame = this._originalSpriteFrame;
    }
  }

  // ========== 私有方法 ==========

  private registerEvents(): void {
    this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
  }

  private unregisterEvents(): void {
    this.node.off(Node.EventType.TOUCH_END, this.onTouchEnd, this);
  }

  private onTouchEnd(): void {
    // 检查是否可点击
    if (this._state !== BubbleState.NORMAL) {
      return;
    }

    // 播放按下音效
    if (AudioManager.instance) {
      AudioManager.instance.playSFX(SFXType.BUBBLE_PRESS);
    }

    // 发送点击事件
    const clickData: IBubbleClickData = {
      row: this._row,
      col: this._col,
      index: this._index,
      type: this._type,
      node: this.node,
    };

    GameEvent.emit(EventName.BUBBLE_CLICK, clickData);
  }
}
