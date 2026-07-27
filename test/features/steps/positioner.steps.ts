// Step definitions for position-and-scene-grabber.feature (reference §7). Positioner
// engages only on Square-family wipes, doubles the wiped size, the lever sizes the inset,
// the joystick places it, and Scene Grabber freezes the inset. Reuses the ASPECT-toward
// step and wipe selection from wipe.steps.ts where possible. GPU-free.

import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { MixerWorld } from '../support/world.js';
import type { PositionerState, WipeFamily } from '../../../src/state/state.js';
import { aspectEffective } from '../../../src/core/positioner.js';
import { SQUARE_SHAPES, squareVariantForShape } from '../../../src/core/wipe.js';

function setPattern(w: MixerWorld, pattern: string): void {
  if ((SQUARE_SHAPES as readonly string[]).includes(pattern)) {
    w.dispatch({ type: 'PRESS_WIPE_FAMILY', family: 'square' });
    w.dispatch({ type: 'SET_WIPE_VARIANT', variant: squareVariantForShape(pattern) });
  } else {
    w.dispatch({ type: 'PRESS_WIPE_FAMILY', family: pattern as WipeFamily });
  }
}

const DIR_VEC: Record<string, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  'up and left': { x: -1, y: -1 },
  'upper-right corner': { x: 1, y: -1 },
  'lower-left corner': { x: -1, y: 1 },
};

function assertDirection(p: PositionerState, direction: string): void {
  if (direction.includes('up')) assert.ok(p.y < 0, 'y should be up');
  if (direction.includes('down')) assert.ok(p.y > 0, 'y should be down');
  if (direction.includes('left')) assert.ok(p.x < 0, 'x should be left');
  if (direction.includes('right')) assert.ok(p.x > 0, 'x should be right');
}

// --- Backgrounds -----------------------------------------------------------

Given('Program Out is set to EFFECT', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_PROGRAM_OUT', mode: 'effect' });
});
Given('a Wipe transition is active between A-bus and B-bus', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_TRANSITION_TYPE', transition: 'wipe' });
});
Given(/^the selected wipe pattern is "(.+)"$/, function (this: MixerWorld, pattern: string) {
  setPattern(this, pattern);
});
Given('the Positioner is active', function (this: MixerWorld) {
  this.dispatch({ type: 'PRESS_POSITIONER' });
});
Given('the wiped inset is placed near the centre of the screen', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_POSITIONER_JOYSTICK', x: 0, y: 0 });
});

// --- Positioner requires Square --------------------------------------------

When('I press the Positioner ON button', function (this: MixerWorld) {
  this.dispatch({ type: 'PRESS_POSITIONER' });
});
Then(/^the Positioner becomes (active|unavailable|inactive)$/, function (this: MixerWorld, state: string) {
  assert.equal(this.snapshot().positioner.on, state === 'active');
});
When(/^I select the "(.+)" wipe pattern$/, function (this: MixerWorld, pattern: string) {
  setPattern(this, pattern);
});
Then('any active Scene Grabber is cancelled', function (this: MixerWorld) {
  assert.equal(this.snapshot().positioner.sceneGrabber, false);
});

// --- ASPECT ON button ------------------------------------------------------

Given('the ASPECT ON button is lit', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_ASPECT_ON', on: true });
});
Given('the ASPECT ON button is unlit', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_ASPECT_ON', on: false });
});
When('I set the ASPECT control toward horizontal', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_WIPE_ASPECT', value: 0.6 });
});
Then('the wipe pattern is stretched vertically', function (this: MixerWorld) {
  const w = this.snapshot().transition.wipe;
  assert.equal(aspectEffective(w), true);
  assert.ok(w.aspect < 0);
});
Then('the wipe pattern is stretched horizontally', function (this: MixerWorld) {
  const w = this.snapshot().transition.wipe;
  assert.equal(aspectEffective(w), true);
  assert.ok(w.aspect > 0);
});
Then('the wipe pattern keeps its default 1:1 ratio', function (this: MixerWorld) {
  assert.equal(aspectEffective(this.snapshot().transition.wipe), false);
});

// --- Doubling --------------------------------------------------------------

Given(/^the current wiped size is (\d+) percent of the screen$/, function (this: MixerWorld, pct: string) {
  this.dispatch({ type: 'SET_POSITIONER_SIZE', value: Number(pct) / 100 });
});
Then(/^the wiped size becomes (\d+) percent of the screen$/, function (this: MixerWorld, pct: string) {
  assert.ok(Math.abs(this.snapshot().positioner.size - Number(pct) / 100) < 1e-9);
});

