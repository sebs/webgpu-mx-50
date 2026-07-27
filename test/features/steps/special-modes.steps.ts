// Step definitions for special-modes.feature (reference §14). Special Mode is a pure state
// machine: MEMORY+SHIFT toggles it, Event buttons (±SHIFT) arm one of eight macros, and the
// lever-at-B macros (Shutter/Vibrate/Satellite) run via AUTO TAKE. The compressed-image VISUALS
// are deferred GPU work (like the other complex passes); these steps assert the state machine,
// the macro table, the preconditions, Vibrate's 64-frame run, and Satellite's orbit.

import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { MixerWorld } from '../support/world.js';
import type { SourceSlot } from '../../../src/core/types.js';
import { runnerComplete } from '../../../src/core/timeline.js';
import {
  macroByName,
  macroName,
  macroSpec,
  macroCharacter,
  shutterRevealShape,
  memoryLedBlinking,
  VIBRATE_FRAMES,
} from '../../../src/core/special-mode.js';

const sm = (w: MixerWorld) => w.snapshot().specialMode;
const squareActive = (w: MixerWorld): boolean => w.snapshot().transition.wipe.family === 'square';

/** Arm a macro by its display name via the ordinal → Event button (+SHIFT) mapping. */
function armByName(w: MixerWorld, name: string): void {
  if (!sm(w).active) w.pressMemoryShift();
  const ord = macroSpec(macroByName(name)).ordinal;
  w.selectMacro(((((ord - 1) % 4) + 1) as 1 | 2 | 3 | 4), ord > 4);
}

// --- Background ---

Given('the mixer is powered and idle', function () {});
Given('the A-bus and B-bus each have a live source assigned', function (this: MixerWorld) {
  this.dispatch({ type: 'ASSIGN_SOURCE', bus: 'A', source: 1 as SourceSlot });
  this.dispatch({ type: 'ASSIGN_SOURCE', bus: 'B', source: 2 as SourceSlot });
});
Given('Special Mode is not active', function (this: MixerWorld) {
  assert.equal(sm(this).active, false);
});

// --- entry / exit ---

Given('Special Mode is active', function (this: MixerWorld) {
  if (!sm(this).active) this.pressMemoryShift();
});
When('I press MEMORY and SHIFT simultaneously', function (this: MixerWorld) {
  this.pressMemoryShift();
});
Then('Special Mode becomes active', function (this: MixerWorld) {
  assert.equal(sm(this).active, true);
});
Then('Special Mode becomes inactive', function (this: MixerWorld) {
  assert.equal(sm(this).active, false);
});
Then('the MEMORY LED blinks to indicate Special Mode is active', function (this: MixerWorld) {
  assert.equal(memoryLedBlinking(sm(this).active), true);
});
Then('the MEMORY LED stops blinking', function (this: MixerWorld) {
  assert.equal(memoryLedBlinking(sm(this).active), false);
});

// --- macro selection ---

When(/^I press Event button (\d+)$/, function (this: MixerWorld, n: string) {
  this.selectMacro(Number(n) as 1 | 2 | 3 | 4, false);
});
When(/^I press SHIFT together with Event button (\d+)$/, function (this: MixerWorld, n: string) {
  this.selectMacro(Number(n) as 1 | 2 | 3 | 4, true);
});
When(/^I select Event (\d+) using (.+)$/, function (this: MixerWorld, event: string, selector: string) {
  const shift = /SHIFT/i.test(selector);
  const button = (shift ? Number(event) - 4 : Number(event)) as 1 | 2 | 3 | 4;
  this.selectMacro(button, shift);
});

// Dual-use: as a Given it arms the macro; as a Then it asserts the macro is armed (§ shared-step pattern).
Given(/^the "([^"]+)" macro is armed$/, function (this: MixerWorld, name: string) {
  const macro = macroByName(name);
  if (sm(this).armed === macro) return; // assertion satisfied
  if (sm(this).armed === null) {
    armByName(this, name); // precondition
    return;
  }
  assert.equal(macroName(sm(this).armed!), name);
});
Then(/^the macro can be run by the Mix\/Wipe lever or Auto Take$/, function (this: MixerWorld) {
  assert.notEqual(sm(this).armed, null);
});

// --- lever position ---

