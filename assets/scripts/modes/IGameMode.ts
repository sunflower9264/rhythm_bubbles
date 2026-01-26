/**
 * @file IGameMode.ts
 * @description 游戏模式接口定义
 * @author YourName
 * @date 2026-01-24
 */

import { Node } from 'cc';
import { BubbleType } from '../utils/BubblePool';
import { BubbleItem } from '../components/BubbleItem';
import { ILevelConfig } from '../data/LevelConfig';
import { IBubbleGenerateResult } from '../utils/IBubbleGenerator';

// ========== 泡泡数据接口 ==========

/** 泡泡数据接口 */
export interface IBubbleData {
  row: number;
  col: number;
  index: number;
  type: BubbleType;
  node: Node;
  item?: BubbleItem;
  /** 临时高亮泡泡节点（记忆模式/顺序模式用于闪烁显示） */
  flashNode?: Node;
}

/** 点击结果 */
export enum ClickResult {
  CORRECT = 1,
  WRONG = 2,
  IGNORED = 3,
}

/** 游戏模式上下文接口 */
export interface IGameModeContext {
  /** 当前关卡配置 */
  config: ILevelConfig;
  /** 生成结果 */
  generateResult: IBubbleGenerateResult;
  /** 泡泡列表 */
  bubbleList: IBubbleData[];
  /** 高亮泡泡列表（正确答案） */
  highlightBubbles: IBubbleData[];
  /** 创建临时高亮泡泡 */
  createFlashNode: (bubbleData: IBubbleData) => Node;
  /** 回收临时高亮泡泡 */
  recycleFlashNode: (node: Node) => void;
  /** 调度函数 */
  scheduleOnce: (callback: () => void, delay: number) => void;
  /** 取消调度 */
  unscheduleAllCallbacks: () => void;
}

/** 模式状态变化回调 */
export interface IGameModeCallbacks {
  /** 模式准备就绪，可以开始点击 */
  onReady: () => void;
  /** 正确点击 */
  onCorrectClick: (index: number) => void;
  /** 错误点击 */
  onWrongClick: (index: number) => void;
  /** 所有高亮泡泡已清除 */
  onAllCleared: () => void;
}

/** 游戏模式接口 */
export interface IGameMode {
  /** 模式名称 */
  readonly name: string;

  /**
   * 初始化模式
   * @param context 游戏模式上下文
   * @param callbacks 回调函数
   */
  init(context: IGameModeContext, callbacks: IGameModeCallbacks): void;

  /**
   * 开始模式（生成泡泡后调用）
   */
  start(): void;

  /**
   * 检查点击是否正确
   * @param positionIndex 点击位置索引
   * @returns 点击结果
   */
  checkClick(positionIndex: number): ClickResult;

  /**
   * 处理正确点击后的逻辑
   * @param positionIndex 点击位置索引
   */
  handleCorrectClick(positionIndex: number): void;

  /**
   * 重置模式状态
   */
  reset(): void;

  /**
   * 清理资源
   */
  cleanup(): void;

  /**
   * 获取剩余需要点击的数量
   */
  getRemainingCount(): number;

  /**
   * 暂停模式（可选）
   */
  pause?(): void;

  /**
   * 恢复模式（可选）
   */
  resume?(): void;
}
