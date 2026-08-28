import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, firefox, webkit } from 'playwright';

const BASE_URL = process.env.GAME_URL || 'http://127.0.0.1:4173';
const BROWSER_NAME = process.env.BROWSER || 'chromium';
const BROWSER_TYPES = { chromium, firefox, webkit };
const browserType = BROWSER_TYPES[BROWSER_NAME];
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

await page.goto(BASE_URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
await page.locator('#menu-screen.is-visible').waitFor();
assert.equal(await page.locator('#fullscreen-button').count(), 0, 'mobile H5 must not expose a fullscreen control');
assert.equal(await page.locator('.menu-hint').textContent(), '轻触泡泡，开始你的节拍挑战');
assert.equal(await page.locator('#game-container canvas').getAttribute('aria-label'), '泡泡节拍游戏区：轻触泡泡进行游戏');
await page.screenshot({ path: new URL('01-menu-mobile.png', OUTPUT_DIR).pathname, fullPage: true });

const shellBox = await page.locator('#game-shell').boundingBox();
assert.ok(shellBox);
assert.ok(shellBox.width <= 390 && shellBox.height <= 844, 'game shell must fit mobile viewport');

await page.locator('#mode-classic').tap();
let state = await readState(page);
assert.equal(state.phase, 'playing');
assert.equal(state.mode, 'classic');
await page.screenshot({ path: new URL('02-classic-play.png', OUTPUT_DIR).pathname, fullPage: true });

const classicTargets = state.bubbles.filter((bubble) => bubble.isTarget).map((bubble) => bubble.index);
await page.evaluate((index) => window.selectBubble(index), classicTargets[0]);
state = await readState(page);
assert.equal(state.score, 10);
assert.equal(state.remainingTargets, classicTargets.length - 1);
await page.waitForTimeout(95);
await page.screenshot({ path: new URL('02b-correct-feedback.png', OUTPUT_DIR).pathname, fullPage: true });
for (const index of classicTargets.slice(1)) await tapBubble(page, state, index);
state = await readState(page);
assert.equal(state.phase, 'transition');
assert.ok(state.feedback.correctReleaseCount > 0, `correct feedback release must run: ${JSON.stringify(state.feedback)}`);
await page.evaluate(() => window.advanceTime(800));
state = await readState(page);
assert.equal(state.level, 2);

await fastClick(page, '#pause-button');
state = await readState(page);
assert.equal(state.phase, 'paused');
const pausedTime = state.timerMs;
await page.evaluate(() => window.advanceTime(3000));
assert.equal((await readState(page)).timerMs, pausedTime);
await fastClick(page, '#resume-button');
assert.equal((await readState(page)).phase, 'playing');

await page.evaluate(() => window.startGame('memory'));
state = await readState(page);
assert.equal(state.phase, 'preview');
assert.ok(state.visibleTargets.length > 0);
await page.screenshot({ path: new URL('03-memory-preview.png', OUTPUT_DIR).pathname, fullPage: true });
await page.evaluate(() => window.advanceTime(1800));
state = await readState(page);
assert.equal(state.phase, 'playing');
assert.equal(state.visibleTargets.length, 0);
const memoryTarget = state.bubbles.find((bubble) => bubble.isTarget).index;
await tapBubble(page, state, memoryTarget);
assert.equal((await readState(page)).score, 10);

await page.evaluate(() => window.startGame('sequence'));
state = await readState(page);
assert.equal(state.phase, 'preview');
assert.equal(await page.locator('#level-toast.is-active').count(), 0, 'a new game must clear the previous level toast');
await page.screenshot({ path: new URL('04-sequence-preview.png', OUTPUT_DIR).pathname, fullPage: true });
await page.evaluate((duration) => window.advanceTime(duration), (state.remainingTargets + 1) * 300);
state = await readState(page);
assert.equal(state.phase, 'playing');
assert.notEqual(state.expectedIndex, null);
await tapBubble(page, state, state.expectedIndex);
state = await readState(page);
assert.equal(state.score, 10);
const wrongIndex = state.bubbles.find((bubble) => !bubble.cleared && bubble.index !== state.expectedIndex).index;
const wrongStartedAt = Date.now();
await page.evaluate((index) => window.selectBubble(index), wrongIndex);
state = await readState(page);
assert.equal(state.phase, 'game-over');
assert.equal(await page.locator('#gameover-modal.is-visible').count(), 0, 'wrong-bubble feedback must play before results appear');
await page.evaluate(() => {
  document.querySelector('#gameover-modal').style.display = 'none';
});
await page.screenshot({ path: new URL('04b-wrong-feedback.png', OUTPUT_DIR).pathname, fullPage: true });
await page.evaluate(() => {
  document.querySelector('#gameover-modal').style.removeProperty('display');
});
await page.locator('#gameover-modal.is-visible').waitFor();
assert.ok(Date.now() - wrongStartedAt >= 430, 'results must wait for the wrong-bubble animation');
state = await readState(page);
assert.ok(state.feedback.wrongWobbleCount > 0, 'wrong feedback wobble must run');
await page.screenshot({ path: new URL('05-game-over.png', OUTPUT_DIR).pathname, fullPage: true });

await fastClick(page, '#gameover-home');
await fastClick(page, '#menu-settings');
const musicVolume = page.locator('#music-volume');
assert.equal(await musicVolume.inputValue(), '40', 'music volume must default to the main sound-effect level');
await musicVolume.fill('65');
assert.equal(await page.locator('#music-volume-value').textContent(), '65%');
await page.locator('[data-preference="reducedMotion"]').check();
await page.locator('#settings-close').tap();
assert.ok(await page.locator('body.reduce-motion').count());

await page.reload({ waitUntil: 'networkidle' });
await page.locator('#menu-screen.is-visible').waitFor();
await fastClick(page, '#menu-settings');
assert.equal(await page.locator('#music-volume').inputValue(), '65', 'music volume must persist after reload');
await page.locator('#settings-close').tap();

await page.setViewportSize({ width: 1280, height: 800 });
await page.waitForTimeout(100);
await page.screenshot({ path: new URL('06-menu-desktop.png', OUTPUT_DIR).pathname, fullPage: true });

assert.deepEqual(errors, [], `browser errors:\n${errors.join('\n')}`);
await browser.close();
console.log(`Production ${BROWSER_NAME} flow passed: classic, memory, sequence, pause, settings, mobile and desktop.`);

async function readState(targetPage) {
  return targetPage.evaluate(() => JSON.parse(window.render_game_to_text()));
}

async function fastClick(targetPage, selector) {
  await targetPage.locator(selector).evaluate((element) => element.click());
}

async function tapBubble(targetPage, snapshot, index) {
  const bubble = snapshot.bubbles[index];
  assert.ok(bubble, `missing bubble ${index}`);
  const canvas = targetPage.locator('#game-container canvas');
  const box = await canvas.boundingBox();
  assert.ok(box);
  const boardSize = 604;
  const innerSize = boardSize - 70;
  const cellWidth = innerSize / snapshot.grid.cols;
  const cellHeight = innerSize / snapshot.grid.rows;
  const logicalX = 720 / 2 - innerSize / 2 + cellWidth / 2 + bubble.col * cellWidth;
  const logicalY = 700 - innerSize / 2 + cellHeight / 2 + bubble.row * cellHeight;
  await targetPage.touchscreen.tap(
    box.x + logicalX * (box.width / 720),
    box.y + logicalY * (box.height / 1280),
  );
  await targetPage.waitForTimeout(30);
}
