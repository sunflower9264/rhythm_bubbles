import Phaser from 'phaser';
import { GameController, type Preferences } from './core/GameController';
import type { SessionSnapshot, SessionUpdate } from './core/types';

type AdjustableSound = Phaser.Sound.BaseSound & { setVolume(value: number): unknown };

interface BubbleView {
  image: Phaser.GameObjects.Image;
  order: Phaser.GameObjects.Text;
  baseScale: number;
  cleared: boolean;
}

const WIDTH = 720;
const HEIGHT = 1280;
const BOARD_CENTER_Y = 920;
const BOARD_SIZE = 604;
const BOARD_FRAME_SIZE = 680;
const BOARD_PLAY_SIZE = 470;
const ENEMY_CENTER_Y = 450;
const ENEMY_RAGE_TINT = 0xff6f7d;

export class BubbleScene extends Phaser.Scene {
  private background!: Phaser.GameObjects.Image;
  private board!: Phaser.GameObjects.Image;
  private boardGlow!: Phaser.GameObjects.Graphics;
  private intentLinks!: Phaser.GameObjects.Graphics;
  private shieldAura!: Phaser.GameObjects.Graphics;
  private enemy!: Phaser.GameObjects.Image;
  private dropletEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private bubbleViews: BubbleView[] = [];
  private transientEffects = new Set<Phaser.GameObjects.GameObject>();
  private feedbackPhase = 'idle';
  private correctReleaseCount = 0;
  private wrongWobbleCount = 0;
  private feedbackEpoch = 0;
  private currentLevelKey = '';
  private currentEnemyBattle = 0;
  private enemyRestScaleX = 1;
  private enemyRestScaleY = 1;
  private latestSnapshot!: SessionSnapshot;
  private preferences!: Preferences;
  private unsubscribe?: () => void;
  private bgm?: AdjustableSound;
  private manualTime = false;
  private renderedIntentLinkCount = 0;
  private shieldBreakCount = 0;
  private shieldVisualMax = 0;
  private shieldImpact?: Phaser.GameObjects.Graphics;
  private enemyCenterY = ENEMY_CENTER_Y;
  private combatText?: Phaser.GameObjects.Text;
  private lastCombatText = { message: '', y: 0 };
  private recentSfx: string[] = [];
  private bubbleVisualKey = '';
  private intentVisualKey = '';
  private shieldVisualKey = '';
  private audioKey = '';

  constructor(private readonly controller: GameController) {
    super({ key: 'BubbleScene' });
  }

  preload(): void {
    this.load.image('garden-bg', 'art/bubble-garden.webp');
    this.load.image('board-frame', 'art/ui/board-frame.png');
    this.load.image('jelly-enemy', 'art/jelly-enemy.png');
    this.load.image('angler-enemy', 'art/angler-enemy.png');
    this.load.image('hermit-enemy', 'art/hermit-enemy.png');
    this.load.image('manta-enemy', 'art/manta-enemy.png');
    this.load.image('puffer-enemy', 'art/puffer-enemy.png');
    this.load.audio('bgm', 'audio/bubble-garden-groove-v2.wav');
    this.load.audio('tap', 'audio/tap.wav');
    this.load.audio('correct-pop-1', 'audio/correct-pop-1.wav');
    this.load.audio('correct-pop-2', 'audio/correct-pop-2.wav');
    this.load.audio('correct-pop-3', 'audio/correct-pop-3.wav');
    this.load.audio('wrong-wobble', 'audio/wrong-wobble.wav');
    this.load.audio('level-up', 'audio/level-up.wav');
    this.load.audio('countdown', 'audio/countdown.wav');
    this.load.audio('enemy-hit', 'audio/enemy-hit.wav');
    this.load.audio('enemy-attack', 'audio/enemy-attack.wav');
    this.load.audio('shield-break', 'audio/shield-break.wav');
    this.load.audio('victory', 'audio/victory.wav');
  }

  create(): void {
    this.enemyCenterY = this.resolveEnemyCenterY();
    window.dispatchEvent(new Event('phaser-scene-ready'));
    this.cameras.main.setBackgroundColor('#cdefe4');
    this.background = this.add.image(WIDTH / 2, HEIGHT / 2, 'garden-bg');
    this.background.setDisplaySize(WIDTH, HEIGHT);

    this.createAmbientBubbles();
    this.createBubbleTexture('bubble-normal', ['#d8fff3', '#79dcca', '#45b9ac']);
    this.createBubbleTexture('bubble-target', ['#fff6a8', '#ffb96f', '#ff7f82']);
    this.createDropletTexture();
    this.enemy = this.add.image(WIDTH / 2, this.enemyCenterY, 'jelly-enemy').setDisplaySize(288, 288).setDepth(7).setVisible(false);
    this.dropletEmitter = this.add.particles(0, 0, 'bubble-droplet', {
      emitting: false,
      lifespan: { min: 300, max: 460 },
      speed: { min: 130, max: 255 },
      angle: { min: 0, max: 360 },
      gravityY: 320,
      alpha: { start: 0.95, end: 0 },
      scale: { start: 1, end: 0.12 },
      rotate: { min: -160, max: 160 },
      tint: [0xff8e8a, 0xffd66b, 0x63d6c5, 0x8fa7f2],
    }).setDepth(32);

    this.boardGlow = this.add.graphics().setDepth(4);
    this.board = this.add.image(WIDTH / 2, BOARD_CENTER_Y, 'board-frame').setDepth(5);
    this.intentLinks = this.add.graphics().setDepth(6);
    this.shieldAura = this.add.graphics().setDepth(46);
    this.drawBoard();

    this.game.canvas.setAttribute('aria-label', '泡泡侠大战海洋怪游戏区：轻触泡泡进行游戏');
    this.game.canvas.setAttribute('role', 'application');
    this.game.canvas.addEventListener('pointerup', this.handleCanvasPointer, { passive: true });

    this.unsubscribe = this.controller.subscribe((update, preferences) => {
      this.latestSnapshot = update.snapshot;
      this.preferences = preferences;
      this.sync(update);
    });

    window.addEventListener('pagehide', () => this.bgm?.stop(), { once: true });
  }

  update(_time: number, delta: number): void {
    if (!this.manualTime) this.controller.tick(Math.min(delta, 100));
  }

  setManualTime(value: boolean): void {
    this.manualTime = value;
  }

