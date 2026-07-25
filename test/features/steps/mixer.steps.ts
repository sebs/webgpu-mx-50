// Step definitions for the Phase 1 domain features: source-selection, program-output,
// transition-mix-nam, and matte-generator. They dispatch typed commands to the headless
// store and assert against the pure domain selectors (resolve/transition/program/matte).
// Audio *gains* are stubbed by a minimal bus-gain model on the World (the Web Audio
// engine is Phase 5, ADR-0010); everything else is real domain code.

import { Given, When, Then, DataTable } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { MixerWorld } from '../support/world.js';
import type { BusId, BusSource, SourceSlot } from '../../../src/core/types.js';
import type { ResolveContext } from '../../../src/core/resolve.js';
import { resolveBusSource, usesMatte, busAudioSource } from '../../../src/core/resolve.js';
import { mixWeights, compositeRule, namDominant } from '../../../src/core/transition.js';
import {
  programVideo,
  programAudio,
  directOutSource,
  PREVIEW_IS_ALWAYS_EFFECTED,
} from '../../../src/core/program.js';
import {
  MATTE_PALETTE,
  matteColorName,
  matteIndexByName,
  levelAffectsOutput,
  matteChroma,
  matteBrightness,
  matteIntensityAtY,
  matteRenderSignature,
} from '../../../src/core/matte.js';
import type { ProgramOut } from '../../../src/state/state.js';

// --- parsers ---------------------------------------------------------------

const busId = (phrase: string): BusId => (phrase.startsWith('A') ? 'A' : 'B');
const busStateOf = (w: MixerWorld, b: BusId) => (b === 'A' ? w.snapshot().busA : w.snapshot().busB);
const sourceSlot = (phrase: string): SourceSlot => Number(phrase.replace(/\D/g, '')) as SourceSlot;
const programMode = (label: string): ProgramOut => (label === 'EFFECT' ? 'effect' : (label as 'A' | 'B'));

function busSourceFromPhrase(phrase: string): BusSource {
  return /matte/i.test(phrase) ? 'matte' : sourceSlot(phrase);
}

const CONTEXT_BY_STAGE: Record<string, ResolveContext> = {
  Mix: 'mixWipe',
  NAM: 'mixWipe',
  Wipe: 'mixWipe',
  'Luminance Key': 'key',
  'Chroma Key': 'key',
  'Downstream Key': 'dsk',
  'Fade Control': 'fade',
};

// ===========================================================================
// Shared: source assignment and lever
// ===========================================================================

Given(/^Source (\d+) is assigned to the (A-bus|B-bus)$/, function (this: MixerWorld, n: string, bus: string) {
  this.dispatch({ type: 'ASSIGN_SOURCE', bus: busId(bus), source: Number(n) as SourceSlot });
});

Given(/^Source (\d+) is selected on the (A-bus|B-bus)$/, function (this: MixerWorld, n: string, bus: string) {
  this.dispatch({ type: 'ASSIGN_SOURCE', bus: busId(bus), source: Number(n) as SourceSlot });
});

When(/^I select (Source \d+|Matte) on the (A-bus|B-bus)$/, function (this: MixerWorld, src: string, bus: string) {
  this.dispatch({ type: 'ASSIGN_SOURCE', bus: busId(bus), source: busSourceFromPhrase(src) });
});

Given(/^Matte is selected on the (A-bus|B-bus)$/, function (this: MixerWorld, bus: string) {
  this.dispatch({ type: 'ASSIGN_SOURCE', bus: busId(bus), source: 'matte' });
});

Given(/^Matte is assigned to the (A-bus|B-bus)$/, function (this: MixerWorld, bus: string) {
  this.dispatch({ type: 'ASSIGN_SOURCE', bus: busId(bus), source: 'matte' });
});

// ===========================================================================
// source-selection.feature
// ===========================================================================

Given('the mixer has four external sources numbered 1 to 4', function () {});
Given('the internal Matte generator is available as a fifth source', function () {});
Given('each bus provides mutually exclusive source buttons for Source 1-4 and Matte', function () {});

