import { GameController, type Preferences } from '../game/core/GameController';
import type { GameMode, SessionSnapshot, SessionUpdate } from '../game/core/types';

const MODE_LABEL: Record<GameMode, string> = {
  classic: '寻光模式',
  memory: '记忆模式',
  sequence: '旋律模式',
};

export class AppUI {
  private readonly root: HTMLElement;
  private settingsPausedGame = false;
  private latestSnapshot!: SessionSnapshot;
  private gameOverRevealPending = false;
  private gameOverRevealTimer?: number;

  constructor(private readonly controller: GameController, root: HTMLElement) {
    this.root = root;
    this.root.innerHTML = this.template();
    this.bindEvents();
    this.controller.subscribe((update, preferences) => this.sync(update, preferences));
  }

  private bindEvents(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => {
      button.addEventListener('click', () => this.controller.start(button.dataset.mode as GameMode));
    });
    this.onClick('#pause-button', () => this.controller.pause());
    this.onClick('#resume-button', () => this.controller.resume());
    this.onClick('#restart-button', () => this.controller.restart());
    this.onClick('#gameover-restart', () => this.controller.restart());
    this.onClick('#pause-home', () => this.controller.home());
    this.onClick('#gameover-home', () => this.controller.home());
    this.onClick('#menu-settings', () => this.openSettings());
    this.onClick('#pause-settings', () => this.openSettings());
    this.onClick('#settings-close', () => this.closeSettings());

