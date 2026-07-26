import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce } from '../../src/state/reducer.js';
import { FACTORY_PRESET } from '../../src/state/state.js';
import type { PanelState } from '../../src/state/state.js';
import { strobeInterval } from '../../src/core/digital-effect.js';
import {
  AV_SYNCHRO_EFFECTS,
  avSynchroEligible,
  avSynchroThreshold,
  avSynchroTriggered,
  avSynchroSelected,
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
} from '../../src/core/av-synchro.js';

const fresh = (): PanelState => structuredClone(FACTORY_PRESET);

/** Arm A/V Synchro and select one or more effects to drive. */
function arm(effects: readonly (typeof AV_SYNCHRO_EFFECTS)[number][]): PanelState {
  let s = reduce(fresh(), { type: 'ATTEMPT_AV_SYNCHRO', on: true });
  for (const e of effects) s = reduce(s, { type: 'SET_AV_SYNCHRO_EFFECT', effect: e, on: true });
  return s;
}

// --- threshold / trigger truth table (§8.9) ---

test('avSynchroThreshold clamps the LEVEL position to 0..1', () => {
  assert.equal(avSynchroThreshold(-1), 0);
  assert.equal(avSynchroThreshold(2), 1);
  assert.equal(avSynchroThreshold(0.4), 0.4);
});

test('LEVEL toward MAX passes only loud audio; toward MIN passes quiet too', () => {
  assert.equal(avSynchroTriggered(LEVEL_TOWARD_MAX, ENVELOPE_QUIET), false);
  assert.equal(avSynchroTriggered(LEVEL_TOWARD_MAX, ENVELOPE_MODERATE), false);
  assert.equal(avSynchroTriggered(LEVEL_TOWARD_MAX, ENVELOPE_LOUD), true);
  assert.equal(avSynchroTriggered(LEVEL_TOWARD_MIN, ENVELOPE_QUIET), true);
  assert.equal(avSynchroTriggered(LEVEL_TOWARD_MIN, ENVELOPE_LOUD), true);
});

test('at the default LEVEL a loud sound triggers but a moderate one does not', () => {
  const level = fresh().digitalEffect.avSynchroLevel; // 0.5
  assert.equal(avSynchroTriggered(level, ENVELOPE_LOUD), true);
  assert.equal(avSynchroTriggered(level, ENVELOPE_MODERATE), false);
  assert.equal(avSynchroTriggered(level, ENVELOPE_SILENT), false);
});

// --- applied gate (armed AND selected AND above threshold) ---

test('an effect applies only when armed, selected, and the audio is above threshold', () => {
  const s = arm(['nega']);
  assert.equal(avSynchroEffectApplied(s.digitalEffect, 'nega', ENVELOPE_LOUD), true);
  assert.equal(avSynchroEffectApplied(s.digitalEffect, 'nega', ENVELOPE_QUIET), false, 'below threshold');
  assert.equal(avSynchroEffectApplied(s.digitalEffect, 'mosaic', ENVELOPE_LOUD), false, 'not selected');
});

test('a selected effect is not applied while A/V Synchro is disarmed', () => {
  let s = arm(['nega']);
  s = reduce(s, { type: 'ATTEMPT_AV_SYNCHRO', on: false }); // disarm, keep selection
  assert.equal(avSynchroSelected(s.digitalEffect, 'nega'), true);
  assert.equal(avSynchroEffectApplied(s.digitalEffect, 'nega', ENVELOPE_LOUD), false);
});

test('silence holds every armed effect off', () => {
  const s = arm(['nega', 'strobe']);
  for (const e of AV_SYNCHRO_EFFECTS) {
    assert.equal(avSynchroEffectApplied(s.digitalEffect, e, ENVELOPE_SILENT), false);
  }
});

