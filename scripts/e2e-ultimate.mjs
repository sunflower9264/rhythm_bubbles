import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE_URL = process.env.GAME_URL ?? 'http://127.0.0.1:4174';
const OUTPUT_DIR = process.env.OUTPUT_DIR ?? 'output/e2e-ultimate';
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const errors = [];

const createPage = async () => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`${BASE_URL}/?seed=2654435761`, { waitUntil: 'networkidle' });
  await page.locator('#start-game').tap();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'playing');
  return { context, page };
};

const readState = (page) => page.evaluate(() => JSON.parse(window.render_game_to_text()));

const canvasPoint = async (page, x, y) => {
  const box = await page.locator('#game-container canvas').boundingBox();
  assert.ok(box);
  return { x: box.x + x / 720 * box.width, y: box.y + y / 1280 * box.height };
};

const tapEnemy = async (page) => {
  const state = await readState(page);
  const point = await canvasPoint(page, state.feedback.enemy.x, state.feedback.enemy.y);
  await page.touchscreen.tap(point.x, point.y);
};

const tapTarget = async (page) => {
  const state = await readState(page);
  const target = state.bubbles.find((bubble) => bubble.isTarget && !bubble.cleared);
  assert.ok(target);
  const cell = 470 / 4;
  const point = await canvasPoint(
    page,
    360 - 235 + cell / 2 + target.col * cell,
    920 - 235 + cell / 2 + target.row * cell,
  );
  await page.touchscreen.tap(point.x, point.y);
};

const finishFirstBattleAndChoose = async (page, upgradeId) => {
  for (let guard = 0; guard < 180; guard += 1) {
    const state = await readState(page);
    if (state.phase === 'reward') break;
    if (state.phase === 'transition') {
      await page.evaluate(() => window.advanceTime(900));
      continue;
    }
    assert.equal(state.phase, 'playing');
    let index = state.bubbles.find((bubble) => bubble.isTarget && !bubble.cleared)?.index;
    if (state.battle.enemy.mechanicState === 'active' && state.battle.enemy.intentTargets.length > 0) {
      index = state.battle.enemy.intentTargets[state.battle.enemy.intentCursor];
    }
    assert.notEqual(index, undefined);
    await page.evaluate((targetIndex) => window.selectBubble(targetIndex), index);
    await page.evaluate(() => window.advanceTime(100));
  }
  let state = await readState(page);
  assert.equal(state.phase, 'reward');
  await page.evaluate(() => window.selectReward(0));
  state = await readState(page);
  assert.equal(state.battle.rewardMode, 'ultimate');
  const upgradeIndex = state.battle.ultimateUpgrades.findIndex((upgrade) => upgrade.id === upgradeId);
  assert.notEqual(upgradeIndex, -1);
  await page.evaluate((index) => window.selectUltimateUpgrade(index), upgradeIndex);
  await page.waitForFunction(() => {
    const next = JSON.parse(window.render_game_to_text());
    return next.phase === 'playing' && next.battle.current === 2;
  });
};

{
  const { context, page } = await createPage();
  let state = await readState(page);
  assert.equal(state.battle.player.ultimate.ready, true);
  assert.equal(await page.locator('.player-meter--energy small').textContent(), '能量');
  assert.equal(await page.locator('.player-meter--energy small img').count(), 0);
  assert.equal(await page.locator('#player-energy-value').textContent(), '100%');
  await page.screenshot({ path: `${OUTPUT_DIR}/00-ready-hud.png`, fullPage: true });

  await tapEnemy(page);
  await page.waitForTimeout(80);
  state = await readState(page);
  assert.equal(state.battle.player.ultimate.active, true);
  assert.equal(state.feedback.ultimate.screenFxVisible, false);
  assert.equal(state.feedback.ultimate.activeBubbleParticles, 0);

  await tapTarget(page);
  await page.waitForTimeout(150);
  state = await readState(page);
  assert.equal(state.feedback.ultimate.rippleVisible, true);
  assert.ok(Math.abs(state.feedback.ultimate.ripple.x - 360) <= 2);
  assert.ok(Math.abs(state.feedback.ultimate.ripple.y - state.feedback.enemy.restY) <= 10);
  assert.equal(state.feedback.ultimate.waveVisible, false);
  await page.screenshot({ path: `${OUTPUT_DIR}/01-tide-ripple.png`, fullPage: true });
  await context.close();
}

{
  const { context, page } = await createPage();
  await finishFirstBattleAndChoose(page, 'control');
  await tapEnemy(page);
  await tapTarget(page);
  await page.waitForTimeout(480);
  const state = await readState(page);
  assert.equal(state.feedback.ultimate.waveVisible, true);
  assert.ok(state.feedback.ultimate.wave.width >= 1080);
  assert.ok(state.feedback.ultimate.wave.y < 1610, JSON.stringify(state.feedback.ultimate.wave));
  await page.screenshot({ path: `${OUTPUT_DIR}/02-control-wave.png`, fullPage: true });
  await context.close();
}

{
  const { context, page } = await createPage();
  await finishFirstBattleAndChoose(page, 'shield');
  await tapEnemy(page);
  await page.waitForTimeout(850);
  const state = await readState(page);
  assert.ok(state.feedback.ultimate.activeBubbleParticles >= 2);
  await page.screenshot({ path: `${OUTPUT_DIR}/03-shield-bubbles.png`, fullPage: true });
  await context.close();
}

assert.deepEqual(errors, []);
await browser.close();
