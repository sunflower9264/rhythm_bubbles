import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, firefox, webkit } from 'playwright';

const BASE_URL = process.env.GAME_URL || 'http://127.0.0.1:4174';
const BROWSER_NAME = process.env.BROWSER || 'chromium';
const browserType = { chromium, firefox, webkit }[BROWSER_NAME];
if (!browserType) throw new Error(`Unsupported BROWSER=${BROWSER_NAME}`);
const OUTPUT_DIR = new URL(`../output/e2e/${BROWSER_NAME}/`, import.meta.url);
await mkdir(OUTPUT_DIR, { recursive: true });

const browser = await browserType.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  locale: 'zh-CN',
});
const page = await context.newPage();
const errors = [];
await page.route(/\/audio\//, async (route) => {
  await new Promise((resolve) => setTimeout(resolve, 700));
  await route.continue();
});
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});

await page.goto(`${BASE_URL}?seed=2654435761`, { waitUntil: 'domcontentloaded' });
await page.locator('#loading-screen.is-visible').waitFor({ state: 'visible' });
assert.equal(await page.locator('.loading-bubble-side, .loading-monster-side, .loading-impact').count(), 0,
  '加载页不应再使用分散的 DOM 角色拼装');
assert.equal(await page.locator('.loading-game-title').getAttribute('alt'), '泡泡侠大战海洋怪');
assert.equal(await page.locator('.loading-progress-bubbles i').count(), 8, '加载进度应由多个泡泡表示');
assert.match((await page.locator('#loading-progress-value').textContent()) ?? '', /^\d+%$/);
assert.equal(await page.locator('.loading-tip').count(), 0, '加载页不再显示 Tips');
const loadingBackground = await page.locator('#loading-screen').evaluate((element) => getComputedStyle(element).backgroundImage);
assert.match(loadingBackground, /loading-battle-key-art\.png/, '加载页应使用独立的整张战斗原画');
await page.evaluate(() => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = resolve;
  image.onerror = reject;
  image.src = 'art/loading-battle-key-art.png';
}));
const loadingProgressBox = await page.locator('.loading-progress-bubbles').boundingBox();
assert.ok(loadingProgressBox && loadingProgressBox.y > 350 && loadingProgressBox.y < 500, '泡泡进度应位于加载页中部');
const loadingPercentBox = await page.locator('#loading-progress-value').boundingBox();
assert.ok(loadingProgressBox && loadingPercentBox
  && Math.abs((loadingPercentBox.x + loadingPercentBox.width / 2) - (loadingProgressBox.x + loadingProgressBox.width / 2)) < 2,
  '百分比应在泡泡进度正下方居中');
await screenshot(page, '00-loading-screen.png');
await page.locator('#loading-screen').waitFor({ state: 'hidden' });
await page.waitForLoadState('networkidle');
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
const sfxDurations = await page.evaluate(async () => {
  const files = ['tap.wav', 'correct-pop-1.wav', 'correct-pop-2.wav', 'correct-pop-3.wav', 'enemy-attack.wav'];
  return Promise.all(files.map(async (file) => {
    const data = await (await fetch(`audio/${file}`)).arrayBuffer();
    const view = new DataView(data);
    const duration = view.getUint32(40, true) / view.getUint32(24, true) / 2;
    return [file, Number(duration.toFixed(2))];
  }));
});
assert.deepEqual(Object.fromEntries(sfxDurations), {
  'tap.wav': 0.18,
  'correct-pop-1.wav': 0.34,
  'correct-pop-2.wav': 0.34,
  'correct-pop-3.wav': 0.34,
  'enemy-attack.wav': 0.92,
}, '三组新音效应加载为预期长度的原创 WAV');
assert.equal(await page.locator('#start-game').count(), 1);
assert.equal(await page.locator('#menu-settings').count(), 1);
assert.equal(await page.locator('#menu-help').count(), 0);
assert.equal(await page.locator('[data-mode]').count(), 0);
assert.equal(await page.locator('#fullscreen-button').count(), 0);
assert.equal(await page.locator('.run-preview').count(), 0);
assert.equal(await page.locator('.menu-hint').count(), 0);
assert.equal(await page.locator('.tagline, .eyebrow, .mascot-badge').count(), 0, '主页不应保留补充文案和旧头像');
assert.equal(await page.locator('.game-logo').getAttribute('aria-label'), '泡泡侠大战海洋怪');
assert.match((await page.locator('.game-logo img').getAttribute('src')) ?? '', /game-title\.png$/);
assert.equal(await page.locator('#game-container canvas').getAttribute('aria-label'), '泡泡侠大战海洋怪游戏区：轻触泡泡进行游戏');
const menuButtonArt = await page.locator('.menu-actions button').evaluateAll((elements) =>
  elements.map((element) => getComputedStyle(element).backgroundImage));
assert.match(menuButtonArt[0], /button-teal\.png/);
assert.match(menuButtonArt[1], /button-coral\.png/);
assert.match(menuButtonArt[2], /button-violet\.png/);
await screenshot(page, '01-clean-menu.png');

const shellBox = await page.locator('#game-shell').boundingBox();
assert.ok(shellBox && shellBox.width <= 390 && shellBox.height <= 844);
const startBox = await page.locator('#start-game').boundingBox();
const settingsBox = await page.locator('#menu-settings').boundingBox();
const logoBox = await page.locator('.game-logo').boundingBox();
assert.ok(startBox && logoBox && startBox.y > logoBox.y + logoBox.height + 30 && startBox.y < 620,
  '开始游戏应位于艺术字标题下方');
