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
