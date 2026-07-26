// Step definitions for auto-take.feature (reference §15, ADR-0012). Auto Take runs the
// Mix/Wipe transition automatically over the TRANSITION frame count. Time is advanced
// headlessly via the World's LogicalClock (advanceFrames dispatches ADVANCE_TIMELINE per
// tick) — no rAF. The shared TRANSITION-set steps live in timeline.steps.ts.

import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { MixerWorld } from '../support/world.js';
import type { SourceSlot } from '../../../src/core/types.js';
import { runnerBlinking, runnerComplete } from '../../../src/core/timeline.js';

const take = (w: MixerWorld) => w.snapshot().transition.auto;
const lever = (w: MixerWorld) => w.snapshot().transition.lever;

// --- Background (steps not already registered elsewhere) ---

Given('A-bus and B-bus each have a source assigned', function (this: MixerWorld) {
  this.dispatch({ type: 'ASSIGN_SOURCE', bus: 'A', source: 1 as SourceSlot });
  this.dispatch({ type: 'ASSIGN_SOURCE', bus: 'B', source: 2 as SourceSlot });
});
Given(/^a transition type is selected for the Mix\/Wipe block$/, function (this: MixerWorld) {
  this.dispatch({ type: 'SET_TRANSITION_TYPE', transition: 'mix' });
});
Given(/^the Mix\/Wipe lever is fully at the A position$/, function (this: MixerWorld) {
  this.dispatch({ type: 'SET_LEVER', position: 0 });
});
Given(/^the Mix\/Wipe lever is resting halfway between A and B$/, function (this: MixerWorld) {
  this.dispatch({ type: 'SET_LEVER', position: 0.5 });
});

// --- TRANSITION control indicator / quantise assertions ---

Then(/^the take duration is accepted as (\d+) frames$/, function (this: MixerWorld, n: string) {
  assert.equal(this.snapshot().transitionFrames, Number(n));
});
Then(/^the Transition Time indicator shows (\d+) frames$/, function (this: MixerWorld, n: string) {
  assert.equal(this.snapshot().transitionFrames, Number(n));
});
Then(/^the take duration is clamped and snapped to (\d+) frames$/, function (this: MixerWorld, n: string) {
  assert.equal(this.snapshot().transitionFrames, Number(n));
});

// --- Press / execution ---

When('I press AUTO TAKE', function (this: MixerWorld) {
  this.pressAutoTake();
});
When('I press AUTO TAKE again', function (this: MixerWorld) {
  this.pressAutoTake();
});

Then('the transition advances automatically from the A position toward the B position', function (this: MixerWorld) {
  this.advanceFrames(1);
  const r = take(this);
  assert.equal(r.from, 0);
  assert.equal(r.to, 1);
  assert.equal(r.phase, 'running');
  assert.ok(lever(this) > 0);
});
Then(/^it completes after (\d+) frames$/, function (this: MixerWorld, n: string) {
  this.advanceToFrame(Number(n));
  assert.equal(runnerComplete(take(this)), true);
  assert.equal(lever(this), 1);
});
Then(/^the effective Mix\/Wipe position (?:ends fully|is fully) at B$/, function (this: MixerWorld) {
  assert.equal(lever(this), 1);
});
Then('no manual lever movement is required', function (this: MixerWorld) {
  assert.equal(take(this).to, 1); // the motion came from the runner, not a SET_LEVER
});
Then('the transition completes on the next rendered frame', function (this: MixerWorld) {
  this.advanceFrames(1);
  assert.equal(runnerComplete(take(this)), true);
  assert.equal(lever(this), 1);
});

// --- Transition type honoured ---

Given('the selected transition type is WIPE with a chosen pattern', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_TRANSITION_TYPE', transition: 'wipe' });
  this.dispatch({ type: 'PRESS_WIPE_FAMILY', family: 'corner' });
});
Then('the automatic take renders the selected wipe pattern progressing from A toward B', function (this: MixerWorld) {
  this.advanceFrames(20);
  assert.equal(this.snapshot().transition.type, 'wipe');
  assert.ok(lever(this) > 0);
});
Then('it does not perform a MIX dissolve', function (this: MixerWorld) {
  assert.notEqual(this.snapshot().transition.type, 'mix');
});

// --- Starts from the current rest ---

Then('the automatic take advances from the current position toward the far end', function (this: MixerWorld) {
  this.advanceFrames(1);
  const r = take(this);
  assert.ok(Math.abs(r.from - 0.5) < 1e-9);
  assert.equal(r.to, 1);
  assert.ok(lever(this) > 0.5);
});
Then('it completes at the B position', function (this: MixerWorld) {
  this.advanceToFrame(60);
  assert.equal(lever(this), 1);
  assert.equal(runnerComplete(take(this)), true);
});

// --- Pause / resume ---

Given(/^I have pressed AUTO TAKE and the take is in progress at frame (\d+)$/, function (this: MixerWorld, n: string) {
  this.pressAutoTake();
  this.advanceFrames(Number(n));
});
Then('the transition pauses and holds at its current position', function (this: MixerWorld) {
  const held = lever(this);
  this.advanceFrames(10);
  assert.equal(take(this).phase, 'paused');
  assert.equal(lever(this), held);
});
Then('the bus LEDs blink to indicate the paused, incomplete take', function (this: MixerWorld) {
  assert.equal(runnerBlinking(take(this)), true);
});
Given(/^an Auto Take is paused partway through at frame (\d+) of (\d+)$/, function (this: MixerWorld, at: string, of: string) {
  this.setTransitionTime(Number(of));
  this.pressAutoTake();
  this.advanceFrames(Number(at));
  this.pressAutoTake(); // pause
});
Then('the transition resumes from the held position', function (this: MixerWorld) {
  assert.equal(take(this).phase, 'running');
});
Then(/^it advances through the remaining (\d+) frames$/, function (this: MixerWorld, n: string) {
  this.advanceFrames(Number(n));
});
Then('it completes fully at B', function (this: MixerWorld) {
  assert.equal(lever(this), 1);
  assert.equal(runnerComplete(take(this)), true);
});
Then('the bus LEDs stop blinking once the take completes', function (this: MixerWorld) {
  assert.equal(runnerBlinking(take(this)), false);
});
Given(/^a (\d+)-frame Auto Take has run to completion$/, function (this: MixerWorld, n: string) {
  this.setTransitionTime(Number(n));
  this.pressAutoTake();
  this.advanceFrames(Number(n));
});
Then('the bus LEDs are not blinking', function (this: MixerWorld) {
  assert.equal(runnerBlinking(take(this)), false);
});
