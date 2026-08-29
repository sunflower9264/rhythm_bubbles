import { BATTLE_STATS, createEnemyOrder, ENEMY_ARCHETYPES, getEnemyArchetype } from './enemies';
import { BOARD_COLS, BOARD_ROWS, createBubbles, createLevelConfig, createSeededRandom, type RandomSource } from './level';
import type { BubbleState, EnemyAttackState, EnemyId, EnemyMechanicState, GamePhase, RewardChoice, RewardId, SessionSnapshot, SessionUpdate } from './types';

const NEXT_BOARD_MS = 420;
const RESULT_TRANSITION_MS = 800;
const ENEMY_RECOVERY_MS = 320;
const GUARD_ACTIVE_MS = 900;
const MISTAKE_LIMIT = 3;
const COMBO_ATTACK_REDUCTION = 0.005;
const BOARD_CLEAR_ATTACK_REDUCTION = 0.005;
const COMBO_WINDOW_MS = 1000;
const BASE_PLAYER_HP = 100;
const BASE_ATTACK_POWER = 8;

const REWARDS: RewardChoice[] = [
  { id: 'power', title: '泡泡利刃', description: '每次正确点击伤害 +2' },
  { id: 'heart', title: '果冻心', description: '最大生命 +12，并恢复 18 点' },
  { id: 'shield', title: '糖霜护盾', description: '获得 20 点护盾，优先抵挡伤害' },
  { id: 'time', title: '回响钟摆', description: '恢复 14 点生命' },
];

type TransitionTarget = 'next-board' | 'reward' | 'victory';

export class GameSession {
  private phase: GamePhase = 'menu';
  private previousPhase: GamePhase | null = null;
  private score = 0;
  private level = 1;
  private bubbles: BubbleState[] = [];
  private lastTargetCount = 0;
  private transitionElapsedMs = 0;
  private transitionTarget: TransitionTarget = 'next-board';
  private lastSelectedIndex: number | null = null;
  private boardTapCount = 0;
  private battle = 1;
  private board = 0;
  private playerHp = BASE_PLAYER_HP;
  private maxPlayerHp = BASE_PLAYER_HP;
  private shield = 0;
  private maxShield = 0;
  private attackPower = BASE_ATTACK_POWER;
  private combo = 0;
  private comboElapsedMs = 0;
  private enemyHp = 0;
  private rewardChoices: RewardChoice[] = [];
  private lastDamage = 0;
  private lastEnemyDamage = 0;
  private lastBlockedDamage = 0;
  private lastAttackReduction = 0;
  private mistakeCount = 0;
  private enemyAttackState: EnemyAttackState = 'charging';
  private enemyAttackElapsedMs = 0;
  private enemyMechanicState: EnemyMechanicState = 'inactive';
  private enemyMechanicElapsedMs = 0;
  private enemyIntentTargets: number[] = [];
  private enemyIntentCursor = 0;
  private enemyPoise = 2;
  private enemyHazardRow: number | null = null;
  private enemyOrder: EnemyId[] = ENEMY_ARCHETYPES.map(({ id }) => id);

  constructor(private readonly random: RandomSource = createSeededRandom()) {}

  start(): SessionUpdate {
    this.score = 0;
    this.level = 1;
    this.battle = 1;
    this.board = 0;
    this.playerHp = BASE_PLAYER_HP;
    this.maxPlayerHp = BASE_PLAYER_HP;
    this.shield = 0;
    this.maxShield = 0;
    this.attackPower = BASE_ATTACK_POWER;
    this.resetCombo();
    this.lastTargetCount = 0;
    this.rewardChoices = [];
    this.mistakeCount = 0;
    this.lastAttackReduction = 0;
    this.previousPhase = null;
    this.enemyOrder = createEnemyOrder(this.random);
    this.resetEnemyAttack();
    this.loadBattle();
    return this.update('start');
  }

  home(): SessionUpdate {
    this.phase = 'menu';
    this.previousPhase = null;
    this.bubbles = [];
    return this.update('home');
  }

  restart(): SessionUpdate {
    return this.start();
  }

  selectReward(index: number): SessionUpdate {
    if (this.phase !== 'reward') return this.update('none');
    const reward = this.rewardChoices[index];
    if (!reward) return this.update('none');
    this.applyReward(reward.id);
    this.rewardChoices = [];
    this.battle += 1;
    this.level = this.battle;
    this.loadBattle();
    return this.update('reward-picked');
  }

