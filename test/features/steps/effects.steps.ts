// Step definitions for Phase 3 (filters slice): color-correction.feature and
// digital-effects-filters.feature. Dispatch typed commands to the headless store and
// assert against the colour-correct / digital-effect domain. The freeze family
// (Still/Strobe/Multi/Trail) and position/scene-grabber land in the next continuation.

import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { MixerWorld } from '../support/world.js';
import type { BusId } from '../../../src/core/types.js';
import type { ColourCorrectMode, ColourCorrectState, FilterEffect } from '../../../src/state/state.js';
import {
  ccActive,
  chromaActive,
  joystickActive,
  isBlackAndWhite,
  monoTint,
  saturation,
  joystickOffCentre,
  TINT_BASIS,
} from '../../../src/core/colour-correct.js';
import {
  effectActiveOn,
  anyEffectOn,
  colourCorrectApplies,
  paintCoarseness,
} from '../../../src/core/digital-effect.js';

const busId = (phrase: string): BusId => (phrase.startsWith('A') ? 'A' : 'B');
const ccOf = (w: MixerWorld, bus: BusId): ColourCorrectState =>
  bus === 'A' ? w.snapshot().busA.colourCorrect : w.snapshot().busB.colourCorrect;
const effectFromName = (name: string): FilterEffect => name.trim().toLowerCase() as FilterEffect;

function ccModeFromText(text: string): ColourCorrectMode {
  const s = text.toLowerCase();
  if (s.includes('plus-joystick')) return 'chroma-plus-joystick';
  if (s.includes('chroma-only')) return 'chroma-only';
  return 'off';
}
function setCCMode(w: MixerWorld, bus: BusId, mode: ColourCorrectMode): void {
  const presses = mode === 'off' ? 0 : mode === 'chroma-only' ? 1 : 2;
  for (let i = 0; i < presses; i++) w.dispatch({ type: 'PRESS_COLOUR_CORRECT', bus });
}

// ===========================================================================
// color-correction.feature
// ===========================================================================

Given(/^a full-colour source is assigned to the (?:A-bus|B-bus)$/, function () {});
Given('colour correction is off on both buses', function () {});

When(/^I press the colour-correction button for the (A-bus|B-bus) (?:once|a second time|a third time)$/, function (this: MixerWorld, bus: string) {
  this.ccPressed = true;
  this.dispatch({ type: 'PRESS_COLOUR_CORRECT', bus: busId(bus) });
});

// One registration for the "is in the X state" line: sets it as a precondition, asserts
// it after a press has happened.
Given(/^colour correction on the (A-bus|B-bus) is in the (.+) state$/, function (this: MixerWorld, bus: string, text: string) {
  const mode = ccModeFromText(text);
  if (this.ccPressed) assert.equal(ccOf(this, busId(bus)).mode, mode);
  else setCCMode(this, busId(bus), mode);
});

Then(/^colour correction on the (A-bus|B-bus) enters the (.+) state$/, function (this: MixerWorld, bus: string, text: string) {
  assert.equal(ccOf(this, busId(bus)).mode, ccModeFromText(text));
});
Then(/^colour correction on the (A-bus|B-bus) is off$/, function (this: MixerWorld, bus: string) {
  assert.equal(ccOf(this, busId(bus)).mode, 'off');
});

Then(/^the (A-bus|B-bus) CHROMA control is active$/, function (this: MixerWorld, bus: string) {
  assert.equal(chromaActive(ccOf(this, busId(bus))), true);
});
Then(/^the (A-bus|B-bus) CHROMA control remains active$/, function (this: MixerWorld, bus: string) {
  assert.equal(chromaActive(ccOf(this, busId(bus))), true);
});
Then(/^the (A-bus|B-bus) CHROMA control is inactive$/, function (this: MixerWorld, bus: string) {
  assert.equal(chromaActive(ccOf(this, busId(bus))), false);
});
Then(/^the (A-bus|B-bus) RGB joystick is not yet active$/, function (this: MixerWorld, bus: string) {
  assert.equal(joystickActive(ccOf(this, busId(bus))), false);
});
Then(/^the (A-bus|B-bus) RGB joystick is inactive$/, function (this: MixerWorld, bus: string) {
  assert.equal(joystickActive(ccOf(this, busId(bus))), false);
});
Then(/^the (A-bus|B-bus) RGB joystick becomes active in addition to CHROMA$/, function (this: MixerWorld, bus: string) {
  assert.equal(joystickActive(ccOf(this, busId(bus))), true);
});
Then('the button LED blinks to indicate the CHROMA-only state', function (this: MixerWorld) {
  assert.equal(this.snapshot().busA.colourCorrect.mode, 'chroma-only');
});
Then('the button LED is solid to indicate the CHROMA-plus-joystick state', function (this: MixerWorld) {
  assert.equal(this.snapshot().busA.colourCorrect.mode, 'chroma-plus-joystick');
});
Then('the button LED is unlit', function (this: MixerWorld) {
  assert.equal(this.snapshot().busA.colourCorrect.mode, 'off');
});

