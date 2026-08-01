import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce } from '../../src/state/reducer.js';
import { FACTORY_PRESET } from '../../src/state/state.js';
import type { PanelState } from '../../src/state/state.js';
import { VIBRATE_FRAMES } from '../../src/core/special-mode.js';
import {
  streamCorner,
  bounceHeight,
  macroFrame,
  specialFrame,
  bgLayerCode,
  fgLayerCode,
  CORK_TURNS,
  BOUNCE_PHASE,
  VIBRATE_AMPLITUDE,
  VIBRATE_CYCLE_FRAMES,
  SATELLITE_ORBIT_FRAMES,
  SATELLITE_ORBIT_RADIUS,
  SATELLITE_HALF,
} from '../../src/core/special-mode-geometry.js';

const fresh = (): PanelState => structuredClone(FACTORY_PRESET);
const OPTS = { joystickX: -1, squareWipe: false };

/** Enter Special Mode and arm a macro by Event button. */
function armed(button: 1 | 2 | 3 | 4, shift = false): PanelState {
  let s = reduce(fresh(), { type: 'PRESS_MEMORY_SHIFT' });
  s = reduce(s, { type: 'SELECT_SPECIAL_MACRO', button, shift });
  return s;
}

test('streamCorner selects exactly the two reference corners by joystick X', () => {
  assert.equal(streamCorner(-1), 'upper-left');
  assert.equal(streamCorner(-0.01), 'upper-left');
  assert.equal(streamCorner(0), 'upper-right');
  assert.equal(streamCorner(1), 'upper-right');
});

test('stream zooms corner-pinned from the chosen corner to full frame', () => {
  assert.deepEqual(macroFrame('stream', 0, 0, OPTS).half, [0, 0]);
  const mid = macroFrame('stream', 0.5, 0, { joystickX: -1, squareWipe: false });
  assert.deepEqual(mid.center, [0.25, 0.25]);
  const midR = macroFrame('stream', 0.5, 0, { joystickX: 1, squareWipe: false });
  assert.deepEqual(midR.center, [0.75, 0.25]);
  const full = macroFrame('stream', 1, 0, OPTS);
  assert.deepEqual(full.center, [0.5, 0.5]);
  assert.deepEqual(full.half, [0.5, 0.5]);
  for (const p of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    const ul = macroFrame('stream', p, 0, { joystickX: -1, squareWipe: false });
    assert.ok(Math.abs(ul.center[0] - ul.half[0]) < 1e-9, 'UL corner-pinned x');
    assert.ok(Math.abs(ul.center[1] - ul.half[1]) < 1e-9, 'UL corner-pinned y');
    const ur = macroFrame('stream', p, 0, { joystickX: 1, squareWipe: false });
    assert.ok(Math.abs(ur.center[0] + ur.half[0] - 1) < 1e-9, 'UR corner-pinned x');
  }
  assert.equal(mid.bg, 'A');
  assert.equal(mid.fg, 'B');
});

test('cork-screw unwinds to angle 0 while its orbit radius shrinks monotonically', () => {
  assert.equal(macroFrame('cork-screw', 0, 0, OPTS).angle, CORK_TURNS * 2 * Math.PI);
  assert.equal(macroFrame('cork-screw', 1, 0, OPTS).angle, 0);
  let prev = Number.POSITIVE_INFINITY;
  for (let p = 0; p <= 1.0001; p += 0.1) {
    const f = macroFrame('cork-screw', Math.min(p, 1), 0, OPTS);
    const r = Math.hypot(f.center[0] - 0.5, f.center[1] - 0.5);
    assert.ok(r <= prev + 1e-9);
    prev = r;
  }
  const start = macroFrame('cork-screw', 0, 0, OPTS);
  assert.ok(Math.abs(start.center[0]) < 1e-9 && Math.abs(start.center[1]) < 1e-9, 'starts at the corner');
  assert.deepEqual(macroFrame('cork-screw', 1, 0, OPTS).half, [0.5, 0.5]);
});

test('bounceHeight is an analytic damped 2-bounce from p alone', () => {
  assert.equal(bounceHeight(0), 1);
  assert.equal(bounceHeight(0.5), 0);
  assert.ok(Math.abs(bounceHeight(0.65) - 0.35) < 1e-9); // first rebound peak
  assert.ok(Math.abs(bounceHeight(0.875) - 0.12) < 1e-9); // second, smaller
  assert.equal(bounceHeight(0.95), 0);
  assert.equal(bounceHeight(1), 0);
  for (let q = 0; q <= 1.0001; q += 0.05) {
    const h = bounceHeight(Math.min(q, 1));
    assert.ok(h >= 0 && h <= 1);
  }
});

