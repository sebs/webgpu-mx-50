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
  revealAnchors,
  revealRect,
  compressionAffine,
  slideAffine,
  incomingRemap,
  outgoingRemap,
  outgoingCompressionAffine,
  outgoingSlideAffine,
  blindsAxes,
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

// --- compression / slide / blinds geometry (reference §9.4) -----------------

const plainWipe = (family: Parameters<typeof revealRect>[0], variant = 0, mods = {}) => ({
  ...FACTORY_PRESET.transition.wipe,
  family,
  variant,
  modifiers: { ...FACTORY_PRESET.transition.wipe.modifiers, ...mods },
});

test('revealRect: straight bands per variant', () => {
  assert.deepEqual(revealRect('straight', 0, 0.3, 0), { x0: 0, x1: 0.3, y0: 0, y1: 1 });
  assert.deepEqual(revealRect('straight', 1, 0.3, 0), { x0: 0.7, x1: 1, y0: 0, y1: 1 });
  assert.deepEqual(revealRect('straight', 2, 0.3, 0), { x0: 0, x1: 1, y0: 0, y1: 0.3 });
  assert.deepEqual(revealRect('straight', 3, 0.3, 0), { x0: 0, x1: 1, y0: 0.7, y1: 1 });
});

test('revealRect: corner squares anchor to each corner', () => {
  assert.deepEqual(revealRect('corner', 3, 0.25, 0), { x0: 0.75, x1: 1, y0: 0.75, y1: 1 });
  assert.deepEqual(revealRect('corner', 0, 0.25, 0), { x0: 0, x1: 0.25, y0: 0, y1: 0.25 });
});

test('revealRect: diagonal doubles progress and clamps', () => {
  assert.deepEqual(revealRect('diagonal', 0, 0.25, 0), { x0: 0, x1: 0.5, y0: 0, y1: 0.5 });
  assert.deepEqual(revealRect('diagonal', 0, 0.6, 0), { x0: 0, x1: 1, y0: 0, y1: 1 });
});

test('revealRect: triangle envelope (1.5x travel, centred across)', () => {
  const r = revealRect('triangle', 0, 0.2, 0);
  assert.ok(Math.abs(r.x0 - 0.2) < 1e-9 && Math.abs(r.x1 - 0.8) < 1e-9);
  assert.ok(Math.abs(r.y0 - 0.7) < 1e-9 && r.y1 === 1);
});

test('revealRect: split opens from centre; the cross degrades to the identity envelope', () => {
  assert.deepEqual(revealRect('split', 0, 0.5, 0), { x0: 0.25, x1: 0.75, y0: 0, y1: 1 });
  // Cross variants reveal a full-frame cross, so only the identity never samples outside.
  assert.deepEqual(revealRect('split', 2, 0.5, 0), { x0: 0, x1: 1, y0: 0, y1: 1 });
});

test('revealRect: square tracks 0.75p, aspect skews, oval squashes y, clamps at half-frame', () => {
  const r = revealRect('square', 0, 0.4, 0);
  assert.ok(Math.abs(r.x0 - 0.2) < 1e-9 && Math.abs(r.x1 - 0.8) < 1e-9);
  const oval = revealRect('square', 2, 0.4, 0);
  assert.ok(oval.y1 - oval.y0 < r.y1 - r.y0);
  const stretched = revealRect('square', 0, 1, 0.5);
  assert.ok(Math.abs(stretched.x0 - 0) < 1e-9 && Math.abs(stretched.y0 - 0) < 1e-9);
});

test('compressionAffine maps the full frame into the rect', () => {
  const a = compressionAffine({ x0: 0, x1: 0.25, y0: 0, y1: 1 });
  assert.ok(Math.abs(a.sx - 4) < 1e-9 && a.ox === 0 && a.sy === 1 && a.oy === 0);
  const b = compressionAffine({ x0: 0.75, x1: 1, y0: 0, y1: 1 });
  assert.ok(Math.abs(b.sx - 4) < 1e-9 && Math.abs(b.ox + 3) < 1e-9);
  // Frame corners land on rect corners: uv 0.75 → 0, uv 1 → 1.
  assert.ok(Math.abs(0.75 * b.sx + b.ox - 0) < 1e-9);
  assert.ok(Math.abs(1 * b.sx + b.ox - 1) < 1e-9);
});

test('compressionAffine survives progress 0', () => {
  const a = compressionAffine(revealRect('straight', 0, 0, 0));
  for (const v of [a.sx, a.sy, a.ox, a.oy]) assert.ok(Number.isFinite(v));
});

