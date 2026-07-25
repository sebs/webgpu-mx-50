import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  forwardIndex,
  patternNumber,
  numberToPattern,
  isReversed,
  forwardNumber,
  reverseNumber,
  rs422Addressable,
  isExternallyAddressable,
  agA800Call,
  blindsLegal,
  complementaryMatteName,
  pressBorder,
  pressSoft,
  visualTravel,
  isSymmetricalWiping,
  squareShapeName,
  PLAIN_WIPE_NUMBER,
} from '../../src/core/wipe.js';
import { FACTORY_PRESET } from '../../src/state/state.js';

test('the plain wipe (Straight, first variant, no modifiers) is pattern 001', () => {
  assert.equal(forwardIndex('straight', 0), 1);
  assert.equal(patternNumber(FACTORY_PRESET.transition.wipe), PLAIN_WIPE_NUMBER);
  const p = numberToPattern(1);
  assert.equal(p.family, 'straight');
  assert.equal(p.variant, 0);
  assert.equal(p.reverse, false);
});

test('+128 is the same wipe reversed (reference §9.4)', () => {
  for (const base of [1, 2, 42, 100, 127]) {
    const reversed = reverseNumber(base);
    assert.equal(reversed, base + 128);
    assert.equal(forwardNumber(reversed), forwardNumber(base));
    assert.equal(isReversed(reversed), true);
    assert.equal(isReversed(base), false);
  }
});

test('a reversed pattern number sets the reverse flag on the wipe', () => {
  const reversedWipe = { ...FACTORY_PRESET.transition.wipe, reverse: true };
  assert.equal(patternNumber(reversedWipe), 1 + 128);
});

test('RS-422 reaches 001–255; 256–287 are panel-only', () => {
  assert.equal(rs422Addressable(1), true);
  assert.equal(rs422Addressable(255), true);
  assert.equal(rs422Addressable(256), false);
  assert.equal(isExternallyAddressable(255), true);
  assert.equal(isExternallyAddressable(287), false);
});

test('the AG-A800 calls 01–99, with 99 = the current setup', () => {
  assert.deepEqual(agA800Call(1), { kind: 'pattern', number: 1 });
  assert.deepEqual(agA800Call(42), { kind: 'pattern', number: 42 });
  assert.deepEqual(agA800Call(99), { kind: 'current' });
  assert.deepEqual(agA800Call(100), { kind: 'invalid' });
});

test('Blinds is legal only with Straight/Corner/Diagonal/Triangle/Split', () => {
  for (const f of ['straight', 'corner', 'diagonal', 'triangle', 'split'] as const) {
    assert.equal(blindsLegal(f), true);
  }
  assert.equal(blindsLegal('square'), false);
  assert.equal(blindsLegal('mosaic'), false);
});

test('BORDER paints the complementary Matte colour', () => {
  assert.equal(complementaryMatteName('Yellow'), 'Blue');
  assert.equal(complementaryMatteName('Cyan'), 'Red');
  assert.equal(complementaryMatteName('Green'), 'Magenta');
  assert.equal(complementaryMatteName('White'), 'Black');
  assert.equal(complementaryMatteName('Black'), 'White');
});

test('BORDER cycles narrow → wide → off; SOFT toggles narrow/wide and is exclusive with Border', () => {
  assert.equal(pressBorder('hard'), 'border-narrow');
  assert.equal(pressBorder('border-narrow'), 'border-wide');
  assert.equal(pressBorder('border-wide'), 'hard');
  assert.equal(pressBorder('soft-narrow'), 'border-narrow'); // border replaces soft
  assert.equal(pressSoft('hard'), 'soft-narrow');
  assert.equal(pressSoft('soft-narrow'), 'soft-wide');
  assert.equal(pressSoft('border-narrow'), 'soft-narrow'); // soft replaces border
});

test('direction: default alternates, ONE-WAY holds, REVERSE mirrors, both = symmetrical', () => {
  assert.notEqual(visualTravel(false, false, +1), visualTravel(false, false, -1)); // alternates
  assert.equal(visualTravel(true, false, +1), visualTravel(true, false, -1)); // one-way same
  assert.equal(visualTravel(false, true, +1), -visualTravel(false, false, +1)); // reverse mirrors
  assert.equal(isSymmetricalWiping(true, true), true);
  assert.equal(isSymmetricalWiping(true, false), false);
});

test('the Square family variants map to square/circle/oval/diamond', () => {
  assert.deepEqual([0, 1, 2, 3].map(squareShapeName), ['square', 'circle', 'oval', 'diamond']);
});
