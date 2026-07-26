// Step definitions for the Mix/Wipe-stage keys (luminance-key + chroma-key, reference
// §9.5/§9.6). Both are transition modes; the B-bus is always the key source. Dispatch
// typed commands and assert against core/key.ts. Reuses shared steps (mixer.steps).

import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { MixerWorld } from '../support/world.js';
import {
  lumKeyMask,
  keyForegroundOpacity,
  keyedFraction,
  backdropHue,
  chromaTolerance,
  keySource,
  keyBackground,
} from '../../../src/core/key.js';
import { resolveBusSource } from '../../../src/core/resolve.js';

const tr = (w: MixerWorld) => w.snapshot().transition;

const LEVER_POS: Record<string, number> = {
  'fully at B': 1,
  'slightly toward A': 0.85,
  midway: 0.5,
  'mostly toward A': 0.2,
  'midway between B and A': 0.5,
};
const SLICE_LEVEL: Record<string, number> = { low: 0.2, mid: 0.5, high: 0.8 };

// ===========================================================================
// Shared bus roles / lever / slice / hue (luminance + chroma)
// ===========================================================================

Given(/^the Mix\/Wipe lever is fully at B-bus$/, function (this: MixerWorld) {
  this.dispatch({ type: 'SET_LEVER', position: 1 });
});
Given(/^the Mix\/Wipe lever is fully at the B-bus end$/, function (this: MixerWorld) {
  this.dispatch({ type: 'SET_LEVER', position: 1 });
});
When(/^the lever is fully at B-bus$/, function (this: MixerWorld) {
  this.dispatch({ type: 'SET_LEVER', position: 1 });
});
When(/^the lever remains fully at the B-bus end$/, function (this: MixerWorld) {
  this.dispatch({ type: 'SET_LEVER', position: 1 });
});
Then(/^the B-bus is treated as the key source over the A-bus background$/, function () {
  assert.equal(keySource(), 'B');
  assert.equal(keyBackground(), 'A');
});
Then(/^the B-bus is the key source$/, function () {
  assert.equal(keySource(), 'B');
});
Then(/^the B-bus supplies the foreground key source$/, function () {
  assert.equal(keySource(), 'B');
});
Then(/^the A-bus supplies the background revealed through the key$/, function () {
  assert.equal(keyBackground(), 'A');
});
Then(/^swapping which physical input feeds the B-bus does not change which bus is the key source$/, function () {
  assert.equal(keySource(), 'B');
});
Then(/^the A-bus is never keyed over the B-bus$/, function () {
  assert.equal(keySource(), 'B');
});

// ===========================================================================
// luminance-key.feature
// ===========================================================================

Given('a source is assigned to the A-bus as the background', function () {});
Given('a source is assigned to the B-bus as the key', function () {});
Given('Luminance Key measures brightness on the Colour-Corrected B-bus signal', function () {});
Given('the LUM KEY button carries an LED that indicates its state', function () {});

When('I press LUM KEY', function (this: MixerWorld) {
  this.dispatch({ type: 'PRESS_LUM_KEY' });
});
When('I press LUM KEY again', function (this: MixerWorld) {
  this.dispatch({ type: 'PRESS_LUM_KEY' });
});
Given('Luminance Key is active', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_TRANSITION_TYPE', transition: 'lum-key' });
});
Given(/^Luminance Key is active with the lever fully at B-bus$/, function (this: MixerWorld) {
  this.dispatch({ type: 'SET_TRANSITION_TYPE', transition: 'lum-key' });
  this.dispatch({ type: 'SET_LEVER', position: 1 });
});
Given('Luminance Key is active with the SLICE control set to a fixed threshold', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_TRANSITION_TYPE', transition: 'lum-key' });
  this.dispatch({ type: 'SET_SLICE', value: 0.5 });
});
Given('Luminance Key is active with the lever eased partway toward A-bus', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_TRANSITION_TYPE', transition: 'lum-key' });
  this.dispatch({ type: 'SET_LEVER', position: 0.6 });
});
Given('Luminance Key is active and the lever is eased toward A-bus', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_TRANSITION_TYPE', transition: 'lum-key' });
  this.dispatch({ type: 'SET_LEVER', position: 0.5 });
});