  pause(): SessionUpdate {
    if (!['playing', 'transition'].includes(this.phase)) return this.update('none');
    this.previousPhase = this.phase;
    this.phase = 'paused';
    return this.update('pause');
  }

  resume(): SessionUpdate {
    if (this.phase !== 'paused') return this.update('none');
    this.phase = this.previousPhase ?? 'playing';
    this.previousPhase = null;
    return this.update('resume');
  }

  select(index: number): SessionUpdate {
    if (this.phase !== 'playing') return this.update('none');
    const bubble = this.bubbles[index];
    if (!bubble || bubble.cleared) return this.update('none');

    this.lastSelectedIndex = index;
    this.boardTapCount += 1;
    this.lastAttackReduction = 0;
    const enemy = this.currentEnemy();
    const mechanic = enemy.mechanic;
    const intentIndex = this.getExpectedIntentIndex();
    if (this.enemyMechanicState === 'active' && mechanic === 'guard') {
      this.resetCombo();
      this.applyPlayerDamage(Math.ceil(enemy.attack * 0.6));
      this.resetEnemyMechanic();
      if (this.playerHp === 0) this.phase = 'game-over';
      return this.finishBubbleTap('counter-miss', index);
    }
    if (this.enemyMechanicState === 'active' && mechanic === 'capture' && index === intentIndex) {
      this.performCounterHit();
      this.resetEnemyMechanic();
      return this.finishBubbleTap('enemy-countered', index);
    }
    if (this.enemyMechanicState === 'active' && mechanic === 'shell'
      && this.enemyIntentTargets.slice(this.enemyIntentCursor).includes(index)) {
      const selectedPosition = this.enemyIntentTargets.indexOf(index, this.enemyIntentCursor);
      [this.enemyIntentTargets[this.enemyIntentCursor], this.enemyIntentTargets[selectedPosition]] = [
        this.enemyIntentTargets[selectedPosition], this.enemyIntentTargets[this.enemyIntentCursor],
      ];
      this.performCounterHit();
      this.enemyIntentCursor += 1;
      this.enemyPoise = Math.max(0, this.enemyIntentTargets.length - this.enemyIntentCursor);
      if (this.enemyIntentCursor < this.enemyIntentTargets.length) return this.finishBubbleTap('enemy-countered', index);
      this.enemyIntentTargets = [];
      this.enemyIntentCursor = 0;
      this.enemyPoise = 0;
      if (this.enemyHp === 0) this.resetEnemyMechanic();
      else {
        this.enemyMechanicState = 'staggered';
        this.enemyMechanicElapsedMs = 0;
      }
      return this.finishBubbleTap('enemy-break', index);
    }
    if (this.enemyMechanicState === 'active' && mechanic === 'sequence' && index === intentIndex) {
      this.performCounterHit();
      this.enemyIntentCursor += 1;
      if (this.enemyIntentCursor < this.enemyIntentTargets.length) return this.finishBubbleTap('enemy-countered', index);

      this.enemyPoise = Math.max(0, this.enemyPoise - 1);
      this.enemyIntentTargets = [];
      this.enemyIntentCursor = 0;
      if (this.enemyHp === 0) this.resetEnemyMechanic();
      else if (this.enemyPoise === 0) {
        this.enemyMechanicState = 'staggered';
        this.enemyMechanicElapsedMs = 0;
        return this.finishBubbleTap('enemy-break', index);
      } else {
        this.resetEnemyMechanic();
      }
      return this.finishBubbleTap('enemy-countered', index);
    }
    if (this.enemyMechanicState === 'active' && mechanic === 'sequence'
      && this.enemyIntentTargets.includes(index) && index !== intentIndex) {
      this.resetCombo();
      this.mistakeCount += 1;
      this.applyPlayerDamage(Math.ceil(this.getMistakeDamage() * 0.5));
      if (this.playerHp === 0) this.phase = 'game-over';
      return this.finishBubbleTap('counter-miss', index);
    }
    if (this.enemyMechanicState === 'active' && mechanic === 'sweep'
      && bubble.row === this.enemyHazardRow) {
      this.resetCombo();
      this.mistakeCount += 1;
      this.applyPlayerDamage(Math.ceil(enemy.attack * 0.6));
      this.resetEnemyMechanic();
      if (this.playerHp === 0) this.phase = 'game-over';
      return this.finishBubbleTap('counter-miss', index);
    }

    const correct = bubble.isTarget;
    if (!correct) {
      this.resetCombo();
      this.mistakeCount += 1;
      this.applyPlayerDamage(this.getMistakeDamage());
      if (this.enemyAttackState === 'charging') {
        const cooldown = this.currentEnemy().cooldownMs;
        this.enemyAttackElapsedMs = Math.min(cooldown - 1, this.enemyAttackElapsedMs + cooldown * 0.2);
      }
      if (this.playerHp === 0) this.phase = 'game-over';
      return this.finishBubbleTap('mistake', index);
    }

    bubble.cleared = true;
    this.score += 10;
    this.combo += 1;
    this.comboElapsedMs = 0;
    const staggerMultiplier = this.enemyMechanicState === 'staggered' ? (mechanic === 'shell' ? 1.75 : 1.5) : 1;
    const armorMultiplier = mechanic === 'shell' && this.enemyMechanicState !== 'staggered' ? 0.5 : 1;
    this.lastDamage = Math.max(1, Math.round(
      (this.attackPower + Math.min(3, this.combo - 1)) * staggerMultiplier * armorMultiplier,
    ));
    this.enemyHp = Math.max(0, this.enemyHp - this.lastDamage);
    let counterEffect: SessionUpdate['effect'] | null = null;
    if (this.enemyHp === 0) {
      this.resetEnemyAttack();
      this.resetEnemyMechanic();
    }
    else {
      const reduction = (this.combo > 1 ? COMBO_ATTACK_REDUCTION : 0)
        + (this.getRemainingTargets() === 0 ? BOARD_CLEAR_ATTACK_REDUCTION : 0);
      this.lastAttackReduction = this.weakenEnemyAttack(reduction);
      if (mechanic === 'sweep' && this.enemyMechanicState === 'active') {
        this.resetEnemyMechanic();
        counterEffect = 'enemy-countered';
      }
    }

    // A broken enemy stays on the field until the current bubble board is fully
    // cleared. This keeps the player's target-completion rhythm intact instead
    // of opening the reward modal in the middle of a board.
    if (this.enemyHp === 0 && this.getRemainingTargets() === 0) {
      this.beginTransition(this.battle === ENEMY_ARCHETYPES.length ? 'victory' : 'reward');
      return this.update('encounter-win', index);
    }

    if (this.getRemainingTargets() === 0) {
      this.beginTransition('next-board');
      return this.update('board-clear', index);
    }

    return this.finishBubbleTap(counterEffect ?? (this.lastAttackReduction > 0 ? 'enemy-staggered' : 'correct'), index);
  }

