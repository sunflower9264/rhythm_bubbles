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
