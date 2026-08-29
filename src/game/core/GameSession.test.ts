import assert from 'node:assert/strict';
import test from 'node:test';
import { GameSession } from './GameSession';
import { createSeededRandom } from './level';
import type { EnemyId, RewardId, SessionUpdate } from './types';

const fixedRandom = () => 0;

test('单一入口从寻光开始，且保留 +10 与连击伤害', () => {
  const session = new GameSession(fixedRandom);
  const start = session.start();
  assert.equal(start.snapshot.mode, 'classic');
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

test('五战自动按寻光、记忆和旋律推进，后续不再叠加新模式', () => {
  const session = new GameSession(fixedRandom);
  let update = playUntilBattle(session, 2);
  assert.equal(update.snapshot.mode, 'memory');
  assert.equal(update.snapshot.phase, 'preview');

  update = playUntilBattle(session, 3, update);
  assert.equal(update.snapshot.mode, 'sequence');
  update = playUntilBattle(session, 4, update);
  assert.equal(update.snapshot.mode, 'sequence');
  update = playUntilBattle(session, 5, update);
  assert.equal(update.snapshot.mode, 'sequence');
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

test('记忆目标只统一显示一次，旋律顺序也统一显示后再隐藏', () => {
  const memorySession = new GameSession(fixedRandom);
  let update = playUntilBattle(memorySession, 2);
  const memoryTargets = update.snapshot.bubbles.filter((bubble) => bubble.isTarget).map((bubble) => bubble.index);
  assert.deepEqual(update.snapshot.visibleTargetIndices, memoryTargets);
  update = memorySession.advanceTime(899);
  assert.equal(update.snapshot.phase, 'preview');
  assert.deepEqual(update.snapshot.visibleTargetIndices, memoryTargets);
  update = memorySession.advanceTime(1);
  assert.equal(update.snapshot.phase, 'playing');
  assert.deepEqual(update.snapshot.visibleTargetIndices, []);

  const sequenceSession = new GameSession(fixedRandom);
  update = playUntilBattle(sequenceSession, 3);
  const orderedTargets = update.snapshot.bubbles
    .filter((bubble) => bubble.isTarget)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((bubble) => bubble.index);
  assert.deepEqual(update.snapshot.visibleTargetIndices, orderedTargets);
  update = sequenceSession.advanceTime(300);
  assert.deepEqual(update.snapshot.visibleTargetIndices, orderedTargets);
  update = sequenceSession.advanceTime(update.snapshot.targetCount * 300);
  assert.equal(update.snapshot.phase, 'playing');
  assert.deepEqual(update.snapshot.visibleTargetIndices, []);
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

test('紫莓果冻会根据伤害快速发起吞噬对招', () => {
  const { session, update: initial } = sessionStartingWith('jelly');
  let update = initial;
  for (let guard = 0; guard < 12 && update.snapshot.enemyAttackState !== 'windup'; guard += 1) {
    update = playOneStep(session, update);
  }
  assert.equal(update.snapshot.enemyAttackState, 'windup');
  assert.ok(update.snapshot.enemyIntentTargets.length >= 1);
  assert.equal(update.effect, 'enemy-windup');
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
  assert.equal(update.snapshot.enemyAttackState, 'charging');

  for (let guard = 0; guard < 60 && update.snapshot.enemyAttackState !== 'windup'; guard += 1) {
    update = playOneStep(session, update);
  }
  assert.equal(update.snapshot.enemyAttackState, 'windup');
  update = resolveIntent(session, update);
  assert.equal(update.effect, 'enemy-break');
  assert.equal(update.snapshot.enemyAttackState, 'staggered');
  assert.equal(update.snapshot.enemyPoise, 0);

  if (update.snapshot.phase === 'transition') update = session.advanceTime(420);
  const target = update.snapshot.bubbles.find((bubble) => bubble.isTarget && !bubble.cleared);
  assert.ok(target);
  update = session.select(target.index);
  assert.ok(update.snapshot.lastDamage > 8);
});

test('吞噬化解失败会造成屏幕撞击，并恢复怪物架势', () => {
  const { session, update: initial } = sessionStartingWith('jelly');
  let update = reachFirstIntent(session, initial);
  update = session.advanceTime(update.snapshot.enemyAttackWindupMs);
  assert.equal(update.effect, 'enemy-impact');
  assert.equal(update.snapshot.playerHp, 90);
  assert.equal(update.snapshot.enemyPoise, 2);
  assert.equal(update.snapshot.enemyAttackState, 'recovery');
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
      const target = update.snapshot.mode === 'sequence'
        ? update.snapshot.expectedIndex
        : update.snapshot.bubbles.find((bubble) => bubble.isTarget && !bubble.cleared)?.index;
      if (target === null || target === undefined) update = session.advanceTime(50);
      else update = session.select(target);
    } else if (update.snapshot.phase === 'preview') update = finishPreview(session, update);
    else break;
  }
  if (update.snapshot.phase === 'transition') update = session.advanceTime(420);
  if (update.snapshot.phase === 'preview') update = finishPreview(session, update);
  if (update.snapshot.enemyAttackState === 'staggered') update = session.advanceTime(1600);
  if (update.snapshot.enemyAttackState === 'charging') update = session.advanceTime(update.snapshot.enemyAttackCooldownMs);
  assert.equal(update.snapshot.phase, 'playing');
  assert.equal(update.snapshot.enemyId, 'jelly');
  assert.equal(update.snapshot.enemyAttackState, 'windup');
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
  assert.equal(update.snapshot.enemyAttackState, 'charging');
  assert.equal(update.snapshot.playerHp, hp);
  assert.equal(update.snapshot.boardTapCount, tapCount + 1);
});

test('铠潮寄居蟹需击破两个任意顺序弱点，护壳期减伤且破壳后增伤', () => {
  const { session, update: initial } = sessionStartingWith('hermit');
  const firstTarget = initial.snapshot.bubbles.find((bubble) => bubble.isTarget)!;
  let update = session.select(firstTarget.index);
  assert.equal(update.snapshot.lastDamage, 4);
  update = reachFirstIntent(session, update);
  const [first, second] = update.snapshot.enemyIntentTargets;
  update = session.select(second);
  assert.equal(update.snapshot.enemyAttackState, 'windup');
  update = session.select(first);
  assert.equal(update.effect, 'enemy-break');
  assert.equal(update.snapshot.enemyAttackState, 'staggered');
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
  update = patient.session.advanceTime(update.snapshot.enemyAttackWindupMs);
  assert.equal(update.snapshot.enemyAttackState, 'staggered');
  assert.equal(update.snapshot.playerHp, 100);
  while (update.snapshot.enemyHp > update.snapshot.maxEnemyHp / 2) {
    const target = update.snapshot.bubbles.find((candidate) => candidate.isTarget && !candidate.cleared);
    if (!target) update = playOneStep(patient.session, update);
    else update = patient.session.select(target.index);
  }
  assert.ok(update.snapshot.enemyAttackCooldownMs < cooldownAtFullHp);
});

test('第 4、5 战的旋律泡泡均一次点击清除', () => {
  for (const battle of [4, 5]) {
    const session = new GameSession(fixedRandom);
    let update = finishPreview(session, playUntilBattle(session, battle));
    const expected = update.snapshot.expectedIndex!;
    update = session.select(expected);
    assert.equal(update.snapshot.bubbles[expected].cleared, true, `battle ${battle}`);
    assert.notEqual(update.snapshot.expectedIndex, expected, `battle ${battle}`);
  }
});

test('普通连击削减 0.5% 蓄力，连击清盘合计削减 1%', () => {
  const session = new GameSession(fixedRandom);
  let update = finishPreview(session, playUntilBattle(session, 3));
  update = session.advanceTime(update.snapshot.enemyAttackCooldownMs * 0.5);

  update = session.select(update.snapshot.expectedIndex!);
  assert.equal(update.snapshot.lastAttackReduction, 0);
  update = session.select(update.snapshot.expectedIndex!);
  assert.ok(Math.abs(update.snapshot.lastAttackReduction - 0.005) < 0.0001);
  update = session.select(update.snapshot.expectedIndex!);
  assert.ok(Math.abs(update.snapshot.lastAttackReduction - 0.01) < 0.0001);
});

test('约每秒 7 次的快速点击仍会让怪物进入技能蓄力', () => {
  const session = new GameSession(fixedRandom);
  let update = finishPreview(session, playUntilBattle(session, 3));

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
  const session = new GameSession(fixedRandom);
  const start = session.start();
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

test('取消盘面倒计时后，时间推进只会驱动怪物行动', () => {
  const { session, update: start } = sessionStartingWith('angler');
  const initialBoard = start.snapshot.board;
  assert.equal(start.snapshot.remainingTimeMs, 0);
  assert.equal(start.snapshot.timeLimitMs, 0);

  const update = session.advanceTime(8000);
  assert.equal(update.snapshot.phase, 'playing');
  assert.equal(update.snapshot.board, initialBoard);
  assert.equal(update.snapshot.playerHp, 90);
  assert.equal(update.snapshot.remainingTimeMs, 0);
  assert.equal(update.snapshot.timeLimitMs, 0);
});

test('预览、暂停和奖励阶段都冻结怪物行动', () => {
  const session = new GameSession(fixedRandom);
  let update = playUntilBattle(session, 2);
  assert.equal(update.snapshot.phase, 'preview');
  session.pause();
  session.advanceTime(5000);
  update = session.resume();
  assert.equal(update.snapshot.phase, 'preview');
  assert.equal(update.snapshot.previewProgress, 0);
  assert.equal(update.snapshot.enemyAttackProgress, 0);

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
  update = finishPreview(session, update);
  const wrong = update.snapshot.bubbles.find((bubble) => !bubble.isTarget)!;
  update = session.select(wrong.index);
  update = playUntilPhase(session, update, 'reward');

  const rewardIndex = update.snapshot.rewardChoices.findIndex((reward) => reward.id === 'time');
  assert.notEqual(rewardIndex, -1);
  assert.equal(update.snapshot.rewardChoices[rewardIndex].description, '恢复 14 点生命');
  const hpBeforeReward = update.snapshot.playerHp;
  update = session.selectReward(rewardIndex);
  assert.equal(update.snapshot.playerHp, Math.min(update.snapshot.maxPlayerHp, hpBeforeReward + 14));
  assert.equal(update.snapshot.timeLimitMs, 0);
});

test('五战四奖励在多个随机种子和奖励策略下都可通关', () => {
  for (const reward of ['power', 'heart', 'shield', 'time'] as RewardId[]) {
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
  let update = initial ?? session.start();
  update = finishPreview(session, update);
  if (update.snapshot.enemyAttackState === 'charging') {
    update = session.advanceTime(update.snapshot.enemyAttackCooldownMs);
  }
  assert.equal(update.snapshot.enemyAttackState, 'windup');
  return update;
}

function resolveIntent(session: GameSession, initial: SessionUpdate): SessionUpdate {
  let update = initial;
  while (update.snapshot.enemyAttackState === 'windup') {
    const target = update.snapshot.enemyIntentTargets[update.snapshot.enemyIntentCursor];
    assert.notEqual(target, undefined);
    update = session.select(target);
  }
  return update;
}

function finishPreview(session: GameSession, update: SessionUpdate): SessionUpdate {
  if (update.snapshot.phase !== 'preview') return update;
  const duration = update.snapshot.mode === 'memory' ? 900 : (update.snapshot.targetCount + 1) * 300;
  return session.advanceTime(duration);
}

function playOneStep(session: GameSession, update: SessionUpdate, preferredReward: RewardId = 'power'): SessionUpdate {
  const snapshot = update.snapshot;
  if (snapshot.phase === 'preview') return finishPreview(session, update);
  if (snapshot.phase === 'transition') return session.advanceTime(snapshot.enemyHp === 0 ? 800 : 420);
  if (snapshot.phase === 'reward') {
    const preferred = snapshot.rewardChoices.findIndex((reward) => reward.id === preferredReward);
    return session.selectReward(preferred >= 0 ? preferred : 0);
  }
  if (snapshot.phase !== 'playing') return update;
  if (snapshot.enemyAttackState === 'windup') {
    if (['sequence', 'capture', 'shell'].includes(snapshot.enemyMechanic)) {
      return session.select(snapshot.enemyIntentTargets[snapshot.enemyIntentCursor]);
    }
    if (snapshot.enemyMechanic === 'guard') return session.advanceTime(snapshot.enemyAttackWindupMs);
    if (snapshot.enemyMechanic === 'sweep') {
      const safeTarget = snapshot.bubbles.find((bubble) => bubble.isTarget && !bubble.cleared && bubble.row !== snapshot.enemyHazardRow);
      return safeTarget ? session.select(safeTarget.index) : session.advanceTime(snapshot.enemyAttackWindupMs);
    }
  }
  const target = snapshot.mode === 'sequence'
    ? snapshot.expectedIndex
    : snapshot.bubbles.find((bubble) => bubble.isTarget && !bubble.cleared)?.index;
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