  advanceTime(milliseconds: number): SessionUpdate {
    let remaining = Math.max(0, milliseconds);
    let effect: SessionUpdate['effect'] = 'none';

    while (remaining > 0) {
      const step = Math.min(remaining, 50);
      remaining -= step;

      if (this.phase === 'playing') {
        if (this.combo > 0) {
          this.comboElapsedMs += step;
          if (this.comboElapsedMs >= COMBO_WINDOW_MS) this.resetCombo();
        }

        const mechanicEffect = this.advanceEnemyMechanic(step);
        if (mechanicEffect !== 'none') effect = mechanicEffect;
        const attackEffect = this.advanceEnemyAttack(step);
        if (attackEffect !== 'none') effect = attackEffect;
        if (this.playerHp === 0) break;
      } else if (this.phase === 'transition') {
        this.transitionElapsedMs += step;
        const transitionDuration = this.transitionTarget === 'next-board' ? NEXT_BOARD_MS : RESULT_TRANSITION_MS;
        if (this.transitionElapsedMs >= transitionDuration) {
          if (this.transitionTarget === 'next-board') {
            this.loadBoard();
            effect = 'next-round';
          } else if (this.transitionTarget === 'reward') {
            this.rewardChoices = this.createRewardChoices();
            this.phase = 'reward';
            effect = 'reward';
          } else {
            this.phase = 'victory';
            effect = 'victory';
          }
        }
      } else {
        break;
      }
    }

    return this.update(effect);
  }

