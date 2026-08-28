# 泡泡节拍 · Rhythm Bubbles

一个软萌、轻快的视觉记忆与反应力 H5 游戏。玩家在限时内完成三种不同的泡泡记忆挑战：寻光、记忆、旋律；每颗正确泡泡 +10 分，点错或超时结束，清空目标后进入下一关。

这是原 Cocos Creator 项目的网页重写版，保留核心玩法与逐关加压逻辑，全面重做了 UI、UX、动效、音效和移动端适配。游戏以手机竖屏触控为唯一正式操作方式，不提供键盘导航或应用内全屏入口。

## 技术栈

- Phaser 3.90：Canvas/WebGL 2D 渲染、输入、动画与音频
- TypeScript 5.9：可测试的游戏规则与状态模型
- Vite 7：开发服务器和生产构建
- Node.js 20.19+：服务器终端开发与部署

不需要 Cocos Creator、Godot 或任何桌面编辑器。

## 本地开发

```bash
npm install
npm run dev
```

开发服务器默认监听 `0.0.0.0`，可从服务器端口直接访问。

## 生产验证

```bash
npm run generate:audio
npm test
npm audit --omit=dev
```

构建后，在一个终端启动生产预览：

```bash
npm run preview -- --port 4174
```

另一个终端运行浏览器验收：

```bash
GAME_URL=http://127.0.0.1:4174 node scripts/e2e-production.mjs
BROWSER=firefox GAME_URL=http://127.0.0.1:4174 node scripts/e2e-production.mjs
BROWSER=webkit GAME_URL=http://127.0.0.1:4174 node scripts/e2e-production.mjs
```

`e2e-production.mjs` 会在移动视口中覆盖菜单、三种模式、触控点击、过关、失败、暂停/恢复、设置、响应式桌面布局，并检查浏览器控制台错误。截图写入 `output/e2e/`。

## 目录

```text
src/
  game/core/       # 纯游戏规则、关卡生成、状态快照与单测
  game/BubbleScene.ts
  ui/AppUI.ts      # DOM HUD、菜单、设置、结算层
  styles.css
public/
  art/             # 生成的背景与应用图标
  audio/           # 程序化生成的 WAV 音效与循环音乐
scripts/
  generate-audio.mjs
  e2e-production.mjs
```

## 生产注意事项

- `public/sw.js` 提供基础离线缓存；部署到 HTTPS 后浏览器会自动注册。
- `window.render_game_to_text()` 和 `window.advanceTime(ms)` 是自动化验证接口，请保持兼容。
- 正式操作入口为手机触控；桌面浏览器仅保留指针点击兼容，不提供键盘操作或全屏按钮。
- 声音需要用户首次触控后由浏览器解锁；设置支持关闭音效、音乐、触感和动态效果。
- 原创图片源文件保存在 `design/source-art/`，运行时使用压缩后的 WebP/PNG。

## 本机 Nginx 部署

当前站点监听高位端口 `18088`，静态目录为 `/var/www/rhythm-bubbles`，版本化配置保存在 `deploy/nginx/rhythm-bubbles.conf`。

后续更新版本时执行：

```bash
npm run build
sudo rsync -a --delete dist/ /var/www/rhythm-bubbles/
sudo nginx -t && sudo systemctl reload nginx
```