  getFeedbackState(): object {
    return {
      transientEffects: this.transientEffects.size,
      activeDroplets: this.dropletEmitter?.getAliveParticleCount() ?? 0,
      phase: this.feedbackPhase,
      correctReleaseCount: this.correctReleaseCount,
      wrongWobbleCount: this.wrongWobbleCount,
      intentLinks: {
        rendered: this.renderedIntentLinkCount,
      },
      shield: {
        active: this.latestSnapshot?.shield > 0,
        breakCount: this.shieldBreakCount,
        max: this.shieldVisualMax,
        ratio: this.shieldVisualMax > 0
          ? Number((this.latestSnapshot.shield / this.shieldVisualMax).toFixed(2))
          : 0,
        damageStage: this.getShieldDamageStage(this.latestSnapshot?.shield ?? 0),
        cracksVisible: Boolean(this.shieldImpact?.active),
      },
      enemy: this.enemy ? {
        visible: this.enemy.visible,
        alpha: Number(this.enemy.alpha.toFixed(2)),
        x: Math.round(this.enemy.x),
        y: Math.round(this.enemy.y),
        displayWidth: Math.round(this.enemy.displayWidth),
        displayHeight: Math.round(this.enemy.displayHeight),
        scaleX: Number(this.enemy.scaleX.toFixed(3)),
        scaleY: Number(this.enemy.scaleY.toFixed(3)),
      } : null,
      combatText: {
        visible: Boolean(this.combatText?.active),
        message: this.lastCombatText.message,
        anchorY: Math.round(this.lastCombatText.y),
      },
      audio: {
        recentSfx: this.recentSfx,
      },
      transformedBubbles: this.bubbleViews
        .map((view, index) => ({
          index,
          scaleX: Number((view.image.scaleX / view.baseScale).toFixed(2)),
          scaleY: Number((view.image.scaleY / view.baseScale).toFixed(2)),
          angle: Math.round(view.image.angle),
          alpha: Number(view.image.alpha.toFixed(2)),
          visible: view.image.visible,
        }))
        .filter((bubble) => bubble.visible && (
          bubble.scaleX !== 1 || bubble.scaleY !== 1 || bubble.angle !== 0 || bubble.alpha !== 1
        )),
    };
  }

  shutdown(): void {
    this.unsubscribe?.();
    this.bgm?.stop();
    this.game.canvas.removeEventListener('pointerup', this.handleCanvasPointer);
  }

  private sync(update: SessionUpdate): void {
    const snapshot = update.snapshot;
    const nextLevelKey = `${snapshot.mode}:${snapshot.battle}:${snapshot.board}:${snapshot.rows}x${snapshot.cols}`;
    const shouldRenderContinuously = ['preview', 'playing', 'transition'].includes(snapshot.phase);
    if (shouldRenderContinuously && !this.game.loop.running) this.game.loop.wake();

    if (snapshot.phase === 'menu') {
      this.clearBoard();
      this.board.setVisible(false);
      this.boardGlow.setVisible(false);
      this.enemy.setVisible(false);
      this.intentLinks.clear();
      this.shieldAura.clear();
      this.renderedIntentLinkCount = 0;
      this.shieldVisualMax = 0;
      this.bubbleVisualKey = '';
      this.intentVisualKey = '';
      this.shieldVisualKey = '';
      this.audioKey = '';
      this.bgm?.stop();
      this.game.loop.sleep();
      return;
    }

    this.board.setVisible(true);
    this.boardGlow.setVisible(true);
    this.syncEnemy(snapshot, update);
    this.drawShield(snapshot);
    if (nextLevelKey !== this.currentLevelKey) {
      this.buildBubbles(snapshot);
      this.currentLevelKey = nextLevelKey;
    }

    this.updateBubbles(snapshot, update);
    this.drawIntentLinks(snapshot);
    this.handleEffect(update);
    this.syncAudio();
    if (['paused', 'reward'].includes(snapshot.phase)) this.game.loop.sleep();
  }

  private drawBoard(): void {
    this.boardGlow.clear();
    this.boardGlow.fillStyle(0x66cdbd, 0.2);
    this.boardGlow.fillRoundedRect(
      (WIDTH - BOARD_FRAME_SIZE) / 2 - 5,
      BOARD_CENTER_Y - BOARD_FRAME_SIZE / 2 + 16,
      BOARD_FRAME_SIZE + 10,
      BOARD_FRAME_SIZE,
      58,
    );
    this.board.setDisplaySize(BOARD_FRAME_SIZE, BOARD_FRAME_SIZE);
  }

  private buildBubbles(snapshot: SessionSnapshot): void {
    this.clearBoard();
    if (snapshot.rows === 0 || snapshot.cols === 0) return;

    const innerSize = BOARD_PLAY_SIZE;
    const cellWidth = innerSize / snapshot.cols;
    const cellHeight = innerSize / snapshot.rows;
    const bubbleSizeArea = BOARD_SIZE - 70;
    const diameter = Math.min(bubbleSizeArea / snapshot.cols, bubbleSizeArea / snapshot.rows)
      * (snapshot.cols === 3 ? 0.73 : 0.76);
    const startX = WIDTH / 2 - innerSize / 2 + cellWidth / 2;
    const startY = BOARD_CENTER_Y - innerSize / 2 + cellHeight / 2;

    for (const bubble of snapshot.bubbles) {
      const x = startX + bubble.col * cellWidth;
      const y = startY + bubble.row * cellHeight;
      const image = this.add.image(x, y, 'bubble-normal')
        .setDisplaySize(diameter, diameter)
        .setDepth(10);
      const order = this.add.text(x + diameter * 0.31, y - diameter * 0.31, '', {
        fontFamily: '"Avenir Next Rounded", "PingFang SC", sans-serif',
        fontSize: `${Math.round(diameter * 0.2)}px`,
        fontStyle: 'bold',
        color: '#5267a8',
        stroke: '#fffdf4',
        strokeThickness: 7,
      }).setOrigin(0.5).setDepth(12).setVisible(false);

      this.bubbleViews.push({ image, order, baseScale: image.scaleX, cleared: false });
    }
  }

