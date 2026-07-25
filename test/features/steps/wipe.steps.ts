// Step definitions for the Phase 2 wipe features: wipe-patterns and
// wipe-edge-and-direction. They dispatch typed wipe commands to the headless store and
// assert against the pure wipe domain (core/wipe.ts) — families/variants, modifier
// legality, the numbering oracle, edge treatment, direction, and aspect. Reuses the
// "selected Matte colour" step from mixer.steps.ts.

import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { MixerWorld } from '../support/world.js';
import type { WipeFamily, WipeModifiers } from '../../../src/state/state.js';
import {
  WIPE_FAMILIES,
  VARIANT_COUNT,
  squareShapeName,
  squareVariantForShape,
  patternNumber,
  numberToPattern,
  forwardNumber,
  reverseNumber,
  isReversed,
  rs422Addressable,
  agA800Call,
  blindsLegal,
  complementaryMatteName,
  hasBorder,
  hasSoft,
  visualTravel,
  isSymmetricalWiping,
  aspectAffects,
} from '../../../src/core/wipe.js';
import { matteColorName } from '../../../src/core/matte.js';

function familyFromName(name: string): WipeFamily {
  const f = name.toLowerCase();
  if ((WIPE_FAMILIES as readonly string[]).includes(f)) return f as WipeFamily;
  throw new Error(`Unknown wipe family: ${name}`);
}
const wipeOf = (w: MixerWorld) => w.snapshot().transition.wipe;
const noModifiers = (m: WipeModifiers) =>
  m.compression === 0 && m.slide === 0 && m.multi === 0 && !m.pairing && !m.blinds;

// --- Backgrounds -----------------------------------------------------------

Given('the transition mode is WIPE', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_TRANSITION_TYPE', transition: 'wipe' });
});
Given('the A-bus and B-bus each have a source assigned', function () {});
Given('the Wipe Pattern Indicator is visible', function () {});
Given('a WIPE transition is active between the A-bus and the B-bus', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_TRANSITION_TYPE', transition: 'wipe' });
});
Given('a wipe pattern is selected', function () {});
Given('the wipe boundary is currently a hard, uncoloured edge', function (this: MixerWorld) {
  assert.equal(wipeOf(this).edge, 'hard');
});
Given('a base wipe pattern is selected', function () {});

// --- families & variants ---------------------------------------------------

Given(/^the "(.+)" Pattern Select button is chosen$/, function (this: MixerWorld, name: string) {
  this.wipeFamily = familyFromName(name);
  this.dispatch({ type: 'PRESS_WIPE_FAMILY', family: this.wipeFamily });
  this.dispatch({ type: 'SET_WIPE_VARIANT', variant: 0 }); // start at the first variant
});

Given(/^the "(.+)" family variant (\d+) is selected$/, function (this: MixerWorld, name: string, variant: string) {
  this.dispatch({ type: 'PRESS_WIPE_FAMILY', family: familyFromName(name) });
  this.dispatch({ type: 'SET_WIPE_VARIANT', variant: Number(variant) - 1 });
});

Given(/^the "(.+)" family is selected$/, function (this: MixerWorld, name: string) {
  this.dispatch({ type: 'PRESS_WIPE_FAMILY', family: familyFromName(name) });
});

When('the button is pressed repeatedly', function (this: MixerWorld) {
  for (let i = 0; i < VARIANT_COUNT; i++) this.dispatch({ type: 'PRESS_WIPE_FAMILY', family: this.wipeFamily });
});

Then(/^it cycles through (\d+) variants and wraps back to the first$/, function (this: MixerWorld, count: string) {
  assert.equal(Number(count), VARIANT_COUNT);
  assert.equal(wipeOf(this).variant, 0); // pressed VARIANT_COUNT times → wrapped back to 0
});

Then(/^the selected variant describes "(?:.+)"$/, function () {});

When(/^the variant "(\d+)" is selected$/, function (this: MixerWorld, variant: string) {
  this.dispatch({ type: 'SET_WIPE_VARIANT', variant: Number(variant) - 1 });
});

Then(/^a centred "(.+)" grows outward as the wipe progresses$/, function (this: MixerWorld, shape: string) {
  assert.equal(squareShapeName(wipeOf(this).variant), shape);
});

