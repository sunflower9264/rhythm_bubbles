# MeowPop 项目学习指南

> 本文档总结了项目中使用的**设计模式**、**设计思想**以及 **Cocos Creator API**，帮助 Web 开发者快速理解 Cocos 游戏开发。

---

## 目录

1. [项目架构概览](#1-项目架构概览)
2. [设计模式详解](#2-设计模式详解)
   - [单例模式 (Singleton)](#21-单例模式-singleton)
   - [工厂模式 (Factory)](#22-工厂模式-factory)
   - [策略模式 (Strategy)](#23-策略模式-strategy)
   - [对象池模式 (Object Pool)](#24-对象池模式-object-pool)
   - [观察者模式 (Observer/Event)](#25-观察者模式-observerevent)
3. [设计思想与原则](#3-设计思想与原则)
   - [关注点分离](#31-关注点分离)
   - [依赖倒置原则](#32-依赖倒置原则)
   - [开闭原则](#33-开闭原则)
4. [Cocos Creator API 详解](#4-cocos-creator-api-详解)
   - [核心模块](#41-核心模块)
   - [装饰器系统](#42-装饰器系统)
   - [生命周期](#43-生命周期)
   - [节点与组件](#44-节点与组件)
   - [事件系统](#45-事件系统)
   - [资源管理](#46-资源管理)
   - [定时器](#47-定时器)
   - [场景管理](#48-场景管理)
   - [音频系统](#49-音频系统)
   - [动画系统](#410-动画系统)
5. [Web 开发对照表](#5-web-开发对照表)

---

## 1. 项目架构概览

```
scripts/
├── components/     # UI组件 - 处理显示和用户交互
│   ├── BubbleItem.ts      # 单个泡泡组件
│   ├── BubbleArea.ts      # 泡泡区域管理
│   ├── GameOverMenu.ts    # 游戏结束菜单
│   ├── PauseMenu.ts       # 暂停菜单
│   └── PauseButton.ts     # 暂停按钮
│
├── managers/       # 管理器 - 控制游戏核心逻辑（单例）
│   ├── GameManager.ts     # 游戏主控制器
│   ├── AudioManager.ts    # 音频管理
│   ├── UIManager.ts       # UI状态管理
│   ├── LevelManager.ts    # 关卡管理
│   └── GameDataManager.ts # 数据管理
│
├── modes/          # 游戏模式 - 策略模式实现
│   ├── IGameMode.ts       # 模式接口定义
│   ├── ClassicMode.ts     # 经典模式
│   ├── MemoryMode.ts      # 记忆模式
│   ├── SequenceMode.ts    # 顺序模式
│   └── GameModeFactory.ts # 模式工厂
│
├── utils/          # 工具类 - 泡泡生成与对象池
│   ├── BubblePool.ts      # 对象池
│   ├── IBubbleGenerator.ts # 生成器接口
│   ├── RandomGenerator.ts  # 随机生成器
│   └── GeneratorFactory.ts # 生成器工厂
│
└── data/           # 数据定义
    ├── GameEvent.ts       # 全局事件定义
    └── LevelConfig.ts     # 关卡配置
```

---

## 2. 设计模式详解

### 2.1 单例模式 (Singleton)

**用途**：确保一个类只有一个实例，并提供全局访问点。

**项目中的应用**：所有 Manager 类都使用单例模式。

```typescript
// GameManager.ts 示例
@ccclass('GameManager')
export class GameManager extends Component {

  // 1. 私有静态实例
  private static _instance: GameManager = null;

  // 2. 公共静态访问器
  public static get instance(): GameManager {
    return this._instance;
  }

  // 3. 在 onLoad 中初始化实例
  protected onLoad(): void {
    if (GameManager._instance === null) {
      GameManager._instance = this;
    } else {
      // 已存在实例时销毁自己
      this.destroy();
      return;
    }
  }

  // 4. 在 onDestroy 中清理实例
  protected onDestroy(): void {
    if (GameManager._instance === this) {
      GameManager._instance = null;
    }
  }
}

// 使用方式
GameManager.instance.pauseGame();
AudioManager.instance.playBGM('game_bgm');
```

**与 Web 开发对比**：
```javascript
// JavaScript 常见单例写法
class GameManager {
  static instance = null;
  
  static getInstance() {
    if (!GameManager.instance) {
      GameManager.instance = new GameManager();
    }
    return GameManager.instance;
  }
}
```

---

### 2.2 工厂模式 (Factory)

**用途**：根据条件创建不同类型的对象，解耦创建逻辑。

**项目中有两处工厂**：

#### 游戏模式工厂 (GameModeFactory)

```typescript
// GameModeFactory.ts
import { ClassicMode } from './ClassicMode';
import { MemoryMode } from './MemoryMode';
import { SequenceMode } from './SequenceMode';

export function createGameMode(mode: GameMode): IGameMode {
  switch (mode) {
    case GameMode.CLASSIC:
      return new ClassicMode();
    case GameMode.MEMORY:
      return new MemoryMode();
    case GameMode.SEQUENCE:
      return new SequenceMode();
    default:
      return new ClassicMode();
  }
}

// 使用方式
const gameMode = createGameMode(GameMode.MEMORY);
gameMode.init(context, callbacks);
gameMode.start();
```

#### 泡泡生成器工厂 (GeneratorFactory)

```typescript
// GeneratorFactory.ts - 带缓存的工厂
const generatorCache: Map<GameMode, IBubbleGenerator> = new Map();

export function getGenerator(mode: GameMode): IBubbleGenerator {
  // 检查缓存，避免重复创建
  if (generatorCache.has(mode)) {
    return generatorCache.get(mode);
  }

  let generator: IBubbleGenerator;
  switch (mode) {
    case GameMode.CLASSIC:
      generator = new RandomGenerator();
      break;
    case GameMode.MEMORY:
      generator = new MemoryGenerator();
      break;
    case GameMode.SEQUENCE:
      generator = new SequenceGenerator();
      break;
    default:
      generator = new RandomGenerator();
  }

  // 缓存并返回
  generatorCache.set(mode, generator);
  return generator;
}
```

**好处**：
- 调用者无需知道具体实现类
- 添加新模式只需创建新类并修改工厂
- 可以在工厂中加入缓存、日志等逻辑

---

### 2.3 策略模式 (Strategy)

**用途**：定义一系列算法，使它们可以相互替换。

**项目应用**：不同游戏模式的实现。

```typescript
// IGameMode.ts - 策略接口
export interface IGameMode {
  readonly name: string;
  
  /** 初始化模式 */
  init(context: IGameModeContext, callbacks: IGameModeCallbacks): void;
  
  /** 开始模式 */
  start(): void;
  
  /** 检查点击是否正确 */
  checkClick(positionIndex: number): ClickResult;
  
  /** 处理正确点击 */
  handleCorrectClick(positionIndex: number): void;
  
  /** 重置状态 */
  reset(): void;
  
  /** 清理资源 */
  cleanup(): void;
}
```

```typescript
// ClassicMode.ts - 经典模式策略
export class ClassicMode implements IGameMode {
  public readonly name: string = 'ClassicMode';
  
  public checkClick(positionIndex: number): ClickResult {
    // 经典模式：点击高亮泡泡即可
    if (this._highlightIndices.has(positionIndex)) {
      return ClickResult.CORRECT;
    }
    return ClickResult.WRONG;
  }
}
```

```typescript
// SequenceMode.ts - 顺序模式策略
export class SequenceMode implements IGameMode {
  public readonly name: string = 'SequenceMode';
  
  public checkClick(positionIndex: number): ClickResult {
    // 顺序模式：必须按特定顺序点击
    const expectedPosition = this.getExpectedPosition();
    if (positionIndex === expectedPosition) {
      return ClickResult.CORRECT;
    }
    return ClickResult.WRONG;
  }
}
```

```typescript
// BubbleArea.ts - 使用策略
private initGameMode(): void {
  // 通过工厂创建策略实例
  this._gameMode = createGameMode(this._currentConfig.mode);
  
  // 统一接口调用
  this._gameMode.init(context, callbacks);
  this._gameMode.start();
}
```

**好处**：
- 各模式逻辑独立，互不影响
- 新增模式只需实现接口
- 运行时可切换策略

---

### 2.4 对象池模式 (Object Pool)

**用途**：预先创建对象并重复使用，避免频繁的创建/销毁开销。

**为什么需要**：游戏中泡泡会频繁创建和销毁，如果每次都 `new` 和 `destroy`，会造成内存碎片和 GC 压力。

```typescript
// BubblePool.ts
import { NodePool, Node, Prefab, instantiate } from 'cc';

export class BubblePool {
  // 使用 Map 管理多种类型的对象池
  private _pools: Map<BubbleType, NodePool> = new Map();
  private _prefabs: Map<BubbleType, Prefab> = new Map();

  constructor(normalPrefab: Prefab, highlightPrefab: Prefab) {
    // 初始化两种类型的对象池
    this._pools.set(BubbleType.NORMAL, new NodePool('NormalBubble'));
    this._pools.set(BubbleType.HIGHLIGHT, new NodePool('HighlightBubble'));
    
    this._prefabs.set(BubbleType.NORMAL, normalPrefab);
    this._prefabs.set(BubbleType.HIGHLIGHT, highlightPrefab);
  }

  /** 获取泡泡：优先从池中取，没有则新建 */
  public getBubble(type: BubbleType): Node {
    const pool = this._pools.get(type);
    
    if (pool.size() > 0) {
      // 池中有可用对象，直接取出
      return pool.get();
    }
    
    // 池中没有，创建新对象
    return instantiate(this._prefabs.get(type));
  }

  /** 回收泡泡：放回池中等待复用 */
  public recycleBubble(node: Node, type: BubbleType): void {
    if (!node?.isValid) return;

    // 重置状态
    const bubbleItem = node.getComponent(BubbleItem);
    if (bubbleItem) {
      bubbleItem.resetForPool();
    }

    // 停止动画
    const animation = node.getComponent(Animation);
    if (animation) {
      animation.stop();
    }

    // 重置节点
    node.setScale(1, 1, 1);
    node.parent = null;
    
    // 放入对象池
    this._pools.get(type).put(node);
  }
}
```

**使用流程**：
```
游戏开始 → getBubble() → [池为空] → instantiate() 创建新对象
                       → [池有对象] → 直接复用

关卡结束 → recycleBubble() → 重置对象 → 放回池中

下一关 → getBubble() → 从池中取出复用
```

**与 Web 对比**：
```javascript
// 类似 React 中的对象复用
// 比如虚拟列表中复用 DOM 元素
```

---

### 2.5 观察者模式 (Observer/Event)

**用途**：对象间松耦合通信，一个对象状态改变时通知所有依赖对象。

```typescript
// GameEvent.ts - 全局事件中心
import { EventTarget } from 'cc';

// 创建全局事件管理器（类似 EventEmitter）
export const GameEvent = new EventTarget();

// 事件名常量（避免拼写错误）
export const EventName = {
  // 游戏流程
  GAME_START: 'game_start',
  GAME_OVER: 'game_over',
  GAME_PAUSE: 'game_pause',
  GAME_RESUME: 'game_resume',
  
  // 泡泡事件
  BUBBLE_CLICK: 'bubble_click',
  BUBBLE_CORRECT: 'bubble_correct',
  BUBBLE_WRONG: 'bubble_wrong',
  
  // UI 更新
  SCORE_UPDATE: 'score_update',
  LEVEL_INFO_UPDATE: 'level_info_update',
  TIME_UPDATE: 'time_update',
} as const;
```

```typescript
// 发送事件 - GameManager.ts
GameEvent.emit(EventName.SCORE_UPDATE, this._score);
GameEvent.emit(EventName.GAME_OVER, { score, level });
```

```typescript
// 监听事件 - UIManager.ts
protected onEnable(): void {
  // 注册监听
  GameEvent.on(EventName.SCORE_UPDATE, this.onScoreUpdate, this);
  GameEvent.on(EventName.LEVEL_INFO_UPDATE, this.onLevelUpdate, this);
}

protected onDisable(): void {
  // 必须注销！否则会内存泄漏
  GameEvent.off(EventName.SCORE_UPDATE, this.onScoreUpdate, this);
  GameEvent.off(EventName.LEVEL_INFO_UPDATE, this.onLevelUpdate, this);
}

private onScoreUpdate(score: number): void {
  this.updateScore(score);
}
```

**与 Web 对比**：
```javascript
// 类似 Node.js EventEmitter 或浏览器 CustomEvent
const emitter = new EventEmitter();
emitter.on('score_update', (score) => { ... });
emitter.emit('score_update', 100);

// 或 Vue 的 $emit / $on
// 或 Redux 的 dispatch / subscribe
```

**重要原则**：
- 在 `onEnable` 注册事件
- 在 `onDisable` 注销事件（防止内存泄漏）
- 使用常量定义事件名

---

## 3. 设计思想与原则

### 3.1 关注点分离

项目将不同职责分离到不同层：

| 层级 | 职责 | 示例 |
|------|------|------|
| **Components** | 显示 & 交互 | BubbleItem 处理泡泡点击动画 |
| **Managers** | 游戏逻辑 | GameManager 控制游戏状态 |
| **Modes** | 模式规则 | SequenceMode 处理顺序判定 |
| **Utils** | 通用工具 | BubblePool 对象复用 |
| **Data** | 数据定义 | LevelConfig 关卡配置 |

```typescript
// BubbleItem.ts - 只负责显示和动画
public playClickAnimation(callback?: () => void): void {
  this._animation.play(animName);
  // 不处理游戏逻辑，通过事件通知
}

// GameManager.ts - 只负责游戏逻辑
private handleCorrectClick(data: IBubbleClickData): void {
  this.addScore(10);
  // 不处理显示，通过事件通知 UI
  GameEvent.emit(EventName.BUBBLE_CORRECT, data);
}
```

### 3.2 依赖倒置原则

高层模块不依赖低层模块，都依赖抽象（接口）。

```typescript
// BubbleArea 不直接依赖 ClassicMode/MemoryMode
// 而是依赖 IGameMode 接口

private _gameMode: IGameMode;  // 依赖接口

private initGameMode(): void {
  // 通过工厂获取具体实现
  this._gameMode = createGameMode(this._currentConfig.mode);
  
  // 统一调用接口方法
  this._gameMode.init(context, callbacks);
  this._gameMode.start();
}
```

### 3.3 开闭原则

对扩展开放，对修改关闭。

```typescript
// 添加新游戏模式的步骤：

// 1. 创建新模式类，实现接口
export class NewMode implements IGameMode {
  public readonly name = 'NewMode';
  // 实现所有接口方法...
}

// 2. 在工厂中添加分支
case GameMode.NEW:
  return new NewMode();

// 不需要修改 BubbleArea、GameManager 等核心代码
```

---

## 4. Cocos Creator API 详解

### 4.1 核心模块

```typescript
import {
  _decorator,    // 装饰器工具
  Component,     // 组件基类（类似 React.Component）
  Node,          // 节点（类似 DOM Element）
  Vec2, Vec3,    // 向量（2D/3D 坐标）
  Color,         // 颜色
  Prefab,        // 预制体（可复用的节点模板）
  instantiate,   // 实例化预制体
  director,      // 导演（控制场景流程）
  find,          // 查找节点（类似 document.querySelector）
  log, warn, error,  // 日志方法
} from 'cc';
```

### 4.2 装饰器系统

Cocos 使用 TypeScript 装饰器让组件属性在编辑器中可见。

```typescript
const { ccclass, property } = _decorator;

// @ccclass 标记这是一个 Cocos 组件
@ccclass('MyComponent')
export class MyComponent extends Component {
  
  // @property 让属性在编辑器面板显示
  @property({ type: Number, tooltip: '移动速度' })
  private speed: number = 100;

  // 节点引用
  @property({ type: Node, tooltip: '目标节点' })
  private targetNode: Node = null;

  // 预制体引用
  @property({ type: Prefab, tooltip: '泡泡预制体' })
  private bubblePrefab: Prefab = null;

  // 数组
  @property({ type: [Node] })
  private nodeList: Node[] = [];

  // 枚举
  @property({ type: Enum(BubbleType) })
  private bubbleType: BubbleType = BubbleType.NORMAL;

  // 带约束的数值
  @property({ 
    type: Number, 
    min: 0, 
    max: 100, 
    step: 1, 
    slide: true  // 显示滑块
  })
  private volume: number = 50;
}
```

**与 Web 对比**：
```typescript
// 类似 Angular 的装饰器
@Component({ selector: 'app-root' })
export class AppComponent {
  @Input() speed: number;
}
```

### 4.3 生命周期

Cocos 组件的生命周期方法：

```typescript
@ccclass('LifecycleDemo')
export class LifecycleDemo extends Component {

  // 1. 组件加载时调用（只执行一次）
  // 类似 React constructor 或 Vue created
  protected onLoad(): void {
    log('onLoad: 初始化数据、获取组件引用');
    this._sprite = this.node.getComponent(Sprite);
  }

  // 2. 第一次激活前调用（只执行一次）
  // 类似 React componentDidMount 或 Vue mounted
  protected start(): void {
    log('start: 可以安全访问其他组件');
  }

  // 3. 组件启用时调用（可多次）
  // 类似 Vue activated
  protected onEnable(): void {
    log('onEnable: 注册事件监听');
    GameEvent.on(EventName.SCORE_UPDATE, this.onScore, this);
  }

  // 4. 组件禁用时调用（可多次）
  // 类似 Vue deactivated
  protected onDisable(): void {
    log('onDisable: 注销事件监听');
    GameEvent.off(EventName.SCORE_UPDATE, this.onScore, this);
  }

  // 5. 每帧调用（性能敏感）
  // 类似 requestAnimationFrame
  protected update(dt: number): void {
    // dt 是距上一帧的时间（秒）
    this.node.position.x += this.speed * dt;
  }

  // 6. 组件销毁时调用
  // 类似 React componentWillUnmount 或 Vue beforeDestroy
  protected onDestroy(): void {
    log('onDestroy: 清理资源');
  }
}
```

**生命周期顺序**：
```
onLoad → onEnable → start → update(每帧) → onDisable → onDestroy
```

### 4.4 节点与组件

**节点 (Node)**：场景中的基本单位，类似 DOM Element。

```typescript
// 获取节点引用
@property({ type: Node })
private targetNode: Node = null;

// 通过名称查找节点
const node = find('Canvas/UI/Score');  // 路径查找

// 查找子节点
const child = this.node.getChildByName('Label');

// 节点操作
node.active = true;                    // 显示/隐藏
node.setPosition(100, 200, 0);         // 设置位置
node.setScale(1.5, 1.5, 1);           // 设置缩放
node.parent = anotherNode;             // 改变父节点
node.addChild(childNode);              // 添加子节点
```

**组件 (Component)**：附加在节点上的功能单元。

```typescript
// 获取组件
const sprite = this.node.getComponent(Sprite);
const label = this.node.getComponent(Label);
const anim = this.node.getComponent(Animation);

// 添加组件
const newComp = this.node.addComponent(AudioSource);

// 缓存组件引用（性能优化）
private _sprite: Sprite = null;

onLoad() {
  // ✅ 在 onLoad 中获取一次
  this._sprite = this.node.getComponent(Sprite);
}

update(dt: number) {
  // ❌ 不要每帧获取
  // const sprite = this.node.getComponent(Sprite);
  
  // ✅ 使用缓存的引用
  this._sprite.color = Color.RED;
}
```

### 4.5 事件系统

#### 节点触摸事件

```typescript
// 注册触摸事件
onEnable() {
  // 触摸开始
  this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
  // 触摸移动
  this.node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
  // 触摸结束
  this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
  // 触摸取消
  this.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
}

// 必须在 onDisable 中注销
onDisable() {
  this.node.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
  this.node.off(Node.EventType.TOUCH_END, this.onTouchEnd, this);
}

// 事件处理函数
private onTouchStart(event: EventTouch): void {
  const location = event.getLocation();  // 屏幕坐标
  log(`触摸位置: ${location.x}, ${location.y}`);
}
```

#### 按钮点击事件

```typescript
@property({ type: Button })
private btnStart: Button = null;

onLoad() {
  // 方式1: 通过 Button 组件
  this.btnStart.node.on(Button.EventType.CLICK, this.onClick, this);
}

private onClick(): void {
  log('按钮被点击');
}
```

#### 全局事件（EventTarget）

```typescript
import { EventTarget } from 'cc';

// 创建事件中心
export const GameEvent = new EventTarget();

// 发送事件
GameEvent.emit('score_update', 100);
GameEvent.emit('game_over', { score: 500, level: 5 });

// 监听事件
GameEvent.on('score_update', (score: number) => {
  log(`分数更新: ${score}`);
}, this);

// 只监听一次
GameEvent.once('game_start', this.onGameStart, this);

// 注销监听
GameEvent.off('score_update', this.onScoreUpdate, this);
```

### 4.6 资源管理

#### 静态引用（编辑器拖拽）

```typescript
// 在编辑器中拖拽赋值
@property({ type: Prefab })
private bubblePrefab: Prefab = null;

@property({ type: SpriteFrame })
private iconSprite: SpriteFrame = null;

// 使用
const node = instantiate(this.bubblePrefab);
this.sprite.spriteFrame = this.iconSprite;
```

#### 动态加载（resources 目录）

只有 `resources` 目录下的资源才能动态加载。

```typescript
import { resources, Prefab, SpriteFrame, AudioClip } from 'cc';

// 加载预制体
resources.load('prefabs/bubble', Prefab, (err, prefab) => {
  if (err) {
    error('加载失败:', err);
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

// 加载音频
resources.load('audio/bgm/game', AudioClip, (err, clip) => {
  if (err) return;
  this.audioSource.clip = clip;
  this.audioSource.play();
});

// 批量加载目录
resources.loadDir('configs', JsonAsset, (err, assets) => {
  assets.forEach(asset => { ... });
});

// 释放资源
resources.release('prefabs/bubble');
```

### 4.7 定时器

Cocos 组件内置定时器，会在组件禁用/销毁时自动清理。

```typescript
// 延迟执行（秒）
this.scheduleOnce(() => {
  log('1秒后执行');
}, 1.0);

// 重复执行
this.schedule(() => {
  log('每秒执行一次');
}, 1.0);  // 间隔秒数

// 有限次数重复
this.schedule(() => {
  log('执行');
}, 1.0, 5);  // 重复5次

// 取消定时器
this.unschedule(this.myCallback);
this.unscheduleAllCallbacks();
```

**与 Web 对比**：
```javascript
// Web 需要手动清理
const timerId = setTimeout(() => {}, 1000);
clearTimeout(timerId);

const intervalId = setInterval(() => {}, 1000);
clearInterval(intervalId);
```

### 4.8 场景管理

```typescript
import { director } from 'cc';

// 加载场景
director.loadScene('Game', (err) => {
  if (err) {
    log('场景加载失败');
    return;
  }
  log('场景加载成功');
});

// 预加载场景（不切换）
director.preloadScene('Game', () => {
  log('预加载完成');
});

// 场景间传递数据（简单方式）
(director as any)._selectedGameMode = GameMode.MEMORY;

// 在新场景获取
const mode = (director as any)._selectedGameMode;
delete (director as any)._selectedGameMode;
```

### 4.9 音频系统

```typescript
import { AudioSource, AudioClip, resources } from 'cc';

@ccclass('AudioManager')
export class AudioManager extends Component {
  
  private _bgmSource: AudioSource = null;
  private _sfxSource: AudioSource = null;

  onLoad() {
    // 创建音频播放组件
    this._bgmSource = this.node.addComponent(AudioSource);
    this._bgmSource.loop = true;        // 循环播放
    this._bgmSource.playOnAwake = false; // 不自动播放
    this._bgmSource.volume = 0.5;       // 音量 0-1
    
    this._sfxSource = this.node.addComponent(AudioSource);
    this._sfxSource.loop = false;
  }

  // 播放背景音乐
  playBGM(name: string) {
    resources.load(`audio/bgm/${name}`, AudioClip, (err, clip) => {
      if (err) return;
      this._bgmSource.clip = clip;
      this._bgmSource.play();
    });
  }

  // 播放音效
  playSFX(name: string) {
    resources.load(`audio/sfx/${name}`, AudioClip, (err, clip) => {
      if (err) return;
      this._sfxSource.playOneShot(clip); // 一次性播放
    });
  }

  // 停止背景音乐
  stopBGM() {
    this._bgmSource.stop();
  }

  // 暂停/恢复
  pauseBGM() { this._bgmSource.pause(); }
  resumeBGM() { this._bgmSource.play(); }
}
```

### 4.10 动画系统

#### 使用 Animation 组件

```typescript
import { Animation } from 'cc';

@ccclass('AnimDemo')
export class AnimDemo extends Component {
  
  private _anim: Animation = null;

  onLoad() {
    this._anim = this.node.getComponent(Animation);
  }

  playClick() {
    // 播放动画
    this._anim.play('click_anim');
    
    // 监听动画结束
    this._anim.once(Animation.EventType.FINISHED, () => {
      log('动画播放完成');
    });
  }

  stopAnim() {
    this._anim.stop();
  }
}
```

#### 使用 Tween 动画

```typescript
import { tween, Vec3 } from 'cc';

// 移动动画
tween(this.node)
  .to(1.0, { position: new Vec3(100, 200, 0) })  // 1秒移动到目标
  .start();

// 缩放动画
tween(this.node)
  .to(0.5, { scale: new Vec3(1.5, 1.5, 1) })
  .start();

// 链式动画
tween(this.node)
  .to(0.3, { scale: new Vec3(1.2, 1.2, 1) })  // 放大
  .to(0.3, { scale: new Vec3(1, 1, 1) })      // 缩回
  .start();

// 重复动画
tween(this.node)
  .to(0.5, { angle: 360 })
  .repeatForever()
  .start();

// 回调
tween(this.node)
  .to(0.5, { position: new Vec3(100, 0, 0) })
  .call(() => {
    log('动画完成');
  })
  .start();
```

---

## 5. Web 开发对照表

| Web 概念 | Cocos 对应 | 说明 |
|----------|-----------|------|
| `document.querySelector()` | `find()` | 查找节点 |
| `element.appendChild()` | `node.addChild()` | 添加子节点 |
| `element.remove()` | `node.destroy()` | 删除节点 |
| `element.style.display` | `node.active` | 显示/隐藏 |
| `element.classList` | - | Cocos 无 CSS |
| `addEventListener()` | `node.on()` | 事件监听 |
| `removeEventListener()` | `node.off()` | 移除监听 |
| `EventEmitter` | `EventTarget` | 事件中心 |
| `setTimeout()` | `scheduleOnce()` | 延迟执行 |
| `setInterval()` | `schedule()` | 定时执行 |
| `new Audio()` | `AudioSource` | 音频播放 |
| `fetch()` | `resources.load()` | 资源加载 |
| React/Vue Component | `Component` | 组件基类 |
| `componentDidMount` | `onLoad` + `start` | 初始化 |
| `componentWillUnmount` | `onDestroy` | 清理 |
| `useState` | 类属性 | 状态管理 |
| Redux/Vuex | Manager 单例 | 全局状态 |
| `requestAnimationFrame` | `update(dt)` | 每帧更新 |
| DOM template | Prefab | 可复用模板 |
| `cloneNode()` | `instantiate()` | 实例化 |

---

## 总结

1. **设计模式**是解决特定问题的成熟方案：
   - 单例管理全局状态
   - 工厂解耦对象创建
   - 策略灵活切换算法
   - 对象池优化性能
   - 观察者松耦合通信

2. **Cocos 与 Web 的主要区别**：
   - 使用场景和节点替代 HTML/DOM
   - 使用组件系统替代 CSS 样式
   - 内置游戏循环（update）
   - 资源需要显式加载

3. **最佳实践**：
   - 在 `onLoad` 初始化，在 `onDestroy` 清理
   - 在 `onEnable` 注册事件，在 `onDisable` 注销
   - 缓存组件引用，避免每帧 `getComponent()`
   - 使用对象池管理频繁创建的对象

---

*最后更新: 2026-01-26*