assert.ok(settingsBox && settingsBox.y >= startBox.y + startBox.height + 24, '开始游戏与设置之间应留出明显间隔');

await page.locator('#start-game').tap();
await page.evaluate(() => window.advanceTime(0));
let state = await readState(page);
assert.equal(state.phase, 'playing');
assert.equal('mode' in state, false, '已删除记忆与顺序点击模式状态');
assert.equal(state.battle.current, 1);
assert.equal(state.battle.enemy.name, '紫莓果冻');
assert.equal(state.battle.enemy.id, 'jelly');
assert.equal(new Set(state.battle.enemy.order).size, 5);
assert.deepEqual(state.battle.enemy.order, ['jelly', 'puffer', 'hermit', 'manta', 'angler']);
assert.equal(state.battle.enemy.maxHp, 150);
assert.equal(state.battle.player.attack, 8);
assert.equal(state.battle.player.mistakeDamage, 5);
assert.equal(state.battle.enemy.poise, 2);
await page.waitForTimeout(420);
state = await readState(page);
assert.ok(Math.abs(state.feedback.enemy.displayWidth - 288) <= 1, '普通怪物应比上一版更大');
assert.deepEqual(state.feedback.performance, { fpsTarget: 120, fpsLimit: 120 }, '战斗渲染上限应配置为 120 FPS');
assert.equal(state.feedback.enemy.breathing, true, '怪物静止时应播放呼吸动画');
const breathStart = { y: state.feedback.enemy.y, scaleY: state.feedback.enemy.scaleY };
await page.waitForTimeout(260);
state = await readState(page);
assert.ok(state.feedback.enemy.y !== breathStart.y || state.feedback.enemy.scaleY !== breathStart.scaleY,
  '怪物呼吸动画应产生轻微浮动或缩放变化');
assert.deepEqual(state.grid, { rows: 4, cols: 4 }, '所有战斗应固定使用 4x4 泡泡盘面');
assert.equal(state.visibleTargets.length, state.remainingTargets, '目标泡泡应持续显示');
assert.ok(state.bubbles.every((bubble) => !('order' in bubble)), '泡泡不应再携带点击顺序');
assert.equal(await page.locator('.liquid-meter:not(.loading-progress-track)').count(), 6, '玩家三状态、敌人生命、蓄力和 Combo 应统一使用液体数值条');
assert.equal(await page.locator('#battle-value, #enemy-attack-damage, #score-value, #attack-value, #shield-value, #mistake-value').count(), 0,
  '旧战数、伤害、得分、攻击、护盾标签和失误标签应全部移除');
assert.equal(await page.locator('#timer-fill, #time-value, #mode-name, .mode-pill, .objective-chip, #play-prompt, #target-counter').count(), 0,
  '倒计时、模式名称和文字操作提示应全部移除');
assert.equal(await page.locator('#player-shield-value, #player-energy-value').count(), 2);
assert.equal(await page.locator('#player-energy-value').textContent(), '0%');
assert.equal(await page.locator('#target-bubbles > i').count(), state.remainingTargets);
const playerHudBox = await page.locator('.player-status').boundingBox();
const enemyHudBox = await page.locator('#enemy-status').boundingBox();
const targetBubblesBox = await page.locator('#target-bubbles').boundingBox();
const enemyNameBox = await page.locator('#enemy-name').boundingBox();
const avatarBox = await page.locator('#pause-button.player-avatar').boundingBox();
const metersBox = await page.locator('.player-meters').boundingBox();
const firstPlayerMeterBox = await page.locator('.player-meter').first().boundingBox();
const lastPlayerMeterBox = await page.locator('.player-meter').last().boundingBox();
const shieldLabelBox = await page.locator('.player-meter--shield small').boundingBox();
const gameplayCanvasBox = await page.locator('#game-container canvas').boundingBox();
assert.ok(playerHudBox && enemyHudBox && targetBubblesBox && enemyNameBox && avatarBox && metersBox
  && firstPlayerMeterBox && lastPlayerMeterBox && shieldLabelBox && gameplayCanvasBox);
const enemyHealthBox = await page.locator('.health-track--enemy').boundingBox();
const enemyHeadingBox = await page.locator('.enemy-heading').boundingBox();
const enemyAttackBox = await page.locator('#enemy-attack-intent').boundingBox();
const enemyAttackTrackBox = await page.locator('#enemy-attack-intent > i').boundingBox();
assert.ok(enemyHealthBox && enemyHeadingBox && enemyAttackBox && enemyAttackTrackBox);
const hudFrameArt = await page.locator('.player-status, #enemy-status').evaluateAll((elements) =>
  elements.map((element) => getComputedStyle(element).backgroundImage));
