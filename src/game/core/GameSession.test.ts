import assert from 'node:assert/strict';
import test from 'node:test';
import { GameSession } from './GameSession';

const fixedRandom = () => 0;

test('classic mode awards 10 points per target and advances after all targets', () => {
  const session = new GameSession(fixedRandom);
  let update = session.start('classic');
  const targets = update.snapshot.bubbles.filter((bubble) => bubble.isTarget).map((bubble) => bubble.index);

  for (const target of targets) update = session.select(target);

  assert.equal(update.snapshot.score, targets.length * 10);
  assert.equal(update.snapshot.phase, 'transition');
  update = session.advanceTime(800);
  assert.equal(update.snapshot.level, 2);
});

test('wrong click ends the game immediately', () => {
  const session = new GameSession(fixedRandom);
  const start = session.start('classic');
  const wrong = start.snapshot.bubbles.find((bubble) => !bubble.isTarget);
  assert.ok(wrong);
  assert.equal(session.select(wrong.index).snapshot.phase, 'game-over');
});

test('memory mode ignores selection during preview and accepts memorized targets afterward', () => {
  const session = new GameSession(fixedRandom);
  const start = session.start('memory');
  const target = start.snapshot.bubbles.find((bubble) => bubble.isTarget);
  assert.ok(target);
  assert.equal(session.select(target.index).effect, 'none');
  assert.equal(session.advanceTime(1800).snapshot.phase, 'playing');
  assert.equal(session.select(target.index).effect, 'correct');
});

test('sequence mode requires the generated order', () => {
  const session = new GameSession(() => 0.5);
  const start = session.start('sequence');
  const playing = session.advanceTime((start.snapshot.targetCount + 1) * 300);
  assert.equal(playing.snapshot.phase, 'playing');
  assert.notEqual(playing.snapshot.expectedIndex, null);
  assert.equal(session.select(playing.snapshot.expectedIndex!).effect, 'correct');
});

test('timer expiry ends the run and pause freezes time', () => {
  const session = new GameSession(fixedRandom);
  const start = session.start('classic');
  const beforePause = start.snapshot.remainingTimeMs;
  session.pause();
  assert.equal(session.advanceTime(5000).snapshot.remainingTimeMs, beforePause);
  session.resume();
  assert.equal(session.advanceTime(beforePause).snapshot.phase, 'game-over');
});
