import { GameController, type Preferences } from '../game/core/GameController';
import type { SessionSnapshot, SessionUpdate } from '../game/core/types';

const MENU_ENEMIES = [
  { id: 'jelly', texture: 'jelly-enemy' },
  { id: 'angler', texture: 'angler-enemy' },
  { id: 'hermit', texture: 'hermit-enemy' },
  { id: 'manta', texture: 'manta-enemy' },
  { id: 'puffer', texture: 'puffer-enemy' },
] as const;

const LOADING_BUBBLE_COUNT = 8;

export class AppUI {
  private readonly root: HTMLElement;
  private settingsPausedGame = false;
  private latestSnapshot!: SessionSnapshot;
  private gameOverRevealPending = false;
  private gameOverRevealTimer?: number;
  private lastEnemyHealthRatio = -1;
  private lastPlayerHealthRatio = -1;
  private playerDamageTimer?: number;
  private comboPunchTimer?: number;
  private comboImpactTimer?: number;
  private readonly loadingStartedAt = performance.now();
  private loadingProgress = 0;
  private resourcesReady = false;
  private menuEnemyIndex = -1;

  constructor(private readonly controller: GameController, root: HTMLElement) {
    this.root = root;
    this.root.innerHTML = this.template();
    this.selectMenuEnemy();
    this.bindEvents();
    this.controller.subscribe((update, preferences) => this.sync(update, preferences));
  }

