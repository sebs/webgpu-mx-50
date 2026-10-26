// The music video's edit, section by section on the song's bar grid (see score.ts for the
// mechanics). The track runs in 8- and 16-bar phrases at 130.97 bpm:
//
//   0–15 intro · 16–39 drop I · 40–47 break · 48–63 drop II · 64–71 break · 72–79 drop III
//   80–95 breakdown + build · 96–109 drop IV · 110–111 hold · 112–123 drop V · 124–127 break
//   128–135 drop VI · 136–143 break (near-silence at 140) · 144–159 drop VII · 160–162 burst
//
// The footage: a black-and-white spiral, three line-drawn dancers on white paper, a street
// crowd and a dance crew. The line drawings are the title material — the Downstream Key
// lifts their dark lines out of the paper (External Camera In) and fills them over the
// street footage; the luminance key does the opposite trick, cutting the crowd out
// through a drawing's lines.

import {
  BEAT,
  CLIPS,
  LANE_NAMES,
  MATTE,
  at,
  avSynchro,
  borderColour,
  buses,
  colourCorrect,
  compileScore,
  dsk,
  effect,
  fadeTo,
  matte,
  positioner,
  transition,
  wipe,
} from './score.js';
import type { ClipId, Cue, Input, LaneName, LanePoint, Marker, Patch, Score, Step, Curve } from './score.js';

const cues: Cue[] = [];
const markers: Marker[] = [];
const lanes = {} as { [K in LaneName]: LanePoint[] };
for (const name of LANE_NAMES) lanes[name] = [];

function cue(
  t: number,
  steps: readonly Step[],
  extra: { patch?: Partial<Patch>; play?: { [K in ClipId]?: { from?: number; rate?: number } } } = {},
): void {
  cues.push({ at: t, steps, patch: extra.patch, play: extra.play });
}

function section(bar: number, label: string): void {
  markers.push({ at: bar <= 0 ? 0 : at(bar), label });
}

function point(lane: LaneName, t: number, value: number, curve: Curve = 'hold'): void {
  lanes[lane].push({ at: t, value, curve });
}

function ramp(lane: LaneName, t0: number, t1: number, v0: number, v1: number, curve: Curve = 'linear'): void {
  point(lane, t0, v0, curve);
  point(lane, t1, v1, 'hold');
}

/** Hard cuts: the lever snaps between the buses every `stepBeats`. Returns the last value. */
function cuts(bar0: number, bar1: number, stepBeats: number, first: number): number {
  let v = first;
  for (let t = at(bar0); t < at(bar1) - 1e-6; t += stepBeats * BEAT) {
    point('lever', t, v);
    v = 1 - v;
  }
  return 1 - v;
}

/** Takes: the lever travels across over `durBeats`, every `stepBeats`, alternating. */
function takes(bar0: number, bar1: number, stepBeats: number, durBeats: number, from: number, curve: Curve = 'linear'): void {
  let v = from;
  for (let t = at(bar0); t < at(bar1) - 1e-6; t += stepBeats * BEAT) {
    ramp('lever', t, t + durBeats * BEAT, v, 1 - v, curve);
    v = 1 - v;
  }
}

/** The SLICE pumps with the kick: low on the beat, opening up until the next one. */
function slicePump(bar0: number, bar1: number, low: number, high: number): void {
  for (let t = at(bar0); t < at(bar1) - 1e-6; t += BEAT) ramp('slice', t, t + BEAT * 0.9, low, high, 'ease');
}

/** A white flash on a downbeat: the Fade lever rises over the last beat, then lets go. */
function flash(bar: number): void {
  ramp('fade', at(bar, -1), at(bar), 0, 0.9);
  ramp('fade', at(bar), at(bar, 2), 1, 0, 'ease');
}

const LINES: readonly ClipId[] = ['line1', 'line2', 'line3'];

/** Swap the drawing on an input every `everyBars`, restarting each one. */
function rotateLines(input: Input, bar0: number, bar1: number, everyBars: number, rate = 1, offset = 0): void {
  for (let bar = bar0, k = offset; bar < bar1; bar += everyBars, k++) {
    const clip = LINES[k % 3]!;
    cue(at(bar), [], { patch: { [input]: clip }, play: { [clip]: { from: 0, rate } } });
  }
}

