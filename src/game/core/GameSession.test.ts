import assert from 'node:assert/strict';
import test from 'node:test';
import { GameSession } from './GameSession';
import { createSeededRandom } from './level';
import type { EnemyId, RewardId, SessionUpdate } from './types';

const fixedRandom = () => 0;

test('单一入口直接进入目标点击，且保留 +10 与连击伤害', () => {
  const session = new GameSession(fixedRandom);
  const start = session.start();
  assert.equal(start.snapshot.battle, 1);
  assert.equal(start.snapshot.phase, 'playing');
  assert.equal(start.snapshot.attackPower, 8);
  assert.equal(start.snapshot.boardTapCount, 0);
  assert.equal(start.snapshot.boardTapLimit, start.snapshot.targetCount + 3);

  const target = start.snapshot.bubbles.find((bubble) => bubble.isTarget);
  assert.ok(target);
  const update = session.select(target.index);
  assert.equal(update.snapshot.score, 10);
  assert.equal(update.snapshot.enemyHp, 142);
  assert.equal(update.snapshot.lastDamage, 8);
  assert.equal(update.snapshot.combo, 1);
  assert.equal(update.snapshot.boardTapCount, 1);
  assert.equal(session.select(target.index).snapshot.boardTapCount, 1);
});

test('五战生命与点错成本形成递增但宽容的曲线', () => {
  const expectedHp = [150, 240, 380, 600, 950];
  const expectedMistakeDamage = [5, 5, 6, 7, 8];
  for (let battle = 1; battle <= 5; battle += 1) {
    const session = new GameSession(fixedRandom);
    const update = battle === 1 ? session.start() : playUntilBattle(session, battle);
    assert.equal(update.snapshot.maxEnemyHp, expectedHp[battle - 1], `battle ${battle} hp`);
    assert.equal(update.snapshot.mistakeDamage, expectedMistakeDamage[battle - 1], `battle ${battle} mistake`);
  }
});

test('五战均直接进入目标点击状态', () => {
  const session = new GameSession(fixedRandom);
  let update = session.start();
  for (let battle = 1; battle <= 5; battle += 1) {
    if (battle > 1) update = playUntilBattle(session, battle, update);
    assert.equal(update.snapshot.phase, 'playing');
    const targets = update.snapshot.bubbles.filter((bubble) => bubble.isTarget && !bubble.cleared).map((bubble) => bubble.index);
    assert.deepEqual(update.snapshot.visibleTargetIndices, targets);
  }
});

test('所有战斗的泡泡盘面固定为 4x4', () => {
  const session = new GameSession(fixedRandom);
  let update = session.start();
  for (let battle = 1; battle <= 5; battle += 1) {
    if (battle > 1) update = playUntilBattle(session, battle, update);
    assert.equal(update.snapshot.rows, 4);
    assert.equal(update.snapshot.cols, 4);
    assert.equal(update.snapshot.bubbles.length, 16);
  }
});

test('目标泡泡持续显示且可按任意顺序点击', () => {
  const session = new GameSession(fixedRandom);
  let update = playUntilBattle(session, 3);
  if (update.snapshot.enemyMechanicState === 'active') update = resolveActiveMechanic(session, update);
  const targets = update.snapshot.bubbles.filter((bubble) => bubble.isTarget && !bubble.cleared);
  const selected = targets.at(-1);
  assert.ok(selected);
  update = session.select(selected.index);
  assert.equal(update.snapshot.bubbles[selected.index].cleared, true);
  assert.equal(update.snapshot.visibleTargetIndices.includes(selected.index), false);
});

test('五只怪物每局随机且无重复，首怪不固定', () => {
  const firstEnemies = new Set<EnemyId>();
  for (let seed = 1; seed <= 32; seed += 1) {
    const update = new GameSession(createSeededRandom(seed)).start();
    assert.equal(update.snapshot.enemyOrder.length, 5);
    assert.equal(new Set(update.snapshot.enemyOrder).size, 5);
    firstEnemies.add(update.snapshot.enemyId);
  }
  assert.ok(firstEnemies.size >= 3);
});

