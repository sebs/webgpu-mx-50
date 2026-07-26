// Step definitions for the audio-mixer (§5) and audio-follow (§12) features. They dispatch
// typed audio commands to the headless store and assert against the pure gain math in
// core/audio.ts — no AudioContext (the Web Audio engine is browser-only, ADR-0010).

import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { MixerWorld } from '../support/world.js';
import type { BusId, SourceSlot } from '../../../src/core/types.js';
import type { ProgramOut } from '../../../src/state/state.js';
import { programAudio } from '../../../src/core/program.js';
import {
  faderGain,
  effectiveBusGains,
  programAudioMix,
  programAudible,
  micAux2Active,
  micAux2Muted,
  linearToDb,
  nearZeroDb,
  isClipped,
  AUDIO_FOLLOW_EXCLUDED,
  FADER_UNITY,
  ZERO_DB_LED,
  NOMINAL_PROGRAM_PEAK,
} from '../../../src/core/audio.js';

const EPS = 1e-9;

type FaderKey = 'a' | 'b' | 'aux1' | 'micAux2' | 'master';
type GainKey = 'busA' | 'busB' | 'aux1' | 'aux2mic';

const busId = (label: string): BusId => (label.startsWith('A') ? 'A' : 'B');
const programMode = (label: string): ProgramOut => (label === 'EFFECT' ? 'effect' : (label as 'A' | 'B'));
const leverOf = (label: string): number => (label === 'A' ? 0 : label === 'B' ? 1 : 0.5);

const FADER_BY_LABEL: Record<string, FaderKey> = {
  A: 'a',
  B: 'b',
  AUX1: 'aux1',
  'MIC/AUX2': 'micAux2',
  MASTER: 'master',
};
const GAIN_BY_FADER: Record<FaderKey, GainKey> = {
  a: 'busA',
  b: 'busB',
  aux1: 'aux1',
  micAux2: 'aux2mic',
  master: 'busA',
};
/** "Mic" → 'mic', "Aux 2"/"Aux2" → 'aux2'. */
const micInput = (label: string): 'mic' | 'aux2' => (/mic/i.test(label) ? 'mic' : 'aux2');

function setFader(w: MixerWorld, fader: FaderKey, level: number): void {
  w.dispatch({ type: 'SET_AUDIO_FADER', fader, level });
}

// ===========================================================================
// Background / descriptive setup
// ===========================================================================

Given('the audio mixer is running', function () {});
Given('the A Fader controls the audio of the source selected on the A-bus', function () {});
Given('the B Fader controls the audio of the source selected on the B-bus', function () {});
Given('the AUX1 Fader controls the Aux 1 input', function () {});
Given(/^the MIC\/AUX2 Fader controls either the Mic or the Aux 2 input$/, function () {});
Given('the MASTER Fader sets the final mixed output level', function () {});
Given('the Audio Level Indicator shows the programme level in LED steps around 0 dB', function () {});

// audio-follow background
Given(/^a source with distinct audio is assigned to the (A-bus|B-bus)$/, function (this: MixerWorld, bus: string) {
  const slot: SourceSlot = busId(bus) === 'A' ? 1 : 2;
  this.dispatch({ type: 'ASSIGN_SOURCE', bus: busId(bus), source: slot });
});
Given(/^Aux 1 and Mic\/Aux 2 each carry their own independent audio$/, function () {});

// ===========================================================================
// Source assignment (lowercase variants unique to the audio features)
// ===========================================================================

Given(/^source (\d+) is assigned to the (A-bus|B-bus)$/, function (this: MixerWorld, n: string, bus: string) {
  this.dispatch({ type: 'ASSIGN_SOURCE', bus: busId(bus), source: Number(n) as SourceSlot });
});
When(/^I reassign source (\d+) to the (A-bus|B-bus)$/, function (this: MixerWorld, n: string, bus: string) {
  this.dispatch({ type: 'ASSIGN_SOURCE', bus: busId(bus), source: Number(n) as SourceSlot });
});

// Ensure both buses carry real (non-Matte) audio; wording varies across scenarios.
Given(/^the A-bus (?:source and the |and )B-bus sources? both have audio$/, function (this: MixerWorld) {
  this.dispatch({ type: 'ASSIGN_SOURCE', bus: 'A', source: 1 });
  this.dispatch({ type: 'ASSIGN_SOURCE', bus: 'B', source: 2 });
});

// ===========================================================================
// Faders
// ===========================================================================

