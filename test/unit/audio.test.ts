import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce } from '../../src/state/reducer.js';
import { FACTORY_PRESET } from '../../src/state/state.js';
import type { PanelState } from '../../src/state/state.js';
import {
  FADER_UNITY,
  FADER_GMAX,
  faderGain,
  faderDb,
  audioFollowGains,
  effectiveBusGains,
  programAudioMix,
  programAudible,
  micAux2Active,
  micAux2Muted,
  linearToDb,
  nearZeroDb,
  isClipped,
  NOMINAL_PROGRAM_PEAK,
  CLIP_CEILING_DB,
} from '../../src/core/audio.js';

const fresh = (): PanelState => structuredClone(FACTORY_PRESET);
/** The desk boots silent (all faders at zero) — routing tests need standing levels. */
const raised = (s: PanelState): PanelState => {
  s.audio = { ...s.audio, faders: { a: 0.7, b: 0.4, aux1: 0.6, micAux2: 0.6, master: 0.75 } };
  return s;
};
const EPS = 1e-9;

// --- fader law ---

test('faderGain: silent at the bottom, unity at the detent, +12 dB at the top', () => {
  assert.equal(faderGain(0), 0);
  assert.equal(faderGain(FADER_UNITY), 1);
  assert.equal(faderGain(1), FADER_GMAX);
});

test('faderGain is monotonic across the travel', () => {
  const samples = [0, 0.1, 0.25, 0.5, 0.75, 1].map(faderGain);
  for (let i = 1; i < samples.length; i++) {
    assert.ok(samples[i]! > samples[i - 1]!, `gain rises at sample ${i}`);
  }
});

test('faderDb: 0 dB at unity, -Infinity at silence', () => {
  assert.equal(faderDb(FADER_UNITY), 0);
  assert.equal(faderDb(0), -Infinity);
  assert.ok(Math.abs(faderDb(1) - 20 * Math.log10(FADER_GMAX)) < EPS);
});

// --- Audio Follow crossfade ---

test('audioFollowGains: equal-power endpoints and centre', () => {
  const atA = audioFollowGains(0);
  assert.ok(Math.abs(atA.a - 1) < EPS && Math.abs(atA.b) < EPS, 'lever A → full A, silent B');
  const atB = audioFollowGains(1);
  assert.ok(Math.abs(atB.b - 1) < EPS && Math.abs(atB.a) < EPS, 'lever B → silent A, full B');
  const centre = audioFollowGains(0.5);
  assert.ok(centre.a > 0 && centre.a < 1 && centre.b > 0 && centre.b < 1, 'centre → both mixed');
});

test('audioFollowGains keeps constant power across the sweep', () => {
  for (const lever of [0, 0.2, 0.5, 0.8, 1]) {
    const { a, b } = audioFollowGains(lever);
    assert.ok(Math.abs(a * a + b * b - 1) < EPS, `constant power at lever ${lever}`);
  }
});

test('the crossfade is continuous: A falls and B rises monotonically as the lever sweeps', () => {
  const levers = [0, 0.25, 0.5, 0.75, 1];
  const gains = levers.map(audioFollowGains);
  for (let i = 1; i < gains.length; i++) {
    assert.ok(gains[i]!.a < gains[i - 1]!.a, `A falls at ${levers[i]}`);
    assert.ok(gains[i]!.b > gains[i - 1]!.b, `B rises at ${levers[i]}`);
  }
});

// --- effectiveBusGains: fader vs follow, and disengage restores ---

test('effectiveBusGains uses the standing faders when Audio Follow is off', () => {
  const s = fresh();
  const g = effectiveBusGains(s);
  assert.equal(g.a, faderGain(s.audio.faders.a));
  assert.equal(g.b, faderGain(s.audio.faders.b));
});

test('effectiveBusGains follows the lever when engaged, and the lever alone drives it', () => {
  let s = reduce(fresh(), { type: 'PRESS_AUDIO_FOLLOW' }); // engage
  s = reduce(s, { type: 'SET_LEVER', position: 0 });
  const atA = effectiveBusGains(s);
  assert.ok(Math.abs(atA.a - 1) < EPS && Math.abs(atA.b) < EPS);
  s = reduce(s, { type: 'SET_LEVER', position: 1 });
  const atB = effectiveBusGains(s);
  assert.ok(Math.abs(atB.b - 1) < EPS && Math.abs(atB.a) < EPS);
});

test('disengaging Audio Follow restores the untouched standing faders', () => {
  const base = fresh();
  let s = reduce(base, { type: 'PRESS_AUDIO_FOLLOW' }); // engage
  s = reduce(s, { type: 'SET_LEVER', position: 0.3 });
  assert.equal(s.audio.faders.a, base.audio.faders.a, 'faders are never mutated by follow');
  s = reduce(s, { type: 'PRESS_AUDIO_FOLLOW' }); // disengage
  const g = effectiveBusGains(s);
  assert.equal(g.a, faderGain(base.audio.faders.a));
  assert.equal(g.b, faderGain(base.audio.faders.b));
});

