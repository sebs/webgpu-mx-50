// Step definitions for the freeze family (reference §8.5–§8.8, ADR-0007): Still, Strobe,
// Multi, Trail. Dispatch typed commands and assert against the freeze domain + exclusion
// state machine. Reuses shared digital-effect steps from effects.steps.ts (select bus,
// press ON, output unchanged, carries no digital effect). GPU-free.

import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { MixerWorld } from '../support/world.js';
import type { BusId } from '../../../src/core/types.js';
import type { FreezeEffect } from '../../../src/state/state.js';
import {
  freezeActiveOn,
  stillLedBlinks,
  strobeInterval,
  multiInterval,
  trailInterval,
  STROBE_MIN,
  STROBE_MAX,
  TRAIL_MAX_COPIES,
  compressionReliable,
} from '../../../src/core/digital-effect.js';

const busId = (phrase: string): BusId => (phrase.startsWith('A') ? 'A' : 'B');
const de = (w: MixerWorld) => w.snapshot().digitalEffect;
const engage = (w: MixerWorld, effect: FreezeEffect, on: boolean) => w.dispatch({ type: 'ENGAGE_FREEZE', effect, on });

/** Engage a named effect (Still/Strobe/Multi/Compression/Trail). */
function engageNamed(w: MixerWorld, name: string): void {
  switch (name) {
    case 'Still':
      engage(w, 'still', true);
      break;
    case 'Strobe':
      engage(w, 'strobe', true);
      break;
    case 'Multi':
      w.dispatch({ type: 'PRESS_MULTI' });
      break;
    case 'Trail':
      engage(w, 'trail', true);
      break;
    case 'Compression':
      w.dispatch({ type: 'PRESS_COMPRESSION' });
      break;
    default:
      throw new Error(`Unknown effect: ${name}`);
  }
}
function namedActive(w: MixerWorld, name: string): boolean {
  const d = de(w);
  switch (name) {
    case 'Still':
      return d.freeze.still;
    case 'Strobe':
      return d.freeze.strobe;
    case 'Multi':
      return d.freeze.multi > 0;
    case 'Trail':
      return d.freeze.trail;
    case 'Compression':
      return w.snapshot().transition.wipe.modifiers.compression > 0;
    default:
      throw new Error(`Unknown effect: ${name}`);
  }
}
const TIME_POS: Record<string, number> = { MIN: 0, minimum: 0, mid: 0.5, midpoint: 0.5, 'one quarter': 0.25, MAX: 1, maximum: 1 };

// ===========================================================================
// Backgrounds
// ===========================================================================

Given('a live moving source is assigned to the bus', function () {});
Given('the Digital Effect stage is applied to that bus', function (this: MixerWorld) {
  this.dispatch({ type: 'SELECT_EFFECT_BUS', bus: 'A' });
});
Given('the Still button carries an LED that indicates its state', function () {});
Given(/^a live moving source is assigned to the (?:A-bus|B-bus)$/, function () {});
Given(/^the Digital Effect stage on the (A-bus|B-bus) is idle$/, function (this: MixerWorld, bus: string) {
  this.dispatch({ type: 'SELECT_EFFECT_BUS', bus: busId(bus) });
});
Given('the mixer is running with the A-bus carrying a moving source', function () {});
Given(/^no digital effect is active on the (?:A-bus|B-bus)$/, function () {});
Given(/^the (?:A-bus|B-bus) is carrying a moving source$/, function () {});
Given('I let the live source advance', function () {});

// ===========================================================================
// Still (digital-effect-still.feature)
// ===========================================================================

