# MeowPop 开发规范

## 项目概述

- **引擎版本**: Cocos Creator 3.4.2
- **开发语言**: TypeScript
- **项目类型**: 消除类游戏

---

## 1. 目录结构规范

```
assets/
├── animations/      # 动画资源 (.anim)
├── prefabs/         # 预制体资源 (.prefab)
├── resources/       # 动态加载资源（图片、音频等）
├── scenes/          # 场景文件 (.scene)
└── scripts/         # TypeScript 脚本
    ├── components/  # 通用组件
    ├── managers/    # 管理器类（单例）
    ├── utils/       # 工具类
    └── data/        # 数据定义
```

---

## 2. 命名规范

### 2.1 文件命名

| 类型 | 规范 | 示例 |
|------|------|------|
| 脚本文件 | PascalCase | `Bubble.ts`, `GameManager.ts` |
| 预制体 | 小写+下划线 | `bubble_normal.prefab` |
| 场景 | PascalCase | `Game.scene`, `MainMenu.scene` |
| 图片资源 | 小写+下划线 | `sprite_highlight.png` |
| 动画 | 小写+下划线 | `hilight_press.anim` |

### 2.2 代码命名

```typescript
// 类名：PascalCase
class GameManager {}

// 接口：I + PascalCase
interface IBubbleData {}

// 枚举：PascalCase，成员全大写
enum BubbleType {
    NORMAL = 0,
    SPECIAL = 1,
}

// 常量：全大写+下划线
const MAX_BUBBLE_COUNT = 100;

// 变量/属性：camelCase
private bubbleCount: number = 0;

// 私有属性：加下划线前缀或使用 private 关键字
private _isActive: boolean = false;

// 方法：camelCase，动词开头
public getBubbleCount(): number {}
private handleClick(): void {}
```

---

## 3. 组件编写规范

### 3.1 基础模板

```typescript
import { _decorator, Component, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('ComponentName')
export class ComponentName extends Component {
    
    // ========== 属性定义 ==========
    @property({ type: Node, tooltip: '描述信息' })
    private targetNode: Node = null;

    // ========== 私有变量 ==========
    private _isInitialized: boolean = false;

    // ========== 生命周期 ==========
    protected onLoad(): void {
        this.init();
    }

    protected start(): void {
        // 初始化逻辑
    }

    protected onEnable(): void {
        this.registerEvents();
    }

    protected onDisable(): void {
    }

    protected onDestroy(): void {
        this.cleanup();
    }

    // ========== 公共方法 ==========
    public doSomething(): void {
        // ...
    }

    // ========== 私有方法 ==========
    private init(): void {
        // ...
    }

    private registerEvents(): void {
        // 注册事件
    }

    private cleanup(): void {
        // 清理资源
    }
}
```

### 3.2 属性装饰器使用

```typescript
// 基础类型
@property({ type: Number, tooltip: '移动速度' })
private speed: number = 100;

// 节点引用
@property({ type: Node })
private targetNode: Node = null;

// 预制体引用
@property({ type: Prefab })
private bubblePrefab: Prefab = null;

// 数组
@property({ type: [Node] })
private nodeList: Node[] = [];

// 枚举
@property({ type: Enum(BubbleType) })
private bubbleType: BubbleType = BubbleType.NORMAL;

// 范围限制
@property({ type: Number, min: 0, max: 100, step: 1, slide: true })
private volume: number = 50;
```

---

## 4. 单例管理器规范

```typescript
import { _decorator, Component } from 'cc';
const { ccclass } = _decorator;

@ccclass('GameManager')
export class GameManager extends Component {
    
    private static _instance: GameManager = null;
    
    public static get instance(): GameManager {
        return this._instance;
    }

    protected onLoad(): void {
        if (GameManager._instance === null) {
            GameManager._instance = this;
        } else {
            this.destroy();
            return;
        }
    }

    protected onDestroy(): void {
        if (GameManager._instance === this) {
            GameManager._instance = null;
        }
    }
}
```

---

## 5. 事件系统规范

### 5.1 节点事件

```typescript
// 注册
this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);

// 注销（必须在 onDisable 或 onDestroy 中执行）
this.node.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
```

### 5.2 全局事件（推荐使用 EventTarget）

```typescript
import { EventTarget } from 'cc';

// 创建全局事件管理器
export const GameEvent = new EventTarget();

// 事件名常量
export const EventName = {
    GAME_START: 'game_start',
    GAME_OVER: 'game_over',
    SCORE_UPDATE: 'score_update',
} as const;

// 发送事件
GameEvent.emit(EventName.SCORE_UPDATE, score);

// 监听事件
GameEvent.on(EventName.SCORE_UPDATE, this.onScoreUpdate, this);

// 注销事件
GameEvent.off(EventName.SCORE_UPDATE, this.onScoreUpdate, this);
```

