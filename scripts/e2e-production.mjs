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
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});

await page.goto(`${BASE_URL}?seed=2654435761`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
assert.equal(await page.locator('#start-game').count(), 1);
assert.equal(await page.locator('#menu-settings').count(), 1);
assert.equal(await page.locator('#menu-help').count(), 0);
assert.equal(await page.locator('[data-mode]').count(), 0);
assert.equal(await page.locator('#fullscreen-button').count(), 0);
assert.equal(await page.locator('.run-preview').count(), 0);
assert.equal(await page.locator('.menu-hint').count(), 0);
assert.equal(await page.locator('#game-container canvas').getAttribute('aria-label'), '泡泡节拍游戏区：轻触泡泡进行游戏');
await screenshot(page, '01-clean-menu.png');

const shellBox = await page.locator('#game-shell').boundingBox();
assert.ok(shellBox && shellBox.width <= 390 && shellBox.height <= 844);
const startBox = await page.locator('#start-game').boundingBox();
const settingsBox = await page.locator('#menu-settings').boundingBox();
assert.ok(startBox && startBox.y > 420 && startBox.y < 680, '开始游戏应位于手机屏幕中偏下区域');
assert.ok(settingsBox && settingsBox.y > startBox.y + startBox.height, '游戏设置应位于开始游戏下方');

await page.locator('#start-game').tap();
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
assert.equal(await page.locator('.liquid-meter').count(), 5, '计时、敌我生命、蓄力和 Combo 应统一使用液体数值条');
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

const firstTarget = state.bubbles.find((bubble) => bubble.isTarget);
assert.ok(firstTarget);
await tapBubble(page, state, firstTarget.index);
state = await readState(page);
assert.equal(state.score, 10);
assert.equal(state.battle.enemy.hp, 142);

state = await progressUntil(page, (snapshot) => snapshot.battle.enemy.attackState === 'windup');
assert.ok(state.battle.enemy.intentTargets.length >= 2);
assert.equal(await page.locator('#enemy-attack-label').textContent(), `吞噬对招 0/${state.battle.enemy.intentTargets.length}`);
assert.equal(state.feedback.intentLinks.rendered, state.battle.enemy.intentTargets.length);
await screenshot(page, '03-jelly-intent-links.png');

const hpBeforeCounterMiss = state.battle.player.hp;
const counterMissDamage = Math.ceil(state.battle.player.mistakeDamage * 0.5);
const enemyImpactDamage = state.battle.enemy.attack;
await page.evaluate((index) => window.selectBubble(index), state.battle.enemy.intentTargets[1]);
state = await readState(page);
assert.equal(state.battle.player.hp, hpBeforeCounterMiss - counterMissDamage);
assert.equal(state.battle.enemy.intentCursor, 0);
assert.equal(state.battle.player.mistakes, 1);

await page.evaluate((milliseconds) => window.advanceTime(milliseconds), state.battle.enemy.windupMs);
state = await readState(page);
assert.equal(state.battle.enemy.attackState, 'recovery');
assert.equal(state.battle.player.hp, hpBeforeCounterMiss - counterMissDamage - enemyImpactDamage);
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
assert.equal(await page.locator('#enemy-attack-label').textContent(), '破势！伤害 ×1.5');
await screenshot(page, '05-jelly-staggered.png');

await page.locator('#pause-button').tap();
state = await readState(page);
const pausedTimer = state.timerMs;
await page.evaluate(() => window.advanceTime(3000));
assert.equal((await readState(page)).timerMs, pausedTimer);
await page.locator('#resume-button').tap();

const captured = new Set();
const capturedWindups = new Set();
let sawBattle4SingleHit = false;
let sawBattle5SingleHit = false;
let sawComboImpact = false;
let sawShieldBreak = false;
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
    const playerBox = await page.locator('.score-strip').boundingBox();
    assert.ok(comboBox && enemyBox && playerBox);
    assert.equal(boxesOverlap(comboBox, enemyBox), false, 'Combo 不应遮挡怪物状态 UI');
    assert.equal(boxesOverlap(comboBox, playerBox), false, 'Combo 不应遮挡玩家状态 UI');
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
await page.locator('#victory-modal.is-visible').waitFor();
await screenshot(page, '09-victory.png');

await page.locator('#victory-home').tap();
await page.locator('#menu-settings').tap();
const musicVolume = page.locator('#music-volume');
assert.equal(await musicVolume.inputValue(), '40');
await musicVolume.fill('65');
assert.equal(await page.locator('#music-volume-value').textContent(), '65%');
await page.locator('[data-preference="reducedMotion"]').check();
await page.locator('#settings-close').tap();
assert.equal(await page.locator('body.reduce-motion').count(), 1);
assert.deepEqual(await page.locator('#enemy-health-fill').evaluate((element) => [
  getComputedStyle(element, '::before').animationName,
  getComputedStyle(element, '::after').animationName,
]), ['none', 'none'], '减少动态时应冻结药剂气泡和液面');

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
