# 泡泡节拍 · Rhythm Bubbles

一个软萌、轻快的视觉记忆战斗 H5 游戏。玩家从唯一的“开始游戏”入口进入五战路线：寻光 → 记忆 → 旋律，后续战斗保持单击旋律规则直到 Boss。记忆预览只闪烁一次，旋律预览会同时显示整组编号；每颗正确泡泡一次点击清除、获得 +10 分并积累连击伤害；每盘允许三次点错，第 4 次点错会扣除护盾或生命并更换泡泡，只有生命归零才会结束挑战。

每局会将五只海洋怪物随机且无重复地排成五战，首怪不固定。紫莓果冻要求按顺序化解吞噬连线；灯笼骗骗鱼用牵引光捕获泡泡，需要点击“救”标记；铠潮寄居蟹常态护壳减伤，击破两个“破”弱点后进入高伤窗口；星翼魔鬼鱼横扫一整排，必须从安全行反击；泡泡刺豚蓄刺时点击会遭到反伤，忍到尖刺收回才会暴露弱点。预览、暂停、转场和奖励选择期间，敌人的攻击时钟会冻结。

连续正确点击从 2 HIT 开始显示格斗式 Combo 大字，每次点击需在 1 秒窗口内衔接，5 连击与 8 连击进入更高视觉等级；点错或超时会清空 Combo。普通连击与清盘对怪物蓄力条的削减均降至 0.5%（合计最多 1%），高手快速点击也会稳定遇到怪物技能。所有生命、计时、蓄力和 Combo 数值条都带有流动液体高光与微粒气泡反馈；减少动态效果时自动静止。护盾存在时以覆盖游戏画布的半透明白色护罩常驻，裂纹只在实际格挡攻击时短暂出现，护盾归零时播放碎裂。五战怪物生命依次为 `150 / 240 / 380 / 600 / 950`，玩家基础攻击为 `8`。

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

`e2e-production.mjs` 会在移动视口中覆盖单入口菜单、五只随机海洋怪、各自反制逻辑、触控攻击、护盾受击、奖励、Boss 胜利、暂停/恢复、设置与响应式桌面布局，并检查浏览器控制台错误。截图写入 `output/e2e/`。

## 目录

```text
src/
  game/core/       # 纯游戏规则、关卡生成、状态快照与单测
  game/BubbleScene.ts
  ui/AppUI.ts      # DOM HUD、菜单、设置、结算层
  styles.css
public/
  art/             # 生成的背景、角色与应用图标
  audio/           # 程序化生成的 WAV 战斗音效与循环音乐
scripts/
  generate-audio.mjs
  e2e-production.mjs
```

## 生产注意事项

- `public/sw.js` 提供基础离线缓存；部署到 HTTPS 后浏览器会自动注册。
- `window.render_game_to_text()` 和 `window.advanceTime(ms)` 是自动化验证接口，请保持兼容。
- 正式操作入口为手机触控；桌面浏览器仅保留指针点击兼容，不提供键盘操作或全屏按钮。
- 声音需要用户首次触控后由浏览器解锁；音乐默认音量为 40%，设置支持调整音乐音量，以及关闭音效、音乐、触感和动态效果。
- 原创图片源文件保存在 `design/source-art/`，运行时使用压缩后的 WebP/PNG。

## 本机 Nginx 部署

当前站点监听高位端口 `18088`，静态目录为 `/var/www/rhythm-bubbles`，版本化配置保存在 `deploy/nginx/rhythm-bubbles.conf`。

后续更新版本时执行：

```bash
npm run build
sudo rsync -a --delete dist/ /var/www/rhythm-bubbles/
sudo nginx -t && sudo systemctl reload nginx
```
