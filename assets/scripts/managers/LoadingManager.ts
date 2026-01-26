/**
 * @file LoadingManager.ts
 * @description 加载场景管理器，负责预加载游戏资源并显示进度
 * @author YourName
 * @date 2026-01-26
 */

import {
  _decorator,
  Component,
  Node,
  UITransform,
  director,
  resources,
  Asset,
  log,
  error
} from 'cc';

const { ccclass, property } = _decorator;

@ccclass('LoadingManager')
export class LoadingManager extends Component {

  // ========== 属性定义 ==========
  @property({ type: Node, tooltip: '进度条节点（Bar）' })
  private progressBar: Node = null;

  @property({ tooltip: '进度条最大宽度', min: 1 })
  private progressBarMaxWidth: number = 440;

  @property({ tooltip: '加载完成后跳转的场景名' })
  private targetScene: string = 'Game';

  @property({ tooltip: '最小加载时间（秒），避免闪屏', min: 0 })
  private minLoadingTime: number = 0.5;

  // ========== 私有变量 ==========
  private _progressBarTransform: UITransform = null;
  private _currentProgress: number = 0;
  private _targetProgress: number = 0;
  private _isLoadingComplete: boolean = false;
  private _loadingStartTime: number = 0;
  private _isSceneLoading: boolean = false; // 防止重复加载场景

  // ========== 生命周期 ==========
  protected onLoad(): void {
    this.init();
  }

  protected start(): void {
    this._loadingStartTime = Date.now();
    this.startLoading();
  }

  protected update(dt: number): void {
    this.updateProgressBar(dt);
  }

  // ========== 私有方法 ==========
  private init(): void {
    if (this.progressBar) {
      this._progressBarTransform = this.progressBar.getComponent(UITransform);
      if (this._progressBarTransform) {
        this._progressBarTransform.width = 0;
      }
    }
  }

  /**
   * 开始加载资源
   */
  private startLoading(): void {
    log('[LoadingManager] 开始加载资源...');

    // 预加载 resources 目录下的所有资源
    resources.loadDir(
      '',
      (completedCount: number, totalCount: number, item: any) => {
        // 进度回调
        if (totalCount > 0) {
          this._targetProgress = completedCount / totalCount;
        }
      },
      (err: Error | null, assets: Asset[]) => {
        if (err) {
          error('[LoadingManager] 资源加载失败:', err);
          // 即使失败也尝试进入游戏
          this.onLoadingComplete();
          return;
        }

        log(`[LoadingManager] 资源加载完成，共加载 ${assets.length} 个资源`);
        this._targetProgress = 1;
        this._isLoadingComplete = true;
      }
    );
  }

  /**
   * 平滑更新进度条
   */
  private updateProgressBar(dt: number): void {
    if (!this._progressBarTransform) return;

    // 平滑插值到目标进度
    const lerpSpeed = 5;
    this._currentProgress += (this._targetProgress - this._currentProgress) * lerpSpeed * dt;

    // 限制进度范围
    this._currentProgress = Math.min(this._currentProgress, 1);

    // 更新进度条宽度
    this._progressBarTransform.width = this._currentProgress * this.progressBarMaxWidth;

    // 检查是否可以跳转场景
    if (this._isLoadingComplete && this._currentProgress >= 0.99) {
      this.checkAndEnterGame();
    }
  }

  /**
   * 检查并进入游戏场景
   */
  private checkAndEnterGame(): void {
    // 防止重复调用
    if (this._isSceneLoading) return;

    const elapsedTime = (Date.now() - this._loadingStartTime) / 1000;

    if (elapsedTime >= this.minLoadingTime) {
      this._isSceneLoading = true;
      this.onLoadingComplete();
    } else {
      // 标记为正在加载，防止 update 中再次触发
      this._isSceneLoading = true;
      // 延迟到最小加载时间后进入
      this.scheduleOnce(() => {
        this.onLoadingComplete();
      }, this.minLoadingTime - elapsedTime);
    }
  }

  /**
   * 加载完成，跳转场景
   */
  private onLoadingComplete(): void {
    log(`[LoadingManager] 准备跳转到场景: ${this.targetScene}`);
    director.loadScene(this.targetScene);
  }
}
