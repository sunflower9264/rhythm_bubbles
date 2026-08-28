import Phaser from 'phaser';
import { GameController, type Preferences } from './core/GameController';
import type { SessionSnapshot, SessionUpdate } from './core/types';

interface BubbleView {
  image: Phaser.GameObjects.Image;
  order: Phaser.GameObjects.Text;
  baseScale: number;
  cleared: boolean;
}

const WIDTH = 720;
const HEIGHT = 1280;
const BOARD_CENTER_Y = 700;
const BOARD_SIZE = 604;

export class BubbleScene extends Phaser.Scene {
  private background!: Phaser.GameObjects.Image;
  private board!: Phaser.GameObjects.Graphics;
  private boardGlow!: Phaser.GameObjects.Graphics;
  private dropletEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private bubbleViews: BubbleView[] = [];
  private transientEffects = new Set<Phaser.GameObjects.GameObject>();
  private feedbackPhase = 'idle';
  private correctReleaseCount = 0;
  private wrongWobbleCount = 0;
  private feedbackEpoch = 0;
  private currentLevelKey = '';
  private latestSnapshot!: SessionSnapshot;
  private preferences!: Preferences;
  private unsubscribe?: () => void;
  private bgm?: Phaser.Sound.BaseSound;
  private manualTime = false;

  constructor(private readonly controller: GameController) {
    super({ key: 'BubbleScene' });
  }

  preload(): void {
    this.load.image('garden-bg', 'art/bubble-garden.webp');
    this.load.audio('bgm', 'audio/bubble-garden-groove-v2.wav');
    this.load.audio('tap', 'audio/tap.wav');
    this.load.audio('correct-pop-1', 'audio/correct-pop-1.wav');
    this.load.audio('correct-pop-2', 'audio/correct-pop-2.wav');
    this.load.audio('correct-pop-3', 'audio/correct-pop-3.wav');
    this.load.audio('wrong-wobble', 'audio/wrong-wobble.wav');
    this.load.audio('level-up', 'audio/level-up.wav');
    this.load.audio('countdown', 'audio/countdown.wav');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#cdefe4');
    this.background = this.add.image(WIDTH / 2, HEIGHT / 2, 'garden-bg');
    this.background.setDisplaySize(WIDTH, HEIGHT);

    this.createAmbientBubbles();
    this.createBubbleTexture('bubble-normal', ['#d8fff3', '#79dcca', '#45b9ac']);
    this.createBubbleTexture('bubble-target', ['#fff6a8', '#ffb96f', '#ff7f82']);
    this.createDropletTexture();
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
    this.board = this.add.graphics().setDepth(5);
    this.drawBoard();

    this.game.canvas.setAttribute('aria-label', '泡泡节拍游戏区：轻触泡泡进行游戏');
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
    const nextLevelKey = `${snapshot.mode}:${snapshot.level}:${snapshot.rows}x${snapshot.cols}`;

    if (snapshot.phase === 'menu') {
      this.clearBoard();
      this.board.setVisible(false);
      this.boardGlow.setVisible(false);
      this.bgm?.stop();
      return;
    }

    this.board.setVisible(true);
    this.boardGlow.setVisible(true);
    if (nextLevelKey !== this.currentLevelKey) {
      this.currentLevelKey = nextLevelKey;
      this.buildBubbles(snapshot);
    }

    this.updateBubbles(snapshot, update);
    this.handleEffect(update);
    this.syncAudio();
  }

  private drawBoard(): void {
    const x = (WIDTH - BOARD_SIZE) / 2;
    const y = BOARD_CENTER_Y - BOARD_SIZE / 2;

    this.boardGlow.clear();
    this.boardGlow.fillStyle(0x66cdbd, 0.2);
    this.boardGlow.fillRoundedRect(x - 10, y + 14, BOARD_SIZE + 20, BOARD_SIZE + 20, 52);

    this.board.clear();
    this.board.fillStyle(0xfffdf3, 0.9);
    this.board.fillRoundedRect(x, y, BOARD_SIZE, BOARD_SIZE, 46);
    this.board.lineStyle(3, 0xffffff, 0.85);
    this.board.strokeRoundedRect(x + 2, y + 2, BOARD_SIZE - 4, BOARD_SIZE - 4, 44);
  }