/** One source after another on an input, a cut per step, each clip entering mid-move. */
function montage(input: Input, bar0: number, bar1: number, stepBeats: number, order: readonly ClipId[]): void {
  let k = 0;
  for (let t = at(bar0); t < at(bar1) - 1e-6; t += stepBeats * BEAT, k++) {
    const clip = order[k % order.length]!;
    const duration = CLIPS.filter((c) => c.id === clip)[0]!.duration;
    cue(t, [], { patch: { [input]: clip }, play: { [clip]: { from: (k * 1.37) % duration, rate: 1 } } });
  }
}

// --- intro: the spiral, then the street ------------------------------------------------

section(0, 'Intro · the spiral');
cue(0, [...buses(3, 2), transition('mix'), effect('A'), ...fadeTo('black', true, true), matte(MATTE.magenta), ...dsk(false)]);
point('lever', 0, 0);
point('fade', 0, 1);
ramp('fade', at(0), at(4), 1, 0, 'ease');
cue(at(4), dsk(true, { fill: 'matte', edge: 'drop-shadow' }));
rotateLines('ext-camera', 4, 16, 2);

section(8, 'Intro · iris to the street');
cue(at(8), [effect('B', { mono: true }), ...wipe(26, { edge: 'soft-wide' }), ...fadeTo('white', true, false)], {
  play: { crowd: { from: 0 } },
});
ramp('lever', at(8), at(12), 0, 1, 'ease');

// The crew is patched into Source 1 while bus A is off air — then the cutting starts.
cue(at(12), [transition('mix'), colourCorrect('A', 'chroma-only')], { patch: { 1: 'crew' }, play: { crew: { from: 3 } } });
point('chromaA', at(12), 0);
let lever = cuts(12.5, 14, 2, 0);
lever = cuts(14, 15, 1, 1 - lever);
lever = cuts(15, 16, 0.5, 1 - lever);
cue(at(14), [effect('B', { mono: true, mosaic: true })]);
ramp('mosaic', at(14), at(16), 2, 28);
flash(16);

// --- drop I ----------------------------------------------------------------------------

section(16, 'Drop I · cut on the beat');
cue(at(16), [
  ...buses(1, 2),
  transition('mix'),
  effect('A'),
  colourCorrect('A', 'off'),
  ...dsk(true, { fill: 'white', edge: 'wide-border', edgeColor: MATTE.magenta }),
]);
point('chromaA', at(16), 0.5);
cuts(16, 24, 2, 0);
rotateLines('ext-camera', 16, 24, 1);
cue(at(20), avSynchro(['nega']), { play: { crowd: { from: 0 } } });
point('avLevel', at(20), 0.55);

section(24, 'Drop I · wipes');
const DROP_I_WIPES = [1, 5, 9, 13, 17, 21, 26, 19 + 128];
cue(at(24), [...dsk(false), ...avSynchro([]), effect('A', { multi: 4 }), borderColour(MATTE.yellow)]);
for (let i = 0; i < 8; i++) {
  cue(at(24 + i), wipe(DROP_I_WIPES[i]!, { edge: 'border-wide', multi: i < 4 ? 0 : i - 3 }));
}
cue(at(28), [effect('A', { multi: 9 })], { patch: { 2: 'spiral' } });
takes(24, 32, 4, 1, 1);

section(32, 'Drop I · hypnosis key');
cue(at(32), [
  transition('lum-key'),
  ...buses(1, 3),
  effect('A'),
  colourCorrect('A', 'chroma-plus-joystick'),
  colourCorrect('B', 'chroma-plus-joystick'),
]);
point('lever', at(32), 1);
point('chromaA', at(32), 0.8);
slicePump(32, 40, 0.18, 0.72);
ramp('hueA', at(32), at(40), 0, 1);
ramp('hueB', at(32), at(40), 0.5, -0.5);
for (let bar = 34; bar < 40; bar += 2) cue(at(bar), [], { patch: { 1: bar % 4 === 2 ? 'crowd' : 'crew' } });
cue(at(38), [effect('A', { trail: true })]);

// --- break: chalk dancers ---------------------------------------------------------------

