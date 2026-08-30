import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE_URL = process.env.GAME_URL ?? 'http://127.0.0.1:4174';
const OUTPUT_DIR = process.env.OUTPUT_DIR ?? 'output/e2e-loading-first-frame';
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const page = await context.newPage();

let releaseScript;
const scriptGate = new Promise((resolve) => {
  releaseScript = resolve;
});
await page.route('**/assets/*.js', async (route) => {
  await scriptGate;
  await route.continue();
});

const navigation = page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
await page.locator('#game-shell').waitFor({ state: 'attached' });
await page.addStyleTag({ content: '* { animation: none !important; transition: none !important; }' });
await page.waitForTimeout(100);
await page.screenshot({ path: `${OUTPUT_DIR}/before-main-script.png` });

const bootstrapLoader = page.locator('#loading-screen.is-visible');
assert.equal(
  await bootstrapLoader.count(),
  1,
  '主脚本下载完成前缺少可见加载页，首屏会直接暴露主菜单背景',
);

releaseScript();
await navigation;
await bootstrapLoader.waitFor({ state: 'visible' });

await browser.close();
