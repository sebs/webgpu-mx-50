import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce } from '../../src/state/reducer.js';
import { FACTORY_PRESET } from '../../src/state/state.js';
import {
  ccActive,
  joystickActive,
  isBlackAndWhite,
  monoTint,
  saturation,
  TINT_BASIS,
} from '../../src/core/colour-correct.js';
import {
  effectActiveOn,
  anyEffectOn,
  colourCorrectApplies,
  paintCoarseness,
} from '../../src/core/digital-effect.js';

const fresh = () => structuredClone(FACTORY_PRESET);

test('colour correction cycles off → chroma-only → +joystick → off', () => {
  let s = fresh();
  s = reduce(s, { type: 'PRESS_COLOUR_CORRECT', bus: 'A' });
  assert.equal(s.busA.colourCorrect.mode, 'chroma-only');
  assert.equal(joystickActive(s.busA.colourCorrect), false);
  s = reduce(s, { type: 'PRESS_COLOUR_CORRECT', bus: 'A' });
  assert.equal(s.busA.colourCorrect.mode, 'chroma-plus-joystick');
  assert.equal(joystickActive(s.busA.colourCorrect), true);
  s = reduce(s, { type: 'PRESS_COLOUR_CORRECT', bus: 'A' });
  assert.equal(s.busA.colourCorrect.mode, 'off');
  assert.equal(ccActive(s.busA.colourCorrect), false);
});

test('CHROMA at MIN is black & white; saturation scales from centre', () => {
  let s = fresh();
  s = reduce(s, { type: 'PRESS_COLOUR_CORRECT', bus: 'A' });
  assert.equal(saturation(s.busA.colourCorrect), 1); // centre = original
  s = reduce(s, { type: 'SET_CHROMA', bus: 'A', value: 0 });
  assert.equal(isBlackAndWhite(s.busA.colourCorrect), true);
  assert.equal(saturation(s.busA.colourCorrect), 0);
});

test('the mono tint appears only at CHROMA MIN with the joystick off centre', () => {
  let s = fresh();
  s = reduce(s, { type: 'PRESS_COLOUR_CORRECT', bus: 'A' });
  s = reduce(s, { type: 'PRESS_COLOUR_CORRECT', bus: 'A' }); // +joystick
  s = reduce(s, { type: 'SET_CHROMA', bus: 'A', value: 0 }); // B&W
  for (const dir of ['red', 'green', 'blue'] as const) {
    const t = reduce(s, { type: 'SET_CC_JOYSTICK', bus: 'A', x: TINT_BASIS[dir].x, y: TINT_BASIS[dir].y });
    assert.equal(monoTint(t.busA.colourCorrect), dir);
  }
  // Above MIN the joystick shifts hue, not a mono tint.
  const above = reduce(reduce(s, { type: 'SET_CHROMA', bus: 'A', value: 0.5 }), {
    type: 'SET_CC_JOYSTICK',
    bus: 'A',
    x: 1,
    y: 0,
  });
  assert.equal(monoTint(above.busA.colourCorrect), 'none');
});

test('the two buses correct independently', () => {
  let s = fresh();
  s = reduce(s, { type: 'PRESS_COLOUR_CORRECT', bus: 'A' });
  assert.equal(s.busA.colourCorrect.mode, 'chroma-only');
  assert.equal(s.busB.colourCorrect.mode, 'off');
});

test('a filter activates on the selected bus only when ON is pressed', () => {
  let s = fresh();
  s = reduce(s, { type: 'SELECT_EFFECT_BUS', bus: 'A' });
  s = reduce(s, { type: 'CHOOSE_EFFECT', effect: 'nega' });
  assert.equal(effectActiveOn(s.digitalEffect, 'A', 'nega'), false); // armed, not ON
  s = reduce(s, { type: 'PRESS_EFFECT_ON' });
  assert.equal(effectActiveOn(s.digitalEffect, 'A', 'nega'), true);
  assert.equal(anyEffectOn(s.digitalEffect, 'B'), false);
});

test('switching the effect bus moves the block; the old bus is left clean', () => {
  let s = fresh();
  s = reduce(s, { type: 'SELECT_EFFECT_BUS', bus: 'A' });
  s = reduce(s, { type: 'CHOOSE_EFFECT', effect: 'mosaic' });
  s = reduce(s, { type: 'PRESS_EFFECT_ON' });
  assert.equal(effectActiveOn(s.digitalEffect, 'A', 'mosaic'), true);
  s = reduce(s, { type: 'SELECT_EFFECT_BUS', bus: 'B' });
  s = reduce(s, { type: 'PRESS_EFFECT_ON' }); // armed mosaic re-engaged on B
  assert.equal(effectActiveOn(s.digitalEffect, 'B', 'mosaic'), true);
  assert.equal(anyEffectOn(s.digitalEffect, 'A'), false);
});

test('Mono overrides colour correction on its bus', () => {
  let s = fresh();
  s = reduce(s, { type: 'PRESS_COLOUR_CORRECT', bus: 'A' }); // cc on
  assert.equal(colourCorrectApplies(s, 'A'), true);
  s = reduce(s, { type: 'SELECT_EFFECT_BUS', bus: 'A' });
  s = reduce(s, { type: 'CHOOSE_EFFECT', effect: 'mono' });
  s = reduce(s, { type: 'PRESS_EFFECT_ON' });
  assert.equal(colourCorrectApplies(s, 'A'), false); // Mono overrides
});

test('Mosaic SIZE clamps to 1..31; Paint LEVEL maps to coarseness', () => {
  let s = fresh();
  s = reduce(s, { type: 'SET_MOSAIC_SIZE', step: 40 });
  assert.equal(s.digitalEffect.mosaicSize, 31);
  s = reduce(s, { type: 'SET_MOSAIC_SIZE', step: 16 });
  assert.equal(s.digitalEffect.mosaicSize, 16);
  assert.equal(paintCoarseness(0), 'finest');
  assert.equal(paintCoarseness(0.5), 'moderate');
  assert.equal(paintCoarseness(1), 'coarsest');
});