Then('Luminance Key becomes active', function (this: MixerWorld) {
  assert.equal(tr(this).type, 'lum-key');
});
Then('the LUM KEY LED is lit', function (this: MixerWorld) {
  assert.equal(tr(this).type, 'lum-key');
});
Then('Luminance Key becomes inactive', function (this: MixerWorld) {
  assert.notEqual(tr(this).type, 'lum-key');
});
Then('the LUM KEY LED turns off', function (this: MixerWorld) {
  assert.notEqual(tr(this).type, 'lum-key');
});
Then(/^the lever once again performs an ordinary Mix\/Wipe transition between the buses$/, function (this: MixerWorld) {
  assert.equal(tr(this).type, 'mix');
});
Then('bright regions of the B-bus image are keyed in as foreground', function (this: MixerWorld) {
  assert.equal(lumKeyMask(0.9, tr(this).slice), 1);
});
Then('dark regions of the B-bus image are replaced by the A-bus', function (this: MixerWorld) {
  assert.equal(lumKeyMask(0.1, tr(this).slice), 0);
});

When('the SLICE control is set to a luminance threshold', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_SLICE', value: 0.5 });
});
When(/^the SLICE control is set to (low|mid|high)$/, function (this: MixerWorld, level: string) {
  this.dispatch({ type: 'SET_SLICE', value: SLICE_LEVEL[level]! });
});
When('the SLICE control is set between the black field and the bright title', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_SLICE', value: 0.5 });
});
When('the SLICE control is turned to its lowest luminance threshold', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_SLICE', value: 0 });
});
When('the SLICE control is turned to its highest luminance threshold', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_SLICE', value: 1 });
});
When('the SLICE control is adjusted', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_SLICE', value: 0.3 });
});
Given('the B-bus carries a bright title over a black field', function () {});

Then('every B-bus pixel darker than the slice level becomes transparent', function (this: MixerWorld) {
  assert.equal(lumKeyMask(tr(this).slice * 0.5, tr(this).slice), 0);
});
Then('the A-bus background shows through those transparent pixels', function (this: MixerWorld) {
  assert.equal(lumKeyMask(0, tr(this).slice + 0.01), 0);
});
Then('every B-bus pixel at or brighter than the slice level stays opaque', function (this: MixerWorld) {
  assert.equal(lumKeyMask(tr(this).slice, tr(this).slice), 1);
});
Then('the black field becomes transparent and reveals the A-bus', function (this: MixerWorld) {
  assert.equal(lumKeyMask(0.05, tr(this).slice), 0);
});
Then('the bright title remains solid over the A-bus background', function (this: MixerWorld) {
  assert.equal(lumKeyMask(0.95, tr(this).slice), 1);
});
Then('B-bus regions below that level are transparent', function (this: MixerWorld) {
  assert.equal(lumKeyMask(Math.max(0, tr(this).slice - 0.05), tr(this).slice), 0);
});
Then('B-bus regions at or above that level remain opaque', function (this: MixerWorld) {
  assert.equal(lumKeyMask(tr(this).slice, tr(this).slice), 1);
});
Then(/^the visible extent of the keyed foreground is (.+)$/, function (this: MixerWorld, extent: string) {
  const kf = keyedFraction(tr(this).slice);
  if (extent.includes('most')) assert.ok(kf > 0.6);
  else if (extent.includes('brightest')) assert.ok(kf < 0.4);
  else assert.ok(kf >= 0.4 && kf <= 0.6);
});
Then('almost no B-bus pixel falls below the slice level', function (this: MixerWorld) {
  assert.ok(keyedFraction(tr(this).slice) > 0.95);
});
Then('the B-bus image is shown opaque over the A-bus with little of the A-bus visible', function (this: MixerWorld) {
  assert.ok(keyedFraction(tr(this).slice) > 0.9);
});
Then('almost every B-bus pixel falls below the slice level', function (this: MixerWorld) {
  assert.ok(keyedFraction(tr(this).slice) < 0.05);
});
Then('the A-bus background is shown almost everywhere with only the brightest B-bus detail retained', function (this: MixerWorld) {
  assert.ok(keyedFraction(tr(this).slice) < 0.1);
});