  private bindEvents(): void {
    this.onClick('#start-game', () => this.controller.start());
    this.onClick('#pause-button', () => this.controller.pause());
    this.onClick('#resume-button', () => this.controller.resume());
    this.onClick('#restart-button', () => this.controller.restart());
    this.onClick('#gameover-restart', () => this.controller.restart());
    this.onClick('#victory-restart', () => this.controller.restart());
    this.onClick('#pause-home', () => this.controller.home());
    this.onClick('#gameover-home', () => this.controller.home());
    this.onClick('#victory-home', () => this.controller.home());
    this.onClick('#menu-settings', () => this.openSettings());
    this.onClick('#menu-bestiary', () => this.openBestiary());
    this.onClick('#pause-settings', () => this.openSettings());
    this.onClick('#settings-close', () => this.closeSettings());
    this.onClick('#bestiary-close', () => this.closeBestiary());

    this.root.querySelectorAll<HTMLButtonElement>('[data-reward-index]').forEach((button) => {
      button.addEventListener('click', () => this.controller.selectReward(Number(button.dataset.rewardIndex)));
    });

    this.root.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-preference]').forEach((input) => {
      input.addEventListener('change', () => {
        const key = input.dataset.preference as keyof Preferences;
        this.controller.setPreference(key, input.checked);
      });
    });
    this.get<HTMLInputElement>('#music-volume').addEventListener('input', (event) => {
      const input = event.currentTarget as HTMLInputElement;
      input.style.setProperty('--volume-progress', `${input.value}%`);
      this.controller.setPreference('musicVolume', Number(input.value) / 100);
    });

  }

  private sync(update: SessionUpdate, preferences: Preferences): void {
    const snapshot = update.snapshot;
    this.latestSnapshot = snapshot;
    const attackWasWeakened = snapshot.lastAttackReduction > 0 && ['enemy-staggered', 'board-clear'].includes(update.effect);
    if (['start', 'home'].includes(update.effect)) this.clearComboImpact();
    const menu = this.get('#menu-screen');
    const hud = this.get('#hud');
    const pause = this.get('#pause-modal');
    const gameOver = this.get('#gameover-modal');
    const reward = this.get('#reward-modal');
    const victory = this.get('#victory-modal');
    this.root.closest('#game-shell')?.classList.toggle('is-menu', snapshot.phase === 'menu');

    if (update.effect === 'home') this.selectMenuEnemy();

    menu.classList.toggle('is-visible', this.resourcesReady && snapshot.phase === 'menu');
    hud.classList.toggle('is-visible', snapshot.phase !== 'menu');
    pause.classList.toggle('is-visible', snapshot.phase === 'paused');
    reward.classList.toggle('is-visible', snapshot.phase === 'reward');
    victory.classList.toggle('is-visible', snapshot.phase === 'victory');
    if (snapshot.phase !== 'game-over') {
      this.clearGameOverReveal();
      if (gameOver.classList.contains('is-visible')) gameOver.classList.remove('is-visible');
    } else if (['mistake', 'counter-miss', 'enemy-impact', 'timeout-impact'].includes(update.effect) && !preferences.reducedMotion) {
      this.clearGameOverReveal();
      this.gameOverRevealPending = true;
      gameOver.classList.remove('is-visible');
      this.gameOverRevealTimer = window.setTimeout(() => {
        this.gameOverRevealPending = false;
        if (this.latestSnapshot.phase !== 'game-over') return;
        gameOver.classList.add('is-visible');
        this.get<HTMLButtonElement>('#gameover-restart').focus();
      }, 480);
    } else {
      gameOver.classList.toggle('is-visible', !this.gameOverRevealPending);
    }
    document.body.classList.toggle('reduce-motion', preferences.reducedMotion);

    this.text('#enemy-name', snapshot.enemyName);
    this.text('#enemy-health-value', `${snapshot.enemyHp}/${snapshot.maxEnemyHp}`);
    this.text('#player-health-value', String(snapshot.playerHp));
    this.text('#player-max-health', String(snapshot.maxPlayerHp));
    this.text('#player-shield-value', snapshot.maxShield > 0 ? `${snapshot.shield}/${snapshot.maxShield}` : '0');
    this.text('#gameover-score', String(snapshot.score));
    this.text('#gameover-level', String(snapshot.level));
    this.text('#gameover-best', String(this.controller.getBestScore()));
    this.text('#victory-score', String(snapshot.score));
    this.text('#victory-health', `${snapshot.playerHp}/${snapshot.maxPlayerHp}`);

    const enemyRatio = snapshot.maxEnemyHp > 0 ? snapshot.enemyHp / snapshot.maxEnemyHp : 0;
    if (enemyRatio !== this.lastEnemyHealthRatio) {
      this.get('#enemy-health-fill').style.width = `${Math.max(0, enemyRatio) * 100}%`;
      this.lastEnemyHealthRatio = enemyRatio;
    }
    const playerRatio = snapshot.maxPlayerHp > 0 ? snapshot.playerHp / snapshot.maxPlayerHp : 0;
    if (playerRatio !== this.lastPlayerHealthRatio) {
      this.get('#player-health-fill').style.width = `${Math.max(0, playerRatio) * 100}%`;
      this.lastPlayerHealthRatio = playerRatio;
    }
    const shieldRatio = snapshot.maxShield > 0 ? snapshot.shield / snapshot.maxShield : 0;
    this.style('#player-shield-fill', 'width', `${Math.max(0, Math.min(1, shieldRatio)) * 100}%`);
    const energyRatio = snapshot.targetCount > 0
      ? (snapshot.targetCount - snapshot.remainingTargets) / snapshot.targetCount
      : 0;
    this.style('#player-energy-fill', 'width', `${Math.max(0, Math.min(1, energyRatio)) * 100}%`);
    this.text('#player-energy-value', `${Math.round(Math.max(0, Math.min(1, energyRatio)) * 100)}%`);
    this.renderTargetBubbles(snapshot.remainingTargets);
    this.get('#enemy-status').classList.toggle('is-boss', snapshot.enemyIsBoss);
    this.get('#enemy-status').classList.toggle('is-windup', snapshot.enemyAttackState === 'windup');
    this.get('#enemy-status').classList.toggle('is-phase-two', snapshot.enemyPhase === 2);

    const comboBurst = this.get('#combo-burst');
    const comboVisible = snapshot.combo > 1 && !['menu', 'reward', 'game-over', 'victory'].includes(snapshot.phase);
    this.text('#combo-burst-value', String(snapshot.combo));
    comboBurst.classList.toggle('is-visible', comboVisible);
    comboBurst.classList.toggle('is-hot', snapshot.combo >= 5);
    comboBurst.classList.toggle('is-fever', snapshot.combo >= 8);
    comboBurst.classList.toggle('is-window-urgent', comboVisible && snapshot.comboRemainingMs <= 350);
    const comboProgress = snapshot.comboWindowMs > 0 ? snapshot.comboRemainingMs / snapshot.comboWindowMs : 0;
    this.style(comboBurst, '--combo-progress', `${Math.max(0, Math.min(1, comboProgress)) * 100}%`);

    const attackIntent = this.get('#enemy-attack-intent');
    const attackFrozen = ['paused', 'reward', 'transition'].includes(snapshot.phase);
    const attackLabel = snapshot.enemyHp === 0
      ? '攻击已停止'
      : snapshot.enemyAttackState === 'windup'
        ? '撞击警告'
        : snapshot.enemyAttackState === 'recovery'
          ? '撞击恢复'
          : attackFrozen ? '攻击暂停' : '撞击蓄力';
    this.text('#enemy-attack-label', attackLabel);
    this.style(attackIntent, '--attack-progress', `${snapshot.enemyAttackProgress * 100}%`);
    attackIntent.classList.toggle('is-windup', snapshot.enemyAttackState === 'windup');
    if (attackIntent.classList.contains('is-staggered')) attackIntent.classList.remove('is-staggered');
    attackIntent.classList.toggle('is-frozen', attackFrozen);
    attackIntent.classList.toggle('is-broken', snapshot.enemyHp === 0);

    for (const key of ['sound', 'music', 'haptics'] as const) {
      const input = this.root.querySelector<HTMLInputElement>(`[data-preference="${key}"]`);
      if (input && input.checked !== preferences[key]) input.checked = preferences[key];
    }
    const musicVolume = Math.round(preferences.musicVolume * 100);
    const musicVolumeInput = this.get<HTMLInputElement>('#music-volume');
    if (musicVolumeInput.value !== String(musicVolume)) musicVolumeInput.value = String(musicVolume);
    this.style(musicVolumeInput, '--volume-progress', `${musicVolume}%`);
    this.text('#music-volume-value', `${musicVolume}%`);

    this.text('#best-run', String(this.controller.getBestScore()));

    snapshot.rewardChoices.forEach((choice, index) => {
      const icon = this.get<HTMLImageElement>(`#reward-icon-${index}`);
      const src = `art/ui/reward-${choice.id}.png`;
      if (!icon.src.endsWith(src)) icon.src = src;
      this.text(`#reward-title-${index}`, choice.title);
      this.text(`#reward-description-${index}`, choice.description);
    });

    if (update.effect === 'start') this.get('#level-toast').classList.remove('is-active', 'is-combat', 'is-battle');
    if (update.effect === 'encounter-win' && !preferences.reducedMotion) this.triggerFinisherImpact();
    if (['enemy-impact', 'timeout-impact'].includes(update.effect) && !preferences.reducedMotion) this.triggerEnemyImpact();
    if (snapshot.lastEnemyDamage > 0 && ['mistake', 'counter-miss', 'mistake-overflow', 'enemy-impact', 'timeout-impact'].includes(update.effect)) this.triggerPlayerDamage();
    if (snapshot.combo > 1 && ['correct', 'enemy-staggered', 'enemy-countered', 'enemy-break', 'board-clear', 'encounter-win'].includes(update.effect)) this.triggerComboPunch();
    if (attackWasWeakened) {
      this.triggerAttackWeakened();
      const reductionPercent = Math.round(snapshot.lastAttackReduction * 1000) / 10;
      if (snapshot.combo > 1) this.showComboImpact(`连击破势 · 蓄力 -${reductionPercent}%`);
    }
    if (update.effect === 'mistake') this.announce(`点错泡泡，损失 ${snapshot.lastEnemyDamage} 点生命`);
    if (update.effect === 'counter-miss') this.announce(`机制应对失败，损失 ${snapshot.lastEnemyDamage} 点生命`);
    if (update.effect === 'enemy-countered') {
      this.flashToast(snapshot.enemyMechanic === 'capture' || snapshot.enemyMechanic === 'sweep'
        ? '反制成功！'
        : `化解成功 · 架势 ${snapshot.enemyPoise}/${snapshot.maxEnemyPoise}`, 'combat');
    }
    if (update.effect === 'enemy-break') this.flashToast(`破势！伤害 ×${snapshot.enemyMechanic === 'shell' ? '1.75' : '1.5'}`, 'combat');
    if (update.effect === 'mistake-overflow') {
      this.flashToast('失误超限 · 更换泡泡', 'combat');
      this.announce('失误超过三次，正在生成新一轮泡泡');
    }
    const mechanicAnnouncement = {
      sequence: '吞噬对招 · 按序化解',
      capture: '诱灯捕获 · 点击救援泡泡',
      shell: '护壳弱点 · 击破两处',
      sweep: `潮汐扫线 · 避开第 ${(snapshot.enemyHazardRow ?? 0) + 1} 排`,
      guard: '尖刺反击 · 暂停点击',
    }[snapshot.enemyMechanic];
    if (['start', 'next-round'].includes(update.effect)) this.flashToast(mechanicAnnouncement, 'combat');
    if (update.effect === 'reward-picked') {
      this.flashToast(`${snapshot.enemyIsBoss ? 'Boss 战' : `第 ${snapshot.battle} 战`} · ${mechanicAnnouncement}`, 'battle');
    }
    if (update.effect === 'start') this.announce('开始战斗');
    if (['mistake', 'counter-miss', 'enemy-impact', 'timeout-impact'].includes(update.effect) && snapshot.phase === 'game-over') this.announce('挑战失败');
    if (update.effect === 'victory') this.announce('挑战成功');
  }

  private openSettings(): void {
    this.settingsPausedGame = ['playing', 'transition'].includes(this.latestSnapshot.phase);
    if (this.settingsPausedGame) this.controller.pause();
    this.get('#settings-modal').classList.add('is-visible');
    this.get<HTMLButtonElement>('#settings-close').focus();
  }

  private openBestiary(): void {
    this.get('#bestiary-modal').classList.add('is-visible');
    this.get<HTMLButtonElement>('#bestiary-close').focus();
  }

  private closeBestiary(): void {
    this.get('#bestiary-modal').classList.remove('is-visible');
    this.get<HTMLButtonElement>('#menu-bestiary').focus();
  }

  setLoadingProgress(progress: number): void {
    this.loadingProgress = Math.max(this.loadingProgress, Math.min(1, progress));
    const percent = Math.round(this.loadingProgress * 100);
    this.get('#loading-progress').setAttribute('aria-valuenow', String(percent));
    this.text('#loading-progress-value', `${percent}%`);
    const filledCount = Math.ceil(this.loadingProgress * LOADING_BUBBLE_COUNT);
    this.root.querySelectorAll<HTMLElement>('.loading-progress-bubbles i').forEach((bubble, index) => {
      bubble.classList.toggle('is-filled', index < filledCount);
      bubble.classList.toggle('is-current', index === filledCount - 1 && percent < 100);
    });
  }

  completeLoading(): void {
    this.setLoadingProgress(1);
    const delay = Math.max(0, 1200 - (performance.now() - this.loadingStartedAt));
    window.setTimeout(() => {
      this.resourcesReady = true;
      const loading = this.get('#loading-screen');
      loading.classList.add('is-complete');
      this.get('#menu-screen').classList.toggle('is-visible', this.latestSnapshot.phase === 'menu');
      window.setTimeout(() => {
        loading.classList.remove('is-visible');
        loading.setAttribute('aria-hidden', 'true');
      }, 360);
    }, delay);
  }

  private closeSettings(): void {
    this.get('#settings-modal').classList.remove('is-visible');
    if (this.settingsPausedGame && this.controller.getSnapshot().phase === 'paused') this.controller.resume();
    this.settingsPausedGame = false;
  }

  private flashToast(message: string, placement: 'default' | 'combat' | 'battle' = 'default'): void {
    const toast = this.get('#level-toast');
    toast.textContent = message;
    toast.classList.remove('is-active');
    toast.classList.toggle('is-combat', placement === 'combat');
    toast.classList.toggle('is-battle', placement === 'battle');
    void toast.offsetWidth;
    toast.classList.add('is-active');
  }

  private triggerFinisherImpact(): void {
    const shell = this.root.closest('#game-shell');
    if (!shell) return;
    shell.classList.remove('is-finisher-impact');
    requestAnimationFrame(() => shell.classList.add('is-finisher-impact'));
    window.setTimeout(() => shell.classList.remove('is-finisher-impact'), 260);
  }

  private triggerEnemyImpact(): void {
    const shell = this.root.closest('#game-shell');
    if (!shell) return;
    shell.classList.remove('is-enemy-impact');
    requestAnimationFrame(() => shell.classList.add('is-enemy-impact'));
    window.setTimeout(() => shell.classList.remove('is-enemy-impact'), 300);
  }

  private triggerAttackWeakened(): void {
    const attackIntent = this.get('#enemy-attack-intent');
    attackIntent.classList.remove('is-weakened');
    requestAnimationFrame(() => attackIntent.classList.add('is-weakened'));
    window.setTimeout(() => attackIntent.classList.remove('is-weakened'), 460);
  }

  private triggerPlayerDamage(): void {
    const vital = this.get('.player-vital');
    if (this.playerDamageTimer !== undefined) window.clearTimeout(this.playerDamageTimer);
    vital.classList.remove('is-damaged');
    requestAnimationFrame(() => vital.classList.add('is-damaged'));
    this.playerDamageTimer = window.setTimeout(() => vital.classList.remove('is-damaged'), 460);
  }

  private triggerComboPunch(): void {
    const combo = this.get('#combo-burst');
    if (this.comboPunchTimer !== undefined) window.clearTimeout(this.comboPunchTimer);
    combo.classList.remove('is-punch');
    requestAnimationFrame(() => combo.classList.add('is-punch'));
    this.comboPunchTimer = window.setTimeout(() => combo.classList.remove('is-punch'), 260);
  }

  private showComboImpact(message: string): void {
    const impact = this.get('#combo-impact');
    if (this.comboImpactTimer !== undefined) window.clearTimeout(this.comboImpactTimer);
    impact.textContent = message;
    impact.classList.remove('is-visible');
    requestAnimationFrame(() => impact.classList.add('is-visible'));
    this.comboImpactTimer = window.setTimeout(() => impact.classList.remove('is-visible'), 1200);
  }

  private clearComboImpact(): void {
    if (this.comboImpactTimer !== undefined) window.clearTimeout(this.comboImpactTimer);
    this.comboImpactTimer = undefined;
    this.get('#combo-impact').classList.remove('is-visible');
  }

  private clearGameOverReveal(): void {
    if (this.gameOverRevealTimer !== undefined) window.clearTimeout(this.gameOverRevealTimer);
    this.gameOverRevealTimer = undefined;
    this.gameOverRevealPending = false;
  }

  private announce(message: string): void {
    this.text('#live-region', message);
  }

  private renderTargetBubbles(remaining: number): void {
    const targetBubbles = this.get('#target-bubbles');
    while (targetBubbles.childElementCount > remaining) targetBubbles.lastElementChild?.remove();
    while (targetBubbles.childElementCount < remaining) {
      const bubble = document.createElement('i');
      bubble.setAttribute('aria-hidden', 'true');
      targetBubbles.append(bubble);
    }
    const label = `还需点击 ${remaining} 个泡泡`;
    if (targetBubbles.getAttribute('aria-label') !== label) targetBubbles.setAttribute('aria-label', label);
  }

  private onClick(selector: string, callback: () => void): void {
    this.get<HTMLButtonElement>(selector).addEventListener('click', callback);
  }

  private text(selector: string, value: string): void {
    const element = this.get(selector);
    if (element.textContent !== value) element.textContent = value;
  }

  private style(target: string | HTMLElement, property: string, value: string): void {
    const element = typeof target === 'string' ? this.get(target) : target;
    if (element.style.getPropertyValue(property) !== value) element.style.setProperty(property, value);
  }

  private selectMenuEnemy(): void {
    let nextIndex = Math.floor(Math.random() * MENU_ENEMIES.length);
    if (nextIndex === this.menuEnemyIndex) nextIndex = (nextIndex + 1) % MENU_ENEMIES.length;
    this.menuEnemyIndex = nextIndex;
    const enemy = MENU_ENEMIES[nextIndex];
    this.get('#menu-encounter').dataset.enemy = enemy.id;
    this.get<HTMLImageElement>('#menu-featured-enemy').src = `art/${enemy.texture}.png`;
  }

  private get<T extends HTMLElement = HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing UI element: ${selector}`);
    return element;
  }

  private template(): string {
    return `
      <section id="loading-screen" class="loading-screen is-visible" aria-label="正在加载游戏资源" aria-live="polite">
        <img class="loading-game-title" src="art/game-title.png" alt="泡泡侠大战海洋怪">
        <div id="loading-progress" class="loading-progress-wrap" role="progressbar" aria-label="游戏资源加载进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <div class="loading-progress-bubbles" aria-hidden="true">
            ${Array.from({ length: LOADING_BUBBLE_COUNT }, () => '<i></i>').join('')}
          </div>
          <strong id="loading-progress-value" class="loading-progress-value">0%</strong>
        </div>
      </section>

      <section id="menu-screen" class="screen menu-screen" aria-label="主菜单">
        <header class="brand-block">
          <h1 class="game-logo" aria-label="泡泡侠大战海洋怪">
            <img src="art/game-title.png" alt="">
          </h1>
        </header>
        <div class="menu-actions">
          <button id="start-game" class="primary-button menu-start" type="button">开始游戏</button>
          <button id="menu-bestiary" class="menu-utility-button menu-bestiary-button" type="button">怪物图鉴</button>
          <button id="menu-settings" class="menu-utility-button" type="button">游戏设置</button>
        </div>
        <div id="menu-encounter" class="menu-encounter" data-enemy="jelly" aria-hidden="true">
          <div class="menu-bubble-squad">
            <i class="menu-bubble menu-bubble--leader"><span></span></i>
            <i class="menu-bubble menu-bubble--wing"><span></span></i>
            <i class="menu-bubble menu-bubble--scout"><span></span></i>
          </div>
          <div class="menu-current"><i></i></div>
          <img id="menu-featured-enemy" class="menu-featured-enemy" src="art/jelly-enemy.png" alt="">
        </div>
        <span id="best-run" class="sr-only">0</span>
      </section>

      <section id="hud" class="hud" aria-label="游戏状态">
        <div class="hud-safe">
          <div class="player-status">
            <button id="pause-button" class="player-avatar" type="button" aria-label="暂停游戏"><span aria-hidden="true"><i></i></span></button>
            <div class="player-meters">
              <div class="player-meter player-vital"><small>生命</small><i class="health-track health-track--player liquid-meter"><u id="player-health-fill" class="liquid-fill"></u></i><strong><span id="player-health-value">100</span><em>/<span id="player-max-health">100</span></em></strong></div>
              <div class="player-meter player-meter--shield"><small>护盾</small><i class="player-meter-track liquid-meter"><u id="player-shield-fill" class="liquid-fill"></u></i><strong id="player-shield-value">0</strong></div>
              <div class="player-meter player-meter--energy"><small>能量</small><i class="player-meter-track liquid-meter"><u id="player-energy-fill" class="liquid-fill"></u></i><strong id="player-energy-value">0%</strong></div>
            </div>
          </div>
          <div id="enemy-status" class="enemy-status">
            <div class="enemy-heading"><strong id="enemy-name">紫莓果冻</strong><em>Boss</em></div>
            <div class="health-track health-track--enemy liquid-meter"><i id="enemy-health-fill" class="liquid-fill"></i><b id="enemy-health-value">40/40</b></div>
            <div id="enemy-attack-intent" class="attack-intent" style="--attack-progress: 0%"><span aria-hidden="true"></span><strong id="enemy-attack-label">撞击蓄力</strong><i class="liquid-meter"><b class="liquid-fill"></b></i></div>
          </div>
          <div id="target-bubbles" class="target-bubbles" aria-label="还需点击 0 个泡泡"></div>
        </div>
      </section>

      <div id="combo-burst" class="combo-burst" aria-hidden="true">
        <span><b id="combo-burst-value">2</b><i>HIT</i></span><strong>COMBO</strong>
        <div class="combo-window liquid-meter"><u class="liquid-fill"></u></div><small id="combo-impact" class="combo-impact"></small>
      </div>

      <div id="level-toast" class="level-toast" aria-hidden="true"></div>

      <section id="pause-modal" class="modal" role="dialog" aria-modal="true" aria-labelledby="pause-title">
        <div class="modal-card modal-card--pause">
          <span class="modal-kicker">慢慢呼吸</span><h2 id="pause-title">暂停一下</h2><p>泡泡会在这里等你。</p>
          <button id="resume-button" class="primary-button" type="button">继续游戏</button>
          <div class="button-row"><button id="restart-button" class="secondary-button" type="button">重新开始</button><button id="pause-settings" class="secondary-button" type="button">游戏设置</button></div>
          <button id="pause-home" class="text-button" type="button">返回主菜单</button>
        </div>
      </section>

      <section id="gameover-modal" class="modal" role="dialog" aria-modal="true" aria-labelledby="gameover-title">
        <div class="modal-card modal-card--result">
          <div class="result-face" aria-hidden="true"><img src="art/ui/result-defeat.png" alt=""></div>
          <span class="modal-kicker">节拍断开了</span><h2 id="gameover-title">挑战失败</h2>
          <div class="result-grid"><div><small>得分</small><b id="gameover-score">0</b></div><div><small>到达</small><b>第 <span id="gameover-level">1</span> 战</b></div><div><small>最佳</small><b id="gameover-best">0</b></div></div>
          <button id="gameover-restart" class="primary-button" type="button">重新挑战</button>
          <button id="gameover-home" class="text-button" type="button">返回主页</button>
        </div>
      </section>

      <section id="reward-modal" class="modal modal--reward" role="dialog" aria-modal="true" aria-labelledby="reward-title">
        <div class="modal-card reward-card">
          <span class="modal-kicker">战斗胜利 · 选择一个</span><h2 id="reward-title">强化泡泡</h2><p>奖励会保留到本轮挑战结束。</p>
          <div class="reward-list">
            ${[0, 1, 2].map((index) => `<button class="reward-option" data-reward-index="${index}" type="button"><img id="reward-icon-${index}" src="art/ui/reward-power.png" alt=""><span><b id="reward-title-${index}">泡泡利刃</b><small id="reward-description-${index}">提高攻击力</small></span><em>选择</em></button>`).join('')}
          </div>
        </div>
      </section>

      <section id="victory-modal" class="modal modal--victory" role="dialog" aria-modal="true" aria-labelledby="victory-title">
        <div class="modal-card modal-card--result victory-card">
          <div class="victory-crown" aria-hidden="true"><img src="art/ui/result-victory.png" alt=""></div>
          <span class="modal-kicker">五战全胜</span><h2 id="victory-title">花园重归节拍</h2><p>星尘巨王也被你的泡泡弹走啦！</p>
          <div class="result-grid"><div><small>总得分</small><b id="victory-score">0</b></div><div><small>战斗</small><b>5/5</b></div><div><small>剩余生命</small><b id="victory-health">0</b></div></div>
          <button id="victory-restart" class="primary-button" type="button">再闯一轮</button>
          <button id="victory-home" class="text-button" type="button">返回主页</button>
        </div>
      </section>

      <section id="settings-modal" class="modal modal--settings" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div class="modal-card settings-card">
          <div class="modal-heading"><h2 id="settings-title">游戏设置</h2><button id="settings-close" class="icon-button" type="button" aria-label="关闭设置">×</button></div>
          <label class="setting-row"><span><b>游戏音效</b><small>点击与反馈声音</small></span><input type="checkbox" data-preference="sound"><i></i></label>
          <label class="setting-row"><span><b>背景音乐</b><small>原创泡泡花园循环曲</small></span><input type="checkbox" data-preference="music"><i></i></label>
          <label class="volume-row" for="music-volume"><span><b>音乐音量</b><small>拖动调整背景音乐响度</small></span><output id="music-volume-value" for="music-volume">40%</output><input id="music-volume" type="range" min="0" max="100" step="1" value="40" style="--volume-progress: 40%" aria-label="音乐音量"></label>
          <label class="setting-row"><span><b>触感反馈</b><small>支持设备上的轻微振动</small></span><input type="checkbox" data-preference="haptics"><i></i></label>
        </div>
      </section>

      <section id="bestiary-modal" class="modal modal--bestiary" role="dialog" aria-modal="true" aria-labelledby="bestiary-title">
        <div class="modal-card bestiary-card">
          <div class="modal-heading"><div><span class="modal-kicker">认识你的对手</span><h2 id="bestiary-title">怪物图鉴</h2></div><button id="bestiary-close" class="icon-button" type="button" aria-label="关闭怪物图鉴">×</button></div>
          <div class="bestiary-list">
            <article class="bestiary-entry bestiary-entry--jelly"><img src="art/jelly-enemy.png" alt=""><div><b>紫莓果冻</b><small>按顺序点亮标记，连续化解可让它破势。</small></div></article>
            <article class="bestiary-entry bestiary-entry--angler"><img src="art/angler-enemy.png" alt=""><div><b>灯笼骗骗鱼</b><small>盯住诱灯，及时点中目标切断捕获。</small></div></article>
            <article class="bestiary-entry bestiary-entry--hermit"><img src="art/hermit-enemy.png" alt=""><div><b>铠潮寄居蟹</b><small>击破两处弱点，破壳后才能造成完整伤害。</small></div></article>
            <article class="bestiary-entry bestiary-entry--manta"><img src="art/manta-enemy.png" alt=""><div><b>星翼魔鬼鱼</b><small>避开潮汐扫线，在安全行点击反制。</small></div></article>
            <article class="bestiary-entry bestiary-entry--puffer"><img src="art/puffer-enemy.png" alt=""><div><b>泡泡刺豚</b><small>蓄刺时停手，等它露出弱点再出击。</small></div></article>
          </div>
        </div>
      </section>

      <div id="live-region" class="sr-only" aria-live="polite"></div>
    `;
  }
}
