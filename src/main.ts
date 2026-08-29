import Phaser from 'phaser';
import './styles.css';
import { BubbleScene } from './game/BubbleScene';
import { GameController } from './game/core/GameController';
import { createSeededRandom } from './game/core/level';
import type { GameMode } from './game/core/types';
import { AppUI } from './ui/AppUI';

const seed = Number(new URLSearchParams(window.location.search).get('seed'));
const controller = new GameController(Number.isFinite(seed) && seed > 0 ? createSeededRandom(seed) : undefined);
const scene = new BubbleScene(controller);
const appUI = new AppUI(controller, requireElement('ui-layer'));

const GAME_RESOURCES = [
  'art/loading-battle-key-art.png',
  'art/game-title.png',
  'art/ui/button-teal.png',
  'art/ui/button-coral.png',
  'art/ui/button-violet.png',
  'art/ui/button-blue.png',
  'art/ui/button-gold.png',
  'art/ui/modal-frame.png',
  'art/bubble-garden.webp',
  'art/jelly-enemy.png',
  'art/angler-enemy.png',
  'art/hermit-enemy.png',
  'art/manta-enemy.png',
  'art/puffer-enemy.png',
  'audio/bubble-garden-groove-v2.wav',
  'audio/tap.wav',
  'audio/correct-pop-1.wav',
  'audio/correct-pop-2.wav',
  'audio/correct-pop-3.wav',
  'audio/wrong-wobble.wav',
  'audio/level-up.wav',
  'audio/countdown.wav',
  'audio/enemy-hit.wav',
  'audio/enemy-attack.wav',
  'audio/shield-break.wav',
  'audio/victory.wav',
];

void bootGame();

async function bootGame(): Promise<void> {
  let completed = 0;
  await Promise.all(GAME_RESOURCES.map(async (resource) => {
    try {
      const response = await fetch(resource, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      await response.arrayBuffer();
    } catch (error) {
      console.warn(`Unable to preload ${resource}; Phaser will retry it.`, error);
    } finally {
      completed += 1;
      appUI.setLoadingProgress(completed / GAME_RESOURCES.length);
    }
  }));

  window.addEventListener('phaser-scene-ready', () => appUI.completeLoading(), { once: true });
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
}

window.render_game_to_text = () => {
  const snapshot = controller.getSnapshot();
  return JSON.stringify({
    coordinateSystem: 'bubble indices are row-major, origin at top-left; x increases right, y increases down',
    phase: snapshot.phase,
    mode: snapshot.mode,
    level: snapshot.level,
    score: snapshot.score,
    battle: {
      current: snapshot.battle,
      total: snapshot.totalBattles,
      board: snapshot.board,
      enemy: {
        id: snapshot.enemyId,
        order: snapshot.enemyOrder,
        name: snapshot.enemyName,
        texture: snapshot.enemyTexture,
        mechanic: snapshot.enemyMechanic,
        hp: snapshot.enemyHp,
        maxHp: snapshot.maxEnemyHp,
        attack: snapshot.enemyAttack,
        boss: snapshot.enemyIsBoss,
        attackState: snapshot.enemyAttackState,
        attackProgress: Number(snapshot.enemyAttackProgress.toFixed(3)),
        attackCooldownMs: snapshot.enemyAttackCooldownMs,
        windupMs: snapshot.enemyAttackWindupMs,
        lastReduction: Number(snapshot.lastAttackReduction.toFixed(3)),
        intentTargets: snapshot.enemyIntentTargets,
        intentCursor: snapshot.enemyIntentCursor,
        hazardRow: snapshot.enemyHazardRow,
        poise: snapshot.enemyPoise,
        maxPoise: snapshot.maxEnemyPoise,
        phase: snapshot.enemyPhase,
      },
      player: {
        hp: snapshot.playerHp,
        maxHp: snapshot.maxPlayerHp,
        shield: snapshot.shield,
        maxShield: snapshot.maxShield,
        attack: snapshot.attackPower,
        combo: snapshot.combo,
        comboRemainingMs: Math.round(snapshot.comboRemainingMs),
        comboWindowMs: snapshot.comboWindowMs,
        mistakeDamage: snapshot.mistakeDamage,
        mistakes: snapshot.mistakeCount,
        mistakeLimit: snapshot.mistakeLimit,
      },
      rewards: snapshot.rewardChoices,
    },
    timerMs: Math.round(snapshot.remainingTimeMs),
    grid: { rows: snapshot.rows, cols: snapshot.cols },
    remainingTargets: snapshot.remainingTargets,
    targetCount: snapshot.targetCount,
    boardTapCount: snapshot.boardTapCount,
    boardTapLimit: snapshot.boardTapLimit,
    visibleTargets: snapshot.visibleTargetIndices,
    expectedIndex: snapshot.expectedIndex,
    feedback: scene.getFeedbackState(),
    bubbles: snapshot.bubbles.map(({ index, row, col, isTarget, cleared, order }) => ({
      index, row, col, isTarget, cleared, order,
    })),
  });
};

window.advanceTime = (milliseconds: number) => {
  scene.setManualTime(true);
  controller.tick(Math.max(0, milliseconds));
};

window.startGame = (_mode?: GameMode) => controller.start();
window.selectBubble = (index: number) => controller.select(index);
window.selectReward = (index: number) => controller.selectReward(index);

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
    startGame: (mode?: GameMode) => void;
    selectBubble: (index: number) => void;
    selectReward: (index: number) => void;
  }
}
