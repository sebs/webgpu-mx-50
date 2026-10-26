// The music video's edit (music-video.html), compiled and sampled headlessly. Every cue
// is a list of real store commands folded through the real reducer, so a section whose
// look the panel refuses — a Positioner off a Square wipe, Trail next to A/V Synchro, an
// effect on the wrong bus — fails here instead of silently showing something else.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MUSIC_VIDEO } from '../../site/music-video/edit.js';
import {
  BAR,
  CLIPS,
  INPUTS,
  SONG_LENGTH,
  at,
  clipTime,
  compileScore,
  cueIndexAt,
  effect,
  laneCommandsAt,
  markerAt,
  sampleLane,
  stateAt,
  LANE_NAMES,
} from '../../site/music-video/score.js';
import { reduce } from '../../src/state/reducer.js';
import { FACTORY_PRESET } from '../../src/state/state.js';
import type { LaneName, LanePoint } from '../../site/music-video/score.js';

const score = MUSIC_VIDEO;
const ids = CLIPS.map((c) => c.id as string);

test('cues are in time order, inside the song, and patch only known clips into every input', () => {
  for (let i = 1; i < score.cues.length; i++) assert.ok(score.cues[i]!.at > score.cues[i - 1]!.at, `cue ${i} is after cue ${i - 1}`);
  for (const cue of score.cues) {
    assert.ok(cue.at >= 0 && cue.at < SONG_LENGTH);
    for (const input of INPUTS) assert.notEqual(ids.indexOf(cue.patch[input]), -1, `input ${String(input)} has a clip`);
    for (const id of ids) assert.ok(cue.clips[id as 'crew'].rate > 0);
  }
});

test('the markers cover the song from the top, in order', () => {
  assert.equal(score.markers[0]!.at, 0);
  for (let i = 1; i < score.markers.length; i++) assert.ok(score.markers[i]!.at > score.markers[i - 1]!.at);
  assert.equal(markerAt(score, at(16) + 0.01)!.label, 'Drop I · cut on the beat');
});

test('every lane stays inside its control range', () => {
  for (let t = 0; t < SONG_LENGTH; t += 0.1) {
    const s = stateAt(score, t);
    assert.ok(s.transition.lever >= 0 && s.transition.lever <= 1);
    assert.ok(s.fade.lever >= 0 && s.fade.lever <= 1);
  }
});

test('it opens on black and fades up to the spiral', () => {
  assert.equal(stateAt(score, 0).fade.lever, 1);
  const s = stateAt(score, at(4));
  assert.equal(s.fade.lever, 0);
  assert.equal(s.busA.source, 3);
  assert.equal(score.cues[cueIndexAt(score, at(4))]!.patch[3], 'spiral');
});

test('each section lands the look it is named for', () => {
  const mid = (bar: number): number => at(bar) + BAR / 2;

  let s = stateAt(score, mid(9));
  assert.equal(s.transition.type, 'wipe');
  assert.equal(s.transition.wipe.family, 'square');
  assert.equal(s.digitalEffect.bus, 'B');
  assert.ok(s.digitalEffect.active.mono);

  s = stateAt(score, mid(17));
  assert.ok(s.dsk.on);
  assert.equal(s.dsk.keySource, 'ext-camera');
  assert.equal(s.transition.type, 'mix');

  s = stateAt(score, mid(21));
  assert.ok(s.digitalEffect.avSynchro);
  assert.ok(s.digitalEffect.avSynchroEffects.nega);

  s = stateAt(score, mid(29));
  assert.equal(s.digitalEffect.freeze.multi, 9);
  assert.equal(s.transition.wipe.edge, 'border-wide');
  assert.ok(s.transition.wipe.modifiers.multi > 0);

  s = stateAt(score, mid(33));
  assert.equal(s.transition.type, 'lum-key');
  assert.equal(s.busB.source, 3);
  assert.equal(s.busA.colourCorrect.mode, 'chroma-plus-joystick');

  s = stateAt(score, mid(41));
  assert.ok(s.digitalEffect.active.nega && s.digitalEffect.freeze.trail);
  assert.equal(s.dsk.fill, 'matte');

  s = stateAt(score, mid(61));
  assert.ok(s.transition.wipe.modifiers.blinds, 'blinds hold on a legal family');
  assert.ok(s.digitalEffect.active.paint);

  s = stateAt(score, mid(65));
  assert.equal(s.transition.type, 'nam');
  assert.ok(s.digitalEffect.freeze.trail);

  s = stateAt(score, mid(77));
  assert.equal(s.digitalEffect.freeze.multi, 16);

  s = stateAt(score, mid(85));
  assert.equal(s.transition.type, 'lum-key');
  assert.ok(s.digitalEffect.active.nega);
  assert.equal(s.digitalEffect.bus, 'B');

  s = stateAt(score, mid(110));
  assert.ok(s.digitalEffect.freeze.still);

  s = stateAt(score, mid(119));
  assert.ok(s.positioner.on, 'the Positioner engages on the Square wipe');

  s = stateAt(score, mid(125));
  assert.ok(!s.positioner.on);
  assert.ok(s.digitalEffect.active.mosaic);

  s = stateAt(score, mid(137));
  assert.equal(s.fade.target, 'black');
  assert.ok(s.fade.video && !s.fade.dsk, 'the drawings stay up while the picture goes to black');
  assert.ok(s.dsk.on);

  s = stateAt(score, SONG_LENGTH - 0.1);
  assert.equal(s.fade.lever, 1);
  assert.equal(s.dsk.high, 0);
});