  private updateBubbles(snapshot: SessionSnapshot, update: SessionUpdate): void {
    const visualKey = [
      snapshot.phase,
      snapshot.visibleTargetIndices.join(','),
      snapshot.enemyMechanic,
      snapshot.enemyMechanicState,
      snapshot.enemyIntentTargets.join(','),
      snapshot.enemyIntentCursor,
      snapshot.bubbles.map((bubble) => bubble.cleared ? '1' : '0').join(''),
    ].join('|');
    if (visualKey === this.bubbleVisualKey && update.effect === 'none') return;
    this.bubbleVisualKey = visualKey;
    const visibleTargets = new Set(snapshot.visibleTargetIndices);
    const intentTargets = new Map(snapshot.enemyIntentTargets
      .slice(snapshot.enemyIntentCursor)
      .map((index, offset) => [index, snapshot.enemyIntentCursor + offset]));
    for (const bubble of snapshot.bubbles) {
      const view = this.bubbleViews[bubble.index];
      if (!view) continue;
      const intentOrder = intentTargets.get(bubble.index);
      const showIntentMarker = intentOrder !== undefined && ['sequence', 'capture', 'shell'].includes(snapshot.enemyMechanic);
      const visibleTarget = visibleTargets.has(bubble.index) || showIntentMarker;
      view.image.setTexture(visibleTarget ? 'bubble-target' : 'bubble-normal');
      const showSequence = snapshot.mode === 'sequence' && snapshot.phase === 'preview' && visibleTargets.has(bubble.index);
      view.order.setVisible(showIntentMarker || showSequence);
      view.order.setColor(showIntentMarker ? '#e05268' : '#5267a8');
      view.order.setText(showIntentMarker
        ? snapshot.enemyMechanic === 'capture' ? '救'
          : snapshot.enemyMechanic === 'shell' ? '破'
            : String(intentOrder + 1)
        : bubble.order === null ? '' : String(bubble.order + 1));
      if (bubble.cleared && !view.cleared) {
        view.cleared = true;
        const animateClear = update.effectIndex === bubble.index
          && ['correct', 'board-clear', 'enemy-staggered', 'enemy-countered', 'enemy-break', 'enemy-windup', 'encounter-win'].includes(update.effect);
        if (animateClear) continue;
        if (this.preferences.reducedMotion) {
          view.image.setVisible(false);
        } else {
          this.tweens.add({
            targets: [view.image, view.order],
            alpha: 0,
            scaleX: view.image.scaleX * 1.35,
            scaleY: view.image.scaleY * 1.35,
            duration: 180,
            ease: 'Back.In',
            onComplete: () => view.image.setVisible(false),
          });
        }
      }
    }
  }

  private handleEffect(update: SessionUpdate): void {
    const { effect, effectIndex } = update;
    if (effect === 'start') {
      this.feedbackEpoch += 1;
      this.feedbackPhase = 'idle';
      this.clearTransientEffects();
      this.shieldImpact = undefined;
      this.dropletEmitter.killAll();
      this.tweens.killTweensOf([this.board, this.boardGlow]);
      this.board.setDisplaySize(BOARD_FRAME_SIZE, BOARD_FRAME_SIZE);
      this.boardGlow.setScale(1);
    }
    if (effect === 'none') return;

    const bubbleHitEffects = ['correct', 'board-clear', 'enemy-staggered', 'enemy-countered', 'enemy-break', 'enemy-windup', 'encounter-win'];
    if (bubbleHitEffects.includes(effect) && effectIndex !== undefined) {
      this.animateCorrectAt(effectIndex, ['board-clear', 'encounter-win'].includes(effect));
    }
    if (['correct', 'board-clear', 'enemy-staggered', 'enemy-countered', 'enemy-break', 'encounter-win'].includes(effect)) {
      if (this.latestSnapshot.lastAttackReduction > 0) {
        this.animateEnemyStaggered(this.latestSnapshot.lastDamage, this.latestSnapshot.lastAttackReduction);
      } else {
        this.animateEnemyHit(this.latestSnapshot.lastDamage, effect === 'encounter-win');
      }
    }

    if (effect === 'enemy-windup') this.animateEnemyWindup();
    if (effect === 'enemy-break') this.animateEnemyBreak();
    if (['enemy-impact', 'timeout-impact'].includes(effect)) {
      this.animateEnemyScreenImpact(effect === 'timeout-impact');
      if (this.latestSnapshot.lastBlockedDamage > 0) {
        this.animateShieldImpact(this.latestSnapshot.lastBlockedDamage, this.latestSnapshot.shield === 0);
      }
    }
    if (effect === 'enemy-recover') {
      if (this.latestSnapshot.enemyAttackState === 'windup') this.setEnemyWindupPose();
      else this.restoreEnemyPose();
    }

    if (['mistake', 'mistake-overflow', 'counter-miss'].includes(effect)) {
      if (this.latestSnapshot.lastBlockedDamage > 0) {
        this.animateShieldImpact(this.latestSnapshot.lastBlockedDamage, this.latestSnapshot.shield === 0);
      }
      if (effectIndex !== undefined) {
        if (!this.preferences.reducedMotion) {
          this.animateWrongAt(effectIndex);
        }
        this.floatPlayerDamage(effect === 'mistake-overflow' ? '容错耗尽' : effect === 'counter-miss' ? '化解失误' : '失误');
      }
    }

    if (!this.preferences.sound) return;
    if (bubbleHitEffects.includes(effect) && effectIndex !== undefined) {
      const variation = ((Math.floor(this.latestSnapshot.score / 10) + (effectIndex ?? 0)) % 3) + 1;
      this.playSfx(`correct-pop-${variation}`, 0.4);
      this.playSfx('enemy-hit', this.latestSnapshot.lastAttackReduction > 0 ? 0.4 : 0.22);
    }
    if (effect === 'enemy-windup') this.playSfx('countdown', 0.32);
    if (effect === 'enemy-break') this.playSfx('level-up', 0.48);
    if (['enemy-impact', 'timeout-impact'].includes(effect)) {
      this.playSfx('enemy-attack', effect === 'timeout-impact' ? 0.62 : this.latestSnapshot.battle === 1 ? 0.44 : 0.52);
    }
    if (['enemy-impact', 'timeout-impact'].includes(effect)
      && this.latestSnapshot.lastBlockedDamage > 0 && this.latestSnapshot.shield === 0) {
      this.playSfx('shield-break', 0.62);
    }
    if (this.latestSnapshot.lastAttackReduction > 0 && ['board-clear', 'enemy-staggered'].includes(effect)) {
      this.playSfx('level-up', 0.24);
    }
    if (effect === 'encounter-win') {
      this.playSfx('enemy-hit', 0.5);
      this.time.delayedCall(110, () => this.playSfx('level-up', 0.42));
    }
    if (effect === 'victory') this.playSfx('victory', 0.52);
    if (['mistake', 'mistake-overflow', 'counter-miss'].includes(effect)) this.playSfx('wrong-wobble', effect === 'mistake-overflow' ? 0.48 : 0.38);
    if (effect === 'countdown') this.playSfx('countdown', 0.23);
  }