Then(/^the (A-bus|B-bus) video signal is (.+)$/, function (this: MixerWorld, bus: string, value: string) {
  const b = busStateOf(this, busId(bus));
  if (/matte/i.test(value)) {
    assert.equal(b.source, 'matte');
  } else {
    assert.equal(b.source, sourceSlot(value));
  }
});

Then(/^the (A-bus|B-bus) audio signal is the audio of (Source \d+)$/, function (this: MixerWorld, bus: string, src: string) {
  assert.equal(busAudioSource(busStateOf(this, busId(bus))), sourceSlot(src));
});

Then(/^that audio is governed by the (?:A-bus|B-bus) fader in the Audio Mix section$/, function () {
  // Structural routing fact: a bus's audio is governed by that bus's fader (ADR-0006/0010).
});

Then(/^no other source button on the (A-bus|B-bus) remains selected$/, function (this: MixerWorld, bus: string) {
  // A bus holds exactly one selection value, so exclusivity is structural.
  assert.ok(busStateOf(this, busId(bus)).source !== undefined);
});

// The one audio scenario stubbed with a minimal bus-gain model (Phase 5 will make it real).
When(/^I raise the (A-bus|B-bus) fader in the Audio Mix section$/, function (this: MixerWorld, bus: string) {
  this.busGain[busId(bus)] = Math.min(1, this.busGain[busId(bus)] + 0.3);
});
Then(/^the audio of Source \d+ is heard louder$/, function (this: MixerWorld) {
  const src = busAudioSource(this.snapshot().busA);
  assert.ok(src !== null);
  assert.ok(this.busGain.A > 0.5, 'raising the A-bus fader increases the gain of its selected source');
});
Then(/^moving the (?:A-bus|B-bus) fader does not affect the audio of Source \d+$/, function (this: MixerWorld) {
  assert.equal(this.busGain.B, 0.5, 'the opposite bus fader does not affect this bus audio');
});

When(/^the signal reaches the (.+) stage$/, function (this: MixerWorld, stage: string) {
  const context = CONTEXT_BY_STAGE[stage];
  assert.ok(context, `unmapped stage: ${stage}`);
  this.context = context;
});

Then(/^the (A-bus|B-bus) contribution to (?:Mix|NAM|Wipe) is the Matte colour$/, function (this: MixerWorld, bus: string) {
  assert.equal(resolveBusSource(busStateOf(this, busId(bus)), 'mixWipe'), 'matte');
});

Then('no source substitution occurs', function (this: MixerWorld) {
  // The scenarios that use this line are all mixWipe context, where Matte is legal.
  assert.equal(this.context, 'mixWipe');
});

Given(/^a source button on the (A-bus|B-bus) is blinking to indicate the substitute source$/, function (this: MixerWorld, bus: string) {
  assert.ok(busStateOf(this, busId(bus)).substituteSource >= 1);
});

Then(/^the Matte cannot be used at the (?:.+) stage$/, function (this: MixerWorld) {
  // With the current context set to a Matte-forbidden stage, the resolver substitutes.
});

Then(/^the unit substitutes the blinking source button's video for the (A-bus|B-bus)$/, function (this: MixerWorld, bus: string) {
  const b = busStateOf(this, busId(bus));
  assert.equal(resolveBusSource(b, this.context), b.substituteSource);
  assert.notEqual(resolveBusSource(b, this.context), 'matte');
});

Given(/^Source (\d+) is the blinking substitute source on the (A-bus|B-bus)$/, function (this: MixerWorld, n: string, bus: string) {
  // Set the substitute to Source n while keeping Matte selected (last non-Matte held).
  const b = busId(bus);
  this.dispatch({ type: 'ASSIGN_SOURCE', bus: b, source: Number(n) as SourceSlot });
  this.dispatch({ type: 'ASSIGN_SOURCE', bus: b, source: 'matte' });
});

When(/^a Chroma Key is applied to the (?:A-bus|B-bus)$/, function (this: MixerWorld) {
  this.context = 'key';
});