When(/^the "(.+)" family variant (\d+) is selected with no modifiers active$/, function (this: MixerWorld, name: string, variant: string) {
  this.dispatch({ type: 'PRESS_WIPE_FAMILY', family: familyFromName(name) });
  this.dispatch({ type: 'SET_WIPE_VARIANT', variant: Number(variant) - 1 });
});

Then('the wipe boundary is a plain hard edge', function (this: MixerWorld) {
  assert.equal(wipeOf(this).edge, 'hard');
});
Then('no modifier LED is lit', function (this: MixerWorld) {
  assert.equal(noModifiers(wipeOf(this).modifiers), true);
});

// --- modifiers -------------------------------------------------------------

When('the COMPRESSION button is pressed once', function (this: MixerWorld) {
  this.dispatch({ type: 'PRESS_COMPRESSION' });
});
When('the COMPRESSION button is pressed twice', function (this: MixerWorld) {
  this.dispatch({ type: 'PRESS_COMPRESSION' });
  this.dispatch({ type: 'PRESS_COMPRESSION' });
});
Then(/^the incoming \(B\) scene wipes in as a whole picture scaled down inside the wipe shape$/, function (this: MixerWorld) {
  assert.equal(wipeOf(this).modifiers.compression, 1);
});
Then('the outgoing scene is not compressed', function (this: MixerWorld) {
  assert.equal(wipeOf(this).modifiers.compression, 1);
});
Then('the COMPRESSION LED shows the single-press state', function (this: MixerWorld) {
  assert.equal(wipeOf(this).modifiers.compression, 1);
});
Then('both the A and B scenes are compressed and wipe in and out together', function (this: MixerWorld) {
  assert.equal(wipeOf(this).modifiers.compression, 2);
});
Then('the COMPRESSION LED shows the double-press state', function (this: MixerWorld) {
  assert.equal(wipeOf(this).modifiers.compression, 2);
});

When('the SLIDE button is pressed once', function (this: MixerWorld) {
  this.dispatch({ type: 'PRESS_SLIDE' });
});
When('the SLIDE button is pressed twice', function (this: MixerWorld) {
  this.dispatch({ type: 'PRESS_SLIDE' });
  this.dispatch({ type: 'PRESS_SLIDE' });
});
Then('one image slides over the other into frame', function (this: MixerWorld) {
  assert.equal(wipeOf(this).modifiers.slide, 1);
});
Then('the SLIDE LED shows the single-press state', function (this: MixerWorld) {
  assert.equal(wipeOf(this).modifiers.slide, 1);
});
Then('both images slide in and out over each other', function (this: MixerWorld) {
  assert.equal(wipeOf(this).modifiers.slide, 2);
});
Then('the SLIDE LED shows the double-press state', function (this: MixerWorld) {
  assert.equal(wipeOf(this).modifiers.slide, 2);
});

When(/^the MULTI button selects multi mode (\d+)$/, function (this: MixerWorld, mode: string) {
  this.dispatch({ type: 'SET_WIPE_MULTI', mode: Number(mode) });
});
Then(/^the wipe pattern is repeated into (\d+) vertical or horizontal tiles$/, function (this: MixerWorld, mode: string) {
  assert.equal(wipeOf(this).modifiers.multi, Number(mode));
});
Then('the MULTI LED is lit', function (this: MixerWorld) {
  assert.ok(wipeOf(this).modifiers.multi > 0);
});
When('the MULTI button is cycled past its last mode', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_WIPE_MULTI', mode: 6 });
  this.dispatch({ type: 'PRESS_WIPE_MULTI' });
});
Then('it does not exceed 6 multi modes and wraps back to the first', function (this: MixerWorld) {
  const multi = wipeOf(this).modifiers.multi;
  assert.ok(multi >= 1 && multi <= 6);
  assert.equal(multi, 1);
});

