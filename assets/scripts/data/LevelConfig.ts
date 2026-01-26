/**
 * @file LevelConfig.ts
 * @description 关卡配置 - 全部动态生成
 * @author YourName
 * @date 2026-01-25
 */

// ========== 枚举定义 ==========

/** 游戏模式枚举 */
export enum GameMode {
  /** 经典模式：随机生成高亮泡泡，直接点击 */
  CLASSIC = 1,
  /** 记忆模式：高亮泡泡闪烁后熄灭，凭记忆点击 */
  MEMORY = 2,
  /** 顺序模式：按顺序亮起后统一熄灭，按顺序点击 */
  SEQUENCE = 3,
}

// ========== 常量定义 ==========

/** 最大行数 */
const MAX_ROWS = 4;
/** 最大列数 */
const MAX_COLS = 4;
/** 最大高亮数量 */
const MAX_HIGHLIGHT = 8;
/** 初始高亮数量 */
const INITIAL_HIGHLIGHT = 2;

// ========== 接口定义 ==========

/** 关卡配置接口 */
export interface ILevelConfig {
  /** 关卡号 */
  level: number;
  /** 游戏模式 */
  mode: GameMode;
  /** 行数 */
  rows: number;
  /** 列数 */
  cols: number;
  /** 最少高亮数量 */
  minHighlight: number;
  /** 最多高亮数量 */
  maxHighlight: number;
  /** 闪烁次数（记忆模式使用） */
  flashCount?: number;
  /** 单次闪烁持续时间（毫秒） */
  flashDuration?: number;
  /** 顺序显示间隔时间（毫秒，顺序模式使用） */
  sequenceInterval?: number;
}

// ========== 关卡生成函数 ==========

/**
 * 获取指定模式和关卡的配置（动态生成）
 * @param mode 游戏模式
 * @param level 关卡号（从1开始）
 * @returns 关卡配置
 */
export function getLevelConfig(mode: GameMode, level: number): ILevelConfig {
  // 根据关卡计算网格大小：1-2关3x3，3-4关3x4，5+关4x4
  let rows: number;
  let cols: number;
  if (level <= 2) {
    rows = 3;
    cols = 3;
  } else if (level <= 4) {
    rows = 3;
    cols = 4;
  } else {
    rows = MAX_ROWS;
    cols = MAX_COLS;
  }

  // 根据关卡计算高亮数量范围
  // 关卡1: 2-2, 关卡2: 2-3, 关卡3: 3-4, 关卡4: 4-5, ...
  const baseMin = Math.min(INITIAL_HIGHLIGHT + Math.floor((level - 1) / 2), MAX_HIGHLIGHT);
  const baseMax = Math.min(baseMin + 1 + Math.floor(level / 3), MAX_HIGHLIGHT);

  const config: ILevelConfig = {
    level,
    mode,
    rows,
    cols,
    minHighlight: baseMin,
    maxHighlight: baseMax,
  };

  // 根据模式添加特定参数
  switch (mode) {
    case GameMode.MEMORY:
      // 闪烁次数：固定3次
      config.flashCount = 3;
      // 闪烁时间：固定300ms
      config.flashDuration = 300;
      break;
    case GameMode.SEQUENCE:
      config.sequenceInterval = 300;
      break;
  }

  return config;
}

/**
 * 获取游戏模式名称
 * @param mode 游戏模式
 * @returns 模式名称
 */
export function getModeName(mode: GameMode): string {
  const names: Record<GameMode, string> = {
    [GameMode.CLASSIC]: '经典模式',
    [GameMode.MEMORY]: '记忆模式',
    [GameMode.SEQUENCE]: '顺序模式',
  };
  return names[mode] || '未知模式';
}