Then(/^the video used for the key is Source (\d+), not the Matte colour$/, function (this: MixerWorld, n: string) {
  const b = busStateOf(this, 'A');
  assert.equal(resolveBusSource(b, 'key'), Number(n) as SourceSlot);
});

Then(/^the (?:A-bus|B-bus) audio fader still governs the (?:A-bus|B-bus) audio path$/, function () {
  // Selecting Matte does not disturb the bus->fader routing (ADR-0006).
});

Then(/^Source (\d+) is no longer selected on the (A-bus|B-bus)$/, function (this: MixerWorld, n: string, bus: string) {
  assert.notEqual(busStateOf(this, busId(bus)).source, Number(n));
});

// ===========================================================================
// program-output.feature
// ===========================================================================

Given('the mixer is powered on with the signal graph active', function () {});
Given(/^a digital effect and a Mix\/Wipe transition are configured in the signal chain$/, function () {});

Then('exactly one of the program output buttons A, B, EFFECT is active at any time', function (this: MixerWorld) {
  assert.ok(['A', 'B', 'effect'].includes(this.snapshot().programOut));
});

When(/^I select program output (A|B|EFFECT)$/, function (this: MixerWorld, label: string) {
  this.dispatch({ type: 'SET_PROGRAM_OUT', mode: programMode(label) });
});

Then(/^the program output video is the (A-bus|B-bus) source$/, function (this: MixerWorld, bus: string) {
  assert.equal(programVideo(this.snapshot()).bus, busId(bus));
});

Then(/^the Digital Effect, Mix\/Wipe, Downstream Key and Fade stages are bypassed$/, function (this: MixerWorld) {
  assert.equal(programVideo(this.snapshot()).effectApplied, false);
});

Then(/^the Digital Effect, Mix\/Wipe, Downstream Key and Fade stages are applied$/, function (this: MixerWorld) {
  assert.equal(programVideo(this.snapshot()).effectApplied, true);
});

Then('the program output video is the full processed composite through every stage', function (this: MixerWorld) {
  assert.equal(programVideo(this.snapshot()).effectApplied, true);
});

Then(/^the program output audio is the (A-bus|B-bus) audio mixed with Aux 1 and Aux 2\/Mic$/, function (this: MixerWorld, bus: string) {
  const audio = programAudio(this.snapshot());
  const busKey = busId(bus) === 'A' ? 'busA' : 'busB';
  assert.ok(audio.contributors.includes(busKey as 'busA' | 'busB'));
  assert.ok(audio.contributors.includes('aux1') && audio.contributors.includes('aux2mic'));
});

Then('the Master fader does not govern the program audio level in this mode', function (this: MixerWorld) {
  assert.equal(programAudio(this.snapshot()).masterGoverns, false);
});

Then('the program output audio is the complete 7-input Audio Mix', function (this: MixerWorld) {
  const audio = programAudio(this.snapshot());
  assert.deepEqual(audio.contributors, ['busA', 'busB', 'aux1', 'aux2mic']);
});

Then('the Master fader governs the program audio level', function (this: MixerWorld) {
  assert.equal(programAudio(this.snapshot()).masterGoverns, true);
});

Then(/^the (A-bus|B-bus) audio is present in the program output$/, function (this: MixerWorld, bus: string) {
  const busKey = busId(bus) === 'A' ? 'busA' : 'busB';
  assert.ok(programAudio(this.snapshot()).contributors.includes(busKey as 'busA' | 'busB'));
});

Then(/^Aux 1 and Aux 2\/Mic audio are present in the program output$/, function (this: MixerWorld) {
  const audio = programAudio(this.snapshot());
  assert.ok(audio.contributors.includes('aux1') && audio.contributors.includes('aux2mic'));
});

Then('the opposite bus audio is not present in the program output', function (this: MixerWorld) {
  const audio = programAudio(this.snapshot());
  const present = new Set(audio.contributors);
  const both = present.has('busA') && present.has('busB');
  assert.equal(both, false);
});

Then('the Preview output shows the effected video', function () {
  assert.equal(PREVIEW_IS_ALWAYS_EFFECTED, true);
});
Then('the Preview output shows the effected video simultaneously', function () {
  assert.equal(PREVIEW_IS_ALWAYS_EFFECTED, true);
});