assert.match(hudFrameArt[0], /hud-player-frame\.png/, '玩家 HUD 应使用生图海洋边框');
assert.match(hudFrameArt[1], /hud-enemy-frame\.png/, '怪物 HUD 应使用生图海洋边框');
await page.evaluate(() => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = resolve;
  image.onerror = reject;
  image.src = 'art/ui/board-frame.png';
}));
assert.ok(playerHudBox.y + playerHudBox.height <= enemyHudBox.y, '玩家 HUD 应位于怪物 HUD 上方');
assert.ok(enemyHudBox.y + enemyHudBox.height <= targetBubblesBox.y, '可消耗泡泡应位于怪物 HUD 下方');
assert.ok(Math.abs(targetBubblesBox.x - enemyHudBox.x) <= 8, '可消耗泡泡应从怪物 HUD 左侧开始排列');
assert.ok(Math.abs(avatarBox.width - avatarBox.height) <= 1, '玩家头像应为圆形');
assert.ok(Math.abs(avatarBox.height - metersBox.height) <= 2, '三条玩家状态的总高应与头像一致');
assert.ok(firstPlayerMeterBox.y - playerHudBox.y >= 14, '生命条与玩家 HUD 上边框应保留安全距离');
assert.ok(playerHudBox.y + playerHudBox.height - (lastPlayerMeterBox.y + lastPlayerMeterBox.height) >= 14,
  '能量条与玩家 HUD 下边框应保留安全距离');
assert.ok(shieldLabelBox.x - (avatarBox.x + avatarBox.width) >= 12,
  '头像圆形接口不得遮挡护盾文字');
assert.ok(playerHudBox.x + playerHudBox.width - (metersBox.x + metersBox.width) >= 48,
  '玩家 HUD 内容不得进入右侧角饰安全区');
assert.ok(enemyHudBox.x + enemyHudBox.width - (enemyHealthBox.x + enemyHealthBox.width) >= 36,
  '怪物 HUD 内容不得进入右侧角饰安全区');
assert.ok(enemyHeadingBox.y - enemyHudBox.y >= 10, '怪物名称与 HUD 上边框应保留安全距离');
assert.ok(enemyHudBox.y + enemyHudBox.height - (enemyAttackBox.y + enemyAttackBox.height) >= 10,
  '怪物蓄力技能与 HUD 下边框应保留安全距离');
assert.ok(enemyAttackTrackBox.height >= enemyHealthBox.height * 0.8,
  '怪物蓄力进度条高度应接近生命条');
const boardFrameLeft = gameplayCanvasBox.x + (360 - 680 / 2) / 720 * gameplayCanvasBox.width;
const firstBubbleCenter = 360 - 470 / 2 + 470 / 4 / 2;
const bubbleRadius = ((604 - 70) / 4 * 0.76) / 2;
const firstBubbleLeft = gameplayCanvasBox.x + (firstBubbleCenter - bubbleRadius) / 720 * gameplayCanvasBox.width;
assert.ok(firstBubbleLeft - boardFrameLeft >= gameplayCanvasBox.width * (680 / 720) * 0.16,
  '四角泡泡不得进入盘面边框装饰区');
const enemyScreenCenterY = gameplayCanvasBox.y + state.feedback.enemy.y / 1280 * gameplayCanvasBox.height;
const boardScreenTop = gameplayCanvasBox.y + (920 - 680 / 2) / 1280 * gameplayCanvasBox.height;
assert.ok(enemyScreenCenterY > targetBubblesBox.y + targetBubblesBox.height && enemyScreenCenterY < boardScreenTop,
  '怪物中心应位于怪物 HUD 下方的目标泡泡与玩法盘面之间');
assert.ok(Math.abs(enemyScreenCenterY - (enemyHudBox.y + enemyHudBox.height + boardScreenTop) / 2) <= 3,
  '怪物应在怪物 HUD 与泡泡外框之间垂直居中');
assert.ok(Math.abs((enemyNameBox.x + enemyNameBox.width / 2) - (enemyHudBox.x + enemyHudBox.width / 2)) <= 2,
  '怪物名称应在怪物 HUD 中几何居中');
const enemyPotionStyle = await page.locator('#enemy-health-fill').evaluate((element) => ({
  overflow: getComputedStyle(element).overflow,
  bubbles: getComputedStyle(element, '::before').animationName,
  meniscus: getComputedStyle(element, '::after').animationName,
  outerParticles: getComputedStyle(element.parentElement, '::after').content,
}));
assert.equal(enemyPotionStyle.overflow, 'hidden', '药剂气泡必须裁剪在当前填充值内部');
assert.match(enemyPotionStyle.bubbles, /potion-bubbles-rise/);
assert.match(enemyPotionStyle.meniscus, /potion-meniscus/);
assert.equal(enemyPotionStyle.outerParticles, 'none', '空轨道外部不应继续绘制漂浮粒子');
await screenshot(page, '02-seek-light-battle.png');

const refreshPage = await context.newPage();
await refreshPage.goto(`${BASE_URL}?seed=2654435761`, { waitUntil: 'networkidle' });
await refreshPage.waitForFunction(() => typeof window.render_game_to_text === 'function');
await refreshPage.locator('#start-game').tap();
let refreshState = await readState(refreshPage);
const refreshBoard = refreshState.battle.board;
const wrongBubble = refreshState.bubbles.find((bubble) => !bubble.isTarget
  && !refreshState.battle.enemy.intentTargets.includes(bubble.index));
assert.ok(wrongBubble);
assert.equal(refreshState.boardTapLimit, refreshState.targetCount + 3);
for (let tap = 1; tap <= refreshState.boardTapLimit; tap += 1) {
  await refreshPage.evaluate((index) => window.selectBubble(index), wrongBubble.index);
  refreshState = await readState(refreshPage);
  assert.equal(refreshState.boardTapCount, tap);
}
assert.equal(refreshState.phase, 'transition', '点击达到目标泡泡数 +3 时应换盘');
await refreshPage.evaluate(() => window.advanceTime(420));
refreshState = await readState(refreshPage);
assert.equal(refreshState.battle.board, refreshBoard + 1);
assert.equal(refreshState.boardTapCount, 0);
assert.equal(await refreshPage.locator('#target-bubbles > i').count(), refreshState.remainingTargets,
  '换盘后可消耗泡泡应按新目标数重置');
