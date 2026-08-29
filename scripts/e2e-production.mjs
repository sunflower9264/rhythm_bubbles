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
assert.ok(startBox && logoBox && startBox.y > logoBox.y + logoBox.height + 45 && startBox.y < 620,
  '开始游戏应位于艺术字标题下方');
assert.ok(settingsBox && settingsBox.y >= startBox.y + startBox.height + 24, '开始游戏与设置之间应留出明显间隔');

await page.locator('#start-game').tap();
await page.evaluate(() => window.advanceTime(0));
let state = await readState(page);
assert.equal(state.phase, 'playing');
assert.equal(state.mode, 'classic');
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
assert.deepEqual(state.grid, { rows: 4, cols: 4 }, '所有战斗应固定使用 4x4 泡泡盘面');
assert.equal(state.timerMs, 0, '盘面倒计时应已取消');
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
const gameplayCanvasBox = await page.locator('#game-container canvas').boundingBox();
assert.ok(playerHudBox && enemyHudBox && targetBubblesBox && enemyNameBox && avatarBox && metersBox && gameplayCanvasBox);
assert.ok(playerHudBox.y + playerHudBox.height <= enemyHudBox.y, '玩家 HUD 应位于怪物 HUD 上方');
assert.ok(enemyHudBox.y + enemyHudBox.height <= targetBubblesBox.y, '可消耗泡泡应位于怪物 HUD 下方');
assert.ok(Math.abs(targetBubblesBox.x - enemyHudBox.x) <= 8, '可消耗泡泡应从怪物 HUD 左侧开始排列');
assert.ok(Math.abs(avatarBox.width - avatarBox.height) <= 1, '玩家头像应为圆形');
assert.ok(Math.abs(avatarBox.height - metersBox.height) <= 2, '三条玩家状态的总高应与头像一致');
const enemyScreenCenterY = gameplayCanvasBox.y + state.feedback.enemy.y / 1280 * gameplayCanvasBox.height;
const boardScreenTop = gameplayCanvasBox.y + (920 - 604 / 2) / 1280 * gameplayCanvasBox.height;
assert.ok(enemyScreenCenterY > targetBubblesBox.y + targetBubblesBox.height && enemyScreenCenterY < boardScreenTop,
  '怪物中心应位于怪物 HUD 下方的目标泡泡与玩法盘面之间');
