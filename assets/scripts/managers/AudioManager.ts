/**
 * @file AudioManager.ts
 * @description 音频管理器，负责音乐和音效的播放控制
 * @author YourName
 * @date 2026-01-25
 */

import { _decorator, Component, AudioClip, AudioSource, resources, log, warn, error, game } from 'cc';
const { ccclass } = _decorator;

// ========== 音效类型枚举 ==========

/** 音效类型 */
export enum SFXType {
  /** 按下泡泡 */
  BUBBLE_PRESS = 'bubble_press',
  /** 过关 */
  LEVEL_COMPLETE = 'level_complete',
  /** 游戏失败 */
  LEVEL_FAILED = 'level_failed',
}

// ========== 音频配置接口 ==========

/** 音频配置 */
interface IAudioConfig {
  bgmVolume: number;  // 背景音乐音量 (0-1)
  sfxVolume: number;  // 音效音量 (0-1)
  bgmEnabled: boolean; // 背景音乐开关
  sfxEnabled: boolean; // 音效开关
}

// ========== 音频管理器 ==========

@ccclass('AudioManager')
export class AudioManager extends Component {

  // ========== 单例 ==========
  private static _instance: AudioManager = null;

  public static get instance(): AudioManager {
    return this._instance;
  }

  // ========== 私有变量 ==========
  private _bgmSource: AudioSource = null;         // 背景音乐播放器
  private _sfxSource: AudioSource = null;         // 音效播放器
  private _audioClips: Map<string, AudioClip> = new Map(); // 音频资源缓存
  private _config: IAudioConfig = {
    bgmVolume: 0.5,
    sfxVolume: 0.8,
    bgmEnabled: true,
    sfxEnabled: true,
  };

  // ========== 生命周期 ==========

  protected onLoad(): void {
    if (AudioManager._instance === null) {
      AudioManager._instance = this;
      // 设为持久化节点，跨场景不销毁
      game.addPersistRootNode(this.node);
    } else {
      this.destroy();
      return;
    }

    this.init();
  }

  protected onDestroy(): void {
    if (AudioManager._instance === this) {
      AudioManager._instance = null;
      game.removePersistRootNode(this.node);
    }
    this.cleanup();
  }

  // ========== 初始化 ==========

  /**
   * 初始化音频管理器
   */
  private init(): void {
    // 创建背景音乐播放器
    this._bgmSource = this.node.addComponent(AudioSource);
    this._bgmSource.loop = true;
    this._bgmSource.playOnAwake = false;
    this._bgmSource.volume = this._config.bgmVolume;

    // 创建音效播放器
    this._sfxSource = this.node.addComponent(AudioSource);
    this._sfxSource.loop = false;
    this._sfxSource.playOnAwake = false;
    this._sfxSource.volume = this._config.sfxVolume;

    // 从本地存储加载配置
    this.loadConfig();

    log('[AudioManager] 初始化完成');
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    this.stopBGM();
    this._audioClips.clear();
  }

  // ========== 配置管理 ==========

  /**
   * 从本地存储加载配置
   */
  private loadConfig(): void {
    const savedConfig = localStorage.getItem('audio_config');
    if (savedConfig) {
      try {
        this._config = JSON.parse(savedConfig);
        this._bgmSource.volume = this._config.bgmVolume;
        this._sfxSource.volume = this._config.sfxVolume;
      } catch (e) {
        warn('[AudioManager] 配置加载失败，使用默认配置');
      }
    }
  }

  /**
   * 保存配置到本地存储
   */
  private saveConfig(): void {
    localStorage.setItem('audio_config', JSON.stringify(this._config));
  }

  // ========== 背景音乐控制 ==========

  /**
   * 播放背景音乐
   * @param name 音乐名称（不含扩展名）
   * @param fadeIn 是否淡入（默认 false）
   */
  public playBGM(name: string, fadeIn: boolean = false): void {
    if (!this._config.bgmEnabled) {
      return;
    }

    const path = `audio/bgm/${name}`;
    this.loadAudioClip(path, (clip) => {
      this._bgmSource.clip = clip;

      if (fadeIn) {
        this._bgmSource.volume = 0;
        this._bgmSource.play();
        this.fadeInBGM();
      } else {
        this._bgmSource.volume = this._config.bgmVolume;
        this._bgmSource.play();
      }

      log(`[AudioManager] 播放背景音乐: ${name}`);
    });
  }

  /**
   * 停止背景音乐
   * @param fadeOut 是否淡出（默认 false）
   */
  public stopBGM(fadeOut: boolean = false): void {
    if (fadeOut) {
      this.fadeOutBGM(() => {
        this._bgmSource.stop();
      });
    } else {
      this._bgmSource.stop();
    }
  }

  /**
   * 暂停背景音乐
   */
  public pauseBGM(): void {
    this._bgmSource.pause();
  }