test('bounce drops in from above, rests on the floor, then grows floor-pinned', () => {
  const drop = macroFrame('bounce', 0, 0, OPTS);
  assert.deepEqual(drop.center, [0.5, -0.25]); // off-screen above
  assert.deepEqual(drop.half, [0.25, 0.25]);
  const rest = macroFrame('bounce', 0.375, 0, OPTS); // q = 0.5 → height 0
  assert.ok(Math.abs(rest.center[1] + rest.half[1] - 1) < 1e-9, 'bottom edge on the floor');
  const grow = macroFrame('bounce', 0.875, 0, OPTS);
  assert.ok(Math.abs(grow.half[0] - 0.375) < 1e-9);
  assert.ok(Math.abs(grow.center[1] + grow.half[1] - 1) < 1e-9, 'still floor-pinned');
  const full = macroFrame('bounce', 1, 0, OPTS);
  assert.deepEqual(full.half, [0.5, 0.5]);
  assert.equal(full.bg, 'A');
  assert.equal(full.fg, 'B');
});

test('flip is a vertical-split compression over the Matte, A collapsing then B expanding', () => {
  for (const p of [0, 0.25, 0.5, 0.75, 1]) {
    assert.equal(macroFrame('flip', p, 0, OPTS).bg, 'matte', `p=${p}`);
  }
  const early = macroFrame('flip', 0.25, 0, OPTS);
  assert.equal(early.fg, 'A');
  assert.deepEqual(early.half, [0.25, 0.5]);
  assert.equal(macroFrame('flip', 0.5, 0, OPTS).half[0], 0);
  const late = macroFrame('flip', 0.75, 0, OPTS);
  assert.equal(late.fg, 'B');
  assert.deepEqual(late.half, [0.25, 0.5]);
  assert.deepEqual(macroFrame('flip', 0, 0, OPTS).half, [0.5, 0.5]); // full A
  assert.deepEqual(macroFrame('flip', 1, 0, OPTS).half, [0.5, 0.5]); // full B
});

test('shutter collapses B to the Matte: horizontal split, circle under Square Wipe', () => {
  const split = macroFrame('shutter', 0.4, 0, { joystickX: 0, squareWipe: false });
  assert.equal(split.shape, 0);
  assert.deepEqual(split.half, [0.5, 0.5 * 0.6]);
  const circle = macroFrame('shutter', 0.4, 0, { joystickX: 0, squareWipe: true });
  assert.equal(circle.shape, 1);
  // The circle radius carries the sqrt(2)/2 factor so it starts enclosing the frame.
  assert.ok(Math.abs(circle.half[0] - 0.5 * Math.SQRT2 * 0.6) < 1e-9 && circle.half[0] === circle.half[1]);
  const start = macroFrame('shutter', 0, 0, { joystickX: 0, squareWipe: true });
  assert.ok(Math.abs(start.half[0] - 0.5 * Math.SQRT2) < 1e-9, 'begins with the corners inside the circle (clean full B)');
  assert.equal(split.bg, 'matte');
  assert.equal(split.fg, 'B');
});

test('vibrate shakes horizontally with linearly decaying amplitude and settles', () => {
  for (const p of [1 / 128, 0.25, 0.5]) {
    const f = macroFrame('vibrate', p, 0, OPTS);
    const expected = VIBRATE_AMPLITUDE * (1 - p) * Math.sin((2 * Math.PI * p * VIBRATE_FRAMES) / VIBRATE_CYCLE_FRAMES);
    assert.ok(Math.abs(f.center[0] - 0.5 - expected) < 1e-9, `p=${p}`);
  }
  const done = macroFrame('vibrate', 1, 0, OPTS);
  assert.deepEqual(done.center, [0.5, 0.5]);
  assert.equal(done.bg, 'black');
  assert.deepEqual(done.half, [0.5, 0.5]);
});

test('satellite orbits on the logical clock with fixed period and radius', () => {
  const a = macroFrame('satellite', 1, 30, OPTS);
  const b = macroFrame('satellite', 1, 30 + SATELLITE_ORBIT_FRAMES, OPTS);
  assert.deepEqual(a.center, b.center);
  const r = Math.hypot(a.center[0] - 0.5, a.center[1] - 0.5);
  assert.ok(Math.abs(r - SATELLITE_ORBIT_RADIUS) < 1e-9);
  const c = macroFrame('satellite', 1, 75, OPTS);
  assert.notDeepEqual(a.center, c.center);
  assert.deepEqual(a.half, [SATELLITE_HALF, SATELLITE_HALF]);
  assert.equal(a.bg, 'A');
  assert.equal(a.fg, 'B');
});