When(/^I raise the (A|B|AUX1|MIC\/AUX2|MASTER) Fader$/, function (this: MixerWorld, label: string) {
  const fader = FADER_BY_LABEL[label]!;
  this.raisedGainKey = GAIN_BY_FADER[fader];
  this.beforeRaiseGain = programAudioMix(this.snapshot()).gains[this.raisedGainKey];
  const current = this.snapshot().audio.faders[fader];
  setFader(this, fader, Math.min(1, Math.max(current, FADER_UNITY) + 0.2));
});

Then(/^the audio of source \d+ rises in the mix$/, function (this: MixerWorld) {
  assert.ok(programAudioMix(this.snapshot()).gains[this.raisedGainKey] > this.beforeRaiseGain);
});

Then(/^the (A|B) Fader now controls the audio of source (\d+)$/, function (this: MixerWorld, bus: string, n: string) {
  const b = busId(bus) === 'A' ? this.snapshot().busA : this.snapshot().busB;
  assert.equal(b.source, Number(n));
});

Given(/^the A, B, AUX1 and MIC\/AUX2 Faders are set to nominal levels$/, function (this: MixerWorld) {
  for (const f of ['a', 'b', 'aux1', 'micAux2'] as FaderKey[]) setFader(this, f, FADER_UNITY);
});
Given(/^the four input faders A, B, AUX1 and MIC\/AUX2 are contributing to the mix$/, function (this: MixerWorld) {
  for (const f of ['a', 'b', 'aux1', 'micAux2'] as FaderKey[]) setFader(this, f, FADER_UNITY);
});
Given(/^the A, B, AUX1 and MIC\/AUX2 Faders are all raised$/, function (this: MixerWorld) {
  for (const f of ['a', 'b', 'aux1', 'micAux2'] as FaderKey[]) setFader(this, f, 0.8);
});
Given(/^the AUX1 and MIC\/AUX2 Faders are raised$/, function (this: MixerWorld) {
  setFader(this, 'aux1', 0.8);
  setFader(this, 'micAux2', 0.8);
});

When('I pull the MASTER Fader to minimum', function (this: MixerWorld) {
  this.prevMasterPos = this.snapshot().audio.faders.master;
  this.prevMasterGain = programAudioMix(this.snapshot()).master;
  setFader(this, 'master', 0);
});
When('I return the MASTER Fader to nominal', function (this: MixerWorld) {
  setFader(this, 'master', this.prevMasterPos);
});
Then('no audio reaches Program Out', function (this: MixerWorld) {
  assert.equal(programAudible(this.snapshot()), false);
});
Then('the full balanced mix reaches Program Out at its previous level', function (this: MixerWorld) {
  assert.equal(programAudible(this.snapshot()), true);
  assert.equal(programAudioMix(this.snapshot()).master, this.prevMasterGain);
});

// ===========================================================================
// Level indicator (§5)
// ===========================================================================

When(/^I balance them so the average programme level sits around 0 dB$/, function (this: MixerWorld) {
  this.programmePeakDb = linearToDb(NOMINAL_PROGRAM_PEAK); // balanced mix reads at the 0 dB LED
  this.briefPeakDb = 3; // a representative brief peak above 0 dB but below the clip ceiling
});
Then('the Audio Level Indicator hovers around its 0 dB LED', function (this: MixerWorld) {
  assert.equal(nearZeroDb(this.programmePeakDb), true);
});
Then('brief peaks may rise above 0 dB without the mix being considered clipped', function (this: MixerWorld) {
  assert.ok(this.briefPeakDb > ZERO_DB_LED);
  assert.equal(isClipped(this.briefPeakDb), false);
});

// ===========================================================================
// MIC/AUX2 switch (§2, §5)
// ===========================================================================

Given(/^the front-panel Mic\/Aux2 switch is set to "(Mic|Aux2)"$/, function (this: MixerWorld, position: string) {
  this.dispatch({ type: 'SET_MIC_AUX2_SWITCH', position: micInput(position) });
});
Given(/^the Mic\/Aux2 switch is set to "(Mic|Aux2)"$/, function (this: MixerWorld, position: string) {
  this.dispatch({ type: 'SET_MIC_AUX2_SWITCH', position: micInput(position) });
});
Then(/^the "(Mic|Aux 2)" signal rises in the mix$/, function (this: MixerWorld, input: string) {
  assert.equal(micAux2Active(this.snapshot()), micInput(input));
});
Then(/^the "(Mic|Aux 2)" signal does not contribute through that fader$/, function (this: MixerWorld, input: string) {
  assert.equal(micAux2Muted(this.snapshot()), micInput(input));
});

