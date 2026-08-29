import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE_URL = process.env.GAME_URL ?? 'http://127.0.0.1:4174';
const OUTPUT_DIR = process.env.OUTPUT_DIR ?? 'output/e2e-ultimate';
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
const canvasPoint = async (x, y) => {
  const box = await page.locator('#game-container canvas').boundingBox();
  assert.ok(box);
  return { x: box.x + x / 720 * box.width, y: box.y + y / 1280 * box.height };
};
const tapTarget = async () => {
  const state = await readState();
  const target = state.bubbles.find((bubble) => bubble.isTarget && !bubble.cleared);
  assert.ok(target);
  const cell = 470 / 4;
  const point = await canvasPoint(
    360 - 235 + cell / 2 + target.col * cell,
    920 - 235 + cell / 2 + target.row * cell,
  );
  await page.touchscreen.tap(point.x, point.y);
};

await page.goto(`${BASE_URL}/?seed=2654435761`, { waitUntil: 'networkidle' });
await page.locator('#start-game').tap();
await page.waitForTimeout(250);
let state = await readState();
assert.equal(state.battle.player.ultimate.ready, true);
assert.equal(state.feedback.ultimate.screenFxVisible, false);
assert.equal(await page.locator('#player-energy-value').textContent(), '释放');
await page.screenshot({ path: `${OUTPUT_DIR}/00-ready.png`, fullPage: true });

const enemyPoint = await canvasPoint(state.feedback.enemy.x, state.feedback.enemy.y);
await page.touchscreen.tap(enemyPoint.x, enemyPoint.y);
await page.waitForTimeout(650);
state = await readState();
assert.equal(state.battle.player.ultimate.active, true);
assert.equal(state.feedback.ultimate.screenFxVisible, true);
assert.ok(state.feedback.ultimate.screenFxWidth >= 720);
assert.ok(state.feedback.ultimate.screenFxHeight >= 1280);
assert.ok(state.feedback.ultimate.activeBubbleParticles > 0);
assert.equal(await page.locator('#player-energy-value').textContent(), '潮汐 1/3');
assert.equal(await page.locator('.player-meter--energy.is-active').count(), 1);
await page.screenshot({ path: `${OUTPUT_DIR}/01-release.png`, fullPage: true });

for (let stage = 1; stage <= 3; stage += 1) {
  await tapTarget();
  await page.waitForTimeout(220);
  state = await readState();
  assert.equal(state.feedback.ultimate.visualStage, stage);
  assert.equal(state.feedback.ultimate.screenFxVisible, true);
  await page.screenshot({ path: `${OUTPUT_DIR}/0${stage + 1}-stage-${stage}.png`, fullPage: true });
}

assert.equal(await page.locator('#player-energy-value').textContent(), '终结潮');
assert.deepEqual(errors, []);
await browser.close();
