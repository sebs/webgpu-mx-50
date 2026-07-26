import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce } from '../../src/state/reducer.js';
import { FACTORY_PRESET } from '../../src/state/state.js';
import {
  freezeActiveOn,
  anyFreezeOn,
  stillLedBlinks,
  multiTilesPerAxis,
  strobeInterval,
  multiInterval,
  trailInterval,
  intervalTicks,
  compressionReliable,
  STROBE_MIN,
  STROBE_MAX,
  MULTI_MIN,
} from '../../src/core/digital-effect.js';

const fresh = () => structuredClone(FACTORY_PRESET);
const engage = (s: ReturnType<typeof fresh>, effect: 'still' | 'strobe' | 'multi' | 'trail', on = true) =>
  reduce(s, { type: 'ENGAGE_FREEZE', effect, on });

test('Still ⊥ Strobe: engaging one switches the other off', () => {
  let s = engage(fresh(), 'still');
  assert.equal(freezeActiveOn(s.digitalEffect, 'A', 'still'), true);
  s = engage(s, 'strobe');
  assert.equal(freezeActiveOn(s.digitalEffect, 'A', 'strobe'), true);
  assert.equal(freezeActiveOn(s.digitalEffect, 'A', 'still'), false);
});

test('Still ⊥ Multi: engaging Multi switches Still off', () => {
  let s = engage(fresh(), 'still');
  s = reduce(s, { type: 'PRESS_MULTI' }); // → 4
  assert.equal(s.digitalEffect.freeze.multi, 4);
  assert.equal(s.digitalEffect.freeze.still, false);
});

test('Still ⊥ Compression: engaging Still clears Compression; Compression off-limits during Strobe', () => {
  // Still clears an active Compression.
  let s = reduce(fresh(), { type: 'PRESS_COMPRESSION' }); // compression → 1
  assert.equal(s.transition.wipe.modifiers.compression, 1);
  s = engage(s, 'still');
  assert.equal(s.transition.wipe.modifiers.compression, 0);
  // Compression is refused while Strobe runs.
  let t = engage(fresh(), 'strobe');
  const before = t.transition.wipe.modifiers.compression;
  t = reduce(t, { type: 'PRESS_COMPRESSION' });
  assert.equal(t.transition.wipe.modifiers.compression, before); // unchanged (refused)
  assert.equal(t.digitalEffect.freeze.strobe, true); // strobe continues
});

test('Trail runs together with Still; the Still LED blinks', () => {
  let s = engage(fresh(), 'still');
  s = engage(s, 'trail');
  assert.equal(s.digitalEffect.freeze.still, true);
  assert.equal(s.digitalEffect.freeze.trail, true);
  assert.equal(stillLedBlinks(s.digitalEffect), true);
});

test('Trail ⊥ A/V Synchro, in both engage orders', () => {
  // Trail active → A/V Synchro refused.
  let s = engage(fresh(), 'trail');
  s = reduce(s, { type: 'ATTEMPT_AV_SYNCHRO', on: true });
  assert.equal(s.digitalEffect.avSynchro, false);
  assert.equal(s.digitalEffect.freeze.trail, true);
  // A/V Synchro active → Trail refused.
  let t = reduce(fresh(), { type: 'ATTEMPT_AV_SYNCHRO', on: true });
  t = engage(t, 'trail');
  assert.equal(t.digitalEffect.freeze.trail, false);
});

test('Multi cycles single → 4 → 9 → 16 → single', () => {
  let s = fresh();
  const seen: number[] = [];
  for (let i = 0; i < 4; i++) {
    s = reduce(s, { type: 'PRESS_MULTI' });
    seen.push(s.digitalEffect.freeze.multi);
  }
  assert.deepEqual(seen, [4, 9, 16, 0]);
  assert.deepEqual([4, 9, 16, 0].map(multiTilesPerAxis), [2, 3, 4, 1]);
});

test('switching the effect bus clears freeze effects too', () => {
  let s = engage(fresh(), 'strobe');
  assert.equal(anyFreezeOn(s.digitalEffect, 'A'), true);
  s = reduce(s, { type: 'SELECT_EFFECT_BUS', bus: 'B' });
  assert.equal(anyFreezeOn(s.digitalEffect, 'A'), false);
  assert.equal(anyFreezeOn(s.digitalEffect, 'B'), false);
});

test('TIME positions map to the reference intervals; seconds convert to ticks', () => {
  assert.ok(Math.abs(strobeInterval(0) - STROBE_MIN) < 1e-9);
  assert.ok(Math.abs(strobeInterval(1) - STROBE_MAX) < 1e-9);
  assert.ok(Math.abs(strobeInterval(0.25) - 0.55) < 0.02);
  assert.ok(Math.abs(multiInterval(0) - MULTI_MIN) < 1e-9);
  assert.ok(Math.abs(multiInterval(0.5) - 1.1) < 0.03);
  assert.equal(trailInterval(0), MULTI_MIN);
  assert.equal(intervalTicks(1), 60); // 1 s = 60 ticks @ 60 Hz
  assert.equal(intervalTicks(0.03), 2); // ~0.03 s → 2 ticks
});

test('Trail makes the Compression Wipe unreliable', () => {
  assert.equal(compressionReliable(fresh()), true);
  assert.equal(compressionReliable(engage(fresh(), 'trail')), false);
});