await refreshPage.close();

const firstTarget = state.bubbles.find((bubble) => bubble.isTarget);
assert.ok(firstTarget);
await tapBubble(page, state, firstTarget.index);
await page.waitForTimeout(100);
state = await readState(page);
assert.equal(state.score, 10);
assert.equal(state.battle.enemy.hp, 142);
assert.equal(state.feedback.audio.recentSfx.at(-3), 'tap', '点击泡泡应先播放戳破泡泡音效');
assert.match(state.feedback.audio.recentSfx.at(-2), /^correct-pop-[1-3]$/, '正确点击应播放独立的成功确认音效');
assert.equal(state.feedback.audio.recentSfx.at(-1), 'enemy-hit');
const combatTextAnchorY = state.feedback.combatText.anchorY;
const combatTextScreenY = gameplayCanvasBox.y + combatTextAnchorY / 1280 * gameplayCanvasBox.height;
assert.equal(state.feedback.combatText.message, '-8');
assert.ok(combatTextScreenY > enemyHudBox.y + enemyHudBox.height && combatTextScreenY < enemyScreenCenterY,
  '战斗浮字应位于怪物 HUD 与怪物中心之间');
assert.ok(state.feedback.transformedBubbles.every((bubble) => bubble.index === firstTarget.index),
  '正确点击期间只有被点击泡泡可以产生形变');
assert.equal(await page.locator('#player-energy-value').textContent(), `${Math.round((state.targetCount - state.remainingTargets) / state.targetCount * 100)}%`);
assert.equal(await page.locator('#target-bubbles > i').count(), state.remainingTargets, '正确点击后可消耗泡泡应减少一个');
await screenshot(page, '02b-isolated-bubble-pop.png');

assert.equal(state.battle.enemy.mechanicState, 'active');
assert.ok(state.battle.enemy.intentTargets.length >= 2);
assert.equal(state.battle.enemy.attackState, 'charging');
assert.ok(state.battle.enemy.attackProgress < 0.03, '开盘机制激活时撞击蓄力仍应接近 0');
assert.equal(await page.locator('#enemy-attack-label').textContent(), '撞击蓄力');
assert.equal(state.feedback.intentLinks.rendered, state.battle.enemy.intentTargets.length);
await screenshot(page, '03-jelly-intent-links.png');
await page.waitForTimeout(450);
state = await readState(page);

const hpBeforeCounterMiss = state.battle.player.hp;
const counterMissDamage = Math.ceil(state.battle.player.mistakeDamage * 0.5);
const enemyImpactDamage = state.battle.enemy.attack;
const intentCountBeforeImpact = state.battle.enemy.intentTargets.length;
await page.evaluate((index) => window.selectBubble(index), state.battle.enemy.intentTargets[1]);
const counterMissIndex = state.battle.enemy.intentTargets[1];
await page.waitForTimeout(120);
state = await readState(page);
assert.equal(state.battle.player.hp, hpBeforeCounterMiss - counterMissDamage);
assert.equal(state.feedback.combatText.anchorY, combatTextAnchorY, '失误反馈应复用统一的怪物上方锚点');
assert.equal(state.battle.enemy.intentCursor, 0);
assert.equal(state.battle.player.mistakes, 1);
assert.ok(state.feedback.transformedBubbles.every((bubble) => bubble.index === counterMissIndex),
  '错误点击期间只有被点击泡泡可以产生形变');