test('紫莓果冻开盘立即发起吞噬对招，攻击蓄力仍从零开始', () => {
  const { update } = sessionStartingWith('jelly');
  assert.equal(update.snapshot.enemyMechanicState, 'active');
  assert.ok(update.snapshot.enemyIntentTargets.length >= 2);
  assert.equal(update.snapshot.enemyAttackState, 'charging');
  assert.equal(update.snapshot.enemyAttackProgress, 0);
});

test('吞噬标记必须按顺序化解，点错只消耗容错而不清除泡泡', () => {
  const { session, update: initial } = sessionStartingWith('jelly');
  let update = reachFirstIntent(session, initial);
  assert.ok(update.snapshot.enemyIntentTargets.length >= 2);
  const wrongOrder = update.snapshot.enemyIntentTargets[1];
  const before = update.snapshot.bubbles[wrongOrder];
  update = session.select(wrongOrder);
  assert.equal(update.effect, 'counter-miss');
  assert.equal(update.snapshot.mistakeCount, 1);
  assert.equal(update.snapshot.bubbles[wrongOrder].cleared, before.cleared);
  assert.equal(update.snapshot.enemyIntentCursor, 0);
});

test('连续两次完整化解会破势，破势期伤害提升 50%', () => {
  const { session, update: initial } = sessionStartingWith('jelly');
  let update = reachFirstIntent(session, initial);
  update = resolveIntent(session, update);
  assert.equal(update.snapshot.enemyPoise, 1);
  assert.equal(update.snapshot.enemyMechanicState, 'inactive');
  assert.equal(update.snapshot.enemyAttackState, 'charging');

  const firstBoard = update.snapshot.board;
  for (let guard = 0; guard < 20 && update.snapshot.board === firstBoard; guard += 1) {
    update = playOneStep(session, update);
  }
  assert.equal(update.snapshot.board, firstBoard + 1);
  assert.equal(update.snapshot.enemyMechanicState, 'active');
  update = resolveIntent(session, update);
  assert.equal(update.effect, 'enemy-break');
  assert.equal(update.snapshot.enemyMechanicState, 'staggered');
  assert.equal(update.snapshot.enemyPoise, 0);

  if (update.snapshot.phase === 'transition') update = session.advanceTime(420);
  const target = update.snapshot.bubbles.find((bubble) => bubble.isTarget && !bubble.cleared);
  assert.ok(target);
  update = session.select(target.index);
  assert.ok(update.snapshot.lastDamage > 8);
});

test('怪物撞屏攻击与吞噬机制独立推进，攻击不会清除机制标记', () => {
  const { session, update: initial } = sessionStartingWith('jelly');
  let update = reachFirstIntent(session, initial);
  const intentTargets = [...update.snapshot.enemyIntentTargets];
  update = session.advanceTime(update.snapshot.enemyAttackCooldownMs);
  assert.equal(update.effect, 'enemy-windup');
  assert.equal(update.snapshot.enemyAttackState, 'windup');
  assert.equal(update.snapshot.enemyMechanicState, 'active');
  assert.deepEqual(update.snapshot.enemyIntentTargets, intentTargets);
  update = session.advanceTime(update.snapshot.enemyAttackWindupMs);
  assert.equal(update.effect, 'enemy-impact');
  assert.equal(update.snapshot.playerHp, 90);
  assert.equal(update.snapshot.enemyAttackState, 'recovery');
  assert.equal(update.snapshot.enemyMechanicState, 'active');
  assert.deepEqual(update.snapshot.enemyIntentTargets, intentTargets);
});

test('半血后吞噬升级为三个标记', () => {
  const { session, update: initial } = sessionStartingWith('jelly');
  let update = initial;
  for (let guard = 0; guard < 80 && update.snapshot.enemyPhase !== 2; guard += 1) {
    update = playOneStep(session, update);
  }
  assert.equal(update.snapshot.enemyPhase, 2);
  for (let guard = 0; guard < 80 && update.snapshot.enemyHp > update.snapshot.maxEnemyHp / 2; guard += 1) {
    if (update.snapshot.phase === 'transition') update = session.advanceTime(420);
    else if (update.snapshot.phase === 'playing') {
      const target = update.snapshot.bubbles.find((bubble) => bubble.isTarget && !bubble.cleared)?.index;
      if (target === null || target === undefined) update = session.advanceTime(50);
      else update = session.select(target);
    } else break;
  }
  if (update.snapshot.phase === 'transition') update = session.advanceTime(420);
  const halfHealthBoard = update.snapshot.board;
  for (let guard = 0; guard < 20 && update.snapshot.board === halfHealthBoard; guard += 1) {
    update = playOneStep(session, update);
  }
  assert.equal(update.snapshot.phase, 'playing');
  assert.equal(update.snapshot.enemyId, 'jelly');
  assert.equal(update.snapshot.enemyMechanicState, 'active');
  assert.equal(update.snapshot.enemyIntentTargets.length, 3);
});