assert.ok(Math.abs(enemyScreenCenterY - (enemyHudBox.y + enemyHudBox.height + boardScreenTop) / 2) <= 2,
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
const wrongBubble = refreshState.bubbles.find((bubble) => !bubble.isTarget);
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

state = await progressUntil(page, (snapshot) => snapshot.battle.enemy.attackState === 'windup');
assert.ok(state.battle.enemy.intentTargets.length >= 2);
assert.equal(await page.locator('#enemy-attack-label').textContent(), `吞噬对招 0/${state.battle.enemy.intentTargets.length}`);
assert.equal(state.feedback.intentLinks.rendered, state.battle.enemy.intentTargets.length);
await screenshot(page, '03-jelly-intent-links.png');
await page.waitForTimeout(450);
state = await readState(page);

const hpBeforeCounterMiss = state.battle.player.hp;
const counterMissDamage = Math.ceil(state.battle.player.mistakeDamage * 0.5);
const enemyImpactDamage = state.battle.enemy.attack;
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

await page.evaluate((milliseconds) => window.advanceTime(milliseconds), state.battle.enemy.windupMs);
state = await readState(page);
assert.equal(state.battle.enemy.attackState, 'recovery');
assert.equal(state.battle.player.hp, hpBeforeCounterMiss - counterMissDamage - enemyImpactDamage);
assert.equal(state.feedback.combatText.anchorY, combatTextAnchorY, '怪物伤害反馈应复用统一的怪物上方锚点');
assert.equal(state.feedback.intentLinks.rendered, 0, '怪物撞屏时应清除目标连线');
assert.ok(state.feedback.enemy.y >= 700, '第一战应由怪物本体撞向屏幕');
assert.ok(state.feedback.enemy.scaleX >= 0.4, '怪物撞屏时应明显放大');
await screenshot(page, '04-jelly-screen-impact.png');
await page.reload({ waitUntil: 'networkidle' });
await page.locator('#start-game').tap();
state = await readState(page);
state = await progressUntil(page, (snapshot) => snapshot.battle.enemy.attackState === 'windup');
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
assert.equal(state.battle.enemy.attackState, 'charging');
await page.evaluate((milliseconds) => window.advanceTime(milliseconds), state.battle.enemy.attackCooldownMs);
state = await readState(page);
assert.equal(state.battle.enemy.attackState, 'windup');
state = await resolveIntent(page, state);
assert.equal(state.battle.enemy.attackState, 'staggered');
assert.equal(state.battle.enemy.poise, 0);
assert.equal(state.feedback.combatText.anchorY, combatTextAnchorY, '破势反馈应复用统一的怪物上方锚点');
assert.equal(await page.locator('#enemy-attack-label').textContent(), '破势！伤害 ×1.5');
await page.locator('#level-toast.is-combat.is-active').waitFor({ state: 'visible' });
await page.locator('#level-toast').evaluate((element) => element.getAnimations().forEach((animation) => {
  animation.currentTime = 450;
  animation.pause();
}));
const counterToastBox = await page.locator('#level-toast').boundingBox();
const currentEnemyTop = gameplayCanvasBox.y
  + (state.feedback.enemy.y - state.feedback.enemy.displayHeight / 2) / 1280 * gameplayCanvasBox.height;
assert.ok(counterToastBox);
assert.ok(Math.abs(counterToastBox.x + counterToastBox.width / 2 - (shellBox.x + shellBox.width / 2)) <= 2,
  '反制提示应与怪物水平居中');
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
let primedCombo = false;
for (let guard = 0; guard < 1400; guard += 1) {
  state = await readState(page);
  if (state.phase === 'victory') break;

  if (state.phase === 'preview') {
    const expectedEnemyHp = [150, 240, 380, 600, 950][state.battle.current - 1];
    const expectedMistakeDamage = [5, 5, 6, 7, 8][state.battle.current - 1];
    assert.equal(state.battle.enemy.maxHp, expectedEnemyHp);
    assert.equal(state.battle.player.mistakeDamage, expectedMistakeDamage);
    assert.equal(state.visibleTargets.length, state.remainingTargets,
      state.mode === 'memory' ? '记忆模式应一次显示全部目标' : '顺序模式应同时显示完整顺序');
    if (!captured.has(state.battle.current)) {
      captured.add(state.battle.current);
      await page.waitForTimeout(450);
      await screenshot(page, `06-${state.battle.enemy.id}-${state.battle.enemy.mechanic}.png`);
    }
    await advancePreview(page, state);
    continue;
  }
  if (state.phase === 'transition') {
    await page.evaluate((milliseconds) => window.advanceTime(milliseconds), state.battle.enemy.hp === 0 ? 800 : 420);
    continue;
  }
  if (state.phase === 'reward') {
    assert.equal(state.battle.rewards.length, 3);
    const shieldIndex = state.battle.rewards.findIndex((reward) => reward.id === 'shield');
    await page.evaluate((index) => window.selectReward(index), state.battle.current === 1 && shieldIndex >= 0 ? shieldIndex : 0);
    if (!sawBattleToast) {
      const battleToast = page.locator('#level-toast.is-battle.is-active');
      await battleToast.waitFor({ state: 'visible' });
      assert.equal(await battleToast.textContent(), '第 2 战');
      await battleToast.evaluate((element) => element.getAnimations().forEach((animation) => {
        animation.currentTime = 450;
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

  if (state.battle.current === 2 && !primedCombo) {
    await page.evaluate((milliseconds) => window.advanceTime(milliseconds), state.battle.enemy.attackCooldownMs * 0.45);
    primedCombo = true;
    continue;
  }

  if (state.battle.current === 3 && state.battle.player.shield === 20 && !sawShieldBreak) {
    const breakCount = state.feedback.shield.breakCount;
    assert.equal(state.feedback.shield.max, 20);
    assert.equal(state.feedback.shield.ratio, 1);
    assert.equal(state.feedback.shield.damageStage, 'intact');
    assert.equal(state.feedback.shield.cracksVisible, false);
    assert.equal(state.battle.player.maxShield, 20);
    assert.equal(await page.locator('#player-shield-value').textContent(), '20/20');
    assert.equal(await page.locator('#player-shield-fill').evaluate((element) => element.style.width), '100%');
    await screenshot(page, '07-shield-intact.png');
    state = await advanceToWindup(page, state);
    assert.equal(state.battle.enemy.attackState, 'windup');
    await page.evaluate((milliseconds) => window.advanceTime(milliseconds), state.battle.enemy.windupMs);
    state = await readState(page);
    assert.equal(state.battle.player.shield, 6);
    assert.equal(state.feedback.shield.breakCount, breakCount, '护盾未耗尽时不应播放完整碎裂');
    assert.equal(state.feedback.shield.ratio, 0.3);
    assert.equal(state.feedback.shield.damageStage, 'damaged');
    assert.equal(state.feedback.shield.cracksVisible, true, '裂纹应只在护盾实际格挡时短暂显示');
    assert.equal(await page.locator('#player-shield-value').textContent(), '6/20');
    assert.equal(await page.locator('#player-shield-fill').evaluate((element) => element.style.width), '30%');
    await screenshot(page, '07-shield-impact.png');
    await page.evaluate(() => window.advanceTime(320));
    await page.waitForTimeout(1300);
    await page.waitForFunction(() => !JSON.parse(window.render_game_to_text()).feedback.shield.cracksVisible);
    state = await readState(page);
    assert.equal(state.feedback.shield.damageStage, 'damaged');
    assert.equal(state.feedback.shield.cracksVisible, false, '受击反馈结束后不应持续显示破损');
    await screenshot(page, '07-shield-damaged.png');
    state = await advanceToWindup(page, state);
    assert.equal(state.battle.enemy.attackState, 'windup');
    await page.evaluate((milliseconds) => window.advanceTime(milliseconds), state.battle.enemy.windupMs);
    state = await readState(page);
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
    if (['sequence', 'capture', 'shell'].includes(state.battle.enemy.mechanic)) {
      await page.evaluate((index) => window.selectBubble(index), state.battle.enemy.intentTargets[state.battle.enemy.intentCursor]);
      continue;
    }
    if (state.battle.enemy.mechanic === 'guard') {
      await page.evaluate((milliseconds) => window.advanceTime(milliseconds), state.battle.enemy.windupMs);
      continue;
    }
    if (state.battle.enemy.mechanic === 'sweep') {
      const safeTarget = state.bubbles.find((bubble) => bubble.isTarget && !bubble.cleared && bubble.row !== state.battle.enemy.hazardRow);
      if (safeTarget) await page.evaluate((index) => window.selectBubble(index), safeTarget.index);
      else await page.evaluate((milliseconds) => window.advanceTime(milliseconds), state.battle.enemy.windupMs);
      continue;
    }
  }

  const target = state.mode === 'sequence'
    ? state.expectedIndex
    : state.bubbles.find((bubble) => bubble.isTarget && !bubble.cleared)?.index;
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
await page.locator('#victory-modal.is-visible').waitFor();
await screenshot(page, '09-victory.png');

await page.locator('#victory-home').tap();
await page.locator('#menu-settings').tap();
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

async function advancePreview(targetPage, snapshot) {
  const duration = snapshot.mode === 'memory' ? 900 : (snapshot.remainingTargets + 1) * 300;
  await targetPage.evaluate((milliseconds) => window.advanceTime(milliseconds), duration);
}

async function advanceToWindup(targetPage, initial) {
  let snapshot = initial;
  for (let guard = 0; guard < 12 && snapshot.battle.enemy.attackState !== 'windup'; guard += 1) {
    if (snapshot.phase === 'preview') {
      await advancePreview(targetPage, snapshot);
    } else if (snapshot.phase === 'transition') {
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
  while (snapshot.battle.enemy.attackState === 'windup') {
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
  const innerSize = 604 - 70;
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