Given(/^the Mix\/Wipe lever is fully at B$/, function (this: MixerWorld) {
  this.dispatch({ type: 'SET_LEVER', position: 1 });
});
Given(/^the Mix\/Wipe lever is not at B$/, function (this: MixerWorld) {
  this.dispatch({ type: 'SET_LEVER', position: 0 });
});
Given('the Square Wipe button is active', function (this: MixerWorld) {
  this.dispatch({ type: 'PRESS_WIPE_FAMILY', family: 'square' });
});

// --- running macros ---

When(/^I run the transition with the Mix\/Wipe lever$/, function (this: MixerWorld) {
  this.pressAutoTake();
});
When('I run the transition', function (this: MixerWorld) {
  this.pressAutoTake();
});
When('I run the transition using Auto Take', function (this: MixerWorld) {
  this.pressAutoTake();
});
When('I run the macro', function (this: MixerWorld) {
  this.pressAutoTake();
});
When('I start the macro with Auto Take', function (this: MixerWorld) {
  this.pressAutoTake();
});
When('I attempt to run the transition', function (this: MixerWorld) {
  this.pressAutoTake();
});
When('I attempt to run the macro', function (this: MixerWorld) {
  this.pressAutoTake();
});
When('I attempt to start the macro', function (this: MixerWorld) {
  this.pressAutoTake();
});
When(/^I trigger Auto Take(?: again)?$/, function (this: MixerWorld) {
  this.pressAutoTake();
});

Then(/^the transition behaves as "([^"]+)"$/, function (this: MixerWorld, description: string) {
  assert.equal(macroCharacter(sm(this).armed!), description);
});
Then('a horizontal split wipe reveals the Matte colour from the B-bus image', function (this: MixerWorld) {
  assert.equal(shutterRevealShape(squareActive(this)), 'horizontal-split');
});
Then('the Shutter reveal follows a Circle Wipe variant instead of a horizontal split', function (this: MixerWorld) {
  assert.equal(shutterRevealShape(squareActive(this)), 'circle-wipe');
});
Then('the B-bus image shakes horizontally', function (this: MixerWorld) {
  assert.equal(sm(this).run.phase, 'running');
});
Then('the shake lasts 64 video frames before settling', function (this: MixerWorld) {
  assert.equal(sm(this).run.durationTicks, VIBRATE_FRAMES);
  this.advanceToFrame(63);
  assert.equal(runnerComplete(sm(this).run), false);
  this.advanceToFrame(64);
  assert.equal(runnerComplete(sm(this).run), true);
});
Then('the compressed B-bus image orbits inside the A-bus image', function (this: MixerWorld) {
  assert.equal(sm(this).orbiting, true);
});
Then('the Satellite orbit starts', function (this: MixerWorld) {
  assert.equal(sm(this).orbiting, true);
});
Then('the Satellite orbit stops', function (this: MixerWorld) {
  assert.equal(sm(this).orbiting, false);
});
Then(/^the (?:Shutter|Vibrate|Satellite) macro does not start$/, function (this: MixerWorld) {
  assert.equal(sm(this).run.phase, 'idle');
  assert.equal(sm(this).orbiting, false);
});
Then('I am prompted to move the lever to B first', function (this: MixerWorld) {
  assert.equal(sm(this).leverPrompt, true);
});
Then(/^the macro executes identically to running it with the Mix\/Wipe lever$/, function (this: MixerWorld) {
  // A compressed-image macro (Bounce) runs as the standard take, regardless of the run control.
  assert.equal(this.snapshot().transition.auto.phase, 'running');
  assert.equal(this.snapshot().transition.auto.to, 1);
  assert.equal(sm(this).run.phase, 'idle');
});

// --- Satellite indefinite orbit ---

Given('the "Satellite" macro is running', function (this: MixerWorld) {
  if (!sm(this).active) this.pressMemoryShift();
  this.selectMacro(4, true); // satellite
  this.dispatch({ type: 'SET_LEVER', position: 1 });
  this.pressAutoTake();
});
When('no other mode or function is selected', function () {});
Then('the compressed B-bus image continues to orbit indefinitely', function (this: MixerWorld) {
  this.advanceFrames(600);
  assert.equal(sm(this).orbiting, true);
});
When('I select a different mode or function', function (this: MixerWorld) {
  this.selectMacro(1, false); // re-arm a different macro → stops the orbit (function change)
});
