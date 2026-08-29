import assert from 'node:assert/strict';
import test from 'node:test';
import { GameController } from './GameController';

test('刷新后仍将已保存的最佳分数读取为数字', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => key === 'rhythm-bubbles:best-run:v3' ? '450' : null,
    },
  });

  try {
    assert.equal(new GameController().getBestScore(), 450);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete (globalThis as { localStorage?: Storage }).localStorage;
  }
});

test('实时状态以 100ms 批量推进，并允许自动化强制刷新', () => {
  const controller = new GameController(() => 0.5);
  let updates = 0;
  controller.subscribe(() => { updates += 1; });
  controller.start();
  const afterStart = updates;

  controller.tick(99);
  assert.equal(updates, afterStart);
  controller.tick(1);
  assert.equal(updates, afterStart + 1);
  controller.tick(1, true);
  assert.equal(updates, afterStart + 2);
});