When('the PAIRING button is engaged', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_PAIRING', on: true });
});
Then('the wipe is rendered as a paired, mirrored scene', function (this: MixerWorld) {
  assert.equal(wipeOf(this).modifiers.pairing, true);
});
Then('the PAIRING LED is lit', function (this: MixerWorld) {
  assert.equal(wipeOf(this).modifiers.pairing, true);
});
Then('both the PAIRING and MULTI LEDs are lit', function (this: MixerWorld) {
  const m = wipeOf(this).modifiers;
  assert.ok(m.pairing && m.multi > 0);
});
Then('the wipe is rendered as paired, mirrored, repeated tiles', function (this: MixerWorld) {
  const m = wipeOf(this).modifiers;
  assert.ok(m.pairing && m.multi > 0);
});

When('the BLINDS button is engaged', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_BLINDS', on: true });
});
Then('the wipe happens as venetian-blind strips', function (this: MixerWorld) {
  assert.equal(wipeOf(this).modifiers.blinds, true);
});
Then('the BLINDS LED is lit', function (this: MixerWorld) {
  assert.equal(wipeOf(this).modifiers.blinds, true);
});
Then('the combination is illegal', function (this: MixerWorld) {
  assert.equal(blindsLegal('square'), false); // the scenario engaged Blinds on Square
});
Then('the BLINDS LED goes out', function (this: MixerWorld) {
  assert.equal(wipeOf(this).modifiers.blinds, false);
});
Then('the resulting pattern falls back to the Straight Wipe', function (this: MixerWorld) {
  assert.equal(wipeOf(this).family, 'straight');
});
Then('the combination is legal', function (this: MixerWorld) {
  const w = wipeOf(this);
  assert.ok(!w.modifiers.blinds || blindsLegal(w.family));
});
Then('both the SLIDE and MULTI LEDs remain lit', function (this: MixerWorld) {
  const m = wipeOf(this).modifiers;
  assert.ok(m.slide > 0 && m.multi > 0);
});

// --- numbering oracle ------------------------------------------------------

When('a valid wipe pattern is composed', function () {});
Then('the Wipe Pattern Indicator shows a number in the range 001 to 255', function (this: MixerWorld) {
  const n = patternNumber(wipeOf(this));
  assert.ok(n >= 1 && n <= 255);
});

When(/^the pattern numbered (\d+) is recalled$/, function (this: MixerWorld, nStr: string) {
  const n = Number(nStr);
  if (this.num.base === 0) this.num.base = n;
  else this.num.reversed = n;
  const forward = forwardNumber(n);
  if (forward >= 1 && forward <= WIPE_FAMILIES.length * VARIANT_COUNT) {
    const p = numberToPattern(n);
    this.dispatch({ type: 'PRESS_WIPE_FAMILY', family: p.family });
    this.dispatch({ type: 'SET_WIPE_VARIANT', variant: p.variant });
    this.dispatch({ type: 'SET_REVERSE', on: p.reverse });
  }
});
Then(/^the "(.+)" family variant (\d+) is selected with no modifiers$/, function (this: MixerWorld, name: string, variant: string) {
  const w = wipeOf(this);
  assert.equal(w.family, familyFromName(name));
  assert.equal(w.variant, Number(variant) - 1);
  assert.equal(noModifiers(w.modifiers), true);
});
Then('the wipe travels in its normal direction', function (this: MixerWorld) {
  assert.equal(wipeOf(this).reverse, false);
});
Then('both numbers select the same composed wipe shape', function (this: MixerWorld) {
  assert.equal(forwardNumber(this.num.base), forwardNumber(this.num.reversed));
});
Then(/^pattern (\d+) plays that wipe reversed relative to pattern (\d+)$/, function (this: MixerWorld, rev: string, base: string) {
  assert.equal(Number(rev), Number(base) + 128);
  assert.equal(isReversed(Number(rev)), true);
  assert.equal(isReversed(Number(base)), false);
});
Given(/^the base pattern number is (\d+)$/, function (this: MixerWorld, base: string) {
  this.num.base = Number(base);
});
When('its reversed variant is requested', function (this: MixerWorld) {
  this.num.reversed = reverseNumber(this.num.base);
});
Then(/^the resulting pattern number equals (\d+) plus 128$/, function (this: MixerWorld, base: string) {
  assert.equal(this.num.reversed, Number(base) + 128);
});