test('灯笼骗骗鱼用救援标记切断捕获光', () => {
  const { session, update: initial } = sessionStartingWith('angler');
  let update = reachFirstIntent(session, initial);
  assert.equal(update.snapshot.enemyIntentTargets.length, 1);
  const hp = update.snapshot.playerHp;
  const tapCount = update.snapshot.boardTapCount;
  update = session.select(update.snapshot.enemyIntentTargets[0]);
  assert.equal(update.effect, 'enemy-countered');
  assert.equal(update.snapshot.enemyMechanicState, 'inactive');
  assert.equal(update.snapshot.enemyAttackState, 'charging');
  assert.equal(update.snapshot.playerHp, hp);
  assert.equal(update.snapshot.boardTapCount, tapCount + 1);
});

test('铠潮寄居蟹需击破两个任意顺序弱点，护壳期减伤且破壳后增伤', () => {
  const armored = sessionStartingWith('hermit');
  const armoredTarget = armored.update.snapshot.bubbles.find((bubble) => bubble.isTarget
    && !armored.update.snapshot.enemyIntentTargets.includes(bubble.index))!;
  const armoredHit = armored.session.select(armoredTarget.index);
  assert.equal(armoredHit.snapshot.lastDamage, 4);

  const { session, update: initial } = sessionStartingWith('hermit', 2000);
  let update = reachFirstIntent(session, initial);
  const [first, second] = update.snapshot.enemyIntentTargets;
  update = session.select(second);
  assert.equal(update.snapshot.enemyMechanicState, 'active');
  update = session.select(first);
  assert.equal(update.effect, 'enemy-break');
  assert.equal(update.snapshot.enemyMechanicState, 'staggered');
  assert.equal(update.snapshot.enemyAttackState, 'charging');
  const target = update.snapshot.bubbles.find((bubble) => bubble.isTarget && !bubble.cleared)!;
  update = session.select(target.index);
  assert.equal(update.snapshot.lastDamage, 18);
});

test('星翼魔鬼鱼危险行会反伤，安全行正确泡泡可打断扫线', () => {
  const risky = sessionStartingWith('manta');
  let update = reachFirstIntent(risky.session, risky.update);
  assert.notEqual(update.snapshot.enemyHazardRow, null);
  const hazard = update.snapshot.bubbles.find((bubble) => !bubble.cleared && bubble.row === update.snapshot.enemyHazardRow)!;
  const hp = update.snapshot.playerHp;
  update = risky.session.select(hazard.index);
  assert.equal(update.effect, 'counter-miss');
  assert.ok(update.snapshot.playerHp < hp);

  const safe = sessionStartingWith('manta', 2000);
  update = reachFirstIntent(safe.session, safe.update);
  const safeTarget = update.snapshot.bubbles.find((bubble) => bubble.isTarget && !bubble.cleared && bubble.row !== update.snapshot.enemyHazardRow)!;
  update = safe.session.select(safeTarget.index);
  assert.equal(update.effect, 'enemy-countered');
  assert.equal(update.snapshot.enemyMechanicState, 'inactive');
  assert.equal(update.snapshot.enemyAttackState, 'charging');
});

