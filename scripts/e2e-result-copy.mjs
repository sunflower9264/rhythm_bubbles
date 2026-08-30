import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE_URL = process.env.GAME_URL ?? 'http://127.0.0.1:4174';
const OUTPUT_DIR = process.env.OUTPUT_DIR ?? 'output/e2e-result-copy';
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

await page.goto(BASE_URL, { waitUntil: 'networkidle' });
await page.locator('#start-game').click();

for (const id of ['gameover-modal', 'victory-modal']) {
  await page.evaluate((modalId) => {
    document.querySelectorAll('.modal').forEach((modal) => modal.classList.remove('is-visible'));
    document.getElementById(modalId)?.classList.add('is-visible');
  }, id);
  const modal = page.locator(`#${id}`);
  await modal.waitFor({ state: 'visible' });
  assert.doesNotMatch((await modal.textContent()) ?? '', /节拍/);
  await page.screenshot({ path: `${OUTPUT_DIR}/${id}.png`, fullPage: true });
}

assert.equal(await page.locator('#gameover-title').textContent(), '挑战失败');
assert.equal(await page.locator('#victory-title').textContent(), '挑战成功');
assert.deepEqual(errors, []);
await browser.close();