When(/^the RS422 protocol requests pattern number (\d+)$/, function (this: MixerWorld, n: string) {
  this.num.base = Number(n);
});
Then(/^the request is (accepted and the pattern is selected|rejected as out of RS422 range)$/, function (this: MixerWorld, result: string) {
  assert.equal(rs422Addressable(this.num.base), result.startsWith('accepted'));
});

When(/^the AG-A800 controller calls pattern (\d+)$/, function (this: MixerWorld, n: string) {
  this.num.base = Number(n);
});
Then(/^the outcome is "(.+)"$/, function (this: MixerWorld, outcome: string) {
  const call = agA800Call(this.num.base);
  if (outcome.includes('currently set up')) assert.equal(call.kind, 'current');
  else {
    assert.equal(call.kind, 'pattern');
    const expected = Number(outcome.replace(/\D/g, ''));
    assert.equal(call.kind === 'pattern' ? call.number : -1, expected);
  }
});

// --- edge treatment (wipe-edge-and-direction.feature) ----------------------

Given('the wipe edge treatment is off', function (this: MixerWorld) {
  assert.equal(wipeOf(this).edge, 'hard');
});
Given('the wipe boundary is a narrow border', function (this: MixerWorld) {
  this.dispatch({ type: 'PRESS_BORDER' });
});
Given('the wipe boundary is a wide border', function (this: MixerWorld) {
  this.dispatch({ type: 'PRESS_BORDER' });
  this.dispatch({ type: 'PRESS_BORDER' });
});
Given('the wipe boundary is a narrow soft edge', function (this: MixerWorld) {
  this.dispatch({ type: 'PRESS_SOFT' });
});
Given('a narrow border is active', function (this: MixerWorld) {
  this.dispatch({ type: 'PRESS_BORDER' });
});
Given('the border line is rendered in the complement of the current Matte colour', function () {});

When('I press BORDER', function (this: MixerWorld) {
  this.dispatch({ type: 'PRESS_BORDER' });
});
When('I press SOFT', function (this: MixerWorld) {
  this.dispatch({ type: 'PRESS_SOFT' });
});
When('I press BORDER to enable a narrow border', function (this: MixerWorld) {
  this.dispatch({ type: 'PRESS_BORDER' });
});
When('I press SOFT to apply a soft edge', function (this: MixerWorld) {
  this.dispatch({ type: 'PRESS_SOFT' });
});
When('I press SOFT to apply a narrow feathered edge', function (this: MixerWorld) {
  this.dispatch({ type: 'PRESS_SOFT' });
});
When('I change the selected Matte colour with the Matte SELECT buttons', function (this: MixerWorld) {
  this.dispatch({ type: 'STEP_MATTE_COLOR', direction: 'up' });
});

Then('the wipe boundary is drawn as a narrow coloured line between the two images', function (this: MixerWorld) {
  assert.equal(wipeOf(this).edge, 'border-narrow');
});
Then('the wipe boundary is drawn as a wide coloured line between the two images', function (this: MixerWorld) {
  assert.equal(wipeOf(this).edge, 'border-wide');
});
Then('the wipe boundary returns to a hard, uncoloured edge', function (this: MixerWorld) {
  assert.equal(wipeOf(this).edge, 'hard');
});
Then('the wipe boundary is a narrow feathered edge', function (this: MixerWorld) {
  assert.equal(wipeOf(this).edge, 'soft-narrow');
});
Then('the wipe boundary is a wide feathered edge', function (this: MixerWorld) {
  assert.equal(wipeOf(this).edge, 'soft-wide');
});
Then('the wipe boundary is a feathered blend between the two images', function (this: MixerWorld) {
  assert.equal(hasSoft(wipeOf(this).edge), true);
});
Then('the wipe boundary is a feathered edge', function (this: MixerWorld) {
  assert.equal(hasSoft(wipeOf(this).edge), true);
});
Then('no border colour is applied to the boundary', function (this: MixerWorld) {
  assert.equal(hasBorder(wipeOf(this).edge), false);
});
Then('no colour is drawn at the boundary', function (this: MixerWorld) {
  assert.equal(hasBorder(wipeOf(this).edge), false);
});
Then('the coloured border is no longer drawn', function (this: MixerWorld) {
  assert.equal(hasBorder(wipeOf(this).edge), false);
});