Given('Still is off and the source is moving', function (this: MixerWorld) {
  engage(this, 'still', false);
});
Given('Still is off', function (this: MixerWorld) {
  engage(this, 'still', false);
});
Given('Still is engaged and holding a captured frame', function (this: MixerWorld) {
  engage(this, 'still', true);
});
Given(/^Still is engaged$/, function (this: MixerWorld) {
  engage(this, 'still', true);
});
Given(/^Still is engaged on the (A-bus|B-bus)$/, function (this: MixerWorld, bus: string) {
  this.dispatch({ type: 'SELECT_EFFECT_BUS', bus: busId(bus) });
  engage(this, 'still', true);
});
Given('Still and Trail are both active and the Still LED is blinking', function (this: MixerWorld) {
  engage(this, 'still', true);
  engage(this, 'trail', true);
});
Given(/^([A-Za-z]+) is active on the bus$/, function (this: MixerWorld, name: string) {
  engageNamed(this, name);
});

When('I engage Still', function (this: MixerWorld) {
  engage(this, 'still', true);
});
When('I engage Still again', function (this: MixerWorld) {
  engage(this, 'still', true);
});
When('I engage Still on a fast-moving source', function (this: MixerWorld) {
  engage(this, 'still', true);
});
When(/^I engage Still on the (A-bus|B-bus)$/, function (this: MixerWorld, bus: string) {
  this.dispatch({ type: 'SELECT_EFFECT_BUS', bus: busId(bus) });
  engage(this, 'still', true);
});
When('I disengage Still', function (this: MixerWorld) {
  engage(this, 'still', false);
});
When('I engage Trail', function (this: MixerWorld) {
  engage(this, 'trail', true);
});
When('I disengage Trail', function (this: MixerWorld) {
  engage(this, 'trail', false);
});
When(/^I engage (Strobe|Multi|Compression)$/, function (this: MixerWorld, name: string) {
  engageNamed(this, name);
});

Then('the frame present at the moment of engagement is captured', function (this: MixerWorld) {
  assert.equal(de(this).freeze.still, true);
});
Then('the bus output holds that captured frame', function (this: MixerWorld) {
  assert.equal(de(this).freeze.still, true);
});
Then('the held frame does not update while the live source keeps moving', function (this: MixerWorld) {
  assert.equal(de(this).freeze.still, true);
});
Then('the very next output frame already shows the frozen picture', function (this: MixerWorld) {
  assert.equal(de(this).freeze.still, true);
});
Then('no intermediate blend between live and frozen frames is shown', function (this: MixerWorld) {
  assert.equal(de(this).freeze.still, true);
});
Then('the bus output resumes following the live moving source', function (this: MixerWorld) {
  assert.equal(de(this).freeze.still, false);
});
Then('the newly captured frame replaces the earlier one', function (this: MixerWorld) {
  assert.equal(de(this).freeze.still, true);
});
Then('the bus output holds the newly captured frame', function (this: MixerWorld) {
  assert.equal(de(this).freeze.still, true);
});
Then('the Still LED is lit steadily', function (this: MixerWorld) {
  assert.equal(de(this).freeze.still, true);
  assert.equal(stillLedBlinks(de(this)), false);
});
Then('the Still LED returns to lit steadily', function (this: MixerWorld) {
  assert.equal(de(this).freeze.still, true);
  assert.equal(stillLedBlinks(de(this)), false);
});
Then('the Still LED turns off', function (this: MixerWorld) {
  assert.equal(de(this).freeze.still, false);
});
Then('Still switches off automatically', function (this: MixerWorld) {
  assert.equal(de(this).freeze.still, false);
});
Then('Still remains active', function (this: MixerWorld) {
  assert.equal(de(this).freeze.still, true);
});
Then('Trail is also active on the bus', function (this: MixerWorld) {
  assert.equal(de(this).freeze.trail, true);
});
Then('the Still LED blinks to indicate Still is combined with Trail', function (this: MixerWorld) {
  assert.equal(stillLedBlinks(de(this)), true);
});
Then('the Still LED changes from steady to blinking', function (this: MixerWorld) {
  assert.equal(stillLedBlinks(de(this)), true);
});
Then('the Still LED blinks', function (this: MixerWorld) {
  assert.equal(stillLedBlinks(de(this)), true);
});
Then('both Still and Trail are active', function (this: MixerWorld) {
  assert.equal(de(this).freeze.still, true);
  assert.equal(de(this).freeze.trail, true);
});
Then(/^([A-Za-z]+) becomes active on the bus$/, function (this: MixerWorld, name: string) {
  assert.equal(namedActive(this, name), true);
});
Then(/^Still and ([A-Za-z]+) are never active at the same time$/, function (this: MixerWorld, name: string) {
  assert.equal(de(this).freeze.still && namedActive(this, name), false);
});
Then('only one of the two remains active', function (this: MixerWorld) {
  // Engaging Still won: Still is on and the conflicting effect is off.
  assert.equal(de(this).freeze.still, true);
});