section(40, 'Break · chalk duet');
cue(at(40), [
  transition('mix'),
  ...buses(4, 2),
  effect('A', { nega: true, trail: true }),
  colourCorrect('B', 'off'),
  matte(MATTE.cyan),
  ...dsk(true, { fill: 'matte', edge: 'normal' }),
]);
point('lever', at(40), 0);
point('chromaA', at(40), 1);
ramp('hueA', at(40), at(48), 0, 1);
rotateLines(4, 40, 48, 4, 0.75, 0);
rotateLines('ext-camera', 40, 48, 4, 0.75, 1);
cue(at(44), [matte(MATTE.magenta)]);
cue(at(46), [effect('A', { nega: true, strobe: true })]);
ramp('strobe', at(46), at(48), 0.6, 0);

// --- drop II ---------------------------------------------------------------------------

section(48, 'Drop II · rotoscope');
cue(at(48), [
  ...buses(1, 2),
  effect('A'),
  colourCorrect('A', 'chroma-only'),
  ...avSynchro(['mosaic']),
  ...dsk(true, { fill: 'white', edge: 'drop-shadow' }),
]);
point('lever', at(48), 0);
point('mosaic', at(48), 7);
ramp('chromaA', at(48), at(56), 0.5, 1);
for (let bar = 48; bar < 56; bar += 2) {
  cue(at(bar), [], { patch: { 1: bar % 4 === 0 ? 'crew' : 'crowd' } });
}
rotateLines('ext-camera', 48, 56, 2);

section(56, 'Drop II · ping-pong wipes');
const DROP_II_WIPES = [2, 6, 10 + 128, 14, 3, 7, 11, 15 + 128];
cue(at(56), [...dsk(false), ...avSynchro([]), effect('B', { paint: true }), colourCorrect('A', 'off')], {
  patch: { 1: 'crew', 2: 'crowd' },
});
for (let i = 0; i < 8; i++) {
  cue(at(56 + i), wipe(DROP_II_WIPES[i]!, { edge: 'soft-narrow', blinds: i >= 4, pairing: i >= 6 }));
}
takes(56, 64, 1, 0.5, 0);

// --- break: trails ---------------------------------------------------------------------

section(64, 'Break · slow trails');
cue(at(64), [transition('nam'), ...buses(3, 1), effect('B', { mono: true, trail: true })], {
  play: { crew: { from: 2, rate: 0.5 }, spiral: { rate: 0.6 } },
});
ramp('lever', at(64), at(66), 0.35, 0.75, 'ease');
ramp('lever', at(66), at(68), 0.75, 0.35, 'ease');
ramp('lever', at(68), at(70), 0.35, 0.8, 'ease');
cue(at(70), [effect('B', { mono: true, strobe: true })]);
ramp('strobe', at(70), at(72), 0.7, 0);

// --- drop III: punching the buses ------------------------------------------------------

section(72, 'Drop III · four-source punch');
cue(at(72), [transition('mix'), effect('A', { multi: 4 })], {
  patch: { 1: 'crew', 2: 'crowd', 3: 'spiral', 4: 'line2' },
  play: { crew: { from: 0, rate: 1 }, crowd: { from: 0 }, spiral: { rate: 1.5 }, line2: { from: 0, rate: 1 } },
});
point('lever', at(72), 0);
const PUNCH: readonly (1 | 2 | 3 | 4)[] = [1, 2, 1, 3, 1, 2, 4, 2, 2, 1, 3, 1, 4, 1, 2, 3];
for (let beat = 0; beat < 32; beat++) {
  cue(at(72, beat), [{ type: 'ASSIGN_SOURCE', bus: 'A', source: PUNCH[beat % PUNCH.length]! }]);
}
cue(at(76), [effect('A', { multi: 16 })]);

// --- breakdown: drawings keyed over the crowd, then the build ---------------------------

section(80, 'Breakdown · drawn over the crowd');
// Nega turns a drawing into light lines on black; the luminance key keeps only the lines.
cue(at(80), [
  effect('B', { nega: true }),
  transition('lum-key'),
  ...buses(2, 4),
  colourCorrect('A', 'chroma-only'),
  colourCorrect('B', 'chroma-plus-joystick'),
], { play: { crowd: { rate: 0.6 } } });
point('lever', at(80), 1);
point('slice', at(80), 0.4);
point('chromaA', at(80), 0);
ramp('chromaA', at(84), at(88), 0, 1, 'ease');
point('chromaB', at(80), 1);
ramp('hueB', at(80), at(88), 0, 1);
rotateLines(4, 80, 88, 2);
cue(at(84), dsk(true, { fill: 'white', edge: 'narrow-shadow' }));
rotateLines('ext-camera', 84, 88, 2, 1, 2);

