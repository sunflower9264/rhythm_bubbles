import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE_URL = process.env.GAME_URL ?? 'http://127.0.0.1:4174';
const OUTPUT_DIR = process.env.OUTPUT_DIR ?? 'output/e2e-bubble-art';
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
const bubbleAssets = new Map();
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('response', (response) => {
  const match = response.url().match(/bubble-(normal|target)\.png$/);
  if (match) bubbleAssets.set(match[1], response.status());
});

await page.goto(BASE_URL, { waitUntil: 'networkidle' });
await page.locator('#menu-screen:not(.is-hidden)').waitFor();

const menuBubbles = page.locator('.menu-bubble-squad img.menu-bubble');
assert.equal(await menuBubbles.count(), 3, '主页应使用三张图片泡泡组成泡泡小队');
for (let index = 0; index < 3; index += 1) {
  const image = menuBubbles.nth(index);
  assert.match(await image.getAttribute('src'), /art\/bubble-normal\.png$/);
  assert.equal(await image.evaluate((element) => element.naturalWidth), 512);
}
await page.screenshot({ path: `${OUTPUT_DIR}/menu-bubble-art.png`, fullPage: true });

await page.locator('#start-game').click();
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'playing');
await page.waitForTimeout(250);

const initial = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
assert.deepEqual(initial.grid, { rows: 4, cols: 4 });
assert.ok(initial.visibleTargets.length > 0, '战斗盘面应显示至少一个目标泡泡');
assert.equal(bubbleAssets.get('normal'), 200);
assert.equal(bubbleAssets.get('target'), 200);
await page.screenshot({ path: `${OUTPUT_DIR}/battle-bubble-art-before.png`, fullPage: true });

const target = initial.bubbles.find((bubble) => bubble.index === initial.visibleTargets[0]);
assert.ok(target, '应能找到可点击目标泡泡');
const canvas = await page.locator('#game-container canvas').boundingBox();
assert.ok(canvas, '游戏 Canvas 应可见');
const logicalX = 183.75 + target.col * 117.5;
const logicalY = 743.75 + target.row * 117.5;
await page.mouse.click(
  canvas.x + logicalX * canvas.width / 720,
  canvas.y + logicalY * canvas.height / 1280,
);
await page.waitForTimeout(300);

const after = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
assert.ok(
  after.remainingTargets < initial.remainingTargets || after.boardTapCount > initial.boardTapCount,
  '点击目标泡泡后应完成清除或有效点击',
);
assert.deepEqual(errors, []);
await page.screenshot({ path: `${OUTPUT_DIR}/battle-bubble-art-after.png`, fullPage: true });

await browser.close();