Then('Still is no longer active', function (this: MixerWorld) {
  assert.equal(de(this).freeze.still, false);
});
Given('Still is engaged and holding an earlier captured frame', function (this: MixerWorld) {
  engage(this, 'still', true);
});
Then('Strobe runs its frozen-frame sequence on the bus', function (this: MixerWorld) {
  assert.equal(de(this).freeze.strobe, true);
});

// ===========================================================================
// Strobe (digital-effect-strobe.feature)
// ===========================================================================

When(/^I engage Strobe on the (A-bus|B-bus)$/, function (this: MixerWorld, bus: string) {
  this.dispatch({ type: 'SELECT_EFFECT_BUS', bus: busId(bus) });
  engage(this, 'strobe', true);
});
Given(/^Strobe is engaged on the (A-bus|B-bus)$/, function (this: MixerWorld, bus: string) {
  this.dispatch({ type: 'SELECT_EFFECT_BUS', bus: busId(bus) });
  engage(this, 'strobe', true);
});
Given(/^Strobe is engaged on the (A-bus|B-bus) with the TIME control at minimum$/, function (this: MixerWorld, bus: string) {
  this.dispatch({ type: 'SELECT_EFFECT_BUS', bus: busId(bus) });
  engage(this, 'strobe', true);
  this.dispatch({ type: 'SET_STROBE_TIME', position: 0 });
});
When(/^I disengage Strobe on the (?:A-bus|B-bus)$/, function (this: MixerWorld) {
  engage(this, 'strobe', false);
});
When(/^I set the Strobe TIME control to (.+)$/, function (this: MixerWorld, position: string) {
  this.dispatch({ type: 'SET_STROBE_TIME', position: TIME_POS[position.trim()] ?? 0.5 });
});
Then(/^the (?:A-bus|B-bus) output holds a frozen frame for the current TIME interval$/, function (this: MixerWorld) {
  assert.equal(de(this).freeze.strobe, true);
});
Then('at the end of each interval the held frame is replaced by a freshly captured frame', function (this: MixerWorld) {
  assert.equal(de(this).freeze.strobe, true);
});
Then('motion on the bus is rendered as a stop-motion sequence', function (this: MixerWorld) {
  assert.equal(de(this).freeze.strobe, true);
});
Then(/^the (?:A-bus|B-bus) output resumes continuous live motion$/, function (this: MixerWorld) {
  assert.equal(de(this).freeze.strobe, false);
});
Then('no frame is held between captures', function (this: MixerWorld) {
  assert.equal(de(this).freeze.strobe, false);
});
Then(/^the freeze interval is approximately (.+)$/, function (this: MixerWorld, interval: string) {
  const expected = parseFloat(interval);
  assert.ok(Math.abs(strobeInterval(de(this).strobeTime) - expected) < 0.06);
});
Then('each captured frame is held for that interval before the next capture', function (this: MixerWorld) {
  assert.equal(de(this).freeze.strobe, true);
});
Then('the freeze interval cannot be set shorter than approximately 0.03 s', function () {
  assert.ok(strobeInterval(-5) >= STROBE_MIN - 1e-9);
});
Then('the freeze interval cannot be set longer than approximately 2.1 s', function () {
  assert.ok(strobeInterval(5) <= STROBE_MAX + 1e-9);
});
Then('subsequent frames are held for approximately 2.1 s', function (this: MixerWorld) {
  assert.ok(Math.abs(strobeInterval(de(this).strobeTime) - 2.1) < 0.06);
});
Then('the strobing continues without being interrupted', function (this: MixerWorld) {
  assert.equal(de(this).freeze.strobe, true);
});
Then(/^Still switches off on the (?:A-bus|B-bus)$/, function (this: MixerWorld) {
  assert.equal(de(this).freeze.still, false);
});
Then(/^Strobe becomes the active freeze-family effect on the (?:A-bus|B-bus)$/, function (this: MixerWorld) {
  assert.equal(de(this).freeze.strobe, true);
});
Then(/^Strobe switches off on the (?:A-bus|B-bus)$/, function (this: MixerWorld) {
  assert.equal(de(this).freeze.strobe, false);
});
Then(/^the (?:A-bus|B-bus) holds a single frozen frame$/, function (this: MixerWorld) {
  assert.equal(de(this).freeze.still, true);
});
When('I attempt to use the Compression Wipe', function (this: MixerWorld) {
  this.dispatch({ type: 'PRESS_COMPRESSION' });
});
Then('Compression is temporarily disabled', function (this: MixerWorld) {
  assert.equal(this.snapshot().transition.wipe.modifiers.compression, 0);
});
Then(/^Strobe continues to run on the (?:A-bus|B-bus)$/, function (this: MixerWorld) {
  assert.equal(de(this).freeze.strobe, true);
});
Then(/^the (?:A-bus|B-bus) output steps through frozen frames$/, function (this: MixerWorld) {
  assert.equal(de(this).freeze.strobe, true);
});
Then(/^the (A-bus|B-bus) output continues in live motion$/, function (this: MixerWorld, bus: string) {
  assert.equal(freezeActiveOn(de(this), busId(bus), 'strobe'), false);
});