state = await advanceToWindup(page, state);
assert.equal(state.battle.enemy.attackState, 'windup');
assert.equal(state.feedback.enemy.breathing, false, '怪物蓄力时应暂停呼吸，避免动作抢姿态');
assert.equal(state.battle.enemy.mechanicState, 'active');
assert.equal(state.feedback.intentLinks.rendered, intentCountBeforeImpact, '撞击蓄满时机制连线仍应独立存在');
assert.equal(await page.locator('#enemy-attack-label').textContent(), '撞击警告');
await page.evaluate((milliseconds) => window.advanceTime(milliseconds), state.battle.enemy.windupMs);
state = await readState(page);
assert.equal(state.battle.enemy.attackState, 'recovery');
assert.equal(state.feedback.enemy.breathing, false, '怪物撞屏回位前不应提前恢复呼吸');
assert.equal(state.battle.player.hp, hpBeforeCounterMiss - counterMissDamage - enemyImpactDamage);
assert.equal(state.feedback.combatText.anchorY, combatTextAnchorY, '怪物伤害反馈应复用统一的怪物上方锚点');
assert.equal(state.battle.enemy.mechanicState, 'active');
assert.equal(state.feedback.intentLinks.rendered, intentCountBeforeImpact, '怪物撞屏不应清除独立机制连线');
assert.ok(state.feedback.enemy.y >= 700, '第一战应由怪物本体撞向屏幕');
assert.ok(state.feedback.enemy.scaleX >= 0.4, '怪物撞屏时应明显放大');
assert.equal(state.feedback.audio.recentSfx.at(-1), 'enemy-attack', '怪物撞屏应播放水下重击音效');
await screenshot(page, '04-jelly-screen-impact.png');
await page.waitForTimeout(420);
state = await readState(page);
assert.equal(state.feedback.enemy.breathing, true, '怪物撞屏回位后应恢复呼吸');
await page.reload({ waitUntil: 'networkidle' });
await page.locator('#start-game').tap();
state = await readState(page);
assert.equal(state.battle.enemy.mechanicState, 'active');
const firstIntentIndex = state.battle.enemy.intentTargets[state.battle.enemy.intentCursor];
const intentCountBeforeResolve = state.battle.enemy.intentTargets.length;
await page.evaluate((index) => window.selectBubble(index), firstIntentIndex);
state = await readState(page);
assert.equal(state.bubbles[firstIntentIndex].cleared, false, '吞噬化解不应改变原盘面目标状态');
assert.equal(state.feedback.intentLinks.rendered, intentCountBeforeResolve - 1, '已消失的化解泡泡不应保留空连线');
await page.waitForTimeout(280);
await screenshot(page, '03b-jelly-intent-resolved.png');
state = await resolveIntent(page, state);
assert.equal(state.battle.enemy.poise, 1);
assert.equal(state.battle.enemy.mechanicState, 'inactive');
assert.equal(state.battle.enemy.attackState, 'charging');
const firstBoard = state.battle.board;
state = await progressUntil(page, (snapshot) => snapshot.battle.board === firstBoard + 1);
assert.equal(state.battle.enemy.mechanicState, 'active');
state = await resolveIntent(page, state);
assert.equal(state.battle.enemy.mechanicState, 'staggered');
assert.equal(state.battle.enemy.poise, 0);
assert.equal(state.feedback.combatText.anchorY, combatTextAnchorY, '破势反馈应复用统一的怪物上方锚点');
assert.equal(await page.locator('#enemy-attack-label').textContent(), '撞击蓄力');
await page.locator('#level-toast.is-combat.is-active').waitFor({ state: 'visible' });
const combatToastDuration = await page.locator('#level-toast').evaluate((element) => {
  const animation = element.getAnimations()[0];
  return animation?.effect?.getTiming().duration ?? 0;
});
assert.ok(Number(combatToastDuration) >= 1500, '战斗提示显示时间应不少于 1.5 秒');
await page.locator('#level-toast').evaluate((element) => element.getAnimations().forEach((animation) => {
  animation.currentTime = 800;
  animation.pause();
}));
const counterToastBox = await page.locator('#level-toast').boundingBox();
const counterShellBox = await page.locator('#game-shell').boundingBox();
const currentEnemyTop = gameplayCanvasBox.y
  + (state.feedback.enemy.y - state.feedback.enemy.displayHeight / 2) / 1280 * gameplayCanvasBox.height;
assert.ok(counterToastBox && counterShellBox);
const counterCenterDelta = counterToastBox.x + counterToastBox.width / 2
  - (counterShellBox.x + counterShellBox.width / 2);
assert.ok(Math.abs(counterCenterDelta) <= 5,
  `反制提示应与怪物水平居中，当前偏差 ${counterCenterDelta.toFixed(2)}px`);
assert.ok(counterToastBox.y + counterToastBox.height <= currentEnemyTop + 18,
  '反制提示应统一显示在怪物上方');
await screenshot(page, '05-jelly-staggered.png');
await page.locator('#level-toast').evaluate((element) => element.getAnimations().forEach((animation) => animation.play()));

await page.locator('#pause-button').tap();
state = await readState(page);
assert.equal(state.phase, 'paused', '点击泡泡头像应暂停游戏');
const pausedAttackProgress = state.battle.enemy.attackProgress;
await page.evaluate(() => window.advanceTime(3000));
assert.equal((await readState(page)).battle.enemy.attackProgress, pausedAttackProgress, '暂停时怪物蓄力应冻结');
await page.locator('#resume-button').tap();