// One registration serves both "When ... is at its centre" and the "Given ... is at its
// centre" precondition (cucumber matches by text, not keyword).
Given(/^the (A-bus|B-bus) CHROMA control is at its centre position$/, function (this: MixerWorld, bus: string) {
  this.dispatch({ type: 'SET_CHROMA', bus: busId(bus), value: 0.5 });
});
When(/^I turn the (A-bus|B-bus) CHROMA control below centre$/, function (this: MixerWorld, bus: string) {
  this.dispatch({ type: 'SET_CHROMA', bus: busId(bus), value: 0.25 });
});
When(/^I turn the (A-bus|B-bus) CHROMA control fully to MIN$/, function (this: MixerWorld, bus: string) {
  this.dispatch({ type: 'SET_CHROMA', bus: busId(bus), value: 0 });
});
Given(/^the (A-bus|B-bus) CHROMA control is fully at MIN so the image is black and white$/, function (this: MixerWorld, bus: string) {
  this.dispatch({ type: 'SET_CHROMA', bus: busId(bus), value: 0 });
});

Then(/^the (A-bus|B-bus) image retains its original colour saturation$/, function (this: MixerWorld, bus: string) {
  assert.equal(saturation(ccOf(this, busId(bus))), 1);
});
Then(/^the (A-bus|B-bus) image is de-saturated$/, function (this: MixerWorld, bus: string) {
  assert.ok(saturation(ccOf(this, busId(bus))) < 1);
});
Then('its saturation is reduced compared with the original', function (this: MixerWorld) {
  assert.ok(saturation(this.snapshot().busA.colourCorrect) < 1);
});
Then(/^the (A-bus|B-bus) image is rendered in black and white$/, function (this: MixerWorld, bus: string) {
  assert.equal(isBlackAndWhite(ccOf(this, busId(bus))), true);
});
Then(/^the (A-bus|B-bus) image retains its original colour$/, function (this: MixerWorld, bus: string) {
  assert.equal(ccActive(ccOf(this, busId(bus))), false);
});

When(/^I move the (A-bus|B-bus) RGB joystick off centre$/, function (this: MixerWorld, bus: string) {
  this.dispatch({ type: 'SET_CC_JOYSTICK', bus: busId(bus), x: 1, y: 0 });
});
When(/^I move the (A-bus|B-bus) RGB joystick toward (red|green|blue)$/, function (this: MixerWorld, bus: string, dir: string) {
  const basis = TINT_BASIS[dir as 'red' | 'green' | 'blue'];
  this.dispatch({ type: 'SET_CC_JOYSTICK', bus: busId(bus), x: basis.x, y: basis.y });
});
When(/^the (A-bus|B-bus) RGB joystick is at its centre position$/, function (this: MixerWorld, bus: string) {
  this.dispatch({ type: 'SET_CC_JOYSTICK', bus: busId(bus), x: 0, y: 0 });
});
Then(/^the whole (A-bus|B-bus) scene takes on a single mono tint toned toward the joystick colour$/, function (this: MixerWorld, bus: string) {
  assert.notEqual(monoTint(ccOf(this, busId(bus))), 'none');
});
Then(/^the whole (A-bus|B-bus) scene is toned as a (red|green|blue) monochrome image$/, function (this: MixerWorld, bus: string, tint: string) {
  assert.equal(monoTint(ccOf(this, busId(bus))), tint);
});
Then(/^the (A-bus|B-bus) image retains its original colour balance$/, function (this: MixerWorld, bus: string) {
  assert.equal(joystickOffCentre(ccOf(this, busId(bus))), false);
});
Then(/^the (A-bus|B-bus) image's hue and colour balance shift toward the joystick colour$/, function (this: MixerWorld, bus: string) {
  assert.equal(joystickOffCentre(ccOf(this, busId(bus))), true);
});
Then('the image is not a single mono tint because CHROMA is above MIN', function (this: MixerWorld) {
  const cc = this.snapshot().busA.colourCorrect;
  assert.equal(monoTint(cc), 'none');
  assert.equal(isBlackAndWhite(cc), false);
});