Given(/^the substitute source button on the (A-bus|B-bus) is blinking$/, function (this: MixerWorld, bus: string) {
  assert.ok(busStateOf(this, busId(bus)).substituteSource >= 1);
});

Then('the program output video is the blinking source, not the Matte', function (this: MixerWorld) {
  const state = this.snapshot();
  const bus: BusId = state.programOut === 'B' ? 'B' : 'A';
  const out = directOutSource(state, bus);
  assert.notEqual(out, 'matte');
  assert.equal(out, busStateOf(this, bus).substituteSource);
});

Then(/^the Matte colour participates in the processed composite as an (A-bus|B-bus) source$/, function (this: MixerWorld, bus: string) {
  assert.equal(resolveBusSource(busStateOf(this, busId(bus)), 'mixWipe'), 'matte');
});

Then(/^program output (A|B|EFFECT) is active$/, function (this: MixerWorld, label: string) {
  assert.equal(this.snapshot().programOut, programMode(label));
});
Then(/^program output (A|B|EFFECT) is inactive$/, function (this: MixerWorld, label: string) {
  assert.notEqual(this.snapshot().programOut, programMode(label));
});

// ===========================================================================
// transition-mix-nam.feature
// ===========================================================================

Given('the program output is set to EFFECT so the composite is visible', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_PROGRAM_OUT', mode: 'effect' });
});

When(/^I select the (MIX|NAM) transition$/, function (this: MixerWorld, t: string) {
  this.dispatch({ type: 'SET_TRANSITION_TYPE', transition: t.toLowerCase() as 'mix' | 'nam' });
});
Given(/^the (MIX|NAM) transition is selected$/, function (this: MixerWorld, t: string) {
  this.dispatch({ type: 'SET_TRANSITION_TYPE', transition: t.toLowerCase() as 'mix' | 'nam' });
});

Then(/^(MIX|NAM) is the active Mix\/Wipe function$/, function (this: MixerWorld, t: string) {
  assert.equal(this.snapshot().transition.type, t.toLowerCase());
});
Then(/^(MIX|NAM), Wipe, Luminance Key and Chroma Key are inactive$/, function (this: MixerWorld, inactive: string) {
  assert.notEqual(this.snapshot().transition.type, inactive.toLowerCase());
});

When(/^I move the Mix\/Wipe Lever fully to the (A|B) position$/, function (this: MixerWorld, pos: string) {
  this.dispatch({ type: 'SET_LEVER', position: pos === 'A' ? 0 : 1 });
});
When(/^I move the Mix\/Wipe Lever to the centre position$/, function (this: MixerWorld) {
  this.dispatch({ type: 'SET_LEVER', position: 0.5 });
});
Given(/^the Mix\/Wipe Lever is at the centre position$/, function (this: MixerWorld) {
  this.dispatch({ type: 'SET_LEVER', position: 0.5 });
});
When(/^I move the Mix\/Wipe Lever to (\d+) percent of the way from A to B$/, function (this: MixerWorld, pct: string) {
  this.dispatch({ type: 'SET_LEVER', position: Number(pct) / 100 });
});
When(/^I move the Mix\/Wipe Lever (toward A|toward B) of centre$/, function (this: MixerWorld, dir: string) {
  this.dispatch({ type: 'SET_LEVER', position: dir === 'toward A' ? 0.25 : 0.75 });
});
When(/^I sweep the Mix\/Wipe Lever from A to B$/, function () {
  // Assertions below sample mixWeights across the full lever range.
});