const captured = new Set();
const capturedWindups = new Set();
let sawBattle4SingleHit = false;
let sawBattle5SingleHit = false;
let sawComboImpact = false;
let sawShieldBreak = false;
let sawBattleToast = false;
let sawHazardTargetCorrect = false;
let primedCombo = false;
let sawCompactRewardLayout = false;
for (let guard = 0; guard < 1400; guard += 1) {
  state = await readState(page);
  if (state.phase === 'victory') break;

  if (state.phase === 'transition') {
    await page.evaluate((milliseconds) => window.advanceTime(milliseconds), state.battle.enemy.hp === 0 ? 800 : 420);
    continue;
  }
  if (state.phase === 'reward') {
    assert.equal(state.battle.rewards.length, 3);
    if (!sawCompactRewardLayout) {
      await page.setViewportSize({ width: 320, height: 568 });
      await page.waitForTimeout(100);
      const rewardCard = await page.locator('.reward-card').boundingBox();
      const rewardOptions = await page.locator('.reward-option').all();
      assert.ok(rewardCard && rewardCard.x >= 0 && rewardCard.y >= 0
        && rewardCard.x + rewardCard.width <= 320 && rewardCard.y + rewardCard.height <= 568,
      '紧凑屏奖励弹窗必须完整落在可视区域内');
      assert.equal(await page.locator('.reward-option > img').count(), 3, '奖励图标应全部使用生成图片');
      assert.equal(await page.locator('.reward-option > em:visible').count(), 0, '紧凑屏不显示重复的选择文字');
      for (const option of rewardOptions) {
        const box = await option.boundingBox();
        const textBox = await option.locator('span').boundingBox();
        assert.ok(box && textBox && textBox.x >= box.x && textBox.x + textBox.width <= box.x + box.width,
          '奖励说明不能越出卡片');
      }
      await screenshot(page, '06-compact-reward.png');
      await page.setViewportSize({ width: 390, height: 844 });
      sawCompactRewardLayout = true;
    }
    const shieldIndex = state.battle.rewards.findIndex((reward) => reward.id === 'shield');
    await page.evaluate((index) => window.selectReward(index), shieldIndex >= 0 ? shieldIndex : 0);
    if (!sawBattleToast) {
      const battleToast = page.locator('#level-toast.is-battle.is-active');
      await battleToast.waitFor({ state: 'visible' });
      assert.match((await battleToast.textContent()) ?? '', /^第 2 战 · /);
      await battleToast.evaluate((element) => element.getAnimations().forEach((animation) => {
        animation.currentTime = 800;
        animation.pause();
      }));
      const battleToastBox = await battleToast.boundingBox();
      assert.ok(battleToastBox && battleToastBox.x < 40 && battleToastBox.x + battleToastBox.width < 195,
        '第几战提示应只在屏幕左侧显示');
      await screenshot(page, '06-battle-toast-left.png');
      await battleToast.evaluate((element) => element.getAnimations().forEach((animation) => animation.play()));
      sawBattleToast = true;
    }
    continue;
  }
  if (state.phase !== 'playing') break;
  const expectedEnemyHp = [150, 240, 380, 600, 950][state.battle.current - 1];
  const expectedMistakeDamage = [5, 5, 6, 7, 8][state.battle.current - 1];
  assert.equal(state.battle.enemy.maxHp, expectedEnemyHp);
  assert.equal(state.battle.player.mistakeDamage, expectedMistakeDamage);
  assert.equal(state.visibleTargets.length, state.remainingTargets, '所有战斗都应持续显示目标泡泡');
  if (!captured.has(state.battle.current)) {
    captured.add(state.battle.current);
    await page.waitForTimeout(450);
    await screenshot(page, `06-${state.battle.enemy.id}-${state.battle.enemy.mechanic}.png`);
  }

  if (state.battle.enemy.mechanicState === 'active') {
    if (['sequence', 'capture', 'shell'].includes(state.battle.enemy.mechanic)) {
      await page.evaluate((index) => window.selectBubble(index), state.battle.enemy.intentTargets[state.battle.enemy.intentCursor]);
      continue;
    }
    if (state.battle.enemy.mechanic === 'guard') {
      await page.evaluate(() => window.advanceTime(900));
      continue;
    }
    const hazardTarget = state.bubbles.find((bubble) => bubble.isTarget && !bubble.cleared
      && bubble.row === state.battle.enemy.hazardRow);
    if (hazardTarget && !sawHazardTargetCorrect) {
      const hpBefore = state.battle.player.hp;
      const mistakesBefore = state.battle.player.mistakes;
      await tapBubble(page, state, hazardTarget.index);
      state = await readState(page);
      assert.equal(state.bubbles[hazardTarget.index].cleared, true,
        '扫线覆盖的可见目标泡泡应通过真实触控正常清除');
      assert.equal(state.battle.player.hp, hpBefore, '正确目标不应被扫线误判并扣血');
      assert.equal(state.battle.player.mistakes, mistakesBefore, '正确目标不应累计失误');
      assert.equal(state.battle.enemy.mechanicState, 'active', '危险行目标不应直接解除扫线');
      await screenshot(page, '06-manta-hazard-target-correct.png');
      sawHazardTargetCorrect = true;
      continue;
    }
    const safeTarget = state.bubbles.find((bubble) => bubble.isTarget && !bubble.cleared && bubble.row !== state.battle.enemy.hazardRow);
    assert.ok(safeTarget && safeTarget.row !== state.battle.enemy.hazardRow);
    await page.evaluate((index) => window.selectBubble(index), safeTarget.index);
    continue;
  }

  if (state.battle.current === 2 && !primedCombo) {
    await page.evaluate((milliseconds) => window.advanceTime(milliseconds), state.battle.enemy.attackCooldownMs * 0.45);
    primedCombo = true;
    continue;
  }

  if (state.battle.current === 3 && state.battle.player.shield > state.battle.enemy.attack && !sawShieldBreak) {
    const breakCount = state.feedback.shield.breakCount;
    const initialShield = state.battle.player.shield;
    const maxShield = state.battle.player.maxShield;
    assert.equal(state.feedback.shield.max, maxShield);
    assert.equal(state.feedback.shield.ratio, 1);
    assert.equal(state.feedback.shield.damageStage, 'intact');
    assert.equal(state.feedback.shield.cracksVisible, false);
    assert.equal(await page.locator('#player-shield-value').textContent(), `${initialShield}/${maxShield}`);
    assert.equal(await page.locator('#player-shield-fill').evaluate((element) => element.style.width), '100%');
    await screenshot(page, '07-shield-intact.png');
    state = await advanceToWindup(page, state);
    assert.equal(state.battle.enemy.attackState, 'windup');
    await page.evaluate((milliseconds) => window.advanceTime(milliseconds), state.battle.enemy.windupMs);
    state = await readState(page);
    const shieldAfterFirstImpact = initialShield - state.battle.enemy.attack;
    const shieldRatio = Number((shieldAfterFirstImpact / maxShield).toFixed(2));
    assert.equal(state.battle.player.shield, shieldAfterFirstImpact);
    assert.equal(state.feedback.shield.breakCount, breakCount, '护盾未耗尽时不应播放完整碎裂');
    assert.equal(state.feedback.shield.ratio, shieldRatio);
    assert.notEqual(state.feedback.shield.damageStage, 'intact');
    assert.equal(state.feedback.shield.cracksVisible, true, '裂纹应只在护盾实际格挡时短暂显示');
    assert.equal(await page.locator('#player-shield-value').textContent(), `${shieldAfterFirstImpact}/${maxShield}`);
    const shieldFillPercent = await page.locator('#player-shield-fill').evaluate((element) => Number.parseFloat(element.style.width));
    assert.ok(Math.abs(shieldFillPercent - shieldAfterFirstImpact / maxShield * 100) < 0.01);
    await screenshot(page, '07-shield-impact.png');
    await page.evaluate(() => window.advanceTime(320));
    await page.waitForTimeout(1300);
    await page.waitForFunction(() => !JSON.parse(window.render_game_to_text()).feedback.shield.cracksVisible);
    state = await readState(page);
    assert.notEqual(state.feedback.shield.damageStage, 'intact');
    assert.equal(state.feedback.shield.cracksVisible, false, '受击反馈结束后不应持续显示破损');
    await screenshot(page, '07-shield-damaged.png');
    for (let guard = 0; guard < 4 && state.battle.player.shield > 0; guard += 1) {
      state = await advanceToWindup(page, state);
      assert.equal(state.battle.enemy.attackState, 'windup');
      await page.evaluate((milliseconds) => window.advanceTime(milliseconds), state.battle.enemy.windupMs);
      state = await readState(page);
    }
    assert.equal(state.battle.player.shield, 0);
    assert.equal(state.feedback.shield.breakCount, breakCount + 1);
    assert.equal(state.feedback.shield.damageStage, 'none');
    assert.equal(state.feedback.shield.cracksVisible, true);
    assert.equal(await page.locator('#player-shield-value').textContent(), '0/20');
    assert.equal(await page.locator('#player-shield-fill').evaluate((element) => element.style.width), '0%');
    await screenshot(page, '07-shield-break.png');
    sawShieldBreak = true;
    continue;
  }

  if (state.battle.enemy.attackState === 'windup') {
    if (!capturedWindups.has(state.battle.enemy.id)) {
      capturedWindups.add(state.battle.enemy.id);
      await page.waitForTimeout(260);
      await screenshot(page, `06-${state.battle.enemy.id}-${state.battle.enemy.mechanic}-windup.png`);
    }
    await page.evaluate((milliseconds) => window.advanceTime(milliseconds), state.battle.enemy.windupMs);
    continue;
  }

  const target = state.bubbles.find((bubble) => bubble.isTarget && !bubble.cleared)?.index;
  assert.notEqual(target, null);
  assert.notEqual(target, undefined);

  if (state.battle.current === 4 && !sawBattle4SingleHit) {
    assert.equal('hitsRequired' in state.bubbles[target], false);
    await page.evaluate((index) => window.selectBubble(index), target);
    const afterHit = await readState(page);
    assert.equal(afterHit.bubbles[target].cleared, true);
    await screenshot(page, '07-battle-4-single-hit.png');
    sawBattle4SingleHit = true;
    continue;
  }
  if (state.battle.current === 5 && !sawBattle5SingleHit) {
    assert.equal('hitsRequired' in state.bubbles[target], false);
    assert.equal(state.feedback.enemy.displayWidth, 340, 'Boss 应比上一版更大');
    await page.evaluate((index) => window.selectBubble(index), target);
    const afterHit = await readState(page);
    assert.equal(afterHit.bubbles[target].cleared, true);
    await screenshot(page, '08-boss-single-hit.png');
    sawBattle5SingleHit = true;
    continue;
  }
  await page.evaluate((index) => window.selectBubble(index), target);
  const afterHit = await readState(page);
  if (!sawComboImpact && afterHit.battle.current > 1
    && afterHit.battle.player.combo > 1 && afterHit.battle.enemy.lastReduction > 0
    && await page.locator('#combo-burst').isVisible()) {
    const reductionPercent = Math.round(afterHit.battle.enemy.lastReduction * 1000) / 10;
    const expectedImpact = `连击破势 · 蓄力 -${reductionPercent}%`;
    await page.locator('#combo-impact.is-visible').waitFor({ state: 'attached' });
    assert.equal(await page.locator('#combo-impact').textContent(), expectedImpact);
    const comboBox = await page.locator('#combo-burst').boundingBox();
    const enemyBox = await page.locator('#enemy-status').boundingBox();
    const playerBox = await page.locator('.player-status').boundingBox();
    const targetBox = await page.locator('#target-bubbles').boundingBox();
    assert.ok(comboBox && enemyBox && playerBox && targetBox);
    assert.equal(boxesOverlap(comboBox, enemyBox), false, 'Combo 不应遮挡怪物状态 UI');
    assert.equal(boxesOverlap(comboBox, playerBox), false, 'Combo 不应遮挡玩家状态 UI');
    assert.equal(boxesOverlap(comboBox, targetBox), false, 'Combo 不应遮挡目标提示');
    assert.ok(comboBox.y < 310, 'Combo 应尽量靠近顶部状态区');
    await screenshot(page, '07-combo-impact.png');
    sawComboImpact = true;
  }
}