  private animateCorrectAt(index: number, large: boolean): void {
    const view = this.bubbleViews[index];
    if (!view) return;
    const image = view.image;
    const baseScale = view.baseScale;
    const feedbackEpoch = this.feedbackEpoch;
    this.tweens.killTweensOf(image);
    image.setTexture('bubble-target').setVisible(true).setAlpha(1).setAngle(0).setScale(baseScale).clearTint();

    if (this.preferences.reducedMotion) {
      image.setVisible(false);
      return;
    }

    image.setScale(baseScale * 1.08, baseScale * 0.78);
    this.feedbackPhase = 'pressed-correct';
    this.tweens.add({
      targets: image,
      scaleX: baseScale * 1.1,
      scaleY: baseScale * 0.76,
      duration: 90,
      ease: 'Sine.In',
      onComplete: () => {
        if (feedbackEpoch !== this.feedbackEpoch) return;
        this.releaseCorrectBubble(view, large, !this.latestSnapshot.bubbles[index]?.cleared);
      },
    });
  }

  private drawIntentLinks(snapshot: SessionSnapshot): void {
    const visualKey = [
      snapshot.enemyMechanicState,
      snapshot.enemyMechanic,
      snapshot.enemyHazardRow,
      snapshot.enemyIntentTargets.join(','),
      snapshot.enemyIntentCursor,
      snapshot.rows,
      this.currentLevelKey,
    ].join('|');
    if (visualKey === this.intentVisualKey) return;
    this.intentVisualKey = visualKey;
    this.intentLinks.clear();
    this.renderedIntentLinkCount = 0;
    if (snapshot.enemyMechanicState !== 'active') return;

    if (snapshot.enemyMechanic === 'sweep' && snapshot.enemyHazardRow !== null) {
      const innerSize = BOARD_PLAY_SIZE;
      const rows = Math.max(1, snapshot.rows);
      const cellHeight = innerSize / rows;
      const top = BOARD_CENTER_Y - innerSize / 2 + snapshot.enemyHazardRow * cellHeight;
      this.intentLinks.fillStyle(0x6d78d8, 0.22);
      this.intentLinks.fillRoundedRect((WIDTH - BOARD_SIZE) / 2 + 12, top + 4, BOARD_SIZE - 24, cellHeight - 8, 28);
      this.intentLinks.lineStyle(5, 0xb8c9ff, 0.82);
      this.intentLinks.lineBetween(74, top + cellHeight / 2, WIDTH - 74, top + cellHeight / 2);
      this.renderedIntentLinkCount = 1;
      return;
    }
    if (snapshot.enemyMechanic === 'guard' || snapshot.enemyIntentTargets.length === 0) return;

    const count = snapshot.enemyIntentTargets.length;
    snapshot.enemyIntentTargets.forEach((index, order) => {
      if (order < snapshot.enemyIntentCursor) return;
      const view = this.bubbleViews[index];
      if (!view) return;
      this.renderedIntentLinkCount += 1;

      const active = order === snapshot.enemyIntentCursor;
      const lane = order - (count - 1) / 2;
      const startX = WIDTH / 2 + lane * 24;
      const startY = this.enemyCenterY + 62;
      const endX = view.image.x;
      const endY = view.image.y;
      if (snapshot.enemyMechanic === 'shell') {
        this.intentLinks.lineStyle(active ? 10 : 7, active ? 0xff8b78 : 0x9e78d8, active ? 0.92 : 0.68);
        this.intentLinks.strokeCircle(endX, endY, active ? 42 : 34);
        this.intentLinks.lineStyle(3, 0xffffff, 0.88);
        this.intentLinks.strokeCircle(endX, endY, active ? 31 : 26);
      } else {
        const outer = snapshot.enemyMechanic === 'capture' ? 0x986f26 : 0x7d2944;
        const inner = snapshot.enemyMechanic === 'capture' ? 0xffd86a : active ? 0xff7890 : 0xd95470;
        this.intentLinks.lineStyle(active ? 8 : 5, outer, active ? 0.78 : 0.48);
        this.intentLinks.lineBetween(startX, startY, endX, endY);
        this.intentLinks.lineStyle(active ? 4 : 2, inner, active ? 0.96 : 0.7);
        this.intentLinks.lineBetween(startX, startY, endX, endY);
        this.intentLinks.fillStyle(inner, active ? 0.96 : 0.72);
        this.intentLinks.fillCircle(endX, endY, active ? 7 : 5);
      }
    });
  }

  private drawShield(snapshot: SessionSnapshot): void {
    const visualKey = `${snapshot.phase}:${snapshot.shield}:${snapshot.maxShield}`;
    if (visualKey === this.shieldVisualKey) return;
    this.shieldVisualKey = visualKey;
    this.shieldAura.clear().setDepth(46);
    if (snapshot.shield <= 0 || ['menu', 'reward', 'victory', 'game-over'].includes(snapshot.phase)) return;
    this.shieldVisualMax = Math.max(this.shieldVisualMax, snapshot.shield);
    this.shieldAura.fillStyle(0xf8ffff, 0.065);
    this.shieldAura.fillRect(0, 0, WIDTH, HEIGHT);
    this.shieldAura.lineStyle(10, 0xffffff, 0.12);
    this.shieldAura.strokeRect(5, 5, WIDTH - 10, HEIGHT - 10);
    this.shieldAura.lineStyle(2, 0xffffff, 0.58);
    this.shieldAura.strokeRect(2, 2, WIDTH - 4, HEIGHT - 4);
    this.shieldAura.fillStyle(0xffffff, 0.07);
    this.shieldAura.fillTriangle(0, 0, 132, 0, 0, 420);
    this.shieldAura.fillTriangle(WIDTH, HEIGHT, WIDTH - 74, HEIGHT, WIDTH, HEIGHT - 330);
  }

