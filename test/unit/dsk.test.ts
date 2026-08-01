import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce } from '../../src/state/reducer.js';
import { FACTORY_PRESET } from '../../src/state/state.js';
import {
  DSK_EDGE_STYLES,
  nextDskEdgeStyle,
  dskEdgeStyleLabel,
  dskEdgeStyleByLabel,
  dskKeyWindow,
  isDskCharacter,
  dskFillColour,
  dskEdgeColour,
  dskEdgeColourSelectable,
  dskKeySource,
  dskEdgeGeometry,
  dskEdgeGraded,
  edgeHasBorderOrShadow,
  DSK_EDGE_MODE,
} from '../../src/core/dsk.js';
import { matteIndexByName } from '../../src/core/matte.js';

const fresh = () => structuredClone(FACTORY_PRESET);

test('the EDGE ring has six styles and wraps drop-shadow → normal', () => {
  assert.equal(DSK_EDGE_STYLES.length, 6);
  assert.equal(nextDskEdgeStyle('normal'), 'narrow-border');
  assert.equal(nextDskEdgeStyle('drop-shadow'), 'normal');
  assert.equal(dskEdgeStyleLabel('wide-border'), 'Wide Border');
  assert.equal(dskEdgeStyleByLabel('Narrow Shadow'), 'narrow-shadow');
});

test('the key window sorts Low/High; isDskCharacter is XOR-reversed', () => {
  const dsk = { ...fresh().dsk, low: 0.7, high: 0.2 };
  assert.deepEqual(dskKeyWindow(dsk), { lo: 0.2, hi: 0.7 });
  assert.equal(isDskCharacter(0.5, dsk), true);
  assert.equal(isDskCharacter(0.5, { ...dsk, reverse: true }), false);
  assert.equal(isDskCharacter(0.05, dsk), false);
  assert.equal(isDskCharacter(0.05, { ...dsk, reverse: true }), true);
});

test('fill colour: WHITE vs the Matte colour; edge colour: white-selectable, matte forces black', () => {
  const matte = { colorIndex: matteIndexByName('Red'), level: 1, gradation: false };
  assert.deepEqual(dskFillColour({ ...fresh().dsk, fill: 'white' }, matte), [1, 1, 1]);
  assert.deepEqual(dskFillColour({ ...fresh().dsk, fill: 'matte' }, matte), [1, 0, 0]);

  const white = { ...fresh().dsk, fill: 'white' as const, edgeColorIndex: matteIndexByName('Blue') };
  assert.equal(dskEdgeColourSelectable(white), true);
  assert.deepEqual(dskEdgeColour(white), [0, 0, 1]);

  const matteFill = { ...fresh().dsk, fill: 'matte' as const };
  assert.equal(dskEdgeColourSelectable(matteFill), false);
  assert.deepEqual(dskEdgeColour(matteFill), [0, 0, 0]);
});

test('SET_DSK_EDGE_COLOR is a no-op while the fill is Matte (edge forced black)', () => {
  let s = reduce(fresh(), { type: 'SET_DSK_FILL', fill: 'matte' });
  const before = s.dsk.edgeColorIndex;
  s = reduce(s, { type: 'SET_DSK_EDGE_COLOR', colorIndex: 4 });
  assert.equal(s.dsk.edgeColorIndex, before);
  // With a white fill it takes.
  s = reduce(fresh(), { type: 'SET_DSK_EDGE_COLOR', colorIndex: 4 });
  assert.equal(s.dsk.edgeColorIndex, 4);
});

test('EDGE press cycles, REVERSE toggles, LOW/HIGH clamp', () => {
  let s = fresh();
  s = reduce(s, { type: 'PRESS_DSK_EDGE' });
  assert.equal(s.dsk.edge, 'narrow-border');
  s = reduce(s, { type: 'PRESS_DSK_REVERSE' });
  assert.equal(s.dsk.reverse, true);
  assert.equal(reduce(s, { type: 'SET_DSK_LOW', level: -1 }).dsk.low, 0);
  assert.equal(reduce(s, { type: 'SET_DSK_HIGH', level: 5 }).dsk.high, 1);
});