  getSnapshot(): SessionSnapshot {
    const enemy = this.currentEnemy();
    return {
      phase: this.phase,
      previousPhase: this.previousPhase,
      score: this.score,
      level: this.level,
      rows: this.bubbles.length > 0 ? BOARD_ROWS : 0,
      cols: this.bubbles.length > 0 ? BOARD_COLS : 0,
      remainingTargets: this.getRemainingTargets(),
      targetCount: this.lastTargetCount,
      bubbles: this.bubbles.map((bubble) => ({ ...bubble })),
      visibleTargetIndices: this.getVisibleTargetIndices(),
      lastSelectedIndex: this.lastSelectedIndex,
      battle: this.battle,
      board: this.board,
      boardTapCount: this.boardTapCount,
      boardTapLimit: this.getBoardTapLimit(),
      totalBattles: ENEMY_ARCHETYPES.length,
      enemyId: enemy.id,
      enemyOrder: [...this.enemyOrder],
      enemyName: enemy.name,
      enemyTexture: enemy.texture,
      enemyMechanic: enemy.mechanic,
      enemyHp: this.enemyHp,
      maxEnemyHp: enemy.maxHp,
      enemyAttack: enemy.attack,
      enemyAttackState: this.enemyAttackState,
      enemyMechanicState: this.enemyMechanicState,
      enemyAttackProgress: this.getEnemyAttackProgress(),
      enemyAttackCooldownMs: enemy.cooldownMs,
      enemyAttackWindupMs: enemy.windupMs,
      enemyIntentTargets: [...this.enemyIntentTargets],
      enemyIntentCursor: this.enemyIntentCursor,
      enemyHazardRow: this.enemyHazardRow,
      enemyPoise: this.enemyPoise,
      maxEnemyPoise: ['sequence', 'shell'].includes(enemy.mechanic) ? 2 : 1,
      enemyPhase: this.enemyHp <= enemy.maxHp / 2 ? 2 : 1,
      lastAttackReduction: this.lastAttackReduction,
      mistakeDamage: this.getMistakeDamage(),
      mistakeCount: this.mistakeCount,
      mistakeLimit: MISTAKE_LIMIT,
      enemyIsBoss: enemy.boss,
      playerHp: this.playerHp,
      maxPlayerHp: this.maxPlayerHp,
      shield: this.shield,
      maxShield: this.maxShield,
      attackPower: this.attackPower,
      combo: this.combo,
      comboRemainingMs: this.combo > 0 ? Math.max(0, COMBO_WINDOW_MS - this.comboElapsedMs) : 0,
      comboWindowMs: COMBO_WINDOW_MS,
      lastDamage: this.lastDamage,
      lastEnemyDamage: this.lastEnemyDamage,
      lastBlockedDamage: this.lastBlockedDamage,
      rewardChoices: this.rewardChoices.map((choice) => ({ ...choice })),
    };
  }

  private loadBattle(): void {
    const enemy = this.currentEnemy();
    this.enemyHp = enemy.maxHp;
    this.resetCombo();
    this.lastDamage = 0;
    this.lastEnemyDamage = 0;
    this.lastBlockedDamage = 0;
    this.lastAttackReduction = 0;
    this.enemyPoise = ['sequence', 'shell'].includes(enemy.mechanic) ? 2 : 1;
    this.enemyIntentTargets = [];
    this.enemyIntentCursor = 0;
    this.resetEnemyMechanic();
    this.resetEnemyAttack();
    this.loadBoard();
  }

  private loadBoard(): void {
    this.board += 1;
    const config = createLevelConfig(this.battle, this.lastTargetCount, this.random);
    this.bubbles = createBubbles(config, this.random);
    this.lastTargetCount = config.targetCount;
    this.transitionElapsedMs = 0;
    this.lastSelectedIndex = null;
    this.boardTapCount = 0;
    this.mistakeCount = 0;
    this.lastAttackReduction = 0;
    this.phase = 'playing';
    this.activateEnemyMechanic();
  }

  private beginTransition(target: TransitionTarget): void {
    this.resetEnemyMechanic();
    this.phase = 'transition';
    this.transitionTarget = target;
    this.transitionElapsedMs = 0;
  }

  private applyPlayerDamage(incoming: number): void {
    this.lastBlockedDamage = Math.min(this.shield, incoming);
    this.shield -= this.lastBlockedDamage;
    this.lastEnemyDamage = incoming - this.lastBlockedDamage;
    this.playerHp = Math.max(0, this.playerHp - this.lastEnemyDamage);
  }

  private resetCombo(): void {
    this.combo = 0;
    this.comboElapsedMs = 0;
  }