    this.root.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-preference]').forEach((input) => {
      input.addEventListener('change', () => {
        const key = input.dataset.preference as keyof Preferences;
        this.controller.setPreference(key, input.checked);
      });
    });
    this.get<HTMLInputElement>('#music-volume').addEventListener('input', (event) => {
      const input = event.currentTarget as HTMLInputElement;
      this.controller.setPreference('musicVolume', Number(input.value) / 100);
    });

  }

  private sync(update: SessionUpdate, preferences: Preferences): void {
    const snapshot = update.snapshot;
    this.latestSnapshot = snapshot;
    const menu = this.get('#menu-screen');
    const hud = this.get('#hud');
    const pause = this.get('#pause-modal');
    const gameOver = this.get('#gameover-modal');

    menu.classList.toggle('is-visible', snapshot.phase === 'menu');
    hud.classList.toggle('is-visible', snapshot.phase !== 'menu');
    pause.classList.toggle('is-visible', snapshot.phase === 'paused');
    if (snapshot.phase !== 'game-over') {
      this.clearGameOverReveal();
      gameOver.classList.remove('is-visible');
    } else if (update.effect === 'wrong' && update.effectIndex !== undefined && !preferences.reducedMotion) {
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

    this.text('#level-value', String(snapshot.level));
    this.text('#score-value', String(snapshot.score).padStart(3, '0'));
    this.text('#time-value', String(Math.max(0, Math.ceil(snapshot.remainingTimeMs / 1000))));
    this.text('#target-value', String(snapshot.remainingTargets));
    this.text('#mode-name', snapshot.mode ? MODE_LABEL[snapshot.mode] : '');
    this.text('#gameover-score', String(snapshot.score));
    this.text('#gameover-level', String(snapshot.level));
    this.text('#gameover-best', snapshot.mode ? String(this.controller.getBestScore(snapshot.mode)) : '0');

    const timer = this.get('#timer-fill');
    const timeRatio = snapshot.timeLimitMs > 0 ? snapshot.remainingTimeMs / snapshot.timeLimitMs : 1;
    timer.style.setProperty('--timer-progress', `${Math.max(0, Math.min(1, timeRatio)) * 100}%`);
    timer.classList.toggle('is-urgent', timeRatio <= 0.3 && snapshot.phase === 'playing');

    const prompt = snapshot.phase === 'preview'
      ? snapshot.mode === 'memory' ? '看仔细，记住发光的位置' : '看仔细，记住亮起的顺序'
      : snapshot.phase === 'transition' ? '全部找到啦！'
        : snapshot.mode === 'classic' ? '找到所有发光泡泡'
          : snapshot.mode === 'memory' ? '凭记忆找到它们'
            : '按刚才的顺序点击';
    this.text('#play-prompt', prompt);

    for (const key of ['sound', 'music', 'haptics', 'reducedMotion'] as const) {
      const input = this.root.querySelector<HTMLInputElement>(`[data-preference="${key}"]`);
      if (input) input.checked = preferences[key];
    }
    const musicVolume = Math.round(preferences.musicVolume * 100);
    this.get<HTMLInputElement>('#music-volume').value = String(musicVolume);
    this.text('#music-volume-value', `${musicVolume}%`);

    for (const mode of ['classic', 'memory', 'sequence'] as GameMode[]) {
      this.text(`#best-${mode}`, String(this.controller.getBestScore(mode)));
    }

    if (update.effect === 'start') this.get('#level-toast').classList.remove('is-active');
    if (update.effect === 'level-up') this.flashToast(`第 ${snapshot.level + (snapshot.phase === 'transition' ? 1 : 0)} 关`);
    if (update.effect === 'start') this.announce(`${snapshot.mode ? MODE_LABEL[snapshot.mode] : ''}开始`);
    if (update.effect === 'wrong') this.announce('本轮结束');
  }

  private openSettings(): void {
    this.settingsPausedGame = ['playing', 'preview'].includes(this.latestSnapshot.phase);
    if (this.settingsPausedGame) this.controller.pause();
    this.get('#settings-modal').classList.add('is-visible');
    this.get<HTMLButtonElement>('#settings-close').focus();
  }

  private closeSettings(): void {
    this.get('#settings-modal').classList.remove('is-visible');
    if (this.settingsPausedGame && this.controller.getSnapshot().phase === 'paused') this.controller.resume();
    this.settingsPausedGame = false;
  }

  private flashToast(message: string): void {
    const toast = this.get('#level-toast');
    toast.textContent = message;
    toast.classList.remove('is-active');
    requestAnimationFrame(() => toast.classList.add('is-active'));
  }

  private clearGameOverReveal(): void {
    if (this.gameOverRevealTimer !== undefined) window.clearTimeout(this.gameOverRevealTimer);
    this.gameOverRevealTimer = undefined;
    this.gameOverRevealPending = false;
  }

  private announce(message: string): void {
    this.text('#live-region', message);
  }

  private onClick(selector: string, callback: () => void): void {
    this.get<HTMLButtonElement>(selector).addEventListener('click', callback);
  }

  private text(selector: string, value: string): void {
    this.get(selector).textContent = value;
  }

  private get<T extends HTMLElement = HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing UI element: ${selector}`);
    return element;
  }

  private template(): string {
    return `
      <section id="menu-screen" class="screen menu-screen is-visible" aria-label="主菜单">
        <div class="menu-topbar">
          <button id="menu-settings" class="icon-button" type="button" aria-label="打开设置">⚙</button>
        </div>
        <header class="brand-block">
          <div class="mascot-badge"><img src="art/icon-192.png" alt="微笑的蓝色泡泡角色"></div>
          <p class="eyebrow">一眼 · 一记 · 一触</p>
          <h1><span>泡泡</span>节拍</h1>
          <p class="tagline">让眼睛记住，让手指回答。</p>
        </header>
        <div class="mode-list" aria-label="选择模式">
          <button id="mode-classic" class="mode-card mode-card--classic" data-mode="classic" type="button">
            <span class="mode-orbit" aria-hidden="true"><i></i><i></i><i></i></span>
            <span class="mode-copy"><strong>寻光模式</strong><small>看见发光，就把它点亮</small></span>
            <span class="mode-meta">最佳 <b id="best-classic">0</b></span><span class="mode-arrow">→</span>
          </button>
          <button id="mode-memory" class="mode-card mode-card--memory" data-mode="memory" type="button">
            <span class="mode-orbit" aria-hidden="true"><i></i><i></i><i></i></span>
            <span class="mode-copy"><strong>记忆模式</strong><small>泡泡熄灭后，找回它们</small></span>
            <span class="mode-meta">最佳 <b id="best-memory">0</b></span><span class="mode-arrow">→</span>
          </button>
          <button id="mode-sequence" class="mode-card mode-card--sequence" data-mode="sequence" type="button">
            <span class="mode-orbit" aria-hidden="true"><i></i><i></i><i></i></span>
            <span class="mode-copy"><strong>旋律模式</strong><small>记住次序，一颗颗回应</small></span>
            <span class="mode-meta">最佳 <b id="best-sequence">0</b></span><span class="mode-arrow">→</span>
          </button>
        </div>
        <p class="menu-hint">轻触泡泡，开始你的节拍挑战</p>
      </section>

      <section id="hud" class="hud" aria-label="游戏状态">
        <div class="hud-safe">
          <div class="hud-row">
            <button id="pause-button" class="icon-button icon-button--glass" type="button" aria-label="暂停游戏">Ⅱ</button>
            <div class="mode-pill"><span class="mode-dot"></span><span id="mode-name"></span></div>
            <div id="timer-fill" class="timer-pill" style="--timer-progress: 100%"><span aria-hidden="true">◷</span><b id="time-value">0</b></div>
          </div>
          <div class="score-strip">
            <div><small>关卡</small><strong id="level-value">1</strong></div>
            <div class="score-main"><small>得分</small><strong id="score-value">000</strong></div>
            <div><small>剩余</small><strong id="target-value">0</strong></div>
          </div>
          <p id="play-prompt" class="play-prompt"></p>
        </div>
      </section>

      <div id="level-toast" class="level-toast" aria-hidden="true"></div>

      <section id="pause-modal" class="modal" role="dialog" aria-modal="true" aria-labelledby="pause-title">
        <div class="modal-card modal-card--pause">
          <span class="modal-kicker">慢慢呼吸</span><h2 id="pause-title">暂停一下</h2><p>泡泡会在这里等你。</p>
          <button id="resume-button" class="primary-button" type="button">继续游戏</button>
          <div class="button-row"><button id="restart-button" class="secondary-button" type="button">重新开始</button><button id="pause-settings" class="secondary-button" type="button">设置</button></div>
          <button id="pause-home" class="text-button" type="button">返回主菜单</button>
        </div>
      </section>

      <section id="gameover-modal" class="modal" role="dialog" aria-modal="true" aria-labelledby="gameover-title">
        <div class="modal-card modal-card--result">
          <div class="result-face" aria-hidden="true"><span>◡</span></div>
          <span class="modal-kicker">这一轮完成</span><h2 id="gameover-title">再来一次？</h2>
          <div class="result-grid"><div><small>得分</small><b id="gameover-score">0</b></div><div><small>到达</small><b>Lv.<span id="gameover-level">1</span></b></div><div><small>最佳</small><b id="gameover-best">0</b></div></div>
          <button id="gameover-restart" class="primary-button" type="button">再玩一轮</button>
          <button id="gameover-home" class="text-button" type="button">换个模式</button>
        </div>
      </section>

      <section id="settings-modal" class="modal modal--settings" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div class="modal-card settings-card">
          <div class="modal-heading"><div><span class="modal-kicker">按你的方式玩</span><h2 id="settings-title">游戏设置</h2></div><button id="settings-close" class="icon-button" type="button" aria-label="关闭设置">×</button></div>
          <label class="setting-row"><span><b>游戏音效</b><small>点击与反馈声音</small></span><input type="checkbox" data-preference="sound"><i></i></label>
          <label class="setting-row"><span><b>背景音乐</b><small>原创泡泡花园循环曲</small></span><input type="checkbox" data-preference="music"><i></i></label>
          <label class="volume-row" for="music-volume"><span><b>音乐音量</b><small>拖动调整背景音乐响度</small></span><output id="music-volume-value" for="music-volume">40%</output><input id="music-volume" type="range" min="0" max="100" step="1" value="40" aria-label="音乐音量"></label>
          <label class="setting-row"><span><b>触感反馈</b><small>支持设备上的轻微振动</small></span><input type="checkbox" data-preference="haptics"><i></i></label>
          <label class="setting-row"><span><b>减少动态效果</b><small>减少弹跳、粒子和震动</small></span><input type="checkbox" data-preference="reducedMotion"><i></i></label>
        </div>
      </section>
      <div id="live-region" class="sr-only" aria-live="polite"></div>
    `;
  }
}
