import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce } from '../../src/state/reducer.js';
import { FACTORY_PRESET } from '../../src/state/state.js';
import {
  positionerAvailable,
  aspectEffective,
  insetCentre,
  insetHalf,
  effectiveInsetSize,
  grabCapture,
  insetSampleUV,
  grabSampleUV,
  INSET_MIN_SIZE,
} from '../../src/core/positioner.js';

const onSquare = () => {
  let s = structuredClone(FACTORY_PRESET);
  s = reduce(s, { type: 'PRESS_WIPE_FAMILY', family: 'square' });
  return s;
};

test('the Positioner engages only with a Square-family wipe', () => {
  assert.equal(positionerAvailable('square'), true);
  assert.equal(positionerAvailable('circle' as never), false); // circle is a Square *variant*, family is 'square'
  // Off Square: pressing the Positioner does nothing.
  let straight = structuredClone(FACTORY_PRESET); // family = straight
  straight = reduce(straight, { type: 'PRESS_POSITIONER' });
  assert.equal(straight.positioner.on, false);
  // On Square: it engages.
  const s = reduce(onSquare(), { type: 'PRESS_POSITIONER' });
  assert.equal(s.positioner.on, true);
});

test('activating the Positioner doubles the wiped size', () => {
  let s = onSquare();
  s = reduce(s, { type: 'SET_POSITIONER_SIZE', value: 0.2 });
  s = reduce(s, { type: 'PRESS_POSITIONER' });
  assert.equal(s.positioner.on, true);
  assert.ok(Math.abs(s.positioner.size - 0.4) < 1e-9);
});

test('turning the Positioner off cancels the Scene Grabber', () => {
  let s = reduce(onSquare(), { type: 'PRESS_POSITIONER' }); // on
  s = reduce(s, { type: 'PRESS_SCENE_GRABBER' }); // grab
  assert.equal(s.positioner.sceneGrabber, true);
  s = reduce(s, { type: 'PRESS_POSITIONER' }); // off
  assert.equal(s.positioner.on, false);
  assert.equal(s.positioner.sceneGrabber, false);
});

test('Scene Grabber needs the Positioner active', () => {
  const s = reduce(structuredClone(FACTORY_PRESET), { type: 'PRESS_SCENE_GRABBER' });
  assert.equal(s.positioner.sceneGrabber, false);
});

test('switching away from Square disengages the Positioner and cancels a grab', () => {
  let s = reduce(onSquare(), { type: 'PRESS_POSITIONER' });
  s = reduce(s, { type: 'PRESS_SCENE_GRABBER' });
  s = reduce(s, { type: 'PRESS_WIPE_FAMILY', family: 'straight' });
  assert.equal(s.positioner.on, false);
  assert.equal(s.positioner.sceneGrabber, false);
});

test('ASPECT is effective only on Square with the ASPECT ON button lit', () => {
  let s = onSquare();
  assert.equal(aspectEffective(s.transition.wipe), false); // aspectOn defaults off
  s = reduce(s, { type: 'SET_ASPECT_ON', on: true });
  assert.equal(aspectEffective(s.transition.wipe), true);
  const straight = reduce(structuredClone(FACTORY_PRESET), { type: 'SET_ASPECT_ON', on: true });
  assert.equal(aspectEffective(straight.transition.wipe), false); // not Square
});

// --- Phase 8: Picture-in-Picture storability predicate (reference §16, recipe 5) ---

import { isStorablePip, isPictureInPicture } from '../../src/core/positioner.js';

test('isStorablePip is true only for a square wipe with the Positioner on and Compression engaged', () => {
  let s = structuredClone(FACTORY_PRESET);
  s = reduce(s, { type: 'SET_TRANSITION_TYPE', transition: 'wipe' });
  s = reduce(s, { type: 'PRESS_WIPE_FAMILY', family: 'square' });
  s = reduce(s, { type: 'PRESS_COMPRESSION' });
  s = reduce(s, { type: 'PRESS_POSITIONER' }); // on (Square only)
  assert.equal(isPictureInPicture(s), true);
  assert.equal(isStorablePip(s), true);
  // A non-square inset cannot even be built: PRESS_POSITIONER no-ops off Square.
  let t = structuredClone(FACTORY_PRESET);
  t = reduce(t, { type: 'SET_TRANSITION_TYPE', transition: 'wipe' });
  t = reduce(t, { type: 'PRESS_WIPE_FAMILY', family: 'straight' });
  t = reduce(t, { type: 'PRESS_POSITIONER' }); // no-op off Square
  t = reduce(t, { type: 'PRESS_COMPRESSION' });
  assert.equal(t.positioner.on, false);
  assert.equal(isStorablePip(t), false);
});

// --- inset geometry & Scene Grabber sample math (reference §7, §16 recipe 5) --

const approxUV = (actual: { u: number; v: number }, expected: { u: number; v: number }): void => {
  assert.ok(Math.abs(actual.u - expected.u) < 1e-9 && Math.abs(actual.v - expected.v) < 1e-9);
};

test('insetCentre maps the joystick onto ±0.4 UV around centre', () => {
  approxUV(insetCentre(0, 0), { u: 0.5, v: 0.5 });
  approxUV(insetCentre(1, -1), { u: 0.9, v: 0.1 });
  approxUV(insetCentre(-1, 1), { u: 0.1, v: 0.9 });
  approxUV(insetCentre(2, -2), { u: 0.9, v: 0.1 }); // clamped
});

