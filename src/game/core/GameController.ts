import { GameSession } from './GameSession';
import type { RandomSource } from './level';
import type { SessionSnapshot, SessionUpdate } from './types';

export interface Preferences {
  sound: boolean;
  music: boolean;
  musicVolume: number;
  haptics: boolean;
  reducedMotion: boolean;
}

type Listener = (update: SessionUpdate, preferences: Preferences) => void;

const PREFERENCES_KEY = 'rhythm-bubbles:preferences:v2';
const BEST_SCORE_KEY = 'rhythm-bubbles:best-run:v3';
const STATE_TICK_MS = 100;

const DEFAULT_PREFERENCES: Preferences = {
  sound: true,
  music: true,
  musicVolume: 0.4,
  haptics: true,
  reducedMotion: false,
};

export class GameController {
  private readonly session: GameSession;
  private readonly listeners = new Set<Listener>();
  private preferences = {
    ...this.readStorage<Preferences>(PREFERENCES_KEY, DEFAULT_PREFERENCES),
    reducedMotion: false,
  };
  private bestScore = this.readStorage<number>(BEST_SCORE_KEY, 0);
  private pendingTimeMs = 0;

  constructor(random?: RandomSource) {
    this.session = new GameSession(random);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener({ snapshot: this.session.getSnapshot(), effect: 'none' }, this.getPreferences());
    return () => this.listeners.delete(listener);
  }

  start(): void {
    this.commit(this.session.start());
  }

  select(index: number): void {
    this.commit(this.session.select(index));
  }

  selectReward(index: number): void {
    this.commit(this.session.selectReward(index));
  }

  tick(milliseconds: number, flush = false): void {
    const snapshot = this.session.getSnapshot();
    if (!['playing', 'transition'].includes(snapshot.phase)) {
      this.pendingTimeMs = 0;
      return;
    }
    this.pendingTimeMs += milliseconds;
    if (!flush && this.pendingTimeMs < STATE_TICK_MS) return;
    const elapsed = this.pendingTimeMs;
    this.pendingTimeMs = 0;
    this.commit(this.session.advanceTime(elapsed));
  }

  pause(): void {
    this.commit(this.session.pause());
  }

  resume(): void {
    this.commit(this.session.resume());
  }

  restart(): void {
    this.commit(this.session.restart());
  }

  home(): void {
    this.commit(this.session.home());
  }

  getSnapshot(): SessionSnapshot {
    return this.session.getSnapshot();
  }

  getPreferences(): Preferences {
    return { ...this.preferences };
  }

  setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]): void {
    this.preferences = { ...this.preferences, [key]: value };
    this.writeStorage(PREFERENCES_KEY, this.preferences);
    this.commit({ snapshot: this.session.getSnapshot(), effect: 'none' });
  }

  getBestScore(): number {
    return this.bestScore;
  }

  private commit(update: SessionUpdate): void {
    const { snapshot } = update;
    if (['game-over', 'victory'].includes(snapshot.phase) && snapshot.score > this.bestScore) {
      this.bestScore = snapshot.score;
      this.writeStorage(BEST_SCORE_KEY, this.bestScore);
    }

    if (update.effect === 'correct' && this.preferences.haptics) this.vibrate(10);
    if (update.effect === 'board-clear' && this.preferences.haptics) this.vibrate(14);
    if (update.effect === 'encounter-win' && this.preferences.haptics) this.vibrate([18, 22, 30]);
    if (update.effect === 'enemy-windup' && this.preferences.haptics) this.vibrate([8, 28, 8]);
    if (['enemy-impact', 'timeout-impact'].includes(update.effect) && this.preferences.haptics) this.vibrate([24, 18, 38]);
    if (update.effect === 'enemy-staggered' && this.preferences.haptics) this.vibrate([10, 10, 18]);
    if (update.effect === 'mistake' && this.preferences.haptics) this.vibrate([16, 20, 16]);
    if (update.effect === 'mistake-overflow' && this.preferences.haptics) this.vibrate([20, 16, 28]);

    for (const listener of this.listeners) listener(update, this.getPreferences());
  }

  private vibrate(pattern: number | number[]): void {
    try {
      navigator.vibrate?.(pattern);
    } catch {
      // Vibration is progressive enhancement and may be blocked by the browser.
    }
  }

  private readStorage<T>(key: string, fallback: T): T {
    try {
      const value = localStorage.getItem(key);
      if (!value) return fallback;
      const parsed: unknown = JSON.parse(value);
      if (typeof fallback === 'number') {
        return (typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : fallback) as T;
      }
      return parsed && typeof parsed === 'object' ? { ...fallback, ...parsed } : fallback;
    } catch {
      return fallback;
    }
  }

  private writeStorage(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Private browsing and strict storage policies should not block gameplay.
    }
  }
}