// ===========================================================================
// Program Out routing (§2, §5)
// ===========================================================================

When(/^I select "?(A|B|EFFECT)"? as the Program Out$/, function (this: MixerWorld, label: string) {
  this.dispatch({ type: 'SET_PROGRAM_OUT', mode: programMode(label) });
});
When(/^I then select (A|B|EFFECT) as the Program Out$/, function (this: MixerWorld, label: string) {
  this.dispatch({ type: 'SET_PROGRAM_OUT', mode: programMode(label) });
});

Then('the audio output contains the A-bus source, the B-bus source, Aux 1 and the Mic', function (this: MixerWorld) {
  const { gains } = programAudioMix(this.snapshot());
  assert.ok(gains.busA > 0 && gains.busB > 0 && gains.aux1 > 0 && gains.aux2mic > 0);
  assert.equal(micAux2Active(this.snapshot()), 'mic');
});
Then('the mix is scaled by the MASTER Fader', function (this: MixerWorld) {
  const s = this.snapshot();
  assert.equal(programAudio(s).masterGoverns, true);
  assert.ok(programAudioMix(s).master > 0);
});
Then(/^the audio output contains the "(A-bus source|B-bus source)" plus Aux 1 and the Mic\/Aux 2 input$/, function (this: MixerWorld, phrase: string) {
  const { gains } = programAudioMix(this.snapshot());
  const busGain = busId(phrase) === 'A' ? gains.busA : gains.busB;
  assert.ok(busGain > 0 && gains.aux1 > 0 && gains.aux2mic > 0);
});
Then(/^the "(A-bus source|B-bus source)" audio is not present in the output$/, function (this: MixerWorld, phrase: string) {
  const { gains } = programAudioMix(this.snapshot());
  assert.equal(busId(phrase) === 'A' ? gains.busA : gains.busB, 0);
});
Then(/^the (A|B)-bus audio is absent from the output$/, function (this: MixerWorld, bus: string) {
  const { gains } = programAudioMix(this.snapshot());
  assert.equal(busId(bus) === 'A' ? gains.busA : gains.busB, 0);
});
Then(/^both bus sources are present in the output together with Aux 1 and the Mic\/Aux 2 input$/, function (this: MixerWorld) {
  const { gains } = programAudioMix(this.snapshot());
  assert.ok(gains.busA > 0 && gains.busB > 0 && gains.aux1 > 0 && gains.aux2mic > 0);
});

When(/^I switch the Program Out between A, B and EFFECT$/, function () {});
Then(/^the Aux 1 and Mic\/Aux 2 audio remains present in the output for each selection$/, function (this: MixerWorld) {
  for (const mode of ['A', 'B', 'effect'] as ProgramOut[]) {
    this.dispatch({ type: 'SET_PROGRAM_OUT', mode });
    const { gains } = programAudioMix(this.snapshot());
    assert.ok(gains.aux1 > 0 && gains.aux2mic > 0, `aux+mic present in ${mode}`);
  }
});

// ===========================================================================
// Audio Follow (§12)
// ===========================================================================

Given('Audio Follow is not engaged', function (this: MixerWorld) {
  if (this.snapshot().audio.audioFollow) this.dispatch({ type: 'PRESS_AUDIO_FOLLOW' });
});
Given('Audio Follow is engaged', function (this: MixerWorld) {
  if (!this.snapshot().audio.audioFollow) this.dispatch({ type: 'PRESS_AUDIO_FOLLOW' });
});
When(/^I press AUDIO FOLLOW(?: to disengage it)?$/, function (this: MixerWorld) {
  this.dispatch({ type: 'PRESS_AUDIO_FOLLOW' });
});
Then('Audio Follow becomes engaged', function (this: MixerWorld) {
  assert.equal(this.snapshot().audio.audioFollow, true);
});
Then('Audio Follow becomes disengaged', function (this: MixerWorld) {
  assert.equal(this.snapshot().audio.audioFollow, false);
});

// Lever placement — one registration serves both Given and When (Cucumber keywords alias).
Given(/^the Mix\/Wipe lever is at the (A|B|centre) position$/, function (this: MixerWorld, label: string) {
  this.dispatch({ type: 'SET_LEVER', position: leverOf(label) });
});
When(/^the Mix\/Wipe lever moves from the A position to the B position$/, function (this: MixerWorld) {
  this.dispatch({ type: 'SET_LEVER', position: 1 });
});