// ===========================================================================
// Multi (digital-effect-multi.feature)
// ===========================================================================

When('I press the Multi button once', function (this: MixerWorld) {
  this.multiPressed = true;
  this.dispatch({ type: 'PRESS_MULTI' });
});
// Grid "tiled into an N by N grid of M images": sets it as precondition, asserts after a press.
Given(/^the (A-bus|B-bus) is tiled into an? \d+ by \d+ grid of (\d+) images$/, function (this: MixerWorld, _bus: string, count: string) {
  if (this.multiPressed) assert.equal(de(this).freeze.multi, Number(count));
  else this.dispatch({ type: 'SET_MULTI_GRID', count: Number(count) });
});
Then(/^the (?:A-bus|B-bus) shows a single full-frame image$/, function (this: MixerWorld) {
  assert.equal(de(this).freeze.multi, 0);
});
Then('the Multi effect is off', function (this: MixerWorld) {
  assert.equal(de(this).freeze.multi, 0);
});
Given(/^the Multi grid is currently (.+)$/, function (this: MixerWorld, before: string) {
  const count = before.includes('single') ? 0 : parseInt(before, 10);
  this.dispatch({ type: 'SET_MULTI_GRID', count });
});
Then(/^the Multi grid becomes (.+)$/, function (this: MixerWorld, after: string) {
  const count = after.includes('single') ? 0 : parseInt(after, 10);
  assert.equal(de(this).freeze.multi, count);
});
Given(/^the Multi effect is active on the (A-bus|B-bus) with an? \d+ by \d+ grid of (\d+) images$/, function (this: MixerWorld, bus: string, count: string) {
  this.dispatch({ type: 'SELECT_EFFECT_BUS', bus: busId(bus) });
  this.dispatch({ type: 'SET_MULTI_GRID', count: Number(count) });
});
When(/^I set the TIME control to (MIN|mid|MAX)$/, function (this: MixerWorld, setting: string) {
  const pos = TIME_POS[setting] ?? 0.5;
  this.dispatch({ type: 'SET_MULTI_TIME', position: pos });
  this.dispatch({ type: 'SET_TRAIL_TIME', position: pos });
});
Then(/^each tile is captured at intervals of about (.+)$/, function (this: MixerWorld, interval: string) {
  assert.ok(Math.abs(multiInterval(de(this).multiTime) - parseFloat(interval)) < 0.06);
});
Given('the TIME control is set toward MIN', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_MULTI_TIME', position: 0.1 });
});
When('the unit steps through the tiles', function () {});
Then('the grid captures its tiles more quickly than at a TIME setting toward MAX', function (this: MixerWorld) {
  assert.ok(multiInterval(de(this).multiTime) < multiInterval(0.9));
});
When('I press ONCE', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_MULTI_MODE', mode: 'once' });
});
When('I press REPEAT', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_MULTI_MODE', mode: 'repeat' });
});
Given('ONCE has completed and the grid is frozen', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_MULTI_MODE', mode: 'once' });
});
Then('the unit captures each tile once in sequence across the grid', function (this: MixerWorld) {
  assert.equal(de(this).multiMode, 'once');
});
Then('once every tile has been captured the grid holds as a still image', function (this: MixerWorld) {
  assert.equal(de(this).multiMode, 'once');
});
Then('no further tiles are updated until Multi is retriggered', function (this: MixerWorld) {
  assert.equal(de(this).multiMode, 'once');
});
Then('the unit keeps capturing tiles in sequence around the grid without stopping', function (this: MixerWorld) {
  assert.equal(de(this).multiMode, 'repeat');
});
Then('each tile is refreshed with a newer captured frame as the cycle comes around', function (this: MixerWorld) {
  assert.equal(de(this).multiMode, 'repeat');
});
Then('the unit resumes cycling through the tiles continuously', function (this: MixerWorld) {
  assert.equal(de(this).multiMode, 'repeat');
});
Given(/^the Still effect is active on the (A-bus|B-bus)$/, function (this: MixerWorld, bus: string) {
  this.dispatch({ type: 'SELECT_EFFECT_BUS', bus: busId(bus) });
  engage(this, 'still', true);
});
Then(/^the Multi effect becomes active on the (?:A-bus|B-bus)$/, function (this: MixerWorld) {
  assert.ok(de(this).freeze.multi > 0);
});
Then('the Still effect switches off automatically', function (this: MixerWorld) {
  assert.equal(de(this).freeze.still, false);
});
Then(/^the (?:A-bus|B-bus) shows the tiled grid$/, function (this: MixerWorld) {
  assert.ok(de(this).freeze.multi > 0);
});

