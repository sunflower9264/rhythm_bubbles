import Phaser from 'phaser';
import './styles.css';
import { BubbleScene } from './game/BubbleScene';
import { GameController } from './game/core/GameController';
import type { GameMode } from './game/core/types';
import { AppUI } from './ui/AppUI';

const controller = new GameController();
const scene = new BubbleScene(controller);

new AppUI(controller, requireElement('ui-layer'));

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 720,
  height: 1280,
  transparent: true,
  antialias: true,
  render: {
    antialiasGL: true,
    powerPreference: 'high-performance',
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 720,
    height: 1280,
  },
  audio: {
    disableWebAudio: false,
  },
  scene: [scene],
});

window.render_game_to_text = () => {
  const snapshot = controller.getSnapshot();
  return JSON.stringify({
    coordinateSystem: 'bubble indices are row-major, origin at top-left; x increases right, y increases down',
    phase: snapshot.phase,
    mode: snapshot.mode,
    level: snapshot.level,
    score: snapshot.score,
    timerMs: Math.round(snapshot.remainingTimeMs),
    grid: { rows: snapshot.rows, cols: snapshot.cols },
    remainingTargets: snapshot.remainingTargets,
    visibleTargets: snapshot.visibleTargetIndices,
    expectedIndex: snapshot.expectedIndex,
    feedback: scene.getFeedbackState(),
    bubbles: snapshot.bubbles.map(({ index, row, col, isTarget, cleared, order }) => ({ index, row, col, isTarget, cleared, order })),
  });
};

window.advanceTime = (milliseconds: number) => {
  scene.setManualTime(true);
  controller.tick(Math.max(0, milliseconds));
};

window.startGame = (mode: GameMode) => controller.start(mode);
window.selectBubble = (index: number) => controller.select(index);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => undefined));
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && controller.getSnapshot().phase === 'playing') controller.pause();
});

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element;
}

declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (milliseconds: number) => void;
    startGame: (mode: GameMode) => void;
    selectBubble: (index: number) => void;
  }
}