  private animateShieldImpact(_blocked: number, broken: boolean): void {
    if (this.shieldImpact?.active) this.destroyTransient(this.shieldImpact);
    const barrier = this.add.graphics().setDepth(49);
    this.shieldImpact = barrier;
    this.transientEffects.add(barrier);
    const stage = broken ? 4 : { intact: 0, light: 1, damaged: 2, critical: 3, none: 0 }[
      this.getShieldDamageStage(this.latestSnapshot.shield)
    ];
    barrier.fillStyle(0xf7ffff, broken ? 0.17 : 0.09);
    barrier.fillRect(0, 0, WIDTH, HEIGHT);
    barrier.lineStyle(broken ? 9 : 6, 0xffffff, broken ? 0.42 : 0.28);
    barrier.strokeRect(4, 4, WIDTH - 8, HEIGHT - 8);
    barrier.lineStyle(2, 0xdfffff, 0.88);
    barrier.strokeRect(2, 2, WIDTH - 4, HEIGHT - 4);
    this.drawShieldCracks(barrier, stage, broken ? 1 : 0.88, broken ? 2.4 : 1.7);
    if (broken) {
      this.shieldBreakCount += 1;
      for (let index = 0; index < 18; index += 1) {
        const angle = (Math.PI * 2 * index) / 18 - Math.PI / 2;
        const radius = 42 + (index % 4) * 28;
        const size = 15 + (index % 5) * 4;
        const fragment = this.add.triangle(
          WIDTH / 2 + Math.cos(angle) * radius,
          760 + Math.sin(angle) * radius,
          -size, size * 0.68, 0, -size, size * 0.82, size * 0.58,
          0xe9ffff,
          0.18,
        ).setStrokeStyle(index % 3 === 0 ? 3 : 2, 0xffffff, 0.82).setDepth(50).setAngle(index * 31);
        this.transientEffects.add(fragment);
        this.destroyAfterTween(fragment, {
          x: fragment.x + Math.cos(angle) * (110 + (index % 4) * 24),
          y: fragment.y + Math.sin(angle) * (110 + (index % 4) * 24) + 64,
          angle: fragment.angle + (index % 2 === 0 ? 118 : -132),
          alpha: 0,
          duration: this.preferences.reducedMotion ? 120 : 520,
          ease: 'Cubic.Out',
        });
      }
    }

    this.tweens.add({
      targets: barrier,
      alpha: 0,
      delay: this.preferences.reducedMotion ? 70 : 480,
      duration: this.preferences.reducedMotion ? 90 : broken ? 420 : 240,
      ease: 'Cubic.In',
      onComplete: () => {
        if (this.shieldImpact === barrier) this.shieldImpact = undefined;
        this.destroyTransient(barrier);
      },
    });

  }

  private getShieldDamageStage(shield: number): 'none' | 'intact' | 'light' | 'damaged' | 'critical' {
    if (shield <= 0 || this.shieldVisualMax <= 0) return 'none';
    const ratio = shield / this.shieldVisualMax;
    if (ratio > 0.75) return 'intact';
    if (ratio > 0.5) return 'light';
    if (ratio > 0.25) return 'damaged';
    return 'critical';
  }

  private drawShieldCracks(
    graphics: Phaser.GameObjects.Graphics,
    stage: number,
    alpha: number,
    width = 3,
  ): void {
    const crackPaths = [
      [[360, 760], [346, 737], [352, 712], [329, 690], [338, 658], [309, 628]],
      [[360, 760], [383, 744], [377, 717], [406, 697], [397, 666], [431, 638]],
      [[360, 760], [337, 781], [345, 812], [316, 837], [325, 873], [291, 908]],
      [[360, 760], [390, 780], [383, 811], [415, 839], [406, 875], [445, 909]],
      [[346, 737], [314, 746], [288, 728], [252, 742], [218, 724]],
      [[383, 744], [418, 756], [447, 737], [485, 752], [520, 730]],
      [[329, 690], [300, 676], [286, 644], [250, 631], [234, 594]],
      [[406, 697], [435, 680], [447, 646], [482, 629], [501, 591]],
      [[316, 837], [281, 826], [255, 850], [219, 839], [184, 866]],
      [[415, 839], [449, 826], [477, 850], [512, 837], [550, 861]],
      [[309, 628], [320, 586], [296, 550], [307, 505], [280, 465], [292, 416]],
      [[431, 638], [421, 596], [446, 559], [434, 511], [461, 470], [450, 420]],
      [[291, 908], [307, 950], [286, 992], [300, 1038], [277, 1081]],
      [[445, 909], [429, 952], [451, 994], [438, 1040], [463, 1085]],
      [[218, 724], [174, 703], [136, 717], [94, 691], [42, 704]],
      [[520, 730], [562, 706], [600, 720], [642, 692], [696, 705]],
      [[292, 416], [268, 371], [282, 321], [255, 274], [270, 219], [246, 166]],
      [[450, 420], [475, 373], [461, 323], [488, 275], [475, 220], [500, 166]],
      [[277, 1081], [297, 1124], [279, 1166], [293, 1212], [278, 1276]],
      [[463, 1085], [444, 1127], [462, 1170], [448, 1215], [463, 1278]],
    ];
    const visibleCount = [0, 4, 8, 14, crackPaths.length][Math.min(4, Math.max(0, stage))];
    if (visibleCount === 0) return;

    graphics.lineStyle(width + 2.2, 0x466877, alpha * 0.3);
    graphics.beginPath();
    for (const path of crackPaths.slice(0, visibleCount)) {
      graphics.moveTo(path[0][0], path[0][1]);
      for (const [x, y] of path.slice(1)) graphics.lineTo(x, y);
    }
    graphics.strokePath();
    graphics.lineStyle(width, 0xffffff, alpha);
    graphics.beginPath();
    for (const path of crackPaths.slice(0, visibleCount)) {
      graphics.moveTo(path[0][0], path[0][1]);
      for (const [x, y] of path.slice(1)) graphics.lineTo(x, y);
    }
    graphics.strokePath();
  }

  private releaseCorrectBubble(view: BubbleView, large: boolean, restoreAfter = false): void {
    const { image, baseScale } = view;
    const { x, y } = image;
    const diameter = image.width * baseScale;
    this.feedbackPhase = 'released-correct';
    this.correctReleaseCount += 1;
    const ring = this.add.circle(x, y, diameter * 0.34)
      .setStrokeStyle(large ? 13 : 10, 0xffffff, 0.92)
      .setScale(0.55)
      .setDepth(29);
    const glow = this.add.circle(x, y, diameter * 0.3, large ? 0xffd66b : 0x9bf1e2, 0.34).setDepth(28);
    this.transientEffects.add(ring);
    this.transientEffects.add(glow);

    this.dropletEmitter.explode(large ? 24 : 14, x, y);

    this.tweens.add({
      targets: image,
      scaleX: baseScale * 1.32,
      scaleY: baseScale * 1.24,
      alpha: 0,
      duration: 150,
      ease: 'Cubic.Out',
      onComplete: () => {
        if (restoreAfter) image.setVisible(true).setAlpha(1).setScale(baseScale);
        else image.setVisible(false);
      },
    });
    this.destroyAfterTween(ring, { scale: large ? 2.6 : 2.15, alpha: 0, duration: large ? 320 : 260, ease: 'Cubic.Out' });
    this.destroyAfterTween(glow, { scale: large ? 2.8 : 2.3, alpha: 0, duration: 210, ease: 'Sine.Out' });

    const points = this.add.text(x, y - 12, '+10', {
      fontFamily: '"Avenir Next Rounded", "PingFang SC", sans-serif',
      fontSize: large ? '38px' : '30px',
      fontStyle: 'bold',
      color: '#ff6f7d',
      stroke: '#fffdf4',
      strokeThickness: 7,
    }).setOrigin(0.5).setDepth(35).setAlpha(0).setScale(0.6);
    this.transientEffects.add(points);
    this.tweens.add({
      targets: points,
      y: y - 54,
      alpha: 1,
      scale: 1,
      duration: 125,
      ease: 'Back.Out',
      onComplete: () => {
        this.tweens.add({
          targets: points,
          y: y - 84,
          alpha: 0,
          duration: 210,
          delay: 65,
          ease: 'Cubic.In',
          onComplete: () => this.destroyTransient(points),
        });
      },
    });
  }