test('the punch section switches bus A on every beat', () => {
  const sources = new Set<number | string>();
  for (let beat = 0; beat < 16; beat++) sources.add(stateAt(score, at(72, beat) + 0.05).busA.source);
  assert.equal(sources.size, 4);
});

test('a lane is silent before its first point and holds after its last', () => {
  const pts: LanePoint[] = [
    { at: 1, value: 0, curve: 'linear' },
    { at: 2, value: 1, curve: 'ease' },
    { at: 3, value: 0, curve: 'hold' },
  ];
  assert.equal(sampleLane(pts, 0.5), null);
  assert.equal(sampleLane(pts, 1.5), 0.5);
  assert.equal(sampleLane(pts, 2.5), 0.5);
  assert.equal(sampleLane(pts, 9), 0);
});

test('lane commands are what stateAt applies on top of the checkpoint', () => {
  const t = at(33, 1.5);
  let s = score.cues[cueIndexAt(score, t)]!.state;
  for (const c of laneCommandsAt(score, t)) s = reduce(s, c);
  assert.deepEqual(s, stateAt(score, t));
});

test('effect() sets exactly the requested effects, whatever was on before', () => {
  const lanes = {} as { [K in LaneName]: LanePoint[] };
  for (const name of LANE_NAMES) lanes[name] = [];
  const patch = { 1: 'crew', 2: 'crowd', 3: 'spiral', 4: 'line1', 'ext-camera': 'line1' } as const;
  const compiled = compileScore({
    cues: [
      { at: 1, steps: [effect('A', { nega: true, strobe: true })] },
      { at: 2, steps: [effect('A', { mono: true, still: true })] },
      { at: 3, steps: [effect('B', { trail: true })] },
    ],
    lanes,
    markers: [],
    patch,
  });
  const de = (t: number) => compiled.cues[cueIndexAt(compiled, t)]!.state.digitalEffect;
  assert.deepEqual(de(1).active, { nega: true, mosaic: false, mono: false, paint: false });
  assert.ok(de(1).freeze.strobe);
  assert.deepEqual(de(2).active, { nega: false, mosaic: false, mono: true, paint: false });
  assert.ok(de(2).freeze.still && !de(2).freeze.strobe);
  assert.equal(de(3).bus, 'B');
  assert.ok(de(3).freeze.trail && !de(3).freeze.still);
  assert.equal(compiled.cues[0]!.state, FACTORY_PRESET);
});

test('a clip loops on its own clock from its last (re)start', () => {
  const clip = CLIPS[0]!;
  assert.equal(clipTime(clip, { at: 10, from: 2, rate: 0.5 }, 14), 4);
  assert.ok(Math.abs(clipTime(clip, { at: 0, from: 0, rate: 1 }, 12.5) - 2.5) < 1e-9);
});
