import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce } from '../../src/state/reducer.js';
import { FACTORY_PRESET } from '../../src/state/state.js';
import type { PanelState } from '../../src/state/state.js';
import { programFadeAudioMix, programFadeSourceMix } from '../../src/core/fade.js';
import { micCaptureWanted } from '../../src/core/audio.js';

const fresh = (): PanelState => structuredClone(FACTORY_PRESET);

/** Standing fader levels so routing is observable (the desk boots silent). */
function raised(s: PanelState): PanelState {
  s.audio = { ...s.audio, faders: { a: 0.7, b: 0.4, aux1: 0.6, micAux2: 0.6, master: 0.75 } };
  return s;
}

function assign(s: PanelState, bus: 'A' | 'B', source: 1 | 2 | 3 | 4 | 'matte'): PanelState {
  return reduce(s, { type: 'ASSIGN_SOURCE', bus, source });
}

test('programFadeSourceMix routes each bus fader gain to the slot holding that bus', () => {
  let s = raised(fresh());
  s = assign(s, 'A', 2);
  s = assign(s, 'B', 3);
  const base = programFadeAudioMix(s);
  const mix = programFadeSourceMix(s);
  assert.equal(mix.slots[2], base.gains.busA);
  assert.equal(mix.slots[3], base.gains.busB);
  assert.equal(mix.slots[1], 0);
  assert.equal(mix.slots[4], 0);
  assert.equal(mix.aux1, base.gains.aux1);
  assert.equal(mix.aux2mic, base.gains.aux2mic);
  assert.equal(mix.master, base.master);
});

test('reassigning the bus moves the fader gain to the new source', () => {
  let s = raised(fresh());
  s = assign(s, 'A', 2);
  s = assign(s, 'B', 3);
  const before = programFadeSourceMix(s);
  assert.ok(before.slots[2] > 0);
  s = assign(s, 'A', 4);
  const after = programFadeSourceMix(s);
  assert.equal(after.slots[2], 0);
  assert.equal(after.slots[4], before.slots[2]);
});

test('the same slot on both buses sums both fader paths', () => {
  let s = raised(fresh());
  s = assign(s, 'A', 3);
  s = assign(s, 'B', 3);
  const base = programFadeAudioMix(s);
  assert.ok(Math.abs(programFadeSourceMix(s).slots[3] - (base.gains.busA + base.gains.busB)) < 1e-12);
});

test('Matte contributes no slot audio and the substitute never carries audio', () => {
  let s = raised(fresh());
  s = assign(s, 'A', 'matte'); // substitute stays 1
  s = assign(s, 'B', 2);
  const mix = programFadeSourceMix(s);
  assert.equal(mix.slots[1], 0); // the blinking substitute is video-only (ADR-0006)
  assert.ok(mix.slots[2] > 0);
});

test('direct-out A excludes the B-bus slot and bypasses Master', () => {
  let s = raised(fresh());
  s = assign(s, 'A', 1);
  s = assign(s, 'B', 4);
  s = reduce(s, { type: 'SET_PROGRAM_OUT', mode: 'A' });
  const mix = programFadeSourceMix(s);
  assert.ok(mix.slots[1] > 0);
  assert.equal(mix.slots[4], 0);
  assert.ok(mix.aux1 > 0 && mix.aux2mic > 0);
  assert.equal(mix.master, 1);
});

test('Audio Follow drives the slots through the lever (equal power)', () => {
  let s = raised(fresh());
  s = assign(s, 'A', 1);
  s = assign(s, 'B', 2);
  s = reduce(s, { type: 'PRESS_AUDIO_FOLLOW' });
  const atA = programFadeSourceMix(reduce(s, { type: 'SET_LEVER', position: 0 }));
  assert.ok(atA.slots[1] > 0 && atA.slots[2] === 0);
  const atB = programFadeSourceMix(reduce(s, { type: 'SET_LEVER', position: 1 }));
  assert.ok(Math.abs(atB.slots[1]) < 1e-12 && atB.slots[2] > 0);
  const mid = programFadeSourceMix(reduce(s, { type: 'SET_LEVER', position: 0.5 }));
  assert.ok(Math.abs(mid.slots[1] - Math.SQRT1_2) < 1e-9);
  assert.ok(Math.abs(mid.slots[2] - Math.SQRT1_2) < 1e-9);
});

test('fades project through the slot mapping: black silences, B keeps only the B slot', () => {
  let s = raised(fresh());
  s = assign(s, 'A', 1);
  s = assign(s, 'B', 2);
  s.fade = { ...s.fade, audio: true, lever: 1, target: 'black' };
  const silenced = programFadeSourceMix(s);
  assert.equal(silenced.slots[1], 0);
  assert.equal(silenced.slots[2], 0);
  assert.equal(silenced.aux1, 0);
  s.fade = { ...s.fade, target: 'B' };
  const toB = programFadeSourceMix(s);
  assert.equal(toB.slots[1], 0);
  assert.ok(toB.slots[2] > 0 && toB.aux1 > 0);
});

test('micCaptureWanted demands the mic only when switched to Mic with an open, routed fader', () => {
  assert.equal(micCaptureWanted(fresh()), false); // boots silent
  const s = raised(fresh());
  assert.equal(micCaptureWanted(s), true); // factory switch = mic, fader open
  const aux2 = reduce(s, { type: 'SET_MIC_AUX2_SWITCH', position: 'aux2' });
  assert.equal(micCaptureWanted(aux2), false);
  // Pre-Fade and pre-Master: neither a running fade nor a closed Master flaps acquisition.
  const faded = structuredClone(s);
  faded.fade = { ...faded.fade, audio: true, lever: 1, target: 'black' };
  assert.equal(micCaptureWanted(faded), true);
  const masterClosed = structuredClone(s);
  masterClosed.audio = { ...masterClosed.audio, faders: { ...masterClosed.audio.faders, master: 0 } };
  assert.equal(micCaptureWanted(masterClosed), true);
});