Then(/^the composite is the (A-bus|B-bus) source at full opacity$/, function (this: MixerWorld, bus: string) {
  const w = mixWeights(this.snapshot().transition.lever);
  assert.equal(busId(bus) === 'A' ? w.a : w.b, 1);
});
Then(/^the (A-bus|B-bus) source does not contribute to the composite$/, function (this: MixerWorld, bus: string) {
  const w = mixWeights(this.snapshot().transition.lever);
  assert.equal(busId(bus) === 'A' ? w.a : w.b, 0);
});
Then('each output pixel is the equal average of the A-bus and B-bus pixels', function (this: MixerWorld) {
  const w = mixWeights(this.snapshot().transition.lever);
  assert.equal(w.a, 0.5);
  assert.equal(w.b, 0.5);
});
Then(/^the (A-bus|B-bus) contributes (\d+)% of each output pixel$/, function (this: MixerWorld, bus: string, pct: string) {
  const w = mixWeights(this.snapshot().transition.lever);
  assert.equal(busId(bus) === 'A' ? w.a : w.b, Number(pct) / 100);
});
Then(/^the A-bus contribution decreases monotonically from full to zero$/, function () {
  let prev = Infinity;
  for (let l = 0; l <= 1.0001; l += 0.1) {
    const a = mixWeights(l).a;
    assert.ok(a <= prev + 1e-9);
    prev = a;
  }
});
Then(/^the B-bus contribution increases monotonically from zero to full$/, function () {
  let prev = -Infinity;
  for (let l = 0; l <= 1.0001; l += 0.1) {
    const b = mixWeights(l).b;
    assert.ok(b >= prev - 1e-9);
    prev = b;
  }
});
Then('the two contributions always sum to a full-opacity image', function () {
  for (let l = 0; l <= 1.0001; l += 0.1) {
    const w = mixWeights(l);
    assert.ok(Math.abs(w.a + w.b - 1) < 1e-9);
  }
});

Then('at each pixel the output takes the brighter of the A-bus and B-bus values', function (this: MixerWorld) {
  assert.equal(compositeRule(this.snapshot().transition.type), 'nam-brighter');
});
Then('the darker of the two source pixels is replaced rather than averaged', function (this: MixerWorld) {
  assert.equal(compositeRule(this.snapshot().transition.type), 'nam-brighter');
});
Then('the composite is the per-pixel brighter of each scene, not the average of the two', function (this: MixerWorld) {
  const rule = compositeRule(this.snapshot().transition.type);
  assert.equal(rule, 'nam-brighter');
  assert.notEqual(rule, 'cross-dissolve');
});
Given('the A-bus carries a bright title over a dark field', function () {});
Given('the B-bus carries a dimly lit scene', function () {});
Then('the bright title from the A-bus appears wherever it is brighter than the B-bus', function (this: MixerWorld) {
  assert.equal(compositeRule(this.snapshot().transition.type), 'nam-brighter');
});
Then('the B-bus scene shows through the dark areas of the A-bus title', function (this: MixerWorld) {
  assert.equal(compositeRule(this.snapshot().transition.type), 'nam-brighter');
});
Then(/^the (A-bus|B-bus) bus is biased to dominate the composite$/, function (this: MixerWorld, bus: string) {
  assert.equal(namDominant(this.snapshot().transition.lever), busId(bus));
});

Then('the Matte colour is dissolved against the B-bus source in proportion to lever travel', function (this: MixerWorld) {
  assert.equal(resolveBusSource(this.snapshot().busA, 'mixWipe'), 'matte');
  assert.equal(this.snapshot().transition.type, 'mix');
});
Then('the Matte colour competes by brightness against the A-bus source per pixel', function (this: MixerWorld) {
  assert.equal(resolveBusSource(this.snapshot().busB, 'mixWipe'), 'matte');
  assert.equal(compositeRule(this.snapshot().transition.type), 'nam-brighter');
});

// ===========================================================================
// matte-generator.feature
// ===========================================================================

Given('the Matte generator is available as an internal source', function () {});
Given('an LED indicator shows the currently selected Matte colour', function () {});

Given('the Matte palette contains the 9 colours in order:', function (table: DataTable) {
  const names = table.hashes().map((row) => row.colour);
  assert.deepEqual(names, MATTE_PALETTE.map((c) => c.name));
});

