// Step definitions for the A/V Synchro feature (§8.9): audio-gated digital effects. The
// audio envelope is a runtime value carried on the World (0..1); the reducer holds only the
// armed flag, LEVEL threshold, and selected effects. Assertions run against the pure gate
// in core/av-synchro.ts. The Trail-refusal Then reuses freeze.steps (do not re-register).

import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { MixerWorld } from '../support/world.js';
import type { AvSynchroEffect, DigitalEffectState } from '../../../src/state/state.js';
import type { SourceSlot } from '../../../src/core/types.js';
import {
  AV_SYNCHRO_EFFECTS,
  avSynchroTriggered,
  avSynchroEffectApplied,
  avSynchroHold,
  avSynchroIntervalSeconds,
  avSynchroPulseTrain,
  ENVELOPE_SILENT,
  ENVELOPE_QUIET,
  ENVELOPE_MODERATE,
  ENVELOPE_LOUD,
  LEVEL_TOWARD_MAX,
  LEVEL_TOWARD_MIN,
} from '../../../src/core/av-synchro.js';

const de = (w: MixerWorld): DigitalEffectState => w.snapshot().digitalEffect;
const fx = (name: string): AvSynchroEffect => name.toLowerCase() as AvSynchroEffect;
const belowThreshold = (w: MixerWorld): number => Math.max(0, de(w).avSynchroLevel - 0.1);
const applied = (w: MixerWorld, effect: AvSynchroEffect): boolean =>
  avSynchroEffectApplied(de(w), effect, w.avEnvelope);