// ===========================================================================
// Trail (digital-effect-trail.feature)
// ===========================================================================

When('I choose the Trail effect', function (this: MixerWorld) {
  this.dispatch({ type: 'CHOOSE_EFFECT', effect: 'trail' });
});
Given('I have chosen the Trail effect', function (this: MixerWorld) {
  this.dispatch({ type: 'CHOOSE_EFFECT', effect: 'trail' });
});
Given(/^the Trail effect is ON for the (A-bus|B-bus)$/, function (this: MixerWorld, bus: string) {
  this.dispatch({ type: 'SELECT_EFFECT_BUS', bus: busId(bus) });
  engage(this, 'trail', true);
});
Then(/^the (A-bus|B-bus) shows a compressed image trailing progressively larger copies of itself$/, function (this: MixerWorld, bus: string) {
  assert.equal(freezeActiveOn(de(this), busId(bus), 'trail'), true);
});
Then('the current source appears as the smallest, most-compressed copy', function (this: MixerWorld) {
  assert.equal(de(this).freeze.trail, true);
});
Then('each older copy behind it is progressively larger', function (this: MixerWorld) {
  assert.equal(de(this).freeze.trail, true);
});
When('the effect has been running long enough to fill the trail', function () {});
Then('no more than 16 copies are shown at once', function () {
  assert.equal(TRAIL_MAX_COPIES, 16);
});
Then('the oldest copy is dropped as each new copy is spawned', function (this: MixerWorld) {
  assert.equal(de(this).freeze.trail, true);
});
When(/^I hold the Positioner Joystick toward the (upper-left|upper-right) corner$/, function (this: MixerWorld, corner: string) {
  this.dispatch({ type: 'SET_TRAIL_CORNER', corner: corner as 'upper-left' | 'upper-right' });
});
Then(/^the trail originates from the (upper-left|upper-right) corner$/, function (this: MixerWorld, corner: string) {
  assert.equal(de(this).trailCorner, corner);
});
Then(/^the copies enlarge away from that corner$/, function (this: MixerWorld) {
  assert.equal(de(this).freeze.trail, true);
});
Then(/^a new copy is spawned every (.+)$/, function (this: MixerWorld, interval: string) {
  const secs = trailInterval(de(this).trailTime);
  if (interval.includes('0.07')) assert.ok(Math.abs(secs - 0.07) < 0.06);
  else if (interval.includes('2.1')) assert.ok(Math.abs(secs - 2.1) < 0.06);
  else assert.ok(secs > 0.07 && secs < 2.1);
});
When(/^I set the TIME control toward (MIN|MAX)$/, function (this: MixerWorld, dir: string) {
  const pos = dir === 'MIN' ? 0.1 : 0.9;
  this.dispatch({ type: 'SET_TRAIL_TIME', position: pos });
});
Then('copies are spawned rapidly and overlap closely', function (this: MixerWorld) {
  assert.ok(trailInterval(de(this).trailTime) < 0.6);
});
Then('copies are spawned slowly and spread further apart', function (this: MixerWorld) {
  assert.ok(trailInterval(de(this).trailTime) > 1.4);
});
Given('a trail is already building from the upper-left corner', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_TRAIL_CORNER', corner: 'upper-left' });
});
When('I move the Positioner Joystick while the trail is building', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_TRAIL_CORNER', corner: 'upper-right' });
});
Then('the already-spawned copies keep their original positions', function (this: MixerWorld) {
  assert.equal(de(this).freeze.trail, true);
});
Then('newly spawned copies follow the joystick to form a staggered series', function (this: MixerWorld) {
  assert.equal(de(this).trailCorner, 'upper-right');
});
When(/^I attempt to enable A\/V Synchro$/, function (this: MixerWorld) {
  this.dispatch({ type: 'ATTEMPT_AV_SYNCHRO', on: true });
});
Then(/^A\/V Synchro is refused while Trail is active$/, function (this: MixerWorld) {
  assert.equal(de(this).avSynchro, false);
});
Then('the Trail effect continues unaffected', function (this: MixerWorld) {
  assert.equal(de(this).freeze.trail, true);
});
Given(/^A\/V Synchro is active on the (?:A-bus|B-bus)$/, function (this: MixerWorld) {
  this.dispatch({ type: 'ATTEMPT_AV_SYNCHRO', on: true });
});
When('I attempt to enable the Trail effect', function (this: MixerWorld) {
  engage(this, 'trail', true);
});
Then('the two effects are not allowed to run together', function (this: MixerWorld) {
  assert.equal(de(this).freeze.trail && de(this).avSynchro, false);
});
When('a Compression Wipe transition is used', function () {});
Then('the Compression Wipe is not guaranteed to behave correctly', function (this: MixerWorld) {
  assert.equal(compressionReliable(this.snapshot()), false);
});
Then('the interaction is surfaced as unsupported rather than silently broken', function (this: MixerWorld) {
  assert.equal(compressionReliable(this.snapshot()), false);
});
Then(/^the Trail effect is applied to the (A-bus|B-bus)$/, function (this: MixerWorld, bus: string) {
  assert.equal(freezeActiveOn(de(this), busId(bus), 'trail'), true);
});