  private animateWrongAt(index: number): void {
    const view = this.bubbleViews[index];
    if (!view) return;
    const { image, baseScale } = view;
    const { x, y } = image;
    this.tweens.killTweensOf(image);
    image.setVisible(true).setAlpha(1).setAngle(0).setScale(baseScale).setTint(0xffb7d6);

    image.setScale(baseScale * 1.12, baseScale * 0.76);
    this.feedbackPhase = 'wobbling-wrong';
    this.wrongWobbleCount += 1;
    this.createWrongRipple(x, y, image.width * baseScale);
    this.tweens.add({
      targets: image,
      scaleX: baseScale * 0.86,
      scaleY: baseScale * 1.14,
      angle: -7,
      duration: 82,
      ease: 'Back.Out',
      onComplete: () => this.tweens.add({
        targets: image,
        scaleX: baseScale * 1.08,
        scaleY: baseScale * 0.93,
        angle: 6,
        duration: 88,
        ease: 'Sine.InOut',
        onComplete: () => this.tweens.add({
          targets: image,
          scaleX: baseScale * 0.97,
          scaleY: baseScale * 1.03,
          angle: -3,
          duration: 100,
          ease: 'Sine.InOut',
          onComplete: () => this.tweens.add({
            targets: image,
            scaleX: baseScale,
            scaleY: baseScale,
            angle: 0,
            duration: 125,
            ease: 'Back.Out',
            onComplete: () => image.clearTint(),
          }),
        }),
      }),
    });
  }

  private syncEnemy(snapshot: SessionSnapshot, update: SessionUpdate): void {
    if (snapshot.battle === this.currentEnemyBattle && update.effect !== 'start') return;
    this.currentEnemyBattle = snapshot.battle;
    this.enemyCenterY = this.resolveEnemyCenterY();
    const size = snapshot.enemyIsBoss ? 340 : 280 + snapshot.battle * 8;
    this.tweens.killTweensOf(this.enemy);
    this.enemy
      .setTexture(snapshot.enemyTexture)
      .setVisible(true)
      .setAlpha(1)
      .setAngle(0)
      .setPosition(WIDTH / 2, this.enemyCenterY)
      .setDisplaySize(size, size)
      .setDepth(7)
      .setTint(this.getEnemyTint());
    this.enemyRestScaleX = this.enemy.scaleX;
    this.enemyRestScaleY = this.enemy.scaleY;
    if (!this.preferences.reducedMotion) {
      this.enemy.setAlpha(0).setScale(this.enemyRestScaleX * 0.72, this.enemyRestScaleY * 0.72).setY(this.enemyCenterY - 14);
      this.tweens.add({ targets: this.enemy, alpha: 1, y: this.enemyCenterY, scaleX: this.enemyRestScaleX, scaleY: this.enemyRestScaleY, duration: 340, ease: 'Back.Out' });
    }
  }

  private animateEnemyHit(damage: number, defeated: boolean): void {
    if (!this.enemy.visible) return;
    if (!this.preferences.reducedMotion) {
      this.tweens.killTweensOf(this.enemy);
      this.enemy.setDepth(7).setPosition(WIDTH / 2, this.enemyCenterY).setScale(this.enemyRestScaleX, this.enemyRestScaleY);
      this.enemy.setTintFill(0xffffff);
      this.tweens.add({
        targets: this.enemy,
        x: this.enemy.x + 15,
        scaleX: this.enemyRestScaleX * 0.92,
        scaleY: this.enemyRestScaleY * 1.08,
        duration: 55,
        yoyo: true,
        ease: 'Sine.Out',
        onComplete: () => {
          this.enemy.clearTint();
          this.enemy.setTint(this.getEnemyTint()).setX(WIDTH / 2);
          if (defeated) this.tweens.add({ targets: this.enemy, alpha: 0, y: this.enemyCenterY - 30, angle: 7, duration: 420, ease: 'Back.In' });
          else if (this.latestSnapshot.enemyAttackState === 'windup') this.setEnemyWindupPose();
          else this.restoreEnemyPose();
        },
      });
      if (defeated) {
        this.dropletEmitter.explode(42, this.enemy.x, this.enemy.y);
      }
    }
    this.floatCombatText(defeated ? '完美收尾！' : `-${damage}`, defeated ? '#ff6f7d' : '#7358b8', defeated ? 42 : 32);
  }

  private animateEnemyWindup(): void {
    if (this.preferences.reducedMotion || !this.enemy.visible) return;
    this.tweens.killTweensOf(this.enemy);
    this.enemy.clearTint().setTint(ENEMY_RAGE_TINT).setDepth(8).setPosition(WIDTH / 2, this.enemyCenterY).setAngle(0);
    this.tweens.add({
      targets: this.enemy,
      y: this.enemyCenterY + 12,
      scaleX: this.enemyRestScaleX * 1.16,
      scaleY: this.enemyRestScaleY * 0.82,
      duration: Math.min(620, this.latestSnapshot.enemyAttackWindupMs * 0.72),
      ease: 'Cubic.In',
    });
  }

  private setEnemyWindupPose(): void {
    this.enemy
      .clearTint()
      .setTint(ENEMY_RAGE_TINT)
      .setDepth(8)
      .setPosition(WIDTH / 2, this.enemyCenterY + 12)
      .setScale(this.enemyRestScaleX * 1.16, this.enemyRestScaleY * 0.82);
  }

