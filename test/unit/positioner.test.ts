import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce } from '../../src/state/reducer.js';
import { FACTORY_PRESET } from '../../src/state/state.js';
import { positionerAvailable, aspectEffective } from '../../src/core/positioner.js';

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