test('泡泡刺豚蓄刺时必须停手，忍过蓄刺后暴露弱点且半血加速', () => {
  const risky = sessionStartingWith('puffer');
  let update = reachFirstIntent(risky.session, risky.update);
  const cooldownAtFullHp = update.snapshot.enemyAttackCooldownMs;
  const hp = update.snapshot.playerHp;
  const bubble = update.snapshot.bubbles.find((candidate) => !candidate.cleared)!;
  update = risky.session.select(bubble.index);
  assert.equal(update.effect, 'counter-miss');
  assert.ok(update.snapshot.playerHp < hp);

  const patient = sessionStartingWith('puffer', 2000);
  update = reachFirstIntent(patient.session, patient.update);
  update = patient.session.advanceTime(900);
  assert.equal(update.snapshot.enemyMechanicState, 'staggered');
  assert.equal(update.snapshot.enemyAttackState, 'charging');
  assert.equal(update.snapshot.playerHp, 100);
  while (update.snapshot.enemyHp > update.snapshot.maxEnemyHp / 2) {
    const target = update.snapshot.bubbles.find((candidate) => candidate.isTarget && !candidate.cleared);
    if (!target) update = playOneStep(patient.session, update);
    else update = patient.session.select(target.index);
  }
  assert.ok(update.snapshot.enemyAttackCooldownMs < cooldownAtFullHp);
});

test('第 4、5 战的目标泡泡均一次点击清除', () => {
  for (const battle of [4, 5]) {
    const session = new GameSession(fixedRandom);
    let update = playUntilBattle(session, battle);
    if (update.snapshot.enemyMechanicState === 'active') update = resolveActiveMechanic(session, update);
    const target = update.snapshot.bubbles.find((bubble) => bubble.isTarget && !bubble.cleared);
    assert.ok(target);
    update = session.select(target.index);
    assert.equal(update.snapshot.bubbles[target.index].cleared, true, `battle ${battle}`);
  }
});

test('连击清盘合计削减 1% 蓄力', () => {
  const session = new GameSession(fixedRandom);
  let update = playUntilBattle(session, 3);
  if (update.snapshot.enemyMechanicState === 'active') update = resolveActiveMechanic(session, update);
  update = session.advanceTime(update.snapshot.enemyAttackCooldownMs * 0.5);
  const targets = update.snapshot.bubbles.filter((bubble) => bubble.isTarget && !bubble.cleared);
  update = session.select(targets[0].index);
  assert.equal(update.snapshot.lastAttackReduction, 0);
  update = session.select(targets[1].index);
  assert.ok(Math.abs(update.snapshot.lastAttackReduction - 0.01) < 0.0001);
});

test('约每秒 7 次的快速点击仍会让怪物蓄满撞屏攻击', () => {
  const session = new GameSession(fixedRandom);
  let update = playUntilBattle(session, 3);

  for (let guard = 0; guard < 80 && update.snapshot.enemyAttackState !== 'windup'; guard += 1) {
    update = session.advanceTime(140);
    if (update.snapshot.enemyAttackState === 'windup') break;
    update = playOneStep(session, update);
  }

  assert.equal(update.snapshot.enemyAttackState, 'windup');
  assert.equal(update.effect, 'enemy-windup');
  assert.ok(update.snapshot.enemyHp > 0);
});

test('连击必须在 1 秒窗口内衔接，超时后归零', () => {
  const session = new GameSession(fixedRandom);
  let update = session.start();
  const first = update.snapshot.bubbles.find((bubble) => bubble.isTarget)!;
  update = session.select(first.index);
  assert.equal(update.snapshot.combo, 1);
  assert.equal(update.snapshot.comboRemainingMs, 1000);

  update = session.advanceTime(999);
  assert.equal(update.snapshot.combo, 1);
  assert.equal(update.snapshot.comboRemainingMs, 1);
  update = session.advanceTime(1);
  assert.equal(update.snapshot.combo, 0);
  assert.equal(update.snapshot.comboRemainingMs, 0);

  const pausedSession = new GameSession(fixedRandom);
  update = pausedSession.start();
  update = pausedSession.select(update.snapshot.bubbles.find((bubble) => bubble.isTarget)!.index);
  pausedSession.pause();
  pausedSession.advanceTime(5000);
  update = pausedSession.resume();
  assert.equal(update.snapshot.combo, 1);
  assert.equal(update.snapshot.comboRemainingMs, 1000);
});

