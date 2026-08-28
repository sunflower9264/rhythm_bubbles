import { GameSession } from './GameSession';
import type { GameMode, SessionSnapshot, SessionUpdate } from './types';

export interface Preferences {
  sound: boolean;
  music: boolean;
  haptics: boolean;
  reducedMotion: boolean;
}

type Listener = (update: SessionUpdate, preferences: Preferences) => void;

const PREFERENCES_KEY = 'rhythm-bubbles:preferences:v2';
const BEST_SCORES_KEY = 'rhythm-bubbles:best-scores:v2';

const DEFAULT_PREFERENCES: Preferences = {
  sound: true,
  music: true,
  haptics: true,
  reducedMotion: false,
};

export class GameController {
  private readonly session = new GameSession();
  private readonly listeners = new Set<Listener>();
  private preferences = this.readStorage<Preferences>(PREFERENCES_KEY, DEFAULT_PREFERENCES);
  private bestScores = this.readStorage<Record<GameMode, number>>(BEST_SCORES_KEY, {
    classic: 0,
    memory: 0,
    sequence: 0,
  });

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener({ snapshot: this.session.getSnapshot(), effect: 'none' }, this.getPreferences());
    return () => this.listeners.delete(listener);
  }

  start(mode: GameMode): void {
    this.commit(this.session.start(mode));
  }

  select(index: number): void {
    this.commit(this.session.select(index));
  }

  tick(milliseconds: number): void {
    const snapshot = this.session.getSnapshot();
    if (!['preview', 'playing', 'transition'].includes(snapshot.phase)) return;
    this.commit(this.session.advanceTime(milliseconds));
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

  getBestScore(mode: GameMode): number {
    return this.bestScores[mode] ?? 0;
  }

  private commit(update: SessionUpdate): void {
    const { snapshot } = update;
    if (snapshot.phase === 'game-over' && snapshot.mode) {
      const previousBest = this.bestScores[snapshot.mode] ?? 0;
      if (snapshot.score > previousBest) {
        this.bestScores = { ...this.bestScores, [snapshot.mode]: snapshot.score };
        this.writeStorage(BEST_SCORES_KEY, this.bestScores);
      }
    }

    if (update.effect === 'correct' && this.preferences.haptics) this.vibrate(12);
    if (update.effect === 'wrong' && this.preferences.haptics) this.vibrate([16, 24, 16]);

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
      return value ? { ...fallback, ...JSON.parse(value) } : fallback;
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