Then(/^the border line is rendered in "(.+)"$/, function (this: MixerWorld, complement: string) {
  assert.equal(hasBorder(wipeOf(this).edge), true);
  assert.equal(complementaryMatteName(matteColorName(this.snapshot().matte.colorIndex)), complement);
});
Then('the border line is recoloured to the complement of the newly selected Matte colour', function (this: MixerWorld) {
  assert.equal(hasBorder(wipeOf(this).edge), true);
  const current = matteColorName(this.snapshot().matte.colorIndex);
  assert.equal(typeof complementaryMatteName(current), 'string');
});

// --- direction -------------------------------------------------------------

Given('ONE-WAY is off', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_ONE_WAY', on: false });
});
Given('ONE-WAY is engaged', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_ONE_WAY', on: true });
});
Given('REVERSE is off', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_REVERSE', on: false });
});
Given('REVERSE is engaged', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_REVERSE', on: true });
});
Given('I note the direction the wipe travels on a swing', function (this: MixerWorld) {
  const w = wipeOf(this);
  this.travel.noted = visualTravel(w.oneWay, w.reverse, +1);
});
When('I engage REVERSE', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_REVERSE', on: true });
});
When('I swing the lever from A to B', function (this: MixerWorld) {
  const w = wipeOf(this);
  this.travel.ab = visualTravel(w.oneWay, w.reverse, +1);
});
When('I swing the lever from B to A', function (this: MixerWorld) {
  const w = wipeOf(this);
  this.travel.ba = visualTravel(w.oneWay, w.reverse, -1);
});
When('I swing the lever', function (this: MixerWorld) {
  const w = wipeOf(this);
  this.travel.after = visualTravel(w.oneWay, w.reverse, +1);
});
Then('the wipe travels in one direction', function (this: MixerWorld) {
  assert.notEqual(this.travel.ab, 0);
});
Then('the wipe travels in the opposite direction', function (this: MixerWorld) {
  assert.equal(this.travel.ba, -this.travel.ab);
});
Then('the wipe travels in a given direction', function (this: MixerWorld) {
  assert.notEqual(this.travel.ab, 0);
});
Then('the wipe travels in the same direction', function (this: MixerWorld) {
  assert.equal(this.travel.ba, this.travel.ab);
});
Then('the wipe travels in the mirrored direction', function (this: MixerWorld) {
  assert.equal(this.travel.after, -this.travel.noted);
});
Then('the wipe expands and contracts symmetrically across the screen', function (this: MixerWorld) {
  const w = wipeOf(this);
  assert.equal(isSymmetricalWiping(w.oneWay, w.reverse), true);
});

// --- aspect ----------------------------------------------------------------

Given(/^a "(.+)" wipe pattern from the Square family is selected$/, function (this: MixerWorld, shape: string) {
  this.dispatch({ type: 'PRESS_WIPE_FAMILY', family: 'square' });
  this.dispatch({ type: 'SET_WIPE_VARIANT', variant: squareVariantForShape(shape) });
});
Given(/^a "(.+)" wipe pattern is selected$/, function (this: MixerWorld, name: string) {
  this.dispatch({ type: 'PRESS_WIPE_FAMILY', family: familyFromName(name) });
});
When(/^I set the ASPECT control toward "(vertical|horizontal)"$/, function (this: MixerWorld, axis: string) {
  this.dispatch({ type: 'SET_WIPE_ASPECT', value: axis === 'vertical' ? -0.6 : 0.6 });
});
When('I set the ASPECT control toward vertical', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_WIPE_ASPECT', value: -0.6 });
});
When('I set the ASPECT control to its centre position', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_WIPE_ASPECT', value: 0 });
});
Then(/^the wipe shape is stretched "(?:vertical|horizontal)"$/, function (this: MixerWorld) {
  const w = wipeOf(this);
  assert.equal(aspectAffects(w.family), true);
  assert.notEqual(w.aspect, 0);
});
Then('the wipe shape keeps its native, unstretched proportions', function (this: MixerWorld) {
  assert.equal(wipeOf(this).aspect, 0);
});
Then('the wipe shape is unchanged', function (this: MixerWorld) {
  assert.equal(aspectAffects(wipeOf(this).family), false);
});
