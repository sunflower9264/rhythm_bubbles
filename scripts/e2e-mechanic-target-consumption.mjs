import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE_URL = process.env.GAME_URL ?? 'http://127.0.0.1:4174';
const OUTPUT_DIR = process.env.OUTPUT_DIR ?? 'output/e2e-mechanic-target-consumption';
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const scenarios = [
  { enemy: 'jelly', seed: 3204 },
  { enemy: 'hermit', seed: 1 },
];

const browser = await chromium.launch({ headless: true });
for (const scenario of scenarios) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto(`${BASE_URL}?seed=${scenario.seed}`, { waitUntil: 'networkidle' });
  await page.locator('#start-game').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'playing');
  const before = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(before.battle.enemy.id, scenario.enemy);
  assert.equal(before.battle.enemy.mechanicState, 'active');

  const intent = before.battle.enemy.intentTargets.find((index) => before.bubbles[index]?.isTarget);
  assert.notEqual(intent, undefined, `${scenario.enemy} should overlap an intent with a real target`);
  const bubble = before.bubbles[intent];
  await page.screenshot({ path: `${OUTPUT_DIR}/${scenario.enemy}-before.png`, fullPage: true });

  const canvas = await page.locator('#game-container canvas').boundingBox();
  assert.ok(canvas);
  const logicalX = 183.75 + bubble.col * 117.5;
  const logicalY = 743.75 + bubble.row * 117.5;
  await page.mouse.click(
    canvas.x + logicalX * canvas.width / 720,
    canvas.y + logicalY * canvas.height / 1280,
  );
  await page.waitForTimeout(400);

  const after = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(after.bubbles[intent].cleared, true, `${scenario.enemy} should consume the target on the counter tap`);
  assert.equal(after.visibleTargets.includes(intent), false, `${scenario.enemy} should not restore the target`);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `${OUTPUT_DIR}/${scenario.enemy}-after.png`, fullPage: true });
  await page.close();
}

await browser.close();