test('dskKeySource: ext-camera passes through; a Matte bus resolves to the substitute (ADR-0006)', () => {
  let s = reduce(fresh(), { type: 'SET_DSK_KEY_SOURCE', source: 'ext-camera' });
  assert.equal(dskKeySource(s), 'ext-camera');
  // Key source = B-bus holding Matte → the blinking substitute stands in.
  s = reduce(s, { type: 'SET_DSK_KEY_SOURCE', source: 'B' });
  s = reduce(s, { type: 'ASSIGN_SOURCE', bus: 'B', source: 3 }); // substitute := 3
  s = reduce(s, { type: 'ASSIGN_SOURCE', bus: 'B', source: 'matte' });
  assert.equal(dskKeySource(s), 3);
});

// --- edge-style geometry (reference §10) ------------------------------------

test('edge geometry agrees with edgeHasBorderOrShadow across the six styles', () => {
  for (const s of DSK_EDGE_STYLES) {
    assert.equal(dskEdgeGeometry(s).kind === 'none', !edgeHasBorderOrShadow(s), s);
  }
  assert.equal(dskEdgeGeometry('normal').kind, 'none');
});

test('edge geometry: wide variants exceed narrow', () => {
  assert.ok(dskEdgeGeometry('wide-border').borderWidth > dskEdgeGeometry('narrow-border').borderWidth);
  assert.ok(dskEdgeGeometry('narrow-border').borderWidth > 0);
  assert.ok(dskEdgeGeometry('wide-shadow').shadowOffset[0] > dskEdgeGeometry('narrow-shadow').shadowOffset[0]);
  assert.ok(dskEdgeGeometry('wide-shadow').shadowOffset[1] > dskEdgeGeometry('narrow-shadow').shadowOffset[1]);
});

test('borders ring, shadows offset: the unused axis is zeroed', () => {
  for (const s of ['narrow-border', 'wide-border'] as const) {
    const g = dskEdgeGeometry(s);
    assert.deepEqual(g.shadowOffset, [0, 0]);
    assert.equal(g.shadowOpacity, 0);
  }
  for (const s of ['narrow-shadow', 'wide-shadow', 'drop-shadow'] as const) {
    const g = dskEdgeGeometry(s);
    assert.equal(g.borderWidth, 0);
    assert.ok(g.shadowOffset[0] > 0 && g.shadowOffset[1] > 0); // down-right
  }
});

test('drop shadow is hard and detached, attached shadows are soft', () => {
  assert.equal(dskEdgeGeometry('drop-shadow').shadowOpacity, 1);
  assert.equal(dskEdgeGeometry('drop-shadow').kind, 'drop-shadow');
  assert.equal(dskEdgeGeometry('narrow-shadow').shadowOpacity, 0.75);
  assert.equal(dskEdgeGeometry('wide-shadow').shadowOpacity, 0.75);
  assert.equal(dskEdgeGeometry('narrow-shadow').kind, 'shadow');
});

test('DSK_EDGE_MODE maps the shader enum 0..3', () => {
  assert.deepEqual(DSK_EDGE_MODE, { none: 0, border: 1, shadow: 2, 'drop-shadow': 3 });
  assert.equal(DSK_EDGE_MODE[dskEdgeGeometry('normal').kind], 0);
});

test('dskEdgeGraded: white fill + GRADATION only', () => {
  const s = fresh();
  const gradMatte = { ...s.matte, gradation: true };
  assert.equal(dskEdgeGraded({ ...s.dsk, fill: 'white' }, gradMatte), true);
  assert.equal(dskEdgeGraded({ ...s.dsk, fill: 'matte' }, gradMatte), false); // forced-black edge never grades
  assert.equal(dskEdgeGraded({ ...s.dsk, fill: 'white' }, s.matte), false);
});