state = await readState(page);
assert.equal(state.phase, 'victory');
assert.equal(state.battle.current, 5);
assert.ok(state.battle.player.hp > 0);
assert.ok(sawBattle4SingleHit);
assert.ok(sawBattle5SingleHit);
assert.ok(sawComboImpact);
assert.ok(sawShieldBreak);
assert.ok(sawBattleToast);
assert.ok(sawHazardTargetCorrect);
assert.ok(sawCompactRewardLayout);
await page.locator('#victory-modal.is-visible').waitFor();
await screenshot(page, '09-victory.png');

await page.locator('#victory-home').tap();
await page.locator('#menu-settings').tap();
const modalFrames = await page.locator('.modal-card').evaluateAll((elements) =>
  elements.map((element) => getComputedStyle(element).borderImageSource));
assert.equal(modalFrames.length, 6);
assert.ok(modalFrames.every((source) => /modal-frame\.png/.test(source)), '所有弹窗应共用生图海洋边框');
const modalSlices = await page.locator('.modal-card').evaluateAll((elements) =>
  elements.map((element) => Number.parseFloat(getComputedStyle(element).borderImageSlice)));
assert.ok(modalSlices.every((slice) => slice >= 180), '弹窗九宫格必须完整保留角饰，不能切入拉伸区');
const musicVolume = page.locator('#music-volume');
assert.equal(await musicVolume.inputValue(), '40');
await musicVolume.fill('65');
assert.equal(await page.locator('#music-volume-value').textContent(), '65%');
assert.equal(await page.locator('[data-preference="reducedMotion"]').count(), 0);
assert.equal(await page.locator('#settings-modal .modal-kicker').count(), 0);
await page.locator('#settings-close').tap();

