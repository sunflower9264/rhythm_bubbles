/**
 * @file SettingsMenu.ts
 * @description 设置菜单组件，控制BGM音量、音效音量、BGM开关、音效开关
 * @author YourName
 * @date 2026-01-26
 */

import { _decorator, Component, Node, Button, Slider, log } from 'cc';
import { AudioManager } from '../managers/AudioManager';

const { ccclass, property } = _decorator;

/** 默认音频配置 */
const DEFAULT_CONFIG = {
  bgmVolume: 0.5,
  sfxVolume: 0.8,
  bgmEnabled: true,
  sfxEnabled: true,
};

@ccclass('SettingsMenu')
export class SettingsMenu extends Component {

  // ========== 属性定义 ==========
  @property({ type: Slider, tooltip: 'BGM音量滑动条' })
  private sliderBGMVolume: Slider = null;

  @property({ type: Slider, tooltip: '音效音量滑动条' })
  private sliderSFXVolume: Slider = null;

  @property({ type: Button, tooltip: '返回按钮' })
  private btnBack: Button = null;

  @property({ type: Button, tooltip: '恢复默认设置按钮' })
  private btnResetDefault: Button = null;

  @property({ type: Node, tooltip: '遮罩背景节点（可选，用于隐藏遮罩）' })
  private maskNode: Node = null;

  // ========== 生命周期 ==========
  protected onLoad(): void {
    this.registerEvents();
  }

  protected onEnable(): void {
    this.syncUIWithSettings();
  }

  // ========== 公共方法 ==========

  /**
   * 显示设置菜单
   * @param hideMask 是否隐藏遮罩（当从其他弹窗打开时设为 true）
   */
  public show(hideMask: boolean = false): void {
    this.node.active = true;
    if (this.maskNode) {
      this.maskNode.active = !hideMask;
    }
    this.syncUIWithSettings();
  }

  /**
   * 隐藏设置菜单
   */
  public hide(): void {
    this.node.active = false;
  }

  // ========== 私有方法 ==========

  /**
   * 注册UI事件
   */
  private registerEvents(): void {
    // BGM音量滑动条
    if (this.sliderBGMVolume) {
      this.sliderBGMVolume.node.on('slide', this.onBGMVolumeChanged, this);
    }

    // 音效音量滑动条
    if (this.sliderSFXVolume) {
      this.sliderSFXVolume.node.on('slide', this.onSFXVolumeChanged, this);
    }

    // 返回按钮
    if (this.btnBack) {
      this.btnBack.node.on(Button.EventType.CLICK, this.onBackClick, this);
    }

    // 恢复默认设置按钮
    if (this.btnResetDefault) {
      this.btnResetDefault.node.on(Button.EventType.CLICK, this.onResetDefaultClick, this);
    }
  }

  /**
   * 同步UI状态与当前设置
   */
  private syncUIWithSettings(): void {
    const audioManager = AudioManager.instance;
    if (!audioManager) {
      return;
    }

    // 同步BGM音量
    if (this.sliderBGMVolume) {
      this.sliderBGMVolume.progress = audioManager.getBGMVolume();
    }

    // 同步音效音量
    if (this.sliderSFXVolume) {
      this.sliderSFXVolume.progress = audioManager.getSFXVolume();
    }
  }

  // ========== 事件回调 ==========

  /**
   * BGM音量变化
   */
  private onBGMVolumeChanged(slider: Slider): void {
    const volume = slider.progress;
    AudioManager.instance?.setBGMVolume(volume);
    log(`[SettingsMenu] BGM音量: ${Math.round(volume * 100)}%`);
  }

  /**
   * 音效音量变化
   */
  private onSFXVolumeChanged(slider: Slider): void {
    const volume = slider.progress;
    AudioManager.instance?.setSFXVolume(volume);
    log(`[SettingsMenu] 音效音量: ${Math.round(volume * 100)}%`);
  }

  /**
   * 返回按钮点击
   */
  private onBackClick(): void {
    log('[SettingsMenu] 返回');
    this.hide();
  }

  /**
   * 恢复默认设置按钮点击
   */
  private onResetDefaultClick(): void {
    log('[SettingsMenu] 恢复默认设置');

    // 恢复默认值
    AudioManager.instance?.setBGMVolume(DEFAULT_CONFIG.bgmVolume);
    AudioManager.instance?.setSFXVolume(DEFAULT_CONFIG.sfxVolume);
    AudioManager.instance?.setBGMEnabled(DEFAULT_CONFIG.bgmEnabled);
    AudioManager.instance?.setSFXEnabled(DEFAULT_CONFIG.sfxEnabled);

    // 同步UI
    this.syncUIWithSettings();
  }
}
