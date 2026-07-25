import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mixWeights, compositeRule, namDominant } from '../../src/core/transition.js';

test('mixWeights: lever 0 = full A, 1 = full B, and weights always sum to 1', () => {
  assert.deepEqual(mixWeights(0), { a: 1, b: 0 });
  assert.deepEqual(mixWeights(1), { a: 0, b: 1 });
  assert.deepEqual(mixWeights(0.25), { a: 0.75, b: 0.25 });
  for (const lever of [0, 0.1, 0.5, 0.9, 1]) {
    const w = mixWeights(lever);
    assert.ok(Math.abs(w.a + w.b - 1) < 1e-12);
  }
});

test('mix contribution is monotonic across a lever sweep', () => {
  let prevA = Infinity;
  let prevB = -Infinity;
  for (let lever = 0; lever <= 1.0001; lever += 0.1) {
    const w = mixWeights(lever);
    assert.ok(w.a <= prevA + 1e-9, 'A decreases');
    assert.ok(w.b >= prevB - 1e-9, 'B increases');
    prevA = w.a;
    prevB = w.b;
  }
});

test('compositeRule maps transition types', () => {
  assert.equal(compositeRule('mix'), 'cross-dissolve');
  assert.equal(compositeRule('nam'), 'nam-brighter');
  assert.equal(compositeRule('wipe'), 'wipe');
});

test('namDominant biases toward A below centre, B above, balanced at centre', () => {
  assert.equal(namDominant(0.2), 'A');
  assert.equal(namDominant(0.8), 'B');
  assert.equal(namDominant(0.5), 'balanced');
});