await page.reload({ waitUntil: 'networkidle' });
assert.match(await page.locator('#gameover-best').textContent(), /^\d+$/, '刷新后最佳分数仍应为数字');
await page.locator('#menu-settings').tap();
assert.equal(await page.locator('#music-volume').inputValue(), '65');
await page.locator('#settings-close').tap();
await page.setViewportSize({ width: 1280, height: 800 });
await page.waitForTimeout(100);
await screenshot(page, '12-desktop-shell.png');

assert.deepEqual(errors, [], `browser errors:\n${errors.join('\n')}`);
await browser.close();
console.log(`Production ${BROWSER_NAME} flow passed: randomized five-enemy route, distinct counterplay, shield, victory, settings and responsive shell.`);

async function readState(targetPage) {
  return targetPage.evaluate(() => JSON.parse(window.render_game_to_text()));
}

async function screenshot(targetPage, name) {
  await targetPage.screenshot({ path: new URL(name, OUTPUT_DIR).pathname, fullPage: true });
}

async function advanceToWindup(targetPage, initial) {
  let snapshot = initial;
  for (let guard = 0; guard < 12 && snapshot.battle.enemy.attackState !== 'windup'; guard += 1) {
    if (snapshot.phase === 'transition') {
      await targetPage.evaluate(() => window.advanceTime(420));
    } else if (snapshot.battle.enemy.attackState === 'charging') {
      const remaining = Math.max(60, snapshot.battle.enemy.attackCooldownMs * (1 - snapshot.battle.enemy.attackProgress) + 60);
      await targetPage.evaluate((milliseconds) => window.advanceTime(milliseconds), remaining);
    } else {
      await targetPage.evaluate(() => window.advanceTime(1700));
    }
    snapshot = await readState(targetPage);
  }
  return snapshot;
}

async function resolveIntent(targetPage, initial) {
  let snapshot = initial;
  while (snapshot.battle.enemy.mechanicState === 'active') {
    await targetPage.evaluate((index) => window.selectBubble(index), snapshot.battle.enemy.intentTargets[snapshot.battle.enemy.intentCursor]);
    snapshot = await readState(targetPage);
  }
  return snapshot;
}

async function progressUntil(targetPage, predicate) {
  for (let guard = 0; guard < 120; guard += 1) {
    const snapshot = await readState(targetPage);
    if (predicate(snapshot)) return snapshot;
    if (snapshot.phase === 'playing') {
      const target = snapshot.bubbles.find((bubble) => bubble.isTarget && !bubble.cleared);
      assert.ok(target);
      await targetPage.evaluate((index) => window.selectBubble(index), target.index);
    } else if (snapshot.phase === 'transition') {
      await targetPage.evaluate(() => window.advanceTime(420));
    } else {
      throw new Error(`Cannot progress from ${snapshot.phase}`);
    }
  }
  throw new Error('Progress guard exhausted');
}

async function tapBubble(targetPage, snapshot, index) {
  const bubble = snapshot.bubbles[index];
  const canvas = targetPage.locator('#game-container canvas');
  const box = await canvas.boundingBox();
  assert.ok(box && bubble);
  const innerSize = 470;
  const cellWidth = innerSize / snapshot.grid.cols;
  const cellHeight = innerSize / snapshot.grid.rows;
  const logicalX = 360 - innerSize / 2 + cellWidth / 2 + bubble.col * cellWidth;
  const logicalY = 920 - innerSize / 2 + cellHeight / 2 + bubble.row * cellHeight;
  await targetPage.touchscreen.tap(box.x + logicalX * (box.width / 720), box.y + logicalY * (box.height / 1280));
  await targetPage.waitForTimeout(35);
}

function boxesOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y;
}
