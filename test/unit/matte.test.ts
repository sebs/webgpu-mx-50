import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MATTE_PALETTE,
  matteColorName,
  matteIndexByName,
  levelAffectsOutput,
  matteChroma,
  matteBrightness,
  matteIntensityAtY,
  matteRenderSignature,
} from '../../src/core/matte.js';
import type { MatteState } from '../../src/state/state.js';

const matte = (over: Partial<MatteState> = {}): MatteState => ({
  colorIndex: 0,
  level: 1,
  gradation: false,
  ...over,
});

test('the palette is the 9 colours in cycle order (reference §4)', () => {
  assert.equal(MATTE_PALETTE.length, 9);
  assert.equal(matteColorName(0), 'Colour Bar');
  assert.equal(matteColorName(8), 'Black');
  assert.equal(matteColorName(9), 'Colour Bar'); // wraps
  assert.equal(matteIndexByName('Blue'), 7);
});

test('LEVEL affects chromatic and White, not Colour Bar or Black', () => {
  assert.equal(levelAffectsOutput(matteIndexByName('Yellow')), true);
  assert.equal(levelAffectsOutput(matteIndexByName('White')), true);
  assert.equal(levelAffectsOutput(matteIndexByName('Colour Bar')), false);
  assert.equal(levelAffectsOutput(matteIndexByName('Black')), false);
});

test('chromatic: LEVEL sets chroma, brightness unchanged', () => {
  const s = matte({ colorIndex: matteIndexByName('Green'), level: 0.5 });
  assert.equal(matteChroma(s), 0.5);
  assert.equal(matteBrightness(s), 1);
});

test('White: LEVEL sets brightness, chroma not adjusted', () => {
  const s = matte({ colorIndex: matteIndexByName('White'), level: 0.4 });
  assert.equal(matteBrightness(s), 0.4);
  assert.equal(matteChroma(s), 0);
});

test('Colour Bar and Black render the same regardless of LEVEL', () => {
  for (const name of ['Colour Bar', 'Black']) {
    const i = matteIndexByName(name);
    assert.equal(matteRenderSignature(matte({ colorIndex: i, level: 0.2 })),
      matteRenderSignature(matte({ colorIndex: i, level: 0.9 })));
  }
});

test('GRADATION ramps least-intense at top to the set level at the bottom; flat is uniform', () => {
  const grad = matte({ colorIndex: matteIndexByName('Blue'), level: 0.5, gradation: true });
  assert.ok(matteIntensityAtY(grad, 0) < matteIntensityAtY(grad, 1));
  assert.equal(matteIntensityAtY(grad, 1), 0.5); // bottom tracks LEVEL

  const flat = matte({ colorIndex: matteIndexByName('Green'), level: 0.7, gradation: false });
  assert.equal(matteIntensityAtY(flat, 0), matteIntensityAtY(flat, 1));
});
