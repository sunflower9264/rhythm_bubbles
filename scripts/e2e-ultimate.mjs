import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE_URL = process.env.GAME_URL ?? 'http://127.0.0.1:4174';
const OUTPUT_DIR = process.env.OUTPUT_DIR ?? 'output/e2e-skill-offline';
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

const readState = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));

await page.goto(`${BASE_URL}/?seed=2654435761`, { waitUntil: 'networkidle' });
await page.locator('#start-game').tap();
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'playing');

let state = await readState();
assert.equal(await page.locator('.player-meter').count(), 3);
assert.deepEqual(await page.locator('.player-meter small').allTextContents(), ['生命', '护盾', '能量']);
assert.equal(await page.locator('.player-meter--energy').count(), 1);
assert.equal(await page.locator('#player-energy-value').textContent(), '100%');
assert.equal(await page.locator('img[src*="skill-"]').count(), 0);
assert.equal(state.battle.player.ultimate.ready, true);
assert.equal(state.battle.player.ultimate.active, false);
assert.equal(state.feedback.ultimate, undefined);

const avatarBox = await page.locator('.player-avatar').boundingBox();
const metersBox = await page.locator('.player-meters').boundingBox();
assert.ok(avatarBox && metersBox);
assert.ok(Math.abs(avatarBox.height - metersBox.height) <= 2, `${avatarBox.height} vs ${metersBox.height}`);
await page.screenshot({ path: `${OUTPUT_DIR}/00-energy-hud-restored.png`, fullPage: true });

const canvasBox = await page.locator('#game-container canvas').boundingBox();
assert.ok(canvasBox);
const enemy = state.feedback.enemy;
await page.touchscreen.tap(
  canvasBox.x + enemy.x / 720 * canvasBox.width,
  canvasBox.y + enemy.y / 1280 * canvasBox.height,
);
await page.waitForTimeout(100);
state = await readState();
assert.equal(state.battle.player.ultimate.energy, 0);
assert.equal(state.battle.player.ultimate.active, true);
assert.equal(await page.locator('#player-energy-value').textContent(), '潮汐 1/3');
assert.equal(state.feedback.ultimate, undefined);
await page.evaluate(() => window.advanceTime(5000));
state = await readState();
assert.equal(state.battle.player.ultimate.active, false);

for (let guard = 0; guard < 180; guard += 1) {
  state = await readState();
  if (state.phase === 'reward') break;
  if (state.phase === 'transition') {
    await page.evaluate(() => window.advanceTime(900));
    continue;
  }
  assert.equal(state.phase, 'playing');
  const enemyState = state.battle.enemy;
  if (enemyState.mechanicState === 'active' && enemyState.mechanic === 'guard') {
    await page.evaluate(() => window.advanceTime(1000));
    continue;
  }
  let target;
  if (enemyState.mechanicState === 'active' && enemyState.mechanic === 'sweep') {
    target = state.bubbles.find((bubble) => bubble.isTarget && !bubble.cleared && bubble.row !== enemyState.hazardRow)?.index;
  } else if (enemyState.mechanicState === 'active' && enemyState.intentTargets.length > 0) {
    target = enemyState.intentTargets[enemyState.intentCursor];
  } else {
    target = state.bubbles.find((bubble) => bubble.isTarget && !bubble.cleared)?.index;
  }
  assert.notEqual(target, undefined);
  await page.evaluate((index) => window.selectBubble(index), target);
  await page.evaluate(() => window.advanceTime(100));
}

state = await readState();
assert.equal(state.phase, 'reward');
assert.equal(state.battle.rewardMode, 'standard');
assert.equal(state.battle.ultimateUpgrades.length, 0);
await page.locator('#reward-option-0').tap();
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).battle.rewardMode === 'ultimate');
state = await readState();
assert.equal(state.phase, 'reward');
assert.equal(state.battle.current, 1);
assert.equal(state.battle.ultimateUpgrades.length, 3);
assert.equal(await page.locator('#reward-modal[data-choice-mode="ultimate"].is-visible').count(), 1);
await page.screenshot({ path: `${OUTPUT_DIR}/01-skill-upgrade-still-active.png`, fullPage: true });
await page.waitForTimeout(320);
await page.locator('#reward-option-0').tap();
await page.waitForFunction(() => {
  const next = JSON.parse(window.render_game_to_text());
  return next.phase === 'playing' && next.battle.current === 2;
});
state = await readState();
assert.equal(state.battle.rewardMode, 'standard');
assert.equal(state.battle.ultimateUpgrades.length, 0);
assert.equal(await page.locator('#reward-modal.is-visible').count(), 0);
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUTPUT_DIR}/02-next-battle-after-skill-upgrade.png`, fullPage: true });

assert.deepEqual(errors, []);
await context.close();
await browser.close();