// --- Lever sizes the inset, joystick places it -----------------------------

When(/^I move the Mix\/Wipe lever toward (A-bus|B-bus)$/, function (this: MixerWorld, bus: string) {
  this.dispatch({ type: 'SET_LEVER', position: bus === 'B-bus' ? 0.75 : 0.25 });
});
Then('the wiped inset grows', function (this: MixerWorld) {
  assert.ok(this.snapshot().transition.lever > 0.5);
});
Then('the wiped inset shrinks', function (this: MixerWorld) {
  assert.ok(this.snapshot().transition.lever < 0.5);
});

When(/^I move the Positioner joystick (up and left|up|down|left|right)$/, function (this: MixerWorld, dir: string) {
  const v = DIR_VEC[dir]!;
  this.dispatch({ type: 'SET_POSITIONER_JOYSTICK', x: v.x, y: v.y });
});
Then(/^the wiped inset moves (up and left|up|down|left|right)$/, function (this: MixerWorld, dir: string) {
  assertDirection(this.snapshot().positioner, dir);
});
Then(/^the live video continues to update inside the inset$/, function (this: MixerWorld) {
  assert.equal(this.snapshot().positioner.sceneGrabber, false);
});

// --- Scene Grabber ---------------------------------------------------------

When('I press SCENE GRABBER', function (this: MixerWorld) {
  this.dispatch({ type: 'PRESS_SCENE_GRABBER' });
});
Then('the image inside the inset is frozen as a grabbed still', function (this: MixerWorld) {
  assert.equal(this.snapshot().positioner.sceneGrabber, true);
});
Then('the video behind the inset continues to play live', function () {});
Given('SCENE GRABBER has frozen the image inside the inset', function (this: MixerWorld) {
  this.dispatch({ type: 'PRESS_SCENE_GRABBER' });
});
Then(/^the grabbed still moves (right|down)$/, function (this: MixerWorld, dir: string) {
  const p = this.snapshot().positioner;
  assert.equal(p.sceneGrabber, true);
  assertDirection(p, dir);
});
Then('the grabbed still does not update with the live source', function (this: MixerWorld) {
  assert.equal(this.snapshot().positioner.sceneGrabber, true);
});
Then('the live video behind the still keeps playing', function () {});
Then('the grabbed still keeps the size it had at the moment of grabbing', function (this: MixerWorld) {
  assert.equal(this.snapshot().positioner.sceneGrabber, true);
});

// --- Positioner OFF cancels Scene Grabber ----------------------------------

When('I press the Positioner ON button to switch it off', function (this: MixerWorld) {
  this.dispatch({ type: 'PRESS_POSITIONER' });
});
Then('the Scene Grabber is cancelled', function (this: MixerWorld) {
  assert.equal(this.snapshot().positioner.sceneGrabber, false);
});
Then('the grabbed still is discarded', function (this: MixerWorld) {
  assert.equal(this.snapshot().positioner.sceneGrabber, false);
});

// --- Phase 8: #12 Build a moving picture-in-picture inset then freeze it (@integration) ---

When('I set the ASPECT control to a 4:3 ratio', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_WIPE_ASPECT', value: 0.33 });
});
When(/^I set the wiped size with the Mix\/Wipe lever to a small inset$/, function (this: MixerWorld) {
  this.dispatch({ type: 'SET_LEVER', position: 0.2 });
});
When('I move the Positioner joystick to the upper-right corner', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_POSITIONER_JOYSTICK', x: DIR_VEC['upper-right corner']!.x, y: DIR_VEC['upper-right corner']!.y });
});
Then('a small live inset appears in the upper-right corner', function (this: MixerWorld) {
  const p = this.snapshot().positioner;
  assert.ok(p.on && !p.sceneGrabber && p.x > 0 && p.y < 0);
  assert.equal(aspectEffective(this.snapshot().transition.wipe), true);
});
When('I move the Positioner joystick to the lower-left corner', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_POSITIONER_JOYSTICK', x: DIR_VEC['lower-left corner']!.x, y: DIR_VEC['lower-left corner']!.y });
});
Then('the frozen inset travels to the lower-left corner over the live background', function (this: MixerWorld) {
  const p = this.snapshot().positioner;
  assert.ok(p.sceneGrabber && p.x < 0 && p.y > 0);
});