test('未清除泡泡的点击达到目标数 +3 时保留本次失误并更换盘面', () => {
  const { session } = sessionStartingWith('puffer');
  const start = session.advanceTime(900);
  assert.equal(start.snapshot.enemyMechanicState, 'staggered');
  const wrong = start.snapshot.bubbles.find((bubble) => !bubble.isTarget)!;
  const initialBoard = start.snapshot.board;
  const tapLimit = start.snapshot.targetCount + 3;
  let update = start;
  for (let count = 1; count < tapLimit; count += 1) {
    update = session.select(wrong.index);
    assert.equal(update.snapshot.mistakeCount, count);
    assert.equal(update.snapshot.boardTapCount, count);
    assert.equal(update.snapshot.phase, 'playing');
  }
  const hpBeforeLimit = update.snapshot.playerHp;
  update = session.select(wrong.index);
  assert.equal(update.effect, 'mistake');
  assert.equal(update.snapshot.mistakeCount, tapLimit);
  assert.equal(update.snapshot.boardTapCount, tapLimit);
  assert.equal(update.snapshot.playerHp, hpBeforeLimit - update.snapshot.mistakeDamage);
  assert.equal(update.snapshot.phase, 'transition');

  update = session.advanceTime(420);
  assert.equal(update.snapshot.board, initialBoard + 1);
  assert.equal(update.snapshot.boardTapCount, 0);
  assert.equal(update.snapshot.boardTapLimit, update.snapshot.targetCount + 3);
});

test('时间推进只驱动怪物行动，不会刷新泡泡盘面', () => {
  const { session, update: start } = sessionStartingWith('angler');
  const initialBoard = start.snapshot.board;

  const update = session.advanceTime(8000);
  assert.equal(update.snapshot.phase, 'playing');
  assert.equal(update.snapshot.board, initialBoard);
  assert.equal(update.snapshot.playerHp, 90);
});

test('暂停和奖励阶段都冻结怪物行动', () => {
  const session = new GameSession(fixedRandom);
  let update = playUntilBattle(session, 2);
  const progressBeforePause = update.snapshot.enemyAttackProgress;
  session.pause();
  session.advanceTime(5000);
  update = session.resume();
  assert.equal(update.snapshot.phase, 'playing');
  assert.equal(update.snapshot.enemyAttackProgress, progressBeforePause);

  update = playUntilPhase(session, update, 'reward');
  const progress = update.snapshot.enemyAttackProgress;
  update = session.advanceTime(10000);
  assert.equal(update.snapshot.phase, 'reward');
  assert.equal(update.snapshot.enemyAttackProgress, progress);
});

test('护盾奖励记录当前容量，重新开始后归零', () => {
  const session = new GameSession(fixedRandom);
  let update = session.start();
  assert.equal(update.snapshot.maxShield, 0);
  update = playUntilPhase(session, update, 'reward');
  const shieldIndex = update.snapshot.rewardChoices.findIndex((reward) => reward.id === 'shield');
  assert.notEqual(shieldIndex, -1);
  update = session.selectReward(shieldIndex);
  assert.equal(update.snapshot.shield, 20);
  assert.equal(update.snapshot.maxShield, 20);
  update = session.start();
  assert.equal(update.snapshot.shield, 0);
  assert.equal(update.snapshot.maxShield, 0);
});

test('原加时奖励改为只恢复 14 点生命', () => {
  const session = new GameSession(fixedRandom);
  let update = playUntilPhase(session, session.start(), 'reward');
  update = session.selectReward(0);
  const wrong = update.snapshot.bubbles.find((bubble) => !bubble.isTarget)!;
  update = session.select(wrong.index);
  update = playUntilPhase(session, update, 'reward');

  const rewardIndex = update.snapshot.rewardChoices.findIndex((reward) => reward.id === 'time');
  assert.notEqual(rewardIndex, -1);
  assert.equal(update.snapshot.rewardChoices[rewardIndex].description, '恢复 14 点生命');
  const hpBeforeReward = update.snapshot.playerHp;
  update = session.selectReward(rewardIndex);
  assert.equal(update.snapshot.playerHp, Math.min(update.snapshot.maxPlayerHp, hpBeforeReward + 14));
});