test('mosaic-mix peaks mid-transition and vanishes at the endpoints', () => {
  assert.equal(macroFrame('mosaic-mix', 0, 0, OPTS).mosaic, 0);
  assert.equal(macroFrame('mosaic-mix', 0.5, 0, OPTS).mosaic, 1);
  assert.equal(macroFrame('mosaic-mix', 1, 0, OPTS).mosaic, 0);
  assert.equal(macroFrame('mosaic-mix', 0.3, 0, OPTS).mix, 0.3);
  assert.equal(macroFrame('mosaic-mix', 0.5, 0, OPTS).fg, 'none');
});

test('specialFrame gates on the tested state machine', () => {
  assert.equal(specialFrame(fresh(), 0), null); // inactive
  const inMode = reduce(fresh(), { type: 'PRESS_MEMORY_SHIFT' });
  assert.equal(specialFrame(inMode, 0), null); // unarmed

  // A lever-family macro reads transition.lever as its progress.
  let bounce = armed(4); // ordinal 4 = bounce
  bounce = reduce(bounce, { type: 'SET_LEVER', position: 0.4 });
  const bf = specialFrame(bounce, 0);
  assert.ok(bf);
  assert.deepEqual(bf, macroFrame('bounce', 0.4, 0, { joystickX: 0, squareWipe: false }));

  // Shutter: idle → null; running → frame at run.progress; complete → holds the Matte.
  let shutter = armed(2, true); // ordinal 6 = shutter
  assert.equal(specialFrame(shutter, 0), null);
  shutter = reduce(shutter, { type: 'SET_LEVER', position: 1 });
  shutter = reduce(shutter, { type: 'PRESS_AUTO_TAKE', tick: 0 });
  shutter = reduce(shutter, { type: 'ADVANCE_TIMELINE', tick: 30 }); // 60-frame default → halfway
  const sfMid = specialFrame(shutter, 30);
  assert.ok(sfMid && sfMid.bg === 'matte' && sfMid.half[1] < 0.5);
  shutter = reduce(shutter, { type: 'ADVANCE_TIMELINE', tick: 60 });
  assert.equal(shutter.specialMode.run.phase, 'complete');
  const sfDone = specialFrame(shutter, 60);
  assert.ok(sfDone && sfDone.half[1] === 0, 'holds the full Matte reveal');

  // Vibrate: complete → null (ends where it began, plain B).
  let vibrate = armed(3, true); // ordinal 7 = vibrate
  vibrate = reduce(vibrate, { type: 'SET_LEVER', position: 1 });
  vibrate = reduce(vibrate, { type: 'PRESS_AUTO_TAKE', tick: 0 });
  vibrate = reduce(vibrate, { type: 'ADVANCE_TIMELINE', tick: 10 });
  assert.ok(specialFrame(vibrate, 10));
  vibrate = reduce(vibrate, { type: 'ADVANCE_TIMELINE', tick: VIBRATE_FRAMES });
  assert.equal(specialFrame(vibrate, VIBRATE_FRAMES), null);

  // Satellite renders only while orbiting.
  let satellite = armed(4, true); // ordinal 8 = satellite
  satellite = reduce(satellite, { type: 'SET_LEVER', position: 1 });
  assert.equal(specialFrame(satellite, 0), null);
  satellite = reduce(satellite, { type: 'PRESS_AUTO_TAKE', tick: 0 });
  assert.equal(satellite.specialMode.orbiting, true);
  assert.ok(specialFrame(satellite, 0));
});

test('layer codes pin the shader encoding', () => {
  assert.equal(bgLayerCode('A'), 0);
  assert.equal(bgLayerCode('B'), 1);
  assert.equal(bgLayerCode('matte'), 2);
  assert.equal(bgLayerCode('black'), 3);
  assert.equal(fgLayerCode('A'), 0);
  assert.equal(fgLayerCode('B'), 1);
  assert.equal(fgLayerCode('none'), 2);
});

test('the bounce phase constants stay in range', () => {
  assert.ok(BOUNCE_PHASE > 0 && BOUNCE_PHASE < 1);
});
