/**
 * @file GameEvent.ts
 * @description 全局事件定义和事件管理器
 * @author YourName
 * @date 2026-01-24
 */

import { EventTarget } from 'cc';

/** 全局事件管理器 */
export const GameEvent = new EventTarget();

/** 事件名称常量 */
export const EventName = {
  // ========== 游戏流程事件 ==========
  /** 游戏开始 */
  GAME_START: 'game_start',
  /** 游戏重新开始 */
  GAME_RESTART: 'game_restart',
  /** 游戏结束 */
  GAME_OVER: 'game_over',
  /** 游戏暂停 */
  GAME_PAUSE: 'game_pause',
  /** 游戏恢复 */
  GAME_RESUME: 'game_resume',

  // ========== 关卡相关事件 ==========
  /** 关卡开始 */
  LEVEL_START: 'level_start',
  /** 关卡完成 */
  LEVEL_COMPLETE: 'level_complete',
  /** 关卡失败 */
  LEVEL_FAILED: 'level_failed',

  // ========== 泡泡相关事件 ==========
  /** 泡泡被点击 */
  BUBBLE_CLICK: 'bubble_click',
  /** 点击正确的泡泡 */
  BUBBLE_CORRECT: 'bubble_correct',
  /** 点击错误的泡泡 */
  BUBBLE_WRONG: 'bubble_wrong',
  /** 所有高亮泡泡已清除 */
  ALL_HIGHLIGHT_CLEARED: 'all_highlight_cleared',

  // ========== 记忆模式事件 ==========
  /** 闪烁开始 */
  FLASH_START: 'flash_start',
  /** 闪烁结束 */
  FLASH_END: 'flash_end',

  // ========== 顺序模式事件 ==========
  /** 开始显示顺序 */
  SEQUENCE_SHOW_START: 'sequence_show_start',
  /** 顺序显示完成，准备接受输入 */
  SEQUENCE_READY: 'sequence_ready',

  // ========== 模式事件 ==========
  /** 游戏模式准备就绪（闪烁/显示完成，可以开始点击） */
  MODE_READY: 'mode_ready',

  // ========== UI 事件 ==========
  /** 分数更新 */
  SCORE_UPDATE: 'score_update',
  /** 关卡信息更新 */
  LEVEL_INFO_UPDATE: 'level_info_update',
  /** 倒计时更新 */
  TIME_UPDATE: 'time_update',
  /** 倒计时结束 */
  TIME_UP: 'time_up',
} as const;

/** 事件名称类型 */
export type EventNameType = typeof EventName[keyof typeof EventName];