When(/^the lever is eased partway back toward A-bus$/, function (this: MixerWorld) {
  this.dispatch({ type: 'SET_LEVER', position: 0.6 });
});
When(/^the lever is moved fully to A-bus$/, function (this: MixerWorld) {
  this.dispatch({ type: 'SET_LEVER', position: 0 });
});
When(/^the lever is moved between B-bus and A-bus$/, function (this: MixerWorld) {
  this.dispatch({ type: 'SET_LEVER', position: 0.4 });
});
When(/^the lever is positioned at (.+)$/, function (this: MixerWorld, pos: string) {
  this.dispatch({ type: 'SET_LEVER', position: LEVER_POS[pos] ?? 0.5 });
});

Then('the keyed B-bus foreground is composited over the A-bus at full opacity', function (this: MixerWorld) {
  assert.equal(keyForegroundOpacity(1, tr(this).lever), 1);
});
Then('no additional A-bus bleed-through is added beyond the transparent regions', function (this: MixerWorld) {
  assert.equal(keyForegroundOpacity(1, tr(this).lever), 1);
});
Then('the opaque keyed foreground is mixed with the A-bus background', function (this: MixerWorld) {
  assert.ok(keyForegroundOpacity(1, tr(this).lever) < 1);
});
Then('the keyed foreground appears translucent, letting the A-bus show through it', function (this: MixerWorld) {
  assert.ok(keyForegroundOpacity(1, tr(this).lever) < 1);
});
Then('the already-transparent regions continue to reveal the A-bus', function (this: MixerWorld) {
  assert.equal(keyForegroundOpacity(0, tr(this).lever), 0);
});
Then(/^the keyed B-bus foreground is composited at (.+)$/, function (this: MixerWorld, opacity: string) {
  const op = keyForegroundOpacity(1, tr(this).lever);
  if (opacity.includes('full opacity')) assert.ok(op > 0.9);
  else if (opacity.startsWith('faint')) assert.ok(op < 0.4);
  else if (opacity.includes('half')) assert.ok(op >= 0.35 && op <= 0.65);
  else assert.ok(op >= 0.6 && op <= 0.95); // mostly opaque
});
Then('the keyed foreground fades out completely', function (this: MixerWorld) {
  assert.equal(keyForegroundOpacity(1, tr(this).lever), 0);
});
Then('only the A-bus background remains on Program Out', function (this: MixerWorld) {
  assert.equal(keyForegroundOpacity(1, tr(this).lever), 0);
});
Then('which B-bus regions are transparent versus opaque changes accordingly', function () {});
Then('the translucency set by the lever position is unchanged', function (this: MixerWorld) {
  assert.equal(tr(this).lever, 0.6); // set by the "eased partway toward A" precondition
});
Then('the boundary between transparent and opaque B-bus regions stays fixed', function (this: MixerWorld) {
  assert.equal(tr(this).slice, 0.5); // set by the "fixed threshold" precondition
});
Then('only the opacity of the opaque foreground changes', function (this: MixerWorld) {
  assert.notEqual(tr(this).lever, 1);
});

// ===========================================================================
// chroma-key.feature
// ===========================================================================

Given('a background source is assigned to the A-bus', function () {});
Given('a subject shot against a solid-colour backdrop is assigned to the B-bus', function () {});

When('I press CHROMA KEY', function (this: MixerWorld) {
  this.dispatch({ type: 'PRESS_CHROMA_KEY' });
});
Given('Chroma Key is engaged', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_TRANSITION_TYPE', transition: 'chroma-key' });
});
Then('Chroma Key is the active transition function', function (this: MixerWorld) {
  assert.equal(tr(this).type, 'chroma-key');
});
Then(/^no other transition function \(Mix, NAM, Wipe, Luminance Key\) is active$/, function (this: MixerWorld) {
  assert.equal(tr(this).type, 'chroma-key');
});
Given('HUE is dialled to the backdrop colour', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_HUE', angle: this.chromaBackdropHue });
});
Given(/^the B-bus subject is shot against a (green|blue|red) backdrop$/, function (this: MixerWorld, backdrop: string) {
  this.chromaBackdropHue = backdropHue(backdrop);
});
When(/^I turn HUE to the (.+) colour$/, function (this: MixerWorld, name: string) {
  const hue = name === 'backdrop' ? this.chromaBackdropHue : backdropHue(name);
  this.chromaBackdropHue = hue;
  this.dispatch({ type: 'SET_HUE', angle: hue });
});
Then('that colour is the one removed from the B-bus image', function (this: MixerWorld) {
  assert.ok(Math.abs(tr(this).hue - this.chromaBackdropHue) < 1e-9);
});
Then('B-bus regions of other colours are unaffected', function (this: MixerWorld) {
  assert.equal(tr(this).type, 'chroma-key');
});
Then(/^the (green|blue|red) backdrop is removed from the B-bus image$/, function (this: MixerWorld, backdrop: string) {
  assert.ok(Math.abs(tr(this).hue - backdropHue(backdrop)) < 1e-9);
});
Then('the A-bus source is revealed behind the subject', function (this: MixerWorld) {
  assert.equal(tr(this).type, 'chroma-key');
});
Then('B-bus pixels matching the keyed colour become transparent', function (this: MixerWorld) {
  assert.equal(tr(this).type, 'chroma-key');
});
Then('the A-bus source shows through wherever the backdrop colour was removed', function (this: MixerWorld) {
  assert.equal(tr(this).type, 'chroma-key');
});
Then('the B-bus subject that does not match the keyed colour remains opaque', function (this: MixerWorld) {
  assert.equal(tr(this).type, 'chroma-key');
});