  private buildBubbles(snapshot: SessionSnapshot): void {
    this.clearBoard();
    if (snapshot.rows === 0 || snapshot.cols === 0) return;

    const innerSize = BOARD_SIZE - 70;
    const cellWidth = innerSize / snapshot.cols;
    const cellHeight = innerSize / snapshot.rows;
    const diameter = Math.min(cellWidth, cellHeight) * (snapshot.cols === 3 ? 0.73 : 0.76);
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
    const visibleTargets = new Set(snapshot.visibleTargetIndices);
    for (const bubble of snapshot.bubbles) {
      const view = this.bubbleViews[bubble.index];
      if (!view) continue;
      const visibleTarget = visibleTargets.has(bubble.index);
      view.image.setTexture(visibleTarget ? 'bubble-target' : 'bubble-normal');
      view.order.setVisible(snapshot.mode === 'sequence' && snapshot.phase === 'preview' && visibleTarget);
      view.order.setText(bubble.order === null ? '' : String(bubble.order + 1));
      if (bubble.cleared && !view.cleared) {
        view.cleared = true;
        const animateClear = update.effectIndex === bubble.index && ['correct', 'level-up'].includes(update.effect);
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
      this.dropletEmitter.killAll();
      this.tweens.killTweensOf([this.board, this.boardGlow]);
      this.board.setScale(1);
      this.boardGlow.setScale(1);
    }
    if (effect === 'none') return;

    if (effect === 'correct' || effect === 'level-up') {
      if (effectIndex !== undefined) this.animateCorrectAt(effectIndex, effect === 'level-up');
      if (effect === 'level-up' && !this.preferences.reducedMotion) {
        this.tweens.add({ targets: [this.board, this.boardGlow], scaleX: 1.025, scaleY: 1.025, yoyo: true, duration: 180, ease: 'Back.Out' });
      }
    }

    if (effect === 'wrong' && !this.preferences.reducedMotion) {
      if (effectIndex !== undefined) {
        this.feedbackEpoch += 1;
        this.cancelPendingCorrectAnimations();
        this.clearTransientEffects();
        this.dropletEmitter.killAll();
        this.animateWrongAt(effectIndex);
        this.cameras.main.shake(70, 0.002);
      } else {
        this.cameras.main.shake(110, 0.003);
      }
    }

    if (!this.preferences.sound) return;
    if (effect === 'correct') {
      const variation = ((Math.floor(this.latestSnapshot.score / 10) + (effectIndex ?? 0)) % 3) + 1;
      this.sound.play(`correct-pop-${variation}`, { volume: 0.4 });
    }
    if (effect === 'wrong') this.sound.play('wrong-wobble', { volume: 0.38 });
    if (effect === 'level-up') this.sound.play('level-up', { volume: 0.42 });
    if (effect === 'countdown') this.sound.play('countdown', { volume: 0.23 });
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
        this.releaseCorrectBubble(view, large);
      },
    });
  }

  private releaseCorrectBubble(view: BubbleView, large: boolean): void {
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
    this.waveNeighbours(x, y, large ? 1.085 : 1.06);

    this.tweens.add({
      targets: image,
      scaleX: baseScale * 1.32,
      scaleY: baseScale * 1.24,
      alpha: 0,
      duration: 150,
      ease: 'Cubic.Out',
      onComplete: () => image.setVisible(false),
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
    this.waveNeighbours(x, y, 1.04);
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

  private createWrongRipple(x: number, y: number, diameter: number): void {
    const ring = this.add.circle(x, y, diameter * 0.38)
      .setStrokeStyle(9, 0x9b86d9, 0.72)
      .setScale(0.7)
      .setDepth(28);
    this.transientEffects.add(ring);
    this.destroyAfterTween(ring, { scaleX: 1.75, scaleY: 1.35, alpha: 0, duration: 280, ease: 'Cubic.Out' });
  }

  private waveNeighbours(x: number, y: number, peakScale: number): void {
    for (const view of this.bubbleViews) {
      if (view.cleared || !view.image.visible || (view.image.x === x && view.image.y === y)) continue;
      const distance = Phaser.Math.Distance.Between(x, y, view.image.x, view.image.y);
      const delay = Math.min(90, distance * 0.16);
      this.tweens.killTweensOf(view.image);
      view.image.setScale(view.baseScale).setAngle(0);
      this.tweens.add({
        targets: view.image,
        scaleX: view.baseScale * peakScale,
        scaleY: view.baseScale * (2 - peakScale),
        duration: 80,
        delay,
        yoyo: true,
        ease: 'Sine.InOut',
      });
    }
  }

  private destroyAfterTween(
    target: Phaser.GameObjects.GameObject,
    config: Omit<Phaser.Types.Tweens.TweenBuilderConfig, 'targets' | 'onComplete'>,
  ): void {
    this.tweens.add({ ...config, targets: target, onComplete: () => this.destroyTransient(target) });
  }

  private destroyTransient(target: Phaser.GameObjects.GameObject): void {
    this.transientEffects.delete(target);
    target.destroy();
  }

  private syncAudio(): void {
    if (!this.preferences.music || this.latestSnapshot.phase === 'menu') {
      this.bgm?.stop();
      return;
    }
    if (!this.bgm) this.bgm = this.sound.add('bgm', { loop: true, volume: 0.2 });
    if (!this.bgm.isPlaying) this.bgm.play();
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
    if (this.preferences.sound) this.sound.play('tap', { volume: 0.2 });
    this.controller.select(selectedIndex);
  };

  private clearBoard(): void {
    for (const view of this.bubbleViews) {
      view.image.destroy();
      view.order.destroy();
    }
    this.bubbleViews = [];
    this.currentLevelKey = '';
  }

  private clearTransientEffects(): void {
    for (const effect of this.transientEffects) {
      this.tweens.killTweensOf(effect);
      effect.destroy();
    }
    this.transientEffects.clear();
  }

  private cancelPendingCorrectAnimations(): void {
    for (const view of this.bubbleViews) {
      if (!view.cleared) continue;
      this.tweens.killTweensOf([view.image, view.order]);
      view.image.setVisible(false);
      view.order.setVisible(false);
    }
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
