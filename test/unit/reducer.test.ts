import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce, clamp } from '../../src/state/reducer.js';
import { FACTORY_PRESET, fieldPreset, MATTE_COLOR_COUNT } from '../../src/state/state.js';

test('clamp bounds a value into range', () => {
  assert.equal(clamp(-1, 0, 1), 0);
  assert.equal(clamp(2, 0, 1), 1);
  assert.equal(clamp(0.4, 0, 1), 0.4);
});

test('SET_LEVER clamps the position into [0, 1]', () => {
  const s = structuredClone(FACTORY_PRESET);
  assert.equal(reduce(s, { type: 'SET_LEVER', position: 1.7 }).transition.lever, 1);
  assert.equal(reduce(s, { type: 'SET_LEVER', position: -0.3 }).transition.lever, 0);
});

test('ASSIGN_SOURCE accepts the Matte as a bus source', () => {
  const s = structuredClone(FACTORY_PRESET);
  const next = reduce(s, { type: 'ASSIGN_SOURCE', bus: 'B', source: 'matte' });
  assert.equal(next.busB.source, 'matte');
});

test('SET_MATTE_COLOR wraps within the 9-colour ring', () => {
  const s = structuredClone(FACTORY_PRESET);
  assert.equal(reduce(s, { type: 'SET_MATTE_COLOR', colorIndex: MATTE_COLOR_COUNT }).matte.colorIndex, 0);
  assert.equal(reduce(s, { type: 'SET_MATTE_COLOR', colorIndex: -1 }).matte.colorIndex, MATTE_COLOR_COUNT - 1);
});

test('reduce never mutates its input', () => {
  const s = structuredClone(FACTORY_PRESET);
  const snapshot = JSON.stringify(s);
  reduce(s, { type: 'SET_LEVER', position: 0.5 });
  reduce(s, { type: 'ASSIGN_SOURCE', bus: 'A', source: 4 });
  assert.equal(JSON.stringify(s), snapshot);
});

test('an unchanged command returns the same state reference', () => {
  const s = structuredClone(FACTORY_PRESET);
  assert.equal(reduce(s, { type: 'ASSIGN_SOURCE', bus: 'A', source: s.busA.source }), s);
});

test('fieldPreset returns an independent clone (reference §18 seam)', () => {
  const saved = structuredClone(FACTORY_PRESET);
  const restored = fieldPreset(saved);
  assert.notEqual(restored, saved);
  assert.deepEqual(restored, saved);
});

test('ASSIGN_SOURCE tracks the blinking substitute (last non-Matte source, ADR-0006)', () => {
  const s0 = structuredClone(FACTORY_PRESET);
  const s1 = reduce(s0, { type: 'ASSIGN_SOURCE', bus: 'A', source: 3 });
  assert.equal(s1.busA.source, 3);
  assert.equal(s1.busA.substituteSource, 3);

  const s2 = reduce(s1, { type: 'ASSIGN_SOURCE', bus: 'A', source: 'matte' });
  assert.equal(s2.busA.source, 'matte');
  assert.equal(s2.busA.substituteSource, 3); // preserved while Matte is selected
});

test('ASSIGN_SOURCE preserves other per-bus fields (e.g. colourCorrect)', () => {
  let s = structuredClone(FACTORY_PRESET);
  s = reduce(s, { type: 'PRESS_COLOUR_CORRECT', bus: 'A' }); // cc → chroma-only
  const next = reduce(s, { type: 'ASSIGN_SOURCE', bus: 'A', source: 3 });
  assert.equal(next.busA.source, 3);
  assert.ok(next.busA.colourCorrect, 'colourCorrect must survive ASSIGN_SOURCE');
  assert.equal(next.busA.colourCorrect.mode, 'chroma-only');
});

test('SET_PROGRAM_OUT switches the program mode', () => {
  const s = structuredClone(FACTORY_PRESET);
  assert.equal(reduce(s, { type: 'SET_PROGRAM_OUT', mode: 'A' }).programOut, 'A');
});

test('STEP_MATTE_COLOR wraps up (Black -> Colour Bar) and down', () => {
  const s = structuredClone(FACTORY_PRESET);
  s.matte.colorIndex = 8; // Black
  assert.equal(reduce(s, { type: 'STEP_MATTE_COLOR', direction: 'up' }).matte.colorIndex, 0);
  s.matte.colorIndex = 0; // Colour Bar
  assert.equal(reduce(s, { type: 'STEP_MATTE_COLOR', direction: 'down' }).matte.colorIndex, 8);
});

test('SET_MATTE_LEVEL clamps and SET_GRADATION toggles', () => {
  const s = structuredClone(FACTORY_PRESET);
  assert.equal(reduce(s, { type: 'SET_MATTE_LEVEL', level: 1.5 }).matte.level, 1);
  assert.equal(reduce(s, { type: 'SET_GRADATION', on: true }).matte.gradation, true);
});