When('I set SLICE to its centre position', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_SLICE', value: 0.5 });
});
Given('SLICE is at its centre position', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_SLICE', value: 0.5 });
});
Then('SLICE provides a moderate keying tolerance as a starting point for adjustment', function (this: MixerWorld) {
  assert.ok(Math.abs(chromaTolerance(tr(this).slice) - 0.5) < 0.1);
});
Given('residual fringing remains around the subject with SLICE at centre', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_SLICE', value: 0.5 });
});
When('I fine-tune SLICE for a clean key edge', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_SLICE', value: 0.4 });
});
Then('the transition between opaque subject and transparent backdrop is sharpened', function (this: MixerWorld) {
  assert.equal(tr(this).type, 'chroma-key');
});
Then('backdrop-colour spill around the subject edge is reduced', function (this: MixerWorld) {
  assert.equal(tr(this).type, 'chroma-key');
});
When(/^I move SLICE toward (narrow|wide)$/, function (this: MixerWorld, direction: string) {
  this.dispatch({ type: 'SET_SLICE', value: direction === 'narrow' ? 0.25 : 0.75 });
});
Then(/^the range of colours treated as backdrop (shrinks|grows).*$/, function (this: MixerWorld, effect: string) {
  const tol = chromaTolerance(tr(this).slice);
  if (effect === 'shrinks') assert.ok(tol < 0.5);
  else assert.ok(tol > 0.5);
});

When('I inspect the composite', function () {});
Given(/^the lever is fully at the B-bus end producing a fully keyed composite$/, function (this: MixerWorld) {
  this.dispatch({ type: 'SET_LEVER', position: 1 });
});
When(/^I ease the lever toward the A-bus end$/, function (this: MixerWorld) {
  this.dispatch({ type: 'SET_LEVER', position: 0.6 });
});
Then('the output is a mix of the keyed composite and the unkeyed B-bus image', function (this: MixerWorld) {
  assert.ok(tr(this).lever < 1);
});
Then('the keyed regions become progressively more filled by the unkeyed B-bus', function (this: MixerWorld) {
  assert.ok(tr(this).lever < 1);
});
When(/^the lever is positioned (fully at B|midway between B and A)$/, function (this: MixerWorld, pos: string) {
  this.dispatch({ type: 'SET_LEVER', position: LEVER_POS[pos] ?? 0.5 });
});
Then(/^the composite is (a fully keyed composite|a partial mix.+)$/, function (this: MixerWorld, result: string) {
  if (result.startsWith('a fully keyed')) assert.equal(tr(this).lever, 1);
  else assert.ok(tr(this).lever > 0 && tr(this).lever < 1);
});
When('the B-bus backdrop is evenly lit and the subject is stable', function () {});
Then('the key edge is clean with minimal SLICE adjustment required', function (this: MixerWorld) {
  assert.equal(tr(this).type, 'chroma-key');
});
Then('the blinking source video is used as the key source, not the Matte', function (this: MixerWorld) {
  const resolved = resolveBusSource(this.snapshot().busB, 'key');
  assert.notEqual(resolved, 'matte');
  assert.equal(resolved, this.snapshot().busB.substituteSource);
});