// --- programAudioMix routing ---

test('EFFECT routes every input and Master governs', () => {
  const s = reduce(raised(fresh()), { type: 'SET_PROGRAM_OUT', mode: 'effect' });
  const mix = programAudioMix(s);
  assert.ok(mix.gains.busA > 0 && mix.gains.busB > 0 && mix.gains.aux1 > 0 && mix.gains.aux2mic > 0);
  assert.equal(mix.master, faderGain(s.audio.faders.master));
});

test('direct A/B routes that bus plus aux+mic, excludes the other bus, and bypasses Master', () => {
  const s = reduce(raised(fresh()), { type: 'SET_PROGRAM_OUT', mode: 'A' });
  const mix = programAudioMix(s);
  assert.ok(mix.gains.busA > 0, 'A bus present');
  assert.equal(mix.gains.busB, 0, 'B bus excluded');
  assert.ok(mix.gains.aux1 > 0 && mix.gains.aux2mic > 0, 'aux + mic present');
  assert.equal(mix.master, 1, 'Master bypassed in direct out');
});

test('a bus resolving to the Matte contributes no audio', () => {
  let s = reduce(fresh(), { type: 'SET_PROGRAM_OUT', mode: 'effect' });
  s = reduce(s, { type: 'ASSIGN_SOURCE', bus: 'A', source: 'matte' });
  assert.equal(programAudioMix(s).gains.busA, 0);
});

test('programAudible is false once the Master is pulled to minimum in EFFECT', () => {
  let s = reduce(raised(fresh()), { type: 'SET_PROGRAM_OUT', mode: 'effect' });
  assert.equal(programAudible(s), true);
  s = reduce(s, { type: 'SET_AUDIO_FADER', fader: 'master', level: 0 });
  assert.equal(programAudible(s), false);
});

// --- MIC/AUX2 switch ---

test('micAux2Active / micAux2Muted mirror the front-panel switch', () => {
  let s = reduce(fresh(), { type: 'SET_MIC_AUX2_SWITCH', position: 'aux2' });
  assert.equal(micAux2Active(s), 'aux2');
  assert.equal(micAux2Muted(s), 'mic');
  s = reduce(s, { type: 'SET_MIC_AUX2_SWITCH', position: 'mic' });
  assert.equal(micAux2Active(s), 'mic');
  assert.equal(micAux2Muted(s), 'aux2');
});

// --- level indicator mapping ---

test('the nominal programme peak reads at the 0 dB LED and is not clipped', () => {
  const db = linearToDb(NOMINAL_PROGRAM_PEAK);
  assert.equal(db, 0);
  assert.equal(nearZeroDb(db), true);
  assert.equal(isClipped(db), false);
});

test('brief peaks above 0 dB are not clipping until they reach the ceiling', () => {
  assert.equal(isClipped(CLIP_CEILING_DB - 0.1), false);
  assert.equal(isClipped(CLIP_CEILING_DB), true);
  assert.equal(linearToDb(0), -Infinity);
});

// --- reducer cases ---

test('SET_AUDIO_FADER clamps and no-ops on an unchanged level', () => {
  const s = fresh();
  assert.equal(reduce(s, { type: 'SET_AUDIO_FADER', fader: 'a', level: 1.5 }).audio.faders.a, 1);
  assert.equal(reduce(s, { type: 'SET_AUDIO_FADER', fader: 'a', level: -1 }).audio.faders.a, 0);
  assert.equal(reduce(s, { type: 'SET_AUDIO_FADER', fader: 'a', level: s.audio.faders.a }), s);
});

test('SET_AUDIO_FADER touches only the named fader', () => {
  const s = fresh();
  const next = reduce(s, { type: 'SET_AUDIO_FADER', fader: 'master', level: 0.9 });
  assert.equal(next.audio.faders.master, 0.9);
  assert.equal(next.audio.faders.a, s.audio.faders.a);
  assert.equal(next.audio.faders.b, s.audio.faders.b);
});

test('PRESS_AUDIO_FOLLOW toggles and never mutates the standing faders', () => {
  const s = fresh();
  assert.equal(s.audio.audioFollow, false);
  const on = reduce(s, { type: 'PRESS_AUDIO_FOLLOW' });
  assert.equal(on.audio.audioFollow, true);
  assert.deepEqual(on.audio.faders, s.audio.faders);
  const off = reduce(on, { type: 'PRESS_AUDIO_FOLLOW' });
  assert.equal(off.audio.audioFollow, false);
});

test('SET_MIC_AUX2_SWITCH no-ops on the same position', () => {
  const s = fresh();
  assert.equal(reduce(s, { type: 'SET_MIC_AUX2_SWITCH', position: s.audio.micAux2 }), s);
});