  /**
   * 恢复背景音乐
   */
  public resumeBGM(): void {
    if (this._config.bgmEnabled) {
      this._bgmSource.play();
    }
  }

  /**
   * 淡入背景音乐
   */
  private fadeInBGM(): void {
    const targetVolume = this._config.bgmVolume;
    const duration = 1.0; // 淡入时长 1 秒
    const step = targetVolume / (duration * 60); // 按 60fps 计算

    const fadeIn = () => {
      if (this._bgmSource.volume < targetVolume) {
        this._bgmSource.volume = Math.min(this._bgmSource.volume + step, targetVolume);
        setTimeout(fadeIn, 1000 / 60);
      }
    };
    fadeIn();
  }

  /**
   * 淡出背景音乐
   */
  private fadeOutBGM(callback?: () => void): void {
    const duration = 1.0; // 淡出时长 1 秒
    const step = this._bgmSource.volume / (duration * 60);

    const fadeOut = () => {
      if (this._bgmSource.volume > 0) {
        this._bgmSource.volume = Math.max(this._bgmSource.volume - step, 0);
        setTimeout(fadeOut, 1000 / 60);
      } else {
        callback && callback();
      }
    };
    fadeOut();
  }

  // ========== 音效控制 ==========

  /**
   * 播放音效
   * @param type 音效类型
   */
  public playSFX(type: SFXType): void {
    if (!this._config.sfxEnabled) {
      return;
    }

    const path = `audio/sfx/${type}`;
    this.loadAudioClip(path, (clip) => {
      this._sfxSource.playOneShot(clip, this._config.sfxVolume);
      log(`[AudioManager] 播放音效: ${type}`);
    });
  }

  // ========== 音量控制 ==========

  /**
   * 设置背景音乐音量
   * @param volume 音量 (0-1)
   */
  public setBGMVolume(volume: number): void {
    this._config.bgmVolume = Math.max(0, Math.min(1, volume));
    this._bgmSource.volume = this._config.bgmVolume;
    this.saveConfig();
  }

  /**
   * 设置音效音量
   * @param volume 音量 (0-1)
   */
  public setSFXVolume(volume: number): void {
    this._config.sfxVolume = Math.max(0, Math.min(1, volume));
    this._sfxSource.volume = this._config.sfxVolume;
    this.saveConfig();
  }

  /**
   * 获取背景音乐音量
   */
  public getBGMVolume(): number {
    return this._config.bgmVolume;
  }

  /**
   * 获取音效音量
   */
  public getSFXVolume(): number {
    return this._config.sfxVolume;
  }

  // ========== 开关控制 ==========

  /**
   * 设置背景音乐开关
   * @param enabled 是否开启
   */
  public setBGMEnabled(enabled: boolean): void {
    this._config.bgmEnabled = enabled;
    if (!enabled) {
      // 关闭时暂停正在播放的音乐
      this.pauseBGM();
    }
    // 开启时不自动播放，只是允许后续播放
    this.saveConfig();
  }

  /**
   * 设置音效开关
   * @param enabled 是否开启
   */
  public setSFXEnabled(enabled: boolean): void {
    this._config.sfxEnabled = enabled;
    this.saveConfig();
  }

  /**
   * 获取背景音乐开关状态
   */
  public isBGMEnabled(): boolean {
    return this._config.bgmEnabled;
  }

  /**
   * 获取音效开关状态
   */
  public isSFXEnabled(): boolean {
    return this._config.sfxEnabled;
  }

  // ========== 资源加载 ==========

  /**
   * 加载音频资源
   * @param path 资源路径
   * @param callback 加载完成回调
   */
  private loadAudioClip(path: string, callback: (clip: AudioClip) => void): void {
    // 检查缓存
    if (this._audioClips.has(path)) {
      callback(this._audioClips.get(path));
      return;
    }

    // 加载资源
    resources.load(path, AudioClip, (err, clip) => {
      if (err) {
        warn(`[AudioManager] 加载音频失败（开发阶段容错）: ${path}`);
        callback(null);
        return;
      }

      // 缓存资源
      this._audioClips.set(path, clip);
      callback(clip);
    });
  }

  /**
   * 预加载所有音效
   */
  public preloadAllSFX(): void {
    const sfxList = [
      SFXType.BUBBLE_PRESS,
      SFXType.LEVEL_COMPLETE,
      SFXType.LEVEL_FAILED,
    ];

    sfxList.forEach(type => {
      const path = `audio/sfx/${type}`;
      this.loadAudioClip(path, () => {
        log(`[AudioManager] 预加载音效: ${type}`);
      });
    });
  }

  /**
   * 预加载背景音乐
   * @param name 音乐名称
   */
  public preloadBGM(name: string): void {
    const path = `audio/bgm/${name}`;
    this.loadAudioClip(path, () => {
      log(`[AudioManager] 预加载背景音乐: ${name}`);
    });
  }
}