  private animateEnemyScreenImpact(timeout: boolean): void {
    const blocked = this.latestSnapshot.lastBlockedDamage;
    const damage = this.latestSnapshot.lastEnemyDamage;
    if (!this.preferences.reducedMotion && this.enemy.visible) {
      this.tweens.killTweensOf(this.enemy);
      this.enemy
        .setVisible(true)
        .setAlpha(1)
        .setDepth(48)
        .setAngle(timeout ? -4 : 0)
        .setPosition(WIDTH / 2, 735)
        .setScale(this.enemyRestScaleX * (timeout ? 2.55 : 2.3), this.enemyRestScaleY * (timeout ? 2.55 : 2.3));
      if (blocked === 0) this.enemy.setTintFill(0xffffff);
      else this.enemy.clearTint().setTint(this.getEnemyTint());
      if (blocked === 0) this.cameras.main.flash(timeout ? 125 : 95, 255, timeout ? 118 : 150, timeout ? 105 : 126, false);
      if (blocked === 0) {
        const shockwave = this.add.circle(WIDTH / 2, 700, 54)
          .setStrokeStyle(timeout ? 18 : 14, timeout ? 0xff6f7d : 0xffffff, 0.86)
          .setDepth(47);
        this.transientEffects.add(shockwave);
        this.destroyAfterTween(shockwave, { scale: 8.5, alpha: 0, duration: 260, ease: 'Cubic.Out' });
      }
      this.time.delayedCall(75, () => {
        if (!this.enemy.active) return;
        this.enemy.clearTint().setTint(this.getEnemyTint());
        this.tweens.add({
          targets: this.enemy,
          y: this.enemyCenterY,
          scaleX: this.enemyRestScaleX,
          scaleY: this.enemyRestScaleY,
          angle: 0,
          duration: 300,
          ease: 'Back.Out',
          onComplete: () => this.enemy.setDepth(7),
        });
      });
    }
    const label = timeout ? '超时重击' : blocked > 0 ? `护盾挡住 ${blocked}` : '撞击';
    this.floatCombatText(`${label} · ${damage > 0 ? `生命 -${damage}` : '完全格挡'}`, blocked > 0 ? '#5267a8' : '#e96973', timeout ? 38 : 34);
  }

  private animateEnemyStaggered(damage: number, reduction: number): void {
    if (!this.enemy.visible) return;
    if (!this.preferences.reducedMotion) {
      this.tweens.killTweensOf(this.enemy);
      this.enemy.clearTint().setTint(0x9bf1e2).setDepth(8);
      this.tweens.add({
        targets: this.enemy,
        y: this.enemyCenterY - 22,
        angle: -6,
        scaleX: this.enemyRestScaleX * 1.1,
        scaleY: this.enemyRestScaleY * 0.88,
        duration: 105,
        yoyo: true,
        ease: 'Back.Out',
        onComplete: () => this.restoreEnemyPose(),
      });
      if (reduction >= 0.25) this.cameras.main.shake(70, 0.0018);
      this.dropletEmitter.explode(22, this.enemy.x, this.enemy.y);
    }
    const reductionPercent = Math.round(reduction * 1000) / 10;
    this.floatCombatText(`-${damage} · 蓄力 -${reductionPercent}%`, '#2f9f96', 34);
  }

  private animateEnemyBreak(): void {
    if (!this.enemy.visible) return;
    if (!this.preferences.reducedMotion) {
      this.tweens.killTweensOf(this.enemy);
      this.enemy.clearTint().setTint(0x9bf1e2).setDepth(8).setAngle(-8);
      this.tweens.add({
        targets: this.enemy,
        y: this.enemyCenterY - 28,
        scaleX: this.enemyRestScaleX * 1.18,
        scaleY: this.enemyRestScaleY * 0.76,
        angle: 8,
        duration: 150,
        yoyo: true,
        ease: 'Back.Out',
        onComplete: () => this.restoreEnemyPose(),
      });
      this.dropletEmitter.explode(34, this.enemy.x, this.enemy.y);
    }
    this.floatCombatText('破势！伤害 ×1.5', '#2f9f96', 38);
  }

  private floatPlayerDamage(prefix: string): void {
    const blocked = this.latestSnapshot.lastBlockedDamage;
    const damage = this.latestSnapshot.lastEnemyDamage;
    const message = blocked > 0 ? `${prefix} · 护盾 -${blocked}` : `${prefix} · 生命 -${damage}`;
    this.floatCombatText(message, blocked > 0 ? '#5267a8' : '#e96973', 30);
  }

  private restoreEnemyPose(): void {
    if (!this.enemy.active || !this.enemy.visible) return;
    this.tweens.killTweensOf(this.enemy);
    this.enemy
      .clearTint()
      .setTint(this.getEnemyTint())
      .setDepth(7)
      .setAlpha(1)
      .setAngle(0)
      .setPosition(WIDTH / 2, this.enemyCenterY)
      .setScale(this.enemyRestScaleX, this.enemyRestScaleY);
  }

  private getEnemyTint(): number {
    return 0xffffff;
  }

  private resolveEnemyCenterY(): number {
    const canvasRect = this.game.canvas.getBoundingClientRect();
    const enemyHudRect = document.getElementById('enemy-status')?.getBoundingClientRect();
    if (!enemyHudRect || canvasRect.height <= 0) return ENEMY_CENTER_Y;
    const boardTop = canvasRect.top + (BOARD_CENTER_Y - BOARD_FRAME_SIZE / 2) / HEIGHT * canvasRect.height;
    const screenCenter = (enemyHudRect.bottom + boardTop) / 2;
    return Phaser.Math.Clamp((screenCenter - canvasRect.top) / canvasRect.height * HEIGHT, 390, 520);
  }

  private floatCombatText(message: string, color: string, size: number): void {
    if (this.combatText?.active) {
      this.tweens.killTweensOf(this.combatText);
      this.destroyTransient(this.combatText);
    }
    const y = this.resolveCombatFeedbackY();
    const text = this.add.text(WIDTH / 2, y, message, {
      fontFamily: '"Avenir Next Rounded", "PingFang SC", sans-serif',
      fontSize: `${size}px`,
      fontStyle: 'bold',
      color,
      stroke: '#fffdf4',
      strokeThickness: 7,
    }).setOrigin(0.5).setDepth(40).setScale(0.65);
    this.combatText = text;
    this.lastCombatText = { message, y };
    this.transientEffects.add(text);
    this.tweens.add({
      targets: text,
      y: y + 10,
      scale: 1,
      duration: 180,
      ease: 'Back.Out',
      onComplete: () => this.destroyAfterTween(text, { y: y + 28, alpha: 0, duration: 280, delay: 360, ease: 'Cubic.In' }),
    });
  }

  private resolveCombatFeedbackY(): number {
    const canvasRect = this.game.canvas.getBoundingClientRect();
    const enemyHudRect = document.getElementById('enemy-status')?.getBoundingClientRect();
    const enemyRestHeight = this.enemy.height * this.enemyRestScaleY;
    const enemyTop = this.enemyCenterY - enemyRestHeight / 2;
    if (!enemyHudRect || canvasRect.height <= 0) return enemyTop - 24;
    const hudBottom = (enemyHudRect.bottom - canvasRect.top) / canvasRect.height * HEIGHT;
    return Phaser.Math.Clamp(
      Math.max(enemyTop - 24, hudBottom + 40),
      80,
      this.enemyCenterY - 32,
    );
  }