test('五战防御奖励路线在多个随机种子下可通关', () => {
  for (const reward of ['shield'] as RewardId[]) {
    for (let seed = 1; seed <= 24; seed += 1) {
      const update = finishRun(new GameSession(createSeededRandom(seed)), reward);
      assert.equal(update.snapshot.phase, 'victory', `${reward} seed ${seed}`);
      assert.ok(update.snapshot.playerHp > 0, `${reward} seed ${seed} should retain health`);
    }
  }
});

function sessionStartingWith(enemyId: EnemyId, seedOffset = 0): { session: GameSession; update: SessionUpdate } {
  for (let seed = seedOffset + 1; seed <= seedOffset + 2000; seed += 1) {
    const session = new GameSession(createSeededRandom(Math.imul(seed, 0x9e3779b1)));
    const update = session.start();
    if (update.snapshot.enemyId === enemyId) return { session, update };
  }
  throw new Error(`Unable to find seed for ${enemyId}`);
}

function reachFirstIntent(session: GameSession, initial?: SessionUpdate): SessionUpdate {
  const update = initial ?? session.start();
  assert.equal(update.snapshot.enemyMechanicState, 'active');
  return update;
}

function resolveIntent(session: GameSession, initial: SessionUpdate): SessionUpdate {
  let update = initial;
  while (update.snapshot.enemyMechanicState === 'active') {
    const target = update.snapshot.enemyIntentTargets[update.snapshot.enemyIntentCursor];
    assert.notEqual(target, undefined);
    update = session.select(target);
  }
  return update;
}

function resolveActiveMechanic(session: GameSession, initial: SessionUpdate): SessionUpdate {
  let update = initial;
  while (update.snapshot.enemyMechanicState === 'active') {
    const snapshot = update.snapshot;
    if (snapshot.enemyMechanic === 'guard') {
      update = session.advanceTime(900);
    } else if (snapshot.enemyMechanic === 'sweep') {
      const target = snapshot.bubbles.find((bubble) => bubble.isTarget && !bubble.cleared && bubble.row !== snapshot.enemyHazardRow);
      assert.ok(target && target.row !== snapshot.enemyHazardRow);
      update = session.select(target.index);
    } else {
      const target = snapshot.enemyIntentTargets[snapshot.enemyIntentCursor];
      assert.notEqual(target, undefined);
      update = session.select(target);
    }
  }
  return update;
}

function playOneStep(session: GameSession, update: SessionUpdate, preferredReward: RewardId = 'power'): SessionUpdate {
  const snapshot = update.snapshot;
  if (snapshot.phase === 'transition') return session.advanceTime(snapshot.enemyHp === 0 ? 800 : 420);
  if (snapshot.phase === 'reward') {
    const preferred = snapshot.rewardChoices.findIndex((reward) => reward.id === preferredReward);
    return session.selectReward(preferred >= 0 ? preferred : 0);
  }
  if (snapshot.phase !== 'playing') return update;
  if (snapshot.enemyMechanicState === 'active') return resolveActiveMechanic(session, update);
  if (snapshot.enemyAttackState === 'windup') return session.advanceTime(snapshot.enemyAttackWindupMs);
  const target = snapshot.bubbles.find((bubble) => bubble.isTarget && !bubble.cleared)?.index;
  assert.notEqual(target, null);
  assert.notEqual(target, undefined);
  return session.select(target!);
}

function playUntilBattle(session: GameSession, battle: number, initial?: SessionUpdate): SessionUpdate {
  let update = initial ?? session.start();
  for (let guard = 0; guard < 600 && update.snapshot.battle < battle; guard += 1) {
    update = playOneStep(session, update);
  }
  assert.equal(update.snapshot.battle, battle);
  return update;
}

function playUntilPhase(session: GameSession, initial: SessionUpdate, phase: 'reward' | 'victory'): SessionUpdate {
  let update = initial;
  for (let guard = 0; guard < 600 && update.snapshot.phase !== phase; guard += 1) {
    update = playOneStep(session, update);
  }
  return update;
}

function finishRun(session: GameSession, preferredReward: RewardId): SessionUpdate {
  let update = session.start();
  for (let guard = 0; guard < 1600 && update.snapshot.phase !== 'victory'; guard += 1) {
    update = playOneStep(session, update, preferredReward);
  }
  return update;
}
