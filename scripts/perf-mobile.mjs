import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE_URL = process.env.GAME_URL || 'http://127.0.0.1:4174';
const SAMPLE_MS = Number(process.env.PERF_SAMPLE_MS || 5000);
const ASSERT_BUDGET = process.env.PERF_ASSERT === '1';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
await page.addInitScript(() => {
  window.__renderDrawCalls = 0;
  const wrap = (prototype, method) => {
    if (!prototype?.[method]) return;
    const original = prototype[method];
    prototype[method] = function (...args) {
      window.__renderDrawCalls += 1;
      return original.apply(this, args);
    };
  };
  wrap(window.WebGLRenderingContext?.prototype, 'drawArrays');
  wrap(window.WebGLRenderingContext?.prototype, 'drawElements');
  wrap(window.WebGL2RenderingContext?.prototype, 'drawArrays');
  wrap(window.WebGL2RenderingContext?.prototype, 'drawElements');
  wrap(window.CanvasRenderingContext2D?.prototype, 'drawImage');
});
await page.goto(`${BASE_URL}?seed=2654435761`, { waitUntil: 'networkidle' });
await page.locator('#loading-screen').waitFor({ state: 'hidden' });
await page.locator('#start-game').tap();
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'playing');
await page.waitForTimeout(800);

await page.evaluate(() => {
  window.__perfProbe = { mutations: 0, startDrawCalls: window.__renderDrawCalls, mutationTargets: {} };
  const observer = new MutationObserver((records) => {
    window.__perfProbe.mutations += records.length;
    for (const record of records) {
      const element = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
      const selector = element?.id ? `#${element.id}` : element?.className ? `.${String(element.className).trim().replaceAll(' ', '.')}` : record.type;
      const key = `${selector}:${record.attributeName || record.type}`;
      window.__perfProbe.mutationTargets[key] = (window.__perfProbe.mutationTargets[key] || 0) + 1;
    }
  });
  observer.observe(document.querySelector('#ui-layer'), {
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true,
  });
  window.__perfProbeObserver = observer;
});

const session = await context.newCDPSession(page);
await session.send('Performance.enable');
const before = await readMetrics(session);
await page.waitForTimeout(SAMPLE_MS);
const after = await readMetrics(session);
const probe = await page.evaluate(() => {
  window.__perfProbeObserver.disconnect();
  return { ...window.__perfProbe, endDrawCalls: window.__renderDrawCalls };
});

const seconds = SAMPLE_MS / 1000;
const result = {
  sampleSeconds: seconds,
  renderDrawCallsPerSecond: Number(((probe.endDrawCalls - probe.startDrawCalls) / seconds).toFixed(1)),
  uiMutationsPerSecond: Number((probe.mutations / seconds).toFixed(1)),
  mainThreadTaskMsPerSecond: Number(((after.TaskDuration - before.TaskDuration) * 1000 / seconds).toFixed(1)),
  scriptMsPerSecond: Number(((after.ScriptDuration - before.ScriptDuration) * 1000 / seconds).toFixed(1)),
  layoutMsPerSecond: Number(((after.LayoutDuration - before.LayoutDuration) * 1000 / seconds).toFixed(1)),
  mutationTargets: Object.fromEntries(Object.entries(probe.mutationTargets).sort((a, b) => b[1] - a[1]).slice(0, 8)),
};
console.log(JSON.stringify(result, null, 2));

if (ASSERT_BUDGET) {
  assert.ok(result.renderDrawCallsPerSecond <= 260, '移动端 WebGL 提交频率应限制在 120 FPS 预算附近');
  assert.ok(result.uiMutationsPerSecond <= 12, '静置战斗不应持续全量改写 DOM HUD');
}

await browser.close();

async function readMetrics(cdp) {
  const response = await cdp.send('Performance.getMetrics');
  return Object.fromEntries(response.metrics.map(({ name, value }) => [name, value]));
}
