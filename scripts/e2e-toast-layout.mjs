import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE_URL = process.env.GAME_URL ?? 'http://127.0.0.1:4174';
const OUTPUT_DIR = process.env.OUTPUT_DIR ?? 'output/e2e-toast-layout';
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const errors = [];

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`${viewport.width}: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${viewport.width}: ${message.text()}`);
  });

  const readState = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
  const pauseToast = async () => page.locator('#level-toast').evaluate((element) => {
    element.getAnimations().forEach((animation) => {
      animation.currentTime = 800;
      animation.pause();
    });
  });
  const assertSideLayout = async (className) => {
    const toast = page.locator(`#level-toast.${className}.is-active`);
    await toast.waitFor({ state: 'visible' });
    await pauseToast();
    const toastBox = await toast.boundingBox();
    const canvasBox = await page.locator('#game-container canvas').boundingBox();
    const state = await readState();
    assert.ok(toastBox && canvasBox);
    const enemyLeft = canvasBox.x
      + (state.feedback.enemy.x - state.feedback.enemy.displayWidth / 2) / 720 * canvasBox.width;
    assert.ok(toastBox.x < 20, `${className} 应锚定屏幕左侧`);
    assert.ok(toastBox.x + toastBox.width <= enemyLeft - 2, `${className} 不得覆盖怪物`);
    const angle = await toast.evaluate((element) => {
      const matrix = new DOMMatrix(getComputedStyle(element).transform);
      return Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;
    });
    assert.ok(Math.abs(angle) < 0.1, `${className} 必须保持水平`);
    return Number.parseFloat(await toast.evaluate((element) => getComputedStyle(element).fontSize));
  };

  await page.goto(`${BASE_URL}/?seed=2654435761`, { waitUntil: 'networkidle' });
  await page.locator('#start-game').tap();
  const mechanicFontSize = await assertSideLayout('is-combat');
  await page.screenshot({ path: `${OUTPUT_DIR}/${viewport.width}-mechanic-left.png`, fullPage: true });

  let state = await readState();
  assert.equal(state.battle.enemy.id, 'jelly');
  for (const index of state.battle.enemy.intentTargets) await page.evaluate((target) => window.selectBubble(target), index);
  const counterFontSize = await assertSideLayout('is-counter');
  await page.screenshot({ path: `${OUTPUT_DIR}/${viewport.width}-counter-left.png`, fullPage: true });

  await page.locator('#level-toast').evaluate((element) => {
    element.className = 'level-toast is-battle';
    element.textContent = '第 2 战 · 潮汐扫线 · 避开第 3 排';
    void element.offsetWidth;
    element.classList.add('is-active');
  });
  const battleFontSize = await assertSideLayout('is-battle');
  assert.ok(battleFontSize < mechanicFontSize && battleFontSize < counterFontSize, '第几战提示应比机制提示更小');
  await page.screenshot({ path: `${OUTPUT_DIR}/${viewport.width}-battle-left.png`, fullPage: true });
  await context.close();
}

assert.deepEqual(errors, []);
await browser.close();