section(88, 'Build');
cue(at(88), [transition('mix'), effect('A'), colourCorrect('A', 'off'), colourCorrect('B', 'off'), ...dsk(false), ...buses(1, 2), ...fadeTo('white', true, false)], {
  play: { crowd: { from: 0, rate: 1 } },
});
lever = cuts(88, 90, 4, 1);
lever = cuts(90, 92, 2, 1 - lever);
lever = cuts(92, 94, 1, 1 - lever);
lever = cuts(94, 95, 0.5, 1 - lever);
cuts(95, 96, 0.25, 1 - lever);
cue(at(92), [effect('A', { mono: true, mosaic: true })]);
ramp('mosaic', at(92), at(96), 2, 31);
flash(96);

// --- drop IV: everything at once --------------------------------------------------------

section(96, 'Drop IV · the whole panel');
const DROP_IV_WIPES = [17, 21, 25, 13 + 128, 27, 22, 8, 28];
const DROP_IV_BORDERS = [MATTE.yellow, MATTE.cyan, MATTE.magenta, MATTE.green, MATTE.red, MATTE.blue, MATTE.white, MATTE.yellow];
cue(at(96), [
  effect('A'),
  ...buses(1, 2),
  colourCorrect('A', 'chroma-plus-joystick'),
  colourCorrect('B', 'chroma-plus-joystick'),
  ...dsk(true, { fill: 'white', edge: 'wide-border', edgeColor: MATTE.cyan }),
]);
point('chromaA', at(96), 0.9);
point('chromaB', at(96), 0.9);
ramp('hueA', at(96), at(104), 0, 2);
ramp('hueB', at(96), at(104), 0.5, -1.5);
for (let i = 0; i < 8; i++) {
  cue(at(96 + i), [...wipe(DROP_IV_WIPES[i]!, { edge: 'border-wide', multi: (i % 6) + 1 }), borderColour(DROP_IV_BORDERS[i]!)]);
}
takes(96, 104, 2, 1, 0);
rotateLines('ext-camera', 96, 104, 1);
cue(at(100), [], { patch: { 2: 'spiral' } });

cue(at(104), [transition('lum-key'), ...buses(1, 3), effect('A', { strobe: true }), ...dsk(false)], {
  patch: { 1: 'crowd', 3: 'spiral' },
  play: { spiral: { rate: 1 } },
});
point('lever', at(104), 1);
point('strobe', at(104), 0.2);
slicePump(104, 110, 0.2, 0.7);
cue(at(108), [], { patch: { 1: 'crew' } });

section(110, 'Hold');
cue(at(110), [transition('mix'), effect('A', { still: true }), colourCorrect('A', 'off'), colourCorrect('B', 'off'), ...fadeTo('black', true, true)]);
point('lever', at(110), 0);
ramp('fade', at(110), at(111, 3), 0, 0.65);
point('fade', at(112), 0);

// --- drop V: long dissolves, invisible re-patching -------------------------------------

section(112, 'Drop V · slow dissolves');
cue(at(112), [effect('A', { trail: true }), ...buses(1, 2), colourCorrect('A', 'chroma-plus-joystick')], {
  patch: { 1: 'crew', 2: 'crowd' },
  play: { crew: { from: 0, rate: 1 }, crowd: { from: 5, rate: 1 } },
});
point('chromaA', at(112), 0.85);
ramp('hueA', at(112), at(118), 0, 0.5);
takes(112, 118, 8, 6, 0, 'ease');
// Each source is swapped while its bus is off air, so the next dissolve reveals new footage.
cue(at(114), [], { patch: { 1: 'spiral' } });
cue(at(116), [], { patch: { 2: 'crew' } });

section(118, 'Drop V · orbiting inset');
cue(at(118), [effect('A'), ...wipe(25, { edge: 'border-wide' }), positioner(true), borderColour(MATTE.yellow)], {
  patch: { 1: 'crew', 2: 'crowd' },
});
point('lever', at(118), 0.5);
ramp('orbit', at(118), at(124), 0, 3);
ramp('hueA', at(118), at(124), 0.5, 1.5);