test('any combination of eligible effects is driven together', () => {
  const s = arm(['nega', 'mosaic', 'paint']);
  for (const e of ['nega', 'mosaic', 'paint'] as const) {
    assert.equal(avSynchroEffectApplied(s.digitalEffect, e, ENVELOPE_LOUD), true);
    assert.equal(avSynchroEffectApplied(s.digitalEffect, e, ENVELOPE_QUIET), false);
  }
  assert.equal(avSynchroEffectApplied(s.digitalEffect, 'mono', ENVELOPE_LOUD), false, 'unselected stays off');
});

test('every eligible effect can be driven by A/V Synchro', () => {
  for (const e of AV_SYNCHRO_EFFECTS) {
    const s = arm([e]);
    assert.equal(avSynchroEffectApplied(s.digitalEffect, e, ENVELOPE_LOUD), true, e);
  }
});

// --- pulse train / rhythm ---

test('a beat train pulses the effect on and off in step', () => {
  const level = fresh().digitalEffect.avSynchroLevel;
  const beats = [ENVELOPE_LOUD, ENVELOPE_SILENT, ENVELOPE_LOUD, ENVELOPE_SILENT];
  assert.deepEqual(avSynchroPulseTrain(level, beats), [true, false, true, false]);
});

test('toward MAX only the loud peaks in a moderate track pulse the effect', () => {
  const track = [ENVELOPE_MODERATE, ENVELOPE_MODERATE, ENVELOPE_LOUD, ENVELOPE_MODERATE];
  assert.deepEqual(avSynchroPulseTrain(LEVEL_TOWARD_MAX, track), [false, false, true, false]);
});

// --- hold rules ---

test('non-Strobe effects hold for the audio duration; Strobe uses the Effect Interval Timer', () => {
  for (const e of ['nega', 'mosaic', 'mono', 'paint', 'still'] as const) {
    assert.equal(avSynchroHold(e), 'audio-duration', e);
  }
  assert.equal(avSynchroHold('strobe'), 'effect-interval-timer');
});

test('the Strobe A/V-Synchro interval comes from the Effect Interval Timer', () => {
  const s = fresh();
  assert.equal(avSynchroIntervalSeconds(s.digitalEffect), strobeInterval(s.digitalEffect.strobeTime));
});

// --- eligibility + Trail exclusion ---

test('avSynchroEligible admits exactly the six drivable effects', () => {
  for (const e of AV_SYNCHRO_EFFECTS) assert.equal(avSynchroEligible(e), true);
  assert.equal(avSynchroEligible('trail'), false);
  assert.equal(avSynchroEligible('wipe'), false);
});

test('arming A/V Synchro is refused while Trail is active', () => {
  let s = reduce(fresh(), { type: 'ENGAGE_FREEZE', effect: 'trail', on: true });
  s = reduce(s, { type: 'ATTEMPT_AV_SYNCHRO', on: true });
  assert.equal(s.digitalEffect.avSynchro, false);
  assert.equal(s.digitalEffect.freeze.trail, true);
});

// --- reducer cases ---

test('SET_AV_SYNCHRO_LEVEL clamps and no-ops on an unchanged level', () => {
  const s = fresh();
  assert.equal(reduce(s, { type: 'SET_AV_SYNCHRO_LEVEL', level: 2 }).digitalEffect.avSynchroLevel, 1);
  assert.equal(reduce(s, { type: 'SET_AV_SYNCHRO_LEVEL', level: -1 }).digitalEffect.avSynchroLevel, 0);
  assert.equal(reduce(s, { type: 'SET_AV_SYNCHRO_LEVEL', level: s.digitalEffect.avSynchroLevel }), s);
});

test('SET_AV_SYNCHRO_EFFECT toggles one member without touching the armed flag or others', () => {
  const s = fresh();
  const next = reduce(s, { type: 'SET_AV_SYNCHRO_EFFECT', effect: 'nega', on: true });
  assert.equal(next.digitalEffect.avSynchroEffects.nega, true);
  assert.equal(next.digitalEffect.avSynchroEffects.mosaic, false);
  assert.equal(next.digitalEffect.avSynchro, false, 'selecting an effect does not arm');
  assert.equal(reduce(next, { type: 'SET_AV_SYNCHRO_EFFECT', effect: 'nega', on: true }), next, 'no-op');
});