  private createWrongRipple(x: number, y: number, diameter: number): void {
    const ring = this.add.circle(x, y, diameter * 0.38)
      .setStrokeStyle(9, 0x9b86d9, 0.72)
      .setScale(0.7)
      .setDepth(28);
    this.transientEffects.add(ring);
    this.destroyAfterTween(ring, { scaleX: 1.75, scaleY: 1.35, alpha: 0, duration: 280, ease: 'Cubic.Out' });
  }

  private destroyAfterTween(
    target: Phaser.GameObjects.GameObject,
    config: Omit<Phaser.Types.Tweens.TweenBuilderConfig, 'targets' | 'onComplete'>,
  ): void {
    this.tweens.add({ ...config, targets: target, onComplete: () => this.destroyTransient(target) });
  }

  private destroyTransient(target: Phaser.GameObjects.GameObject): void {
    this.transientEffects.delete(target);
    if (target === this.combatText) this.combatText = undefined;
    target.destroy();
  }

  private syncAudio(): void {
    const audioKey = `${this.preferences.music}:${this.preferences.musicVolume}:${this.latestSnapshot.phase === 'menu'}`;
    if (audioKey === this.audioKey) return;
    this.audioKey = audioKey;
    if (!this.preferences.music || this.latestSnapshot.phase === 'menu') {
      this.bgm?.stop();
      return;
    }
    if (!this.bgm) this.bgm = this.sound.add('bgm', { loop: true, volume: this.preferences.musicVolume }) as AdjustableSound;
    this.bgm.setVolume(this.preferences.musicVolume);
    if (!this.bgm.isPlaying) this.bgm.play();
  }

  private playSfx(key: string, volume: number): void {
    this.recentSfx.push(key);
    if (this.recentSfx.length > 12) this.recentSfx.shift();
    this.sound.play(key, { volume });
  }

  private readonly handleCanvasPointer = (event: PointerEvent): void => {
    const snapshot = this.controller.getSnapshot();
    if (snapshot.phase !== 'playing') return;
    const bounds = this.game.canvas.getBoundingClientRect();
    const pointerX = ((event.clientX - bounds.left) / bounds.width) * WIDTH;
    const pointerY = ((event.clientY - bounds.top) / bounds.height) * HEIGHT;
    let selectedIndex = -1;
    let selectedDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < this.bubbleViews.length; index += 1) {
      const bubble = snapshot.bubbles[index];
      const view = this.bubbleViews[index];
      if (!bubble || bubble.cleared || !view.image.visible) continue;
      const distance = Phaser.Math.Distance.Between(pointerX, pointerY, view.image.x, view.image.y);
      if (distance <= view.image.displayWidth * 0.52 && distance < selectedDistance) {
        selectedIndex = index;
        selectedDistance = distance;
      }
    }

    if (selectedIndex < 0) return;
    if (this.preferences.sound) this.playSfx('tap', 0.2);
    this.controller.select(selectedIndex);
  };

  private clearBoard(): void {
    for (const view of this.bubbleViews) {
      view.image.destroy();
      view.order.destroy();
    }
    this.bubbleViews = [];
    this.currentLevelKey = '';
    this.bubbleVisualKey = '';
    this.intentVisualKey = '';
  }

  private clearTransientEffects(): void {
    for (const effect of this.transientEffects) {
      this.tweens.killTweensOf(effect);
      effect.destroy();
    }
    this.transientEffects.clear();
    this.combatText = undefined;
  }

  private createAmbientBubbles(): void {
    const specs = [
      [74, 252, 20, 0x63d6c5],
      [650, 420, 13, 0xff8e8a],
      [92, 1030, 16, 0xffd66b],
      [625, 1010, 22, 0x8fa7f2],
    ];
    for (const [x, y, radius, color] of specs) {
      const bubble = this.add.circle(x, y, radius, color, 0.18).setStrokeStyle(2, 0xffffff, 0.45).setDepth(2);
      this.tweens.add({ targets: bubble, y: y - 18, x: x + 7, duration: 2600 + radius * 35, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    }
  }

  private createBubbleTexture(key: string, colors: [string, string, string]): void {
    if (this.textures.exists(key)) return;
    const texture = this.textures.createCanvas(key, 180, 180);
    if (!texture) return;
    const context = texture.context;
    const gradient = context.createRadialGradient(62, 48, 8, 90, 92, 82);
    gradient.addColorStop(0, colors[0]);
    gradient.addColorStop(0.56, colors[1]);
    gradient.addColorStop(1, colors[2]);
    context.fillStyle = 'rgba(65, 92, 120, .13)';
    context.beginPath();
    context.ellipse(93, 158, 61, 13, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(90, 88, 76, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = 'rgba(255,255,255,.78)';
    context.lineWidth = 6;
    context.stroke();
    context.fillStyle = 'rgba(255,255,255,.82)';
    context.beginPath();
    context.ellipse(60, 48, 25, 15, -0.5, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#274f78';
    context.beginPath();
    context.ellipse(67, 97, 8, 12, 0, 0, Math.PI * 2);
    context.ellipse(113, 97, 8, 12, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = 'white';
    context.beginPath();
    context.arc(64, 93, 3, 0, Math.PI * 2);
    context.arc(110, 93, 3, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#274f78';
    context.lineWidth = 4;
    context.lineCap = 'round';
    context.beginPath();
    context.arc(90, 109, 14, 0.18, Math.PI - 0.18);
    context.stroke();
    context.fillStyle = 'rgba(255,116,129,.45)';
    context.beginPath();
    context.ellipse(47, 116, 12, 6, 0, 0, Math.PI * 2);
    context.ellipse(133, 116, 12, 6, 0, 0, Math.PI * 2);
    context.fill();
    texture.refresh();
  }

  private createDropletTexture(): void {
    if (this.textures.exists('bubble-droplet')) return;
    const texture = this.textures.createCanvas('bubble-droplet', 22, 28);
    if (!texture) return;
    const context = texture.context;
    const gradient = context.createRadialGradient(8, 7, 1, 11, 14, 13);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.32, '#b8fff2');
    gradient.addColorStop(1, '#63d6c5');
    context.fillStyle = gradient;
    context.beginPath();
    context.moveTo(11, 1);
    context.bezierCurveTo(15, 8, 21, 14, 21, 19);
    context.bezierCurveTo(21, 25, 16, 28, 11, 28);
    context.bezierCurveTo(5, 28, 1, 25, 1, 19);
    context.bezierCurveTo(1, 14, 7, 8, 11, 1);
    context.fill();
    texture.refresh();
  }
}