section(124, 'Break · mosaic');
cue(at(124), [positioner(false), transition('mix'), ...buses(3, 2), effect('A', { mosaic: true }), colourCorrect('A', 'off')], {
  play: { spiral: { rate: 0.5 } },
});
point('lever', at(124), 0);
for (let beat = 0; beat < 16; beat++) point('mosaic', at(124, beat), 31 - beat * 2);

// --- drop VI: every clip -----------------------------------------------------------------

section(128, 'Drop VI · six-clip montage');
cue(at(128), [effect('A'), ...buses(1, 2), ...avSynchro(['nega'])], { play: { spiral: { rate: 1 } } });
point('lever', at(128), 0);
montage(1, 128, 136, 1, ['crew', 'crowd', 'spiral', 'line1', 'crowd', 'crew', 'line2', 'spiral', 'crew', 'line3', 'crowd', 'spiral']);
cue(at(132), [effect('A', { paint: true }), ...avSynchro(['nega'])]);

// --- titles on black -------------------------------------------------------------------

section(136, 'Break · drawings on black');
cue(at(136), [
  ...avSynchro([]),
  effect('A'),
  ...fadeTo('black', true, false),
  ...dsk(true, { fill: 'white', edge: 'wide-border', edgeColor: MATTE.cyan }),
], { patch: { 1: 'crew' } });
ramp('fade', at(136), at(138), 0, 1, 'ease');
point('fade', at(143), 1, 'ease');
point('fade', at(144), 0);
rotateLines('ext-camera', 136, 140, 2);
rotateLines('ext-camera', 140, 144, 2, 0.5, 1);
cue(at(143), [effect('A', { mosaic: true })]);
ramp('mosaic', at(143), at(144), 31, 1);

// --- drop VII: reprise -----------------------------------------------------------------

section(144, 'Drop VII · reprise');
cue(at(144), [
  effect('A'),
  ...buses(1, 2),
  transition('mix'),
  ...avSynchro(['nega']),
  ...dsk(true, { fill: 'white', edge: 'drop-shadow' }),
]);
cuts(144, 148, 2, 0);
rotateLines('ext-camera', 144, 148, 1);

const DROP_VII_WIPES = [1, 2 + 128, 5, 6 + 128];
cue(at(148), [...dsk(false), ...avSynchro([]), borderColour(MATTE.magenta)]);
for (let i = 0; i < 4; i++) cue(at(148 + i), wipe(DROP_VII_WIPES[i]!, { edge: 'border-narrow', blinds: true }));
takes(148, 152, 2, 1, 0);

cue(at(152), [transition('lum-key'), ...buses(2, 3), colourCorrect('B', 'chroma-plus-joystick')], { patch: { 2: 'crowd' } });
point('lever', at(152), 1);
point('chromaB', at(152), 1);
ramp('hueB', at(152), at(156), 0, 1);
slicePump(152, 156, 0.2, 0.75);

section(156, 'Wind down');
cue(at(156), [transition('mix'), colourCorrect('B', 'off'), effect('A', { trail: true }), ...buses(1, 2)], {
  play: { crew: { rate: 0.7 }, crowd: { rate: 0.7 } },
});
ramp('lever', at(156), at(158), 0, 1, 'ease');
ramp('lever', at(158), at(160), 1, 0, 'ease');
cue(at(159), fadeTo('white', true, false));
flash(160);

section(160, 'Final burst');
cue(at(160), [effect('A'), ...avSynchro(['nega'])], { play: { crew: { rate: 1 }, crowd: { rate: 1 } } });
point('lever', at(160), 0);
montage(1, 160, 163, 0.5, ['crew', 'crowd', 'crew', 'spiral', 'crowd', 'crew', 'line1', 'crowd']);

section(163, 'Out');
cue(at(163), [
  ...avSynchro([]),
  ...fadeTo('black', true, false),
  ...dsk(true, { fill: 'white', edge: 'normal' }),
], { patch: { 1: 'crew', 'ext-camera': 'line1' }, play: { line1: { from: 0, rate: 0.5 } } });
ramp('fade', at(163), at(164.5), 0, 1, 'ease');
ramp('dskHigh', at(165), at(166.5), 0.42, 0, 'ease');

const START_PATCH: Patch = { 1: 'crew', 2: 'crowd', 3: 'spiral', 4: 'line1', 'ext-camera': 'line1' };

export const MUSIC_VIDEO: Score = compileScore({ cues, lanes, markers, patch: START_PATCH });
