import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LogicalClock } from '../../src/engine/clock.js';
import { TICK_MS } from '../../src/constants.js';

test('advanceOneTick increments the tick count', () => {
  const clock = new LogicalClock();
  assert.equal(clock.tick, 0);
  clock.advanceOneTick();
  clock.advanceOneTick();
  assert.equal(clock.tick, 2);
});

test('accumulate steps whole ticks and reports how many', () => {
  // Feed a non-boundary delta (3.5 ticks) so floating-point rounding at an exact tick
  // boundary cannot make the count ambiguous. Exact-count determinism is covered by
  // advanceOneTick(), the path ADR-0012 mandates for deterministic tests.
  const clock = new LogicalClock();
  const stepped = clock.accumulate(TICK_MS * 3.5);
  assert.equal(stepped, 3);
  assert.equal(clock.tick, 3);
  assert.ok(Math.abs(clock.subTickAlpha - 0.5) < 1e-9);
});

test('logical time is monitor-independent: many small deltas == one large delta', () => {
  // 1667 ms fed as 1-ms increments, versus the same total in a single delta.
  const fine = new LogicalClock();
  const coarse = new LogicalClock();
  for (let i = 0; i < 1667; i++) fine.accumulate(1);
  coarse.accumulate(1667);
  assert.equal(fine.tick, coarse.tick);
  assert.equal(fine.tick, Math.floor(1667 / TICK_MS)); // 100
});

test('subTickAlpha reports the fractional tick left in the accumulator', () => {
  const clock = new LogicalClock();
  clock.accumulate(TICK_MS * 2.5);
  assert.equal(clock.tick, 2);
  assert.ok(Math.abs(clock.subTickAlpha - 0.5) < 1e-9);
});

test('a delta below one tick advances no ticks but accrues alpha', () => {
  const clock = new LogicalClock();
  const stepped = clock.accumulate(TICK_MS * 0.25);
  assert.equal(stepped, 0);
  assert.equal(clock.tick, 0);
  assert.ok(Math.abs(clock.subTickAlpha - 0.25) < 1e-9);
});
