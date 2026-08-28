# AGENTS.md

## 项目定位

这是 `Rhythm Bubbles` 的 H5 网页重写版：保留原 Cocos 项目的三种模式、逐关加压、+10 计分、点错/超时结束和清空目标进下一关，改用服务器可纯代码开发的 Phaser 3.90 + TypeScript + Vite。

新会话先读本文件，再按任务需要读取父目录 `../.codex/skills/` 中的本地 Skill；不要恢复 Cocos Creator、Godot 或桌面编辑器依赖。

## 关键入口

- `src/game/core/GameSession.ts`：纯规则状态机；先改这里并补 `GameSession.test.ts`。
- `src/game/core/level.ts`：关卡尺寸、目标数量、随机生成与时间曲线。
- `src/game/BubbleScene.ts`：Phaser Canvas/WebGL 场景、泡泡绘制、输入、动画、音频。
- `src/ui/AppUI.ts`：DOM 菜单、HUD、暂停、设置、结算与无障碍语义。
- `src/main.ts`：组装 Controller、Phaser、自动化接口和可见性暂停。
- `scripts/generate-audio.mjs`：重新生成 `public/audio/*.wav` 的确定性脚本。
- `scripts/e2e-production.mjs`：移动/桌面浏览器验收脚本，依赖 `GAME_URL`。

## 工作规则

- 默认移动端竖屏 9:16，以触控为正式操作方式；桌面端仅居中显示并兼容指针点击。不要恢复游戏键盘导航、快捷键或应用内全屏入口。关键 DOM UI 必须使用安全区域、响应式布局和可见焦点样式。
- 所有有意义的玩法改动都要运行 `npm test`、`npm audit --omit=dev` 和生产预览上的 `GAME_URL=... node scripts/e2e-production.mjs`。
- 必须保持 `window.render_game_to_text()` 与 `window.advanceTime(ms)`，供自动化测试读取和推进状态。
- 事件反馈要短促、有层级，并尊重 `reducedMotion`；声音先经过用户手势解锁，音乐默认音量为 40%，设置可调整并持久化音乐音量，也可独立关闭音乐、音效、触感和动态效果。
- 图片只使用 `public/art/` 中的项目生成素材；音频只使用 `public/audio/` 中的原创 WAV，或通过生成脚本重建。
- 不新增未被需求授权的账号、联网、排行榜、支付、埋点或第三方服务；部署和发布仍需用户明确要求。
- 保持规则与呈现分离。不要在 Phaser 渲染层复制判定逻辑，也不要用 UI 框架状态驱动每帧游戏更新。
- 只做与任务直接相关的最小改动，保留用户已有改动；不使用破坏性 Git 操作。

## 验证命令

```bash
npm install
npm test
npm audit --omit=dev
npm run preview -- --port 4174
GAME_URL=http://127.0.0.1:4174 node scripts/e2e-production.mjs
BROWSER=firefox GAME_URL=http://127.0.0.1:4174 node scripts/e2e-production.mjs
BROWSER=webkit GAME_URL=http://127.0.0.1:4174 node scripts/e2e-production.mjs
```

生产静态产物在 `dist/`；`public/sw.js` 提供基础离线缓存，部署到 HTTPS 后注册。