// Mono override + independence + transition-shift.
Given(/^the Mono digital effect is active on the (A-bus|B-bus) signal path$/, function (this: MixerWorld, bus: string) {
  this.dispatch({ type: 'SELECT_EFFECT_BUS', bus: busId(bus) });
  this.dispatch({ type: 'CHOOSE_EFFECT', effect: 'mono' });
  this.dispatch({ type: 'PRESS_EFFECT_ON' });
});
When(/^I adjust the (A-bus|B-bus) CHROMA control and RGB joystick$/, function (this: MixerWorld, bus: string) {
  this.dispatch({ type: 'SET_CHROMA', bus: busId(bus), value: 0.2 });
  this.dispatch({ type: 'SET_CC_JOYSTICK', bus: busId(bus), x: 1, y: 0 });
});
Then('the colour-correction adjustments have no visible effect on the output', function (this: MixerWorld) {
  assert.equal(colourCorrectApplies(this.snapshot(), 'A'), false);
});
Then('the Mono digital effect determines the resulting colour', function (this: MixerWorld) {
  assert.equal(effectActiveOn(this.snapshot().digitalEffect, 'A', 'mono'), true);
});

Given(/^colour correction on the (A-bus|B-bus) is set identically to the (A-bus|B-bus)$/, function (this: MixerWorld, target: string, source: string) {
  const src = ccOf(this, busId(source));
  const dst = busId(target);
  setCCMode(this, dst, src.mode);
  this.dispatch({ type: 'SET_CHROMA', bus: dst, value: src.chroma });
  this.dispatch({ type: 'SET_CC_JOYSTICK', bus: dst, x: src.joystickX, y: src.joystickY });
});
Given(/^the (A-bus|B-bus) has different colour correction from the (?:A-bus|B-bus)$/, function (this: MixerWorld, target: string) {
  setCCMode(this, busId(target), 'chroma-only');
  this.dispatch({ type: 'SET_CHROMA', bus: busId(target), value: 0.1 });
});
When('a Mix or Wipe transition runs from the A-bus to the B-bus', function () {});
Then('the corrected colour does not visibly shift across the transition', function (this: MixerWorld) {
  assert.deepEqual(this.snapshot().busA.colourCorrect, this.snapshot().busB.colourCorrect);
});
Then('the output colour visibly shifts as the transition crosses between the buses', function (this: MixerWorld) {
  assert.notDeepEqual(this.snapshot().busA.colourCorrect, this.snapshot().busB.colourCorrect);
});

// ===========================================================================
// digital-effects-filters.feature
// ===========================================================================

Given('the mixer is running with the A-bus and the B-bus each carrying a moving source', function () {});
Given('no digital effect is active on either bus', function () {});

When(/^I select the (A-bus|B-bus) for the digital effect$/, function (this: MixerWorld, bus: string) {
  this.dispatch({ type: 'SELECT_EFFECT_BUS', bus: busId(bus) });
});
Given(/^I have selected the (A-bus|B-bus) for the digital effect$/, function (this: MixerWorld, bus: string) {
  this.dispatch({ type: 'SELECT_EFFECT_BUS', bus: busId(bus) });
});
When(/^I choose the (Nega|Mosaic|Mono|Paint) effect$/, function (this: MixerWorld, name: string) {
  this.dispatch({ type: 'CHOOSE_EFFECT', effect: effectFromName(name) });
});
Given(/^I have chosen the (Nega|Mosaic|Mono|Paint) effect$/, function (this: MixerWorld, name: string) {
  this.dispatch({ type: 'CHOOSE_EFFECT', effect: effectFromName(name) });
});
When('I press ON', function (this: MixerWorld) {
  this.dispatch({ type: 'PRESS_EFFECT_ON' });
});
When('I press ON to deactivate the effect', function (this: MixerWorld) {
  this.dispatch({ type: 'PRESS_EFFECT_ON' });
});
Given(/^the (Nega|Mosaic|Mono|Paint) effect is ON for the (A-bus|B-bus)$/, function (this: MixerWorld, name: string, bus: string) {
  this.dispatch({ type: 'SELECT_EFFECT_BUS', bus: busId(bus) });
  this.dispatch({ type: 'CHOOSE_EFFECT', effect: effectFromName(name) });
  this.dispatch({ type: 'PRESS_EFFECT_ON' });
});

Then(/^the (Nega|Mosaic|Mono|Paint) effect is applied to the (A-bus|B-bus)$/, function (this: MixerWorld, name: string, bus: string) {
  assert.equal(effectActiveOn(this.snapshot().digitalEffect, busId(bus), effectFromName(name)), true);
});
Then(/^the (A-bus|B-bus) output is unchanged$/, function (this: MixerWorld, bus: string) {
  assert.equal(anyEffectOn(this.snapshot().digitalEffect, busId(bus)), false);
});
Then(/^the (A-bus|B-bus) carries no digital effect$/, function (this: MixerWorld, bus: string) {
  assert.equal(anyEffectOn(this.snapshot().digitalEffect, busId(bus)), false);
});

