import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce } from '../../src/state/reducer.js';
import { FACTORY_PRESET } from '../../src/state/state.js';
import {
  luminance,
  wrapUnit,
  lumKeyMask,
  keyForegroundOpacity,
  keyedFraction,
  backdropHue,
  chromaTolerance,
  keySource,
  keyBackground,
} from '../../src/core/key.js';
import { stageIsBefore } from '../../src/core/signal-graph.js';
import { combineMode } from '../../src/core/transition.js';

const fresh = () => structuredClone(FACTORY_PRESET);

test('luminance is Rec.601 and wrapUnit folds into [0,1)', () => {
  assert.ok(Math.abs(luminance(1, 1, 1) - 1) < 1e-9);
  assert.ok(Math.abs(luminance(0, 1, 0) - 0.587) < 1e-9);
  assert.ok(Math.abs(wrapUnit(1.25) - 0.25) < 1e-9);
  assert.ok(Math.abs(wrapUnit(-0.25) - 0.75) < 1e-9);
});

test('the B-bus is always the key source, the A-bus the background', () => {
  assert.equal(keySource(), 'B');
  assert.equal(keyBackground(), 'A');
});

test('lumKeyMask thresholds at the slice; keyForegroundOpacity = mask × lever', () => {
  assert.equal(lumKeyMask(0.8, 0.5), 1);
  assert.equal(lumKeyMask(0.3, 0.5), 0);
  assert.equal(keyForegroundOpacity(1, 1), 1); // fully B, opaque
  assert.equal(keyForegroundOpacity(1, 0.5), 0.5); // translucent
  assert.equal(keyForegroundOpacity(0, 1), 0); // transparent region stays transparent
});

test('keyedFraction shrinks as the slice rises (low keeps most, high keeps highlights)', () => {
  assert.ok(keyedFraction(0.1) > keyedFraction(0.5));
  assert.ok(keyedFraction(0.5) > keyedFraction(0.9));
});

test('chroma: named backdrops map to hues; tolerance grows narrow→wide', () => {
  assert.equal(backdropHue('red'), 0);
  assert.ok(Math.abs(backdropHue('green') - 1 / 3) < 1e-9);
  assert.ok(chromaTolerance(0.25) < chromaTolerance(0.75));
});

test('PRESS_LUM_KEY / PRESS_CHROMA_KEY toggle against Mix', () => {
  let s = reduce(fresh(), { type: 'PRESS_LUM_KEY' });
  assert.equal(s.transition.type, 'lum-key');
  s = reduce(s, { type: 'PRESS_LUM_KEY' });
  assert.equal(s.transition.type, 'mix');
  s = reduce(fresh(), { type: 'PRESS_CHROMA_KEY' });
  assert.equal(s.transition.type, 'chroma-key');
  // Pressing the other key switches straight to it.
  s = reduce(s, { type: 'PRESS_LUM_KEY' });
  assert.equal(s.transition.type, 'lum-key');
});

test('SLICE clamps, HUE wraps, and both are independent of the lever', () => {
  let s = reduce(fresh(), { type: 'SET_SLICE', value: 1.4 });
  assert.equal(s.transition.slice, 1);
  s = reduce(s, { type: 'SET_HUE', angle: 1.2 });
  assert.ok(Math.abs(s.transition.hue - 0.2) < 1e-9);
  const lever = s.transition.lever;
  s = reduce(s, { type: 'SET_SLICE', value: 0.3 });
  assert.equal(s.transition.lever, lever); // slice does not move the lever
  const slice = s.transition.slice;
  s = reduce(s, { type: 'SET_LEVER', position: 0.7 });
  assert.equal(s.transition.slice, slice); // lever does not move the slice
});

test('combineMode maps rules; stageIsBefore honours the fixed flow', () => {
  assert.deepEqual(
    ['cross-dissolve', 'nam-brighter', 'lum-key', 'chroma-key'].map((r) => combineMode(r as never)),
    [0, 1, 2, 3],
  );
  assert.equal(stageIsBefore('mix-wipe', 'downstream-key'), true);
  assert.equal(stageIsBefore('downstream-key', 'fade'), true);
  assert.equal(stageIsBefore('fade', 'mix-wipe'), false);
});