---

## 6. 资源加载规范

### 6.1 动态加载

```typescript
import { resources, Prefab, SpriteFrame, instantiate } from 'cc';

// 加载预制体
resources.load('prefabs/bubble', Prefab, (err, prefab) => {
    if (err) {
        console.error('加载失败:', err);
        return;
    }
    const node = instantiate(prefab);
    this.node.addChild(node);
});

// 加载图片
resources.load('textures/icon', SpriteFrame, (err, spriteFrame) => {
    if (err) return;
    this.sprite.spriteFrame = spriteFrame;
});

// 批量加载
resources.loadDir('configs', JsonAsset, (err, assets) => {
    // 处理资源
});
```

### 6.2 资源释放

```typescript
// 释放单个资源
resources.release('prefabs/bubble');

// 释放资源及其依赖
assetManager.releaseAsset(asset);
```

---

## 7. 对象池规范

```typescript
import { _decorator, Component, NodePool, Prefab, instantiate } from 'cc';

@ccclass('BubblePool')
export class BubblePool extends Component {
    
    @property({ type: Prefab })
    private bubblePrefab: Prefab = null;

    private _pool: NodePool = new NodePool('Bubble');

    public get(parent: Node): Node {
        let node: Node;
        if (this._pool.size() > 0) {
            node = this._pool.get();
        } else {
            node = instantiate(this.bubblePrefab);
        }
        node.parent = parent;
        return node;
    }

    public put(node: Node): void {
        this._pool.put(node);
    }

    public clear(): void {
        this._pool.clear();
    }
}
```

---

## 8. 注释规范

### 8.1 文件头注释

```typescript
/**
 * @file Bubble.ts
 * @description 泡泡组件，处理泡泡的显示和交互逻辑
 * @author YourName
 * @date 2026-01-23
 */
```

### 8.2 方法注释

```typescript
/**
 * 初始化泡泡
 * @param type 泡泡类型
 * @param position 初始位置
 * @returns 是否初始化成功
 */
public initBubble(type: BubbleType, position: Vec3): boolean {
    // ...
}
```

### 8.3 代码块注释

```typescript
// ========== 生命周期方法 ==========

// ========== 公共方法 ==========

// ========== 私有方法 ==========

// ========== 事件回调 ==========
```

---

## 9. 性能优化指南

### 9.1 通用原则

- 避免在 `update()` 中进行复杂计算
- 使用对象池管理频繁创建/销毁的对象
- 及时清理不再使用的事件监听
- 避免频繁调用 `getComponent()`，缓存组件引用
- 禁止生成任何说明文档，初非我主动让你输出一份文档

### 9.2 代码示例

```typescript
// ❌ 不推荐
update(dt: number) {
    const sprite = this.node.getComponent(Sprite);
    sprite.color = this.calculateColor();
}

// ✅ 推荐
private _sprite: Sprite = null;

onLoad() {
    this._sprite = this.node.getComponent(Sprite);
}

update(dt: number) {
    if (this._needUpdateColor) {
        this._sprite.color = this._cachedColor;
        this._needUpdateColor = false;
    }
}
```

---

## 10. Git 提交规范

### 提交信息格式

```
<type>(<scope>): <subject>

<body>
```

### Type 类型

| 类型 | 描述 |
|------|------|
| feat | 新功能 |
| fix | 修复 Bug |
| docs | 文档更新 |
| style | 代码格式（不影响功能） |
| refactor | 重构 |
| perf | 性能优化 |
| test | 测试相关 |
| chore | 构建/工具变动 |

### 示例

```
feat(bubble): 添加泡泡消除动画效果

- 实现连消动画
- 添加粒子特效
- 优化动画性能
```

---

## 11. 调试技巧

```typescript
// 使用 cc.log 替代 console.log（发布时可统一关闭）
import { log, warn, error } from 'cc';

log('普通日志');
warn('警告信息');
error('错误信息');

// 条件编译
if (DEBUG) {
    log('仅在调试模式下输出');
}
```

---

## 12. 常用导入

```typescript
// 核心模块
import { 
    _decorator, 
    Component, 
    Node, 
    Vec2, 
    Vec3,
    Color,
    Prefab,
    instantiate,
} from 'cc';

// UI 组件
import { 
    Sprite, 
    Label, 
    Button, 
    Layout,
    ScrollView,
} from 'cc';

// 资源管理
import { 
    resources, 
    assetManager,
    SpriteFrame,
    AudioClip,
} from 'cc';

// 动画
import { 
    Animation, 
    tween, 
    Tween,
} from 'cc';
```

---

*最后更新: 2026-01-23*
