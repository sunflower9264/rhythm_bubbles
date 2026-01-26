/**
 * @file BubblePool.ts
 * @description 泡泡对象池管理器，负责泡泡的创建、回收和复用
 * @author YourName
 * @date 2026-01-24
 */

import { NodePool, Node, Prefab, instantiate, Animation } from 'cc';
import { BubbleItem } from '../components/BubbleItem';

/** 泡泡类型枚举 */
export enum BubbleType {
  NORMAL = 0,
  HIGHLIGHT = 1,
}

/**
 * 泡泡对象池管理器
 */
export class BubblePool {

  // ========== 私有变量 ==========
  private _pools: Map<BubbleType, NodePool> = new Map();
  private _prefabs: Map<BubbleType, Prefab> = new Map();

  // ========== 构造函数 ==========
  constructor(normalPrefab: Prefab, highlightPrefab: Prefab) {
    this.initPools();
    this.setPrefabs(normalPrefab, highlightPrefab);
  }

  // ========== 公共方法 ==========
  /**
   * 获取泡泡节点
   * @param type 泡泡类型
   * @returns 泡泡节点
   */
  public getBubble(type: BubbleType): Node {
    const pool = this._pools.get(type);
    if (pool.size() > 0) {
      return pool.get();
    }
    return instantiate(this._prefabs.get(type));
  }

  /**
   * 回收泡泡节点
   * @param node 要回收的节点
   * @param type 泡泡类型
   */
  public recycleBubble(node: Node, type: BubbleType): void {
    if (!node?.isValid) return;

    // 重置 BubbleItem 状态（包括精灵帧）
    const bubbleItem = node.getComponent(BubbleItem);
    if (bubbleItem) {
      bubbleItem.resetForPool();
    }

    // 停止动画
    const animation = node.getComponent(Animation);
    if (animation) {
      animation.stop();
    }

    // 重置节点状态
    node.setScale(1, 1, 1);
    node.off(Node.EventType.TOUCH_END);
    node.parent = null;
    this._pools.get(type).put(node);
  }

  /**
   * 清空所有对象池
   */
  public clearAll(): void {
    this._pools.forEach(pool => pool.clear());
  }

  /**
   * 获取对象池状态信息
   */
  public getPoolInfo(): { [key: string]: number } {
    const info: { [key: string]: number } = {};
    this._pools.forEach((pool, type) => {
      const typeName = type === BubbleType.NORMAL ? 'Normal' : 'Highlight';
      info[typeName] = pool.size();
    });
    return info;
  }

  // ========== 私有方法 ==========
  private initPools(): void {
    this._pools.set(BubbleType.NORMAL, new NodePool('NormalBubble'));
    this._pools.set(BubbleType.HIGHLIGHT, new NodePool('HighlightBubble'));
  }

  private setPrefabs(normalPrefab: Prefab, highlightPrefab: Prefab): void {
    this._prefabs.set(BubbleType.NORMAL, normalPrefab);
    this._prefabs.set(BubbleType.HIGHLIGHT, highlightPrefab);
  }
}