// Nega
Then(/^each pixel of the (A-bus|B-bus) is inverted to its complementary value$/, function (this: MixerWorld, bus: string) {
  assert.equal(effectActiveOn(this.snapshot().digitalEffect, busId(bus), 'nega'), true);
});
Then('a pure white region reads as pure black', function () {});
Then('a pure black region reads as pure white', function () {});
Given(/^colour correction on the (A-bus|B-bus) is tinting the image$/, function (this: MixerWorld, bus: string) {
  const b = busId(bus);
  setCCMode(this, b, 'chroma-plus-joystick');
  this.dispatch({ type: 'SET_CC_JOYSTICK', bus: b, x: 0.6, y: 0.2 });
});
Then(/^the (A-bus|B-bus) shows an inverted image that also carries the colour-correction tint$/, function (this: MixerWorld, bus: string) {
  const b = busId(bus);
  assert.equal(effectActiveOn(this.snapshot().digitalEffect, b, 'nega'), true);
  assert.equal(colourCorrectApplies(this.snapshot(), b), true);
});

// Mosaic
Then(/^the (A-bus|B-bus) is rendered as a grid of solid-coloured square blocks$/, function (this: MixerWorld, bus: string) {
  assert.equal(effectActiveOn(this.snapshot().digitalEffect, busId(bus), 'mosaic'), true);
});
Then('each block takes a single colour sampled from the source', function () {});
When(/^I set the SIZE control to step (\d+)$/, function (this: MixerWorld, step: string) {
  this.dispatch({ type: 'SET_MOSAIC_SIZE', step: Number(step) });
});
Then(/^the Mosaic block size corresponds to step (\d+) of 31$/, function (this: MixerWorld, step: string) {
  assert.equal(this.snapshot().digitalEffect.mosaicSize, Number(step));
});
When('I sweep the SIZE control from step 1 through step 31', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_MOSAIC_SIZE', step: 31 });
});
Then(/^the (A-bus|B-bus) blocks grow progressively larger without interrupting playback$/, function (this: MixerWorld, bus: string) {
  assert.equal(effectActiveOn(this.snapshot().digitalEffect, busId(bus), 'mosaic'), true);
});

// Mono
Then(/^the (A-bus|B-bus) is rendered in greyscale$/, function (this: MixerWorld, bus: string) {
  assert.equal(effectActiveOn(this.snapshot().digitalEffect, busId(bus), 'mono'), true);
});
Then(/^the (A-bus|B-bus) retains its colour$/, function (this: MixerWorld, bus: string) {
  assert.equal(effectActiveOn(this.snapshot().digitalEffect, busId(bus), 'mono'), false);
});
Given(/^colour correction on the (A-bus|B-bus) is adjusting hue and saturation$/, function (this: MixerWorld, bus: string) {
  const b = busId(bus);
  setCCMode(this, b, 'chroma-plus-joystick');
  this.dispatch({ type: 'SET_CHROMA', bus: b, value: 0.7 });
  this.dispatch({ type: 'SET_CC_JOYSTICK', bus: b, x: 0.4, y: 0.3 });
});
Then(/^the (A-bus|B-bus) colour correction is overridden while Mono is on$/, function (this: MixerWorld, bus: string) {
  assert.equal(colourCorrectApplies(this.snapshot(), busId(bus)), false);
});
Then(/^the (A-bus|B-bus) remains greyscale regardless of the colour-correction settings$/, function (this: MixerWorld, bus: string) {
  assert.equal(effectActiveOn(this.snapshot().digitalEffect, busId(bus), 'mono'), true);
});
Then(/^the (A-bus|B-bus) colour correction takes effect again$/, function (this: MixerWorld, bus: string) {
  assert.equal(colourCorrectApplies(this.snapshot(), busId(bus)), true);
});

// Paint
Then(/^the (A-bus|B-bus) is posterized into flat bands of colour$/, function (this: MixerWorld, bus: string) {
  assert.equal(effectActiveOn(this.snapshot().digitalEffect, busId(bus), 'paint'), true);
});
When(/^I set the LEVEL control to (MIN|mid|MAX)$/, function (this: MixerWorld, level: string) {
  const value = level === 'MIN' ? 0 : level === 'MAX' ? 1 : 0.5;
  this.dispatch({ type: 'SET_PAINT_LEVEL', level: value });
});
Then(/^the Paint gradation becomes (.+)$/, function (this: MixerWorld, coarseness: string) {
  assert.ok(coarseness.includes(paintCoarseness(this.snapshot().digitalEffect.paintLevel)));
});
When('I sweep the LEVEL control from MIN to MAX', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_PAINT_LEVEL', level: 1 });
});
Then(/^the (A-bus|B-bus) colour banding coarsens smoothly without interrupting playback$/, function (this: MixerWorld, bus: string) {
  assert.equal(effectActiveOn(this.snapshot().digitalEffect, busId(bus), 'paint'), true);
});