test('slideAffine: the incoming frame edge rides the boundary', () => {
  const v0 = slideAffine(revealAnchors('straight', 0), revealRect('straight', 0, 0.25, 0));
  assert.ok(Math.abs(v0.ox - 0.75) < 1e-9 && v0.sx === 1);
  assert.ok(Math.abs(0.25 + v0.ox - 1) < 1e-9); // screen x=p samples B x=1
  const v1 = slideAffine(revealAnchors('straight', 1), revealRect('straight', 1, 0.25, 0));
  assert.ok(Math.abs(v1.ox + 0.75) < 1e-9);
});

test('incomingRemap: precedence and off', () => {
  const both = incomingRemap(plainWipe('straight', 0, { compression: 1, slide: 1 }), 0.25, 0);
  assert.ok(both && both.sx > 1); // compression wins
  assert.equal(incomingRemap(plainWipe('straight'), 0.25, 0), null);
  const slide = incomingRemap(plainWipe('straight', 0, { slide: 1 }), 0.25, 0);
  assert.ok(slide && slide.sx === 1 && slide.ox !== 0);
});

test('outgoingRemap: both-compressed only where the complement is a rect', () => {
  const straight = outgoingRemap(plainWipe('straight', 0, { compression: 2 }), 0.25, 0);
  assert.ok(straight && Math.abs(straight.sx - 1 / 0.75) < 1e-9 && Math.abs(straight.ox + 0.25 / 0.75) < 1e-9);
  assert.equal(outgoingRemap(plainWipe('corner', 0, { compression: 2 }), 0.25, 0), null);
  assert.equal(outgoingRemap(plainWipe('square', 0, { compression: 2 }), 0.25, 0), null);
  assert.equal(outgoingCompressionAffine(revealAnchors('square', 0), revealRect('square', 0, 0.25, 0)), null);
});

test('outgoingRemap: slide x2 pushes A out by the boundary displacement', () => {
  const v0 = outgoingRemap(plainWipe('straight', 0, { slide: 2 }), 0.25, 0);
  assert.ok(v0 && Math.abs(v0.ox + 0.25) < 1e-9);
  const v1 = outgoingRemap(plainWipe('straight', 1, { slide: 2 }), 0.25, 0);
  assert.ok(v1 && Math.abs(v1.ox - 0.25) < 1e-9);
  const corner = outgoingSlideAffine(revealAnchors('corner', 0), revealRect('corner', 0, 0.25, 0));
  assert.ok(Math.abs(corner.ox + 0.25) < 1e-9 && Math.abs(corner.oy + 0.25) < 1e-9);
  const cross = outgoingRemap(plainWipe('split', 2, { slide: 2 }), 0.25, 0);
  assert.ok(cross && cross.ox === 0 && cross.oy === 0);
});

test('inward-reversed centred families degrade the remaps to plain crops', () => {
  // REVERSE runs Split/Square inward: the forward reveal rect does not exist, so the
  // affines are withheld (the shader then samples the untransformed frame).
  const revSquare = { ...plainWipe('square', 0, { compression: 1 }), reverse: true };
  assert.equal(incomingRemap(revSquare, 0.5, 0), null);
  const revSplit = { ...plainWipe('split', 0, { compression: 2 }), reverse: true };
  assert.equal(outgoingRemap(revSplit, 0.5, 0), null);
  // Edge-anchored families keep their remaps under REVERSE (the uv mirror re-anchors them).
  const revStraight = { ...plainWipe('straight', 0, { compression: 1 }), reverse: true };
  assert.notEqual(incomingRemap(revStraight, 0.5, 0), null);
});

test('blindsAxes: strips run along the travel axis; illegal families get none', () => {
  assert.deepEqual(blindsAxes('straight', 0), { x: true, y: false });
  assert.deepEqual(blindsAxes('straight', 2), { x: false, y: true });
  assert.deepEqual(blindsAxes('corner', 1), { x: true, y: true });
  assert.deepEqual(blindsAxes('diagonal', 3), { x: true, y: true });
  assert.deepEqual(blindsAxes('triangle', 0), { x: false, y: true });
  assert.deepEqual(blindsAxes('triangle', 2), { x: true, y: false });
  assert.deepEqual(blindsAxes('split', 0), { x: true, y: false });
  assert.deepEqual(blindsAxes('split', 2), { x: true, y: true });
  assert.deepEqual(blindsAxes('square', 0), { x: false, y: false });
  assert.deepEqual(blindsAxes('mosaic', 0), { x: false, y: false });
});

test('the reveal rect agrees with the straight field sign (oracle probe)', () => {
  // straightField v0: f = p - uv.x; inside the rect ⇔ f > 0.
  for (const p of [0.2, 0.5, 0.8]) {
    const rect = revealRect('straight', 0, p, 0);
    for (const x of [0.1, 0.4, 0.6, 0.9]) {
      const inside = x > rect.x0 && x < rect.x1;
      assert.equal(p - x > 0, inside, `p=${p} x=${x}`);
    }
  }
});