/** Split "Nega, Mosaic, and Paint" / "Nega and Strobe" / "Nega" into effect names. */
function parseEffects(list: string): AvSynchroEffect[] {
  return list
    .split(/,\s*and\s+|,\s*|\s+and\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(fx);
}

// ===========================================================================
// Background
// ===========================================================================

Given('the mixer is running with a moving source on the A-bus', function (this: MixerWorld) {
  this.dispatch({ type: 'ASSIGN_SOURCE', bus: 'A', source: 1 as SourceSlot });
});
Given('audio is being fed to the mixer', function () {});

// ===========================================================================
// Arming + selection + LEVEL
// ===========================================================================

Given(/^A\/V Synchro is armed with the (.+?) effects? selected(?: together)?$/, function (this: MixerWorld, list: string) {
  const effects = parseEffects(list);
  this.dispatch({ type: 'ATTEMPT_AV_SYNCHRO', on: true });
  for (const e of effects) this.dispatch({ type: 'SET_AV_SYNCHRO_EFFECT', effect: e, on: true });
  this.avSelected = effects;
  this.avLastEffect = effects[effects.length - 1] ?? '';
});

Given(/^the LEVEL control is set toward (MAX|MIN)$/, function (this: MixerWorld, setting: string) {
  this.dispatch({ type: 'SET_AV_SYNCHRO_LEVEL', level: setting === 'MAX' ? LEVEL_TOWARD_MAX : LEVEL_TOWARD_MIN });
});

// ===========================================================================
// Audio envelope (runtime signal on the World)
// ===========================================================================

When('the audio stays below the trigger threshold', function (this: MixerWorld) {
  this.avEnvelope = belowThreshold(this);
});
When('the audio rises above the trigger threshold', function (this: MixerWorld) {
  this.avEnvelope = ENVELOPE_LOUD;
});
Given('the audio has risen above the trigger threshold so the effect is on', function (this: MixerWorld) {
  this.avEnvelope = ENVELOPE_LOUD;
});
When('the audio falls back below the trigger threshold', function (this: MixerWorld) {
  this.avEnvelope = belowThreshold(this);
});
When('the audio stays above the trigger threshold for a sustained note', function (this: MixerWorld) {
  this.avEnvelope = ENVELOPE_LOUD;
});
When(/^the audio delivers a (quiet|loud) sound$/, function (this: MixerWorld, loudness: string) {
  this.avEnvelope = loudness === 'quiet' ? ENVELOPE_QUIET : ENVELOPE_LOUD;
});
When('the audio delivers a steady series of beats crossing the threshold', function (this: MixerWorld) {
  this.avBeats = [ENVELOPE_LOUD, ENVELOPE_SILENT, ENVELOPE_LOUD, ENVELOPE_SILENT];
  this.avEnvelope = ENVELOPE_LOUD;
});
When('the audio delivers only moderate sounds with occasional loud peaks', function (this: MixerWorld) {
  this.avBeats = [ENVELOPE_MODERATE, ENVELOPE_MODERATE, ENVELOPE_LOUD, ENVELOPE_MODERATE];
});
When('the audio delivers a continuous quiet sound above that threshold', function (this: MixerWorld) {
  this.avEnvelope = ENVELOPE_QUIET;
});
When('the audio is silent', function (this: MixerWorld) {
  this.avEnvelope = ENVELOPE_SILENT;
});

// ===========================================================================
// Effect-applied assertions
// ===========================================================================

Then(/^the (Nega|Mosaic|Mono|Paint|Still|Strobe) effect is applied$/, function (this: MixerWorld, name: string) {
  assert.equal(applied(this, fx(name)), true);
});
Then(/^the (Nega|Mosaic|Mono|Paint|Still|Strobe) effect is not applied$/, function (this: MixerWorld, name: string) {
  assert.equal(applied(this, fx(name)), false);
});
Then(/^the (Nega|Mosaic|Mono|Paint|Still|Strobe) effect is released$/, function (this: MixerWorld, name: string) {
  assert.equal(applied(this, fx(name)), false);
});
Then('the effect stays on while the audio remains above the threshold', function (this: MixerWorld) {
  assert.ok(this.avSelected.every((e) => applied(this, e as AvSynchroEffect)));
});
Then('the A-bus shows the untreated picture', function (this: MixerWorld) {
  assert.ok(AV_SYNCHRO_EFFECTS.every((e) => !applied(this, e)));
});
Then('the A-bus returns to the untreated picture', function (this: MixerWorld) {
  assert.ok(AV_SYNCHRO_EFFECTS.every((e) => !applied(this, e)));
});

// ===========================================================================
// Rhythm / pulse train
// ===========================================================================

Then(/^the (?:Nega|Mosaic|Mono|Paint) effect pulses on and off in step with the beats$/, function (this: MixerWorld) {
  const train = avSynchroPulseTrain(de(this).avSynchroLevel, this.avBeats);
  assert.deepEqual(train, [true, false, true, false]);
});
Then('the Nega effect pulses only on the loud peaks', function (this: MixerWorld) {
  const train = avSynchroPulseTrain(de(this).avSynchroLevel, this.avBeats);
  assert.deepEqual(train, [false, false, true, false]);
});
Then('the moderate sounds leave the picture untreated', function (this: MixerWorld) {
  assert.equal(avSynchroTriggered(de(this).avSynchroLevel, ENVELOPE_MODERATE), false);
});
Then('the Nega effect stays applied for the duration of the sound', function (this: MixerWorld) {
  assert.equal(applied(this, 'nega'), true);
});

// ===========================================================================
// Hold time
// ===========================================================================

Then(/^the (Nega|Mosaic|Mono|Paint|Still) effect holds for the full duration the audio stays above threshold$/, function (this: MixerWorld, name: string) {
  assert.equal(avSynchroHold(fx(name)), 'audio-duration');
  assert.equal(applied(this, fx(name)), true);
});
Then('it releases as soon as the audio drops below the threshold', function (this: MixerWorld) {
  assert.equal(avSynchroEffectApplied(de(this), this.avLastEffect as AvSynchroEffect, belowThreshold(this)), false);
});
Then('the Strobe effect is triggered', function (this: MixerWorld) {
  assert.equal(applied(this, 'strobe'), true);
});
Then('its hold time is governed by the Effect Interval Timer', function (this: MixerWorld) {
  assert.equal(avSynchroHold('strobe'), 'effect-interval-timer');
  assert.ok(avSynchroIntervalSeconds(de(this)) > 0);
});
Then('it is not extended by how long the audio stays above threshold', function (this: MixerWorld) {
  assert.notEqual(avSynchroHold('strobe'), 'audio-duration');
});

// ===========================================================================
// Combining effects / silence
// ===========================================================================

Then(/^the (.+?) effects are all applied together$/, function (this: MixerWorld, list: string) {
  for (const e of parseEffects(list)) assert.equal(applied(this, e), true, e);
});
Then('they release together when the audio falls below the threshold', function (this: MixerWorld) {
  const below = belowThreshold(this);
  for (const e of this.avSelected) {
    assert.equal(avSynchroEffectApplied(de(this), e as AvSynchroEffect, below), false, e);
  }
});
Then('no armed effect is applied', function (this: MixerWorld) {
  assert.ok(AV_SYNCHRO_EFFECTS.every((e) => !applied(this, e)));
});

// ===========================================================================
// Trail restriction — the Then reuses freeze.steps' "refused while Trail is active"
// ===========================================================================

Given('the Trail effect is active', function (this: MixerWorld) {
  this.dispatch({ type: 'ENGAGE_FREEZE', effect: 'trail', on: true });
});
When(/^I try to arm A\/V Synchro$/, function (this: MixerWorld) {
  this.dispatch({ type: 'ATTEMPT_AV_SYNCHRO', on: true });
});
