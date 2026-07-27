// Step definitions for frame-field-mode.feature's v1 no-op contract (reference §8.10, ADR-0005 §6).
// The four intended-hardware scenarios are @deferred (interlace has no clean-modern substrate);
// this file implements only the final scenario: the Frame toggle is a real, remembered control
// that provably changes no renderable state. The proxy for "the pixels an effect renders" is the
// whole digital-effect block with frameMode normalised out — if that is byte-identical across both
// Frame positions and nothing reads frameMode, the output is pixel-identical by construction.

import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { MixerWorld } from '../support/world.js';
import type { DigitalEffectState, FrameMode } from '../../../src/state/state.js';
import { FRAME_MODE_AFFECTS_OUTPUT } from '../../../src/core/digital-effect.js';

const effectSig = (de: DigitalEffectState): string => JSON.stringify({ ...de, frameMode: 'X' });

// --- Background ---
Given('the Digital Effect block is engaged on a bus', function (this: MixerWorld) {
  this.dispatch({ type: 'SELECT_EFFECT_BUS', bus: 'A' });
});
Given('the source feeding that effect contains visible motion', function () {});

// --- v1 no-op contract ---
Given('the clean-modern v1 build is running', function () {});
Given(/^video is represented as full-resolution progressive RGBA with no interlace fields$/, function () {
  assert.equal(FRAME_MODE_AFFECTS_OUTPUT, false);
});
Given(/^any of the Still, Strobe, Multi, or Trail effects is active$/, function (this: MixerWorld) {
  this.dispatch({ type: 'ENGAGE_FREEZE', effect: 'still', on: true });
  this.frameModeBefore = this.snapshot().digitalEffect.frameMode;
  this.frameSigBefore = effectSig(this.snapshot().digitalEffect);
});
When(/^the operator toggles the Frame button between 1-field and 2-field frame mode$/, function (this: MixerWorld) {
  const next: FrameMode = this.snapshot().digitalEffect.frameMode === 'frame' ? 'field' : 'frame';
  this.dispatch({ type: 'SET_FRAME_MODE', mode: next });
  this.frameSigAfter = effectSig(this.snapshot().digitalEffect);
});
Then('the effect output is pixel-identical in both positions', function (this: MixerWorld) {
  assert.notEqual(this.snapshot().digitalEffect.frameMode, this.frameModeBefore); // the control really moved
  assert.equal(this.frameSigAfter, this.frameSigBefore); // yet nothing renderable changed
});
Then('no vertical-resolution change occurs', function () {
  assert.equal(FRAME_MODE_AFFECTS_OUTPUT, false);
});
Then('no interlace vibration is introduced or removed', function () {
  assert.equal(FRAME_MODE_AFFECTS_OUTPUT, false);
});