Then(/^the (A|B)-bus audio level stays at its fader setting$/, function (this: MixerWorld, bus: string) {
  const s = this.snapshot();
  const g = effectiveBusGains(s);
  if (busId(bus) === 'A') assert.equal(g.a, faderGain(s.audio.faders.a));
  else assert.equal(g.b, faderGain(s.audio.faders.b));
});
Then(/^the (A|B)-bus audio is at full level$/, function (this: MixerWorld, bus: string) {
  const g = effectiveBusGains(this.snapshot());
  assert.ok(Math.abs((busId(bus) === 'A' ? g.a : g.b) - 1) < EPS);
});
Then(/^the (A|B)-bus audio is silent$/, function (this: MixerWorld, bus: string) {
  const g = effectiveBusGains(this.snapshot());
  assert.ok(Math.abs(busId(bus) === 'A' ? g.a : g.b) < EPS);
});
Then(/^the (A|B)-bus audio level is (full|silent|both mixed)$/, function (this: MixerWorld, bus: string, level: string) {
  const g = effectiveBusGains(this.snapshot());
  const value = busId(bus) === 'A' ? g.a : g.b;
  if (level === 'full') assert.ok(Math.abs(value - 1) < EPS);
  else if (level === 'silent') assert.ok(Math.abs(value) < EPS);
  else assert.ok(value > 0 && value < 1, 'both mixed');
});
Then(/^the (A|B)-bus audio returns to its own fader setting$/, function (this: MixerWorld, bus: string) {
  const s = this.snapshot();
  const g = effectiveBusGains(s);
  if (busId(bus) === 'A') assert.equal(g.a, faderGain(s.audio.faders.a));
  else assert.equal(g.b, faderGain(s.audio.faders.b));
});

When(/^the lever sweeps smoothly toward the B position$/, function (this: MixerWorld) {
  this.sweepGains = [0, 0.25, 0.5, 0.75, 1].map((lever) => {
    this.dispatch({ type: 'SET_LEVER', position: lever });
    return effectiveBusGains(this.snapshot());
  });
});
Then('the A-bus audio level falls continuously toward silence', function (this: MixerWorld) {
  for (let i = 1; i < this.sweepGains.length; i++) {
    assert.ok(this.sweepGains[i]!.a < this.sweepGains[i - 1]!.a, `A falls at ${i}`);
  }
  assert.ok(Math.abs(this.sweepGains[this.sweepGains.length - 1]!.a) < EPS);
});
Then('the B-bus audio level rises continuously toward full', function (this: MixerWorld) {
  for (let i = 1; i < this.sweepGains.length; i++) {
    assert.ok(this.sweepGains[i]!.b > this.sweepGains[i - 1]!.b, `B rises at ${i}`);
  }
  assert.ok(Math.abs(this.sweepGains[this.sweepGains.length - 1]!.b - 1) < EPS);
});
Then('at every intermediate lever position both buses contribute in proportion to the lever', function (this: MixerWorld) {
  for (let i = 1; i < this.sweepGains.length - 1; i++) {
    const g = this.sweepGains[i]!;
    assert.ok(g.a > 0 && g.a < 1 && g.b > 0 && g.b < 1, `interior sample ${i}`);
  }
});

Then(/^the Aux 1 audio level stays at its own fader setting throughout$/, function (this: MixerWorld) {
  const s = this.snapshot();
  assert.equal(programAudioMix(s).gains.aux1, faderGain(s.audio.faders.aux1));
});
Then(/^the Mic\/Aux 2 audio level stays at its own fader setting throughout$/, function (this: MixerWorld) {
  const s = this.snapshot();
  assert.equal(programAudioMix(s).gains.aux2mic, faderGain(s.audio.faders.micAux2));
});
Then(/^the Aux and Mic sources remain constant across the whole transition$/, function () {
  assert.ok(AUDIO_FOLLOW_EXCLUDED.includes('aux1') && AUDIO_FOLLOW_EXCLUDED.includes('aux2mic'));
});
Then('subsequent lever movement no longer changes the bus audio levels', function (this: MixerWorld) {
  const before = effectiveBusGains(this.snapshot());
  this.dispatch({ type: 'SET_LEVER', position: 0 });
  const after = effectiveBusGains(this.snapshot());
  assert.equal(after.a, before.a);
  assert.equal(after.b, before.b);
});