test('the lever sizes the inset: centre = stored size, B doubles, A collapses to the floor', () => {
  assert.ok(Math.abs(effectiveInsetSize(0.4, 0.5) - 0.4) < 1e-12);
  assert.ok(Math.abs(effectiveInsetSize(0.4, 1) - 0.8) < 1e-12);
  assert.equal(effectiveInsetSize(0.4, 0), 0);
  assert.equal(effectiveInsetSize(1, 1), 1); // clamped
  // Monotone nondecreasing in the lever.
  let prev = -1;
  for (const lever of [0, 0.25, 0.5, 0.75, 1]) {
    const v = effectiveInsetSize(0.4, lever);
    assert.ok(v >= prev);
    prev = v;
  }
});

test('insetHalf floors a degenerate inset at the visible minimum', () => {
  assert.ok(Math.abs(insetHalf(0) - INSET_MIN_SIZE / 2) < 1e-12);
  assert.ok(Math.abs(insetHalf(0.4) - 0.2) < 1e-12);
  assert.equal(insetHalf(1), 0.5);
});

test('grabCapture freezes centre, size and compression at the grab edge', () => {
  const p = { on: true, x: 1, y: -1, size: 0.4, sceneGrabber: true };
  const g = grabCapture(p, 0.5, 1);
  assert.ok(Math.abs(g.cu - 0.9) < 1e-12 && Math.abs(g.cv - 0.1) < 1e-12);
  assert.ok(Math.abs(g.half - 0.2) < 1e-12);
  assert.equal(g.compressed, true);
  assert.equal(grabCapture(p, 0.5, 0).compressed, false);
  assert.equal(grabCapture(p, 0.5, 2).compressed, true);
});

test('a grabbed window still rides rigidly with the joystick', () => {
  const g = grabCapture({ on: true, x: 0, y: 0, size: 0.4, sceneGrabber: true }, 0.5, 0);
  const L = insetCentre(1, -1); // moved after the grab
  const centre = grabSampleUV(L.u, L.v, L, g);
  assert.ok(Math.abs(centre.u - g.cu) < 1e-12 && Math.abs(centre.v - g.cv) < 1e-12);
  const off = grabSampleUV(L.u + 0.05, L.v - 0.03, L, g);
  assert.ok(Math.abs(off.u - (g.cu + 0.05)) < 1e-12 && Math.abs(off.v - (g.cv - 0.03)) < 1e-12);
});

test('the grabbed still holds its captured size', () => {
  // grabSampleUV takes no live-size argument at all; the compressed mapping depends only
  // on the captured half-extent.
  const g = { cu: 0.5, cv: 0.5, half: 0.2, compressed: true };
  const L = { u: 0.5, v: 0.5 };
  approxUV(grabSampleUV(0.7, 0.7, L, g), { u: 1, v: 1 });
  approxUV(grabSampleUV(0.3, 0.3, L, g), { u: 0, v: 0 });
});

test('a grabbed compressed PiP samples the whole frozen frame into the moved inset', () => {
  const g = { cu: 0.5, cv: 0.5, half: 0.2, compressed: true };
  const L = { u: 0.9, v: 0.1 }; // inset moved to the upper right after the grab
  approxUV(grabSampleUV(0.9, 0.1, L, g), { u: 0.5, v: 0.5 });
  approxUV(grabSampleUV(1.1, 0.3, L, g), { u: 1, v: 1 });
});

test('live and frozen compressed insets share one sample transform', () => {
  const C = { u: 0.6, v: 0.4 };
  const h = 0.15;
  const g = { cu: C.u, cv: C.v, half: h, compressed: true };
  for (const u of [0.5, 0.6, 0.7]) {
    for (const v of [0.3, 0.4, 0.5]) {
      assert.deepEqual(insetSampleUV(u, v, C, h, true), grabSampleUV(u, v, C, g));
    }
  }
  // Window mode is identity for the live inset.
  assert.deepEqual(insetSampleUV(0.42, 0.77, C, h, false), { u: 0.42, v: 0.77 });
});

test('a grabbed PiP still stays compressed when the live Compression modifier changes', () => {
  let s = structuredClone(FACTORY_PRESET);
  s = reduce(s, { type: 'SET_TRANSITION_TYPE', transition: 'wipe' });
  s = reduce(s, { type: 'PRESS_WIPE_FAMILY', family: 'square' });
  s = reduce(s, { type: 'PRESS_COMPRESSION' });
  s = reduce(s, { type: 'PRESS_POSITIONER' });
  s = reduce(s, { type: 'PRESS_SCENE_GRABBER' });
  const g = grabCapture(s.positioner, s.transition.lever, s.transition.wipe.modifiers.compression);
  assert.equal(g.compressed, true);
  s = reduce(s, { type: 'PRESS_COMPRESSION' }); // 1 → 2
  s = reduce(s, { type: 'PRESS_COMPRESSION' }); // 2 → 0
  assert.equal(s.transition.wipe.modifiers.compression, 0);
  assert.equal(g.compressed, true); // the latch, not the live modifier, drives the frozen look
});