  private advanceEnemyAttack(milliseconds: number): SessionUpdate['effect'] {
    if (this.enemyHp === 0) return 'none';
    const enemy = this.currentEnemy();
    this.enemyAttackElapsedMs += milliseconds;

    if (this.enemyAttackState === 'charging' && this.enemyAttackElapsedMs >= enemy.cooldownMs) {
      this.enemyAttackState = 'windup';
      this.enemyAttackElapsedMs = 0;
      return 'enemy-windup';
    }

    if (this.enemyAttackState === 'windup' && this.enemyAttackElapsedMs >= enemy.windupMs) {
      this.applyPlayerDamage(enemy.attack);
      this.enemyAttackState = 'recovery';
      this.enemyAttackElapsedMs = 0;
      if (this.playerHp === 0) this.phase = 'game-over';
      return 'enemy-impact';
    }

    if (this.enemyAttackState === 'recovery' && this.enemyAttackElapsedMs >= ENEMY_RECOVERY_MS) {
      this.enemyAttackState = 'charging';
      this.enemyAttackElapsedMs = 0;
      return 'enemy-recover';
    }

    return 'none';
  }

  private resetEnemyAttack(): void {
    this.enemyAttackState = 'charging';
    this.enemyAttackElapsedMs = 0;
  }

  private advanceEnemyMechanic(milliseconds: number): SessionUpdate['effect'] {
    if (this.enemyHp === 0) return 'none';
    const mechanic = this.currentEnemy().mechanic;
    this.enemyMechanicElapsedMs += milliseconds;

    if (mechanic === 'guard' && this.enemyMechanicState === 'active'
      && this.enemyMechanicElapsedMs >= GUARD_ACTIVE_MS) {
      this.enemyMechanicState = 'staggered';
      this.enemyMechanicElapsedMs = 0;
      this.enemyPoise = 0;
      return 'enemy-break';
    }

    if (this.enemyMechanicState === 'staggered') {
      const staggerMs = mechanic === 'guard' ? 1200 : mechanic === 'shell' ? 1400 : 1600;
      if (this.enemyMechanicElapsedMs >= staggerMs) {
        this.enemyPoise = ['sequence', 'shell'].includes(mechanic) ? 2 : 1;
        this.enemyMechanicState = 'inactive';
        this.enemyMechanicElapsedMs = 0;
        return 'enemy-recover';
      }
    }

    return 'none';
  }

  private resetEnemyMechanic(): void {
    this.enemyMechanicState = 'inactive';
    this.enemyMechanicElapsedMs = 0;
    this.enemyIntentTargets = [];
    this.enemyIntentCursor = 0;
    this.enemyHazardRow = null;
  }

  private weakenEnemyAttack(reduction: number): number {
    if (reduction <= 0 || this.enemyAttackState !== 'charging') return 0;
    const enemy = this.currentEnemy();
    const previousProgress = Math.min(1, this.enemyAttackElapsedMs / enemy.cooldownMs);
    const nextProgress = Math.max(0, previousProgress - reduction);
    const actualReduction = previousProgress - nextProgress;
    if (actualReduction <= 0) return 0;
    this.enemyAttackState = 'charging';
    this.enemyAttackElapsedMs = nextProgress * enemy.cooldownMs;
    return actualReduction;
  }

  private currentEnemy() {
    const archetype = getEnemyArchetype(this.enemyOrder[this.battle - 1] ?? this.enemyOrder[0] ?? 'jelly');
    const stats = BATTLE_STATS[this.battle - 1] ?? BATTLE_STATS[0];
    const phaseSpeed = archetype.mechanic === 'guard' && this.enemyHp > 0 && this.enemyHp <= stats.maxHp / 2 ? 0.72 : 1;
    return {
      ...archetype,
      ...stats,
      cooldownMs: Math.round(archetype.cooldownMs * stats.speed * phaseSpeed),
      windupMs: Math.max(650, Math.round(archetype.windupMs * (0.96 + stats.speed * 0.04))),
    };
  }

  private getEnemyAttackProgress(): number {
    if (this.enemyHp === 0) return 0;
    const enemy = this.currentEnemy();
    if (this.enemyAttackState === 'windup') return 1;
    if (this.enemyAttackState === 'recovery') return 0;
    return Math.min(1, this.enemyAttackElapsedMs / enemy.cooldownMs);
  }

  private getMistakeDamage(): number {
    return Math.max(5, Math.ceil(this.currentEnemy().attack * 0.4));
  }

  private getVisibleTargetIndices(): number[] {
    const remainingTargets = this.bubbles.filter((bubble) => bubble.isTarget && !bubble.cleared);
    return this.phase === 'menu' ? [] : remainingTargets.map(({ index }) => index);
  }

