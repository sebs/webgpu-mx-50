import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDLE_RUNNER } from '../../src/state/state.js';
import type { TransitionRunner } from '../../src/state/state.js';
import {
  quantizeTransitionFrames,
  startRunner,
  advanceRunner,
  runnerLever,
  runnerBlinking,
  runnerActive,
  runnerComplete,
} from '../../src/core/timeline.js';

// --- TRANSITION control quantize (0..510 in 2-frame steps) ---

test('quantizeTransitionFrames clamps to [0,510] and floors to an even step', () => {
  const table: [number, number][] = [
    [0, 0],
    [1, 0],
    [2, 2],
    [3, 2],
    [60, 60],
    [61, 60],
    [254, 254],
    [510, 510],
    [600, 510],
    [-4, 0],
  ];
  for (const [input, expected] of table) {
    assert.equal(quantizeTransitionFrames(input), expected, `${input} → ${expected}`);
  }
});

// --- runner progress / completion ---

test('startRunner anchors the run at the press tick with zero progress', () => {
  const r = startRunner(0, 1, 60, 7);
  assert.deepEqual(r, { phase: 'running', durationTicks: 60, startTick: 7, lastTick: 7, pausedTicks: 0, from: 0, to: 1, progress: 0 });
});

test('advanceRunner reaches half progress at half duration and completes exactly at the end', () => {
  const start = startRunner(0, 1, 60, 0);
  const mid = advanceRunner(start, 30);
  assert.equal(mid.progress, 0.5);
  assert.equal(mid.phase, 'running');
  assert.equal(runnerLever(mid), 0.5);
  const done = advanceRunner(mid, 60);
  assert.equal(done.progress, 1);
  assert.equal(done.phase, 'complete');
  assert.equal(runnerLever(done), 1); // exactly at B, not a float product
});

test('a zero-frame runner snaps to the target on the next advance, not on the press', () => {
  const start = startRunner(0, 1, 0, 5);
  assert.equal(runnerLever(start), 0); // press frame: lever still at `from`
  assert.equal(advanceRunner(start, 5), start); // same tick → no-op
  const next = advanceRunner(start, 6);
  assert.equal(next.phase, 'complete');
  assert.equal(runnerLever(next), 1);
});

test('the runner holds its from position and heads to the far end', () => {
  const half = advanceRunner(startRunner(0.5, 1, 60, 0), 1);
  assert.equal(half.from, 0.5);
  assert.equal(half.to, 1);
  assert.ok(runnerLever(half) > 0.5);
});

// --- determinism: cadence-independent + drift-free pause ---

test('tick-by-tick and single catch-up advances land on identical runners', () => {
  let stepwise = startRunner(0, 1, 60, 0);
  for (let t = 1; t <= 60; t++) stepwise = advanceRunner(stepwise, t);
  const jump = advanceRunner(startRunner(0, 1, 60, 0), 60);
  assert.deepEqual(stepwise, jump);
});

test('pausing is drift-free: paused ticks are absorbed identically stepwise or in bulk', () => {
  const running = advanceRunner(startRunner(0, 1, 100, 0), 40);
  const paused: TransitionRunner = { ...running, phase: 'paused' };
  // absorb 20 paused ticks stepwise vs. one bulk catch-up
  let stepwise: TransitionRunner = paused;
  for (let t = 41; t <= 60; t++) stepwise = advanceRunner(stepwise, t);
  const bulk = advanceRunner(paused, 60);
  assert.deepEqual(stepwise, bulk);
  assert.equal(stepwise.pausedTicks, 20);
  assert.equal(stepwise.progress, 0.4); // frozen while paused
  // resume → completes exactly at startTick + duration + pausedTicks = 0 + 100 + 20
  const resumed = { ...stepwise, phase: 'running' as const };
  const done = advanceRunner(resumed, 120);
  assert.equal(done.phase, 'complete');
  assert.equal(runnerLever(done), 1);
  assert.equal(advanceRunner(resumed, 119).phase, 'running'); // one tick shy is not yet complete
});

// --- no-op returns the same reference (ADR-0011) ---

test('advanceRunner returns the same reference when nothing can move', () => {
  assert.equal(advanceRunner(IDLE_RUNNER, 50), IDLE_RUNNER); // idle
  const done = advanceRunner(startRunner(0, 1, 10, 0), 10);
  assert.equal(done.phase, 'complete');
  assert.equal(advanceRunner(done, 99), done); // complete
  const running = advanceRunner(startRunner(0, 1, 60, 0), 5);
  assert.equal(advanceRunner(running, 5), running); // no logical time passed (tick <= lastTick)
});

// --- LED / status predicates ---

test('runner status predicates reflect the phase', () => {
  const running = startRunner(0, 1, 60, 0);
  assert.equal(runnerActive(running), true);
  assert.equal(runnerBlinking(running), false);
  const paused = { ...running, phase: 'paused' as const };
  assert.equal(runnerBlinking(paused), true);
  assert.equal(runnerActive(paused), true);
  const done = advanceRunner(running, 60);
  assert.equal(runnerComplete(done), true);
  assert.equal(runnerBlinking(done), false);
  assert.equal(runnerActive(done), false);
  assert.equal(runnerActive(IDLE_RUNNER), false);
});