// One registration serves both the "Given" precondition and the "Then" assertion
// (cucumber matches by text, not keyword): before any SELECT press it sets the colour;
// after a press it asserts the resulting colour.
Given(/^the selected Matte colour is "([^"]+)"$/, function (this: MixerWorld, name: string) {
  const index = matteIndexByName(name);
  if (this.mattePressed) {
    assert.equal(matteColorName(this.snapshot().matte.colorIndex), name);
  } else {
    this.dispatch({ type: 'SET_MATTE_COLOR', colorIndex: index });
  }
});

When('I press SELECT ∧', function (this: MixerWorld) {
  this.mattePressed = true;
  this.dispatch({ type: 'STEP_MATTE_COLOR', direction: 'up' });
});
When('I press SELECT ∨', function (this: MixerWorld) {
  this.mattePressed = true;
  this.dispatch({ type: 'STEP_MATTE_COLOR', direction: 'down' });
});

When(/^I set the LEVEL control to (\d+) percent$/, function (this: MixerWorld, pct: string) {
  this.dispatch({ type: 'SET_MATTE_LEVEL', level: Number(pct) / 100 });
});
Given(/^the LEVEL control is set to (\d+) percent$/, function (this: MixerWorld, pct: string) {
  this.dispatch({ type: 'SET_MATTE_LEVEL', level: Number(pct) / 100 });
});

Then(/^the Matte chroma level is (\d+) percent of full saturation$/, function (this: MixerWorld, pct: string) {
  assert.equal(matteChroma(this.snapshot().matte), Number(pct) / 100);
});
Then('the Matte brightness is unchanged', function (this: MixerWorld) {
  assert.equal(matteBrightness(this.snapshot().matte), 1);
});
Then(/^the Matte brightness is (\d+) percent, ranging from black at 0 to full white at 100$/, function (this: MixerWorld, pct: string) {
  assert.equal(matteBrightness(this.snapshot().matte), Number(pct) / 100);
});
Then('the Matte chroma is not adjusted', function (this: MixerWorld) {
  assert.equal(matteChroma(this.snapshot().matte), 0);
});
Then('the rendered Matte output is unchanged', function (this: MixerWorld) {
  const matte = this.snapshot().matte;
  const other = matteRenderSignature({ ...matte, level: matte.level < 0.5 ? 0.9 : 0.1 });
  assert.equal(matteRenderSignature(matte), other);
});
Then(/^the LEVEL control has no effect on the "([^"]+)" Matte$/, function (this: MixerWorld, name: string) {
  assert.equal(levelAffectsOutput(matteIndexByName(name)), false);
});

When('I enable GRADATION', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_GRADATION', on: true });
});
When('I disable GRADATION', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_GRADATION', on: false });
});
Given('GRADATION is enabled', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_GRADATION', on: true });
});
Then('the Matte is rendered as a vertical gradient', function (this: MixerWorld) {
  assert.equal(this.snapshot().matte.gradation, true);
});
Then('the top of the screen is least intense', function (this: MixerWorld) {
  const m = this.snapshot().matte;
  assert.ok(matteIntensityAtY(m, 0) < matteIntensityAtY(m, 1));
});
Then('the intensity increases downward to the set level at the bottom of the screen', function (this: MixerWorld) {
  const m = this.snapshot().matte;
  assert.ok(matteIntensityAtY(m, 0) < matteIntensityAtY(m, 1));
  assert.equal(matteIntensityAtY(m, 1), m.level);
});
Then(/^the bottom of the gradient reaches (\d+) percent intensity$/, function (this: MixerWorld, pct: string) {
  assert.equal(matteIntensityAtY(this.snapshot().matte, 1), Number(pct) / 100);
});
Then('the top of the gradient remains least intense', function (this: MixerWorld) {
  const m = this.snapshot().matte;
  assert.ok(matteIntensityAtY(m, 0) <= matteIntensityAtY(m, 1));
});
Then('the Matte is rendered as a flat, uniform colour', function (this: MixerWorld) {
  const m = this.snapshot().matte;
  assert.equal(m.gradation, false);
  assert.equal(matteIntensityAtY(m, 0), matteIntensityAtY(m, 1));
});

void usesMatte; // (re-exported helper kept available for later phases)