  private getExpectedIntentIndex(): number | null {
    return this.enemyMechanicState === 'active' ? this.enemyIntentTargets[this.enemyIntentCursor] ?? null : null;
  }

  private getBoardTapLimit(): number {
    return this.lastTargetCount + 3;
  }

  private finishBubbleTap(effect: SessionUpdate['effect'], index: number): SessionUpdate {
    if (this.phase === 'playing' && this.getRemainingTargets() > 0 && this.boardTapCount >= this.getBoardTapLimit()) {
      this.beginTransition('next-board');
    }
    return this.update(effect, index);
  }

  private activateEnemyMechanic(): void {
    const enemy = this.currentEnemy();
    const available = this.bubbles.filter((bubble) => !bubble.cleared).map((bubble) => bubble.index);
    if (available.length === 0) return;
    this.enemyIntentTargets = [];
    this.enemyIntentCursor = 0;
    this.enemyHazardRow = null;

    if (enemy.mechanic === 'sequence') {
      const targetCount = this.enemyHp <= enemy.maxHp / 2 ? 3 : 2;
      this.enemyIntentTargets = available.slice(0, targetCount);
      if (this.board % 2 === 0) this.enemyIntentTargets.reverse();
    } else if (enemy.mechanic === 'capture') {
      const rescue = this.bubbles.find((bubble) => !bubble.cleared && !bubble.isTarget)?.index ?? available[0];
      this.enemyIntentTargets = [rescue];
    } else if (enemy.mechanic === 'shell') {
      this.enemyIntentTargets = available.slice(0, Math.min(2, available.length));
      this.enemyPoise = this.enemyIntentTargets.length;
    } else if (enemy.mechanic === 'sweep') {
      const remainingTargets = this.bubbles.filter((bubble) => bubble.isTarget && !bubble.cleared);
      const rowOffset = (this.board + this.battle) % BOARD_ROWS;
      const rows = Array.from({ length: BOARD_ROWS }, (_, index) => (rowOffset + index) % BOARD_ROWS);
      this.enemyHazardRow = rows.find((row) => remainingTargets.some((bubble) => bubble.row !== row)) ?? rows[0] ?? 0;
    }

    this.enemyMechanicState = 'active';
    this.enemyMechanicElapsedMs = 0;
  }

  private performCounterHit(): void {
    this.score += 10;
    this.combo += 1;
    this.comboElapsedMs = 0;
    this.lastDamage = Math.max(4, Math.floor(this.attackPower * 0.5));
    this.enemyHp = Math.max(0, this.enemyHp - this.lastDamage);
  }

  private getRemainingTargets(): number {
    return this.bubbles.filter((bubble) => bubble.isTarget && !bubble.cleared).length;
  }

  private createRewardChoices(): RewardChoice[] {
    const offset = (this.battle - 1) % REWARDS.length;
    return [REWARDS[offset], REWARDS[(offset + 1) % REWARDS.length], REWARDS[(offset + 2) % REWARDS.length]]
      .map((reward) => this.contextualizeReward(reward));
  }

  private contextualizeReward(reward: RewardChoice): RewardChoice {
    if (reward.id === 'power') return { ...reward, description: `攻击 ${this.attackPower} → ${this.attackPower + 2}，更容易压制蓄力` };
    if (reward.id === 'heart') return { ...reward, description: `生命上限 ${this.maxPlayerHp} → ${this.maxPlayerHp + 12}，并恢复 18` };
    if (reward.id === 'shield') return { ...reward, description: `护盾 ${this.shield} → ${this.shield + 20}，优先吸收撞击` };
    return { ...reward, description: `恢复 14 点生命` };
  }

  private applyReward(id: RewardId): void {
    if (id === 'power') this.attackPower += 2;
    if (id === 'heart') {
      this.maxPlayerHp += 12;
      this.playerHp = Math.min(this.maxPlayerHp, this.playerHp + 18);
    }
    if (id === 'shield') {
      this.shield += 20;
      this.maxShield = Math.max(this.maxShield, this.shield);
    }
    if (id === 'time') {
      this.playerHp = Math.min(this.maxPlayerHp, this.playerHp + 14);
    }
  }

  private update(effect: SessionUpdate['effect'], effectIndex?: number): SessionUpdate {
    return { snapshot: this.getSnapshot(), effect, effectIndex };
  }
}
