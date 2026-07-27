// Step definitions for the auto-take.feature @integration external-trigger scenarios, realized by
// the ADR-0014 control-mapping layer. GPI / RS422 / keyboard / on-screen all converge on the same
// PRESS_AUTO_TAKE command via the resolver (the sole emitter) or the pointer-exempt direct dispatch.
// The World's emitSignal routes through resolveSignal; the automation API is the RS422 stand-in.

import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { MixerWorld } from '../support/world.js';
import { runnerBlinking } from '../../../src/core/timeline.js';
import { chordToSignal } from '../../../src/control/keyboard.js';

const take = (w: MixerWorld) => w.snapshot().transition.auto;

// --- GPI trigger (mapped to autoTake.trigger) ---

Given('GPI triggering is enabled', function (this: MixerWorld) {
  this.gpiEnabled = true;
});
When('a GPI trigger edge is received', function (this: MixerWorld) {
  if (this.gpiEnabled) this.emitSignal('autoTake.trigger', 'trigger');
});
Then('an Auto Take begins exactly as if the AUTO TAKE button were pressed', function (this: MixerWorld) {
  this.advanceFrames(1);
  const r = take(this);
  assert.equal(r.phase, 'running');
  assert.equal(r.from, 0);
  assert.equal(r.to, 1);
  assert.ok(this.snapshot().transition.lever > 0);
});

Given('an Auto Take is in progress', function (this: MixerWorld) {
  this.setTransitionTime(100);
  this.emitSignal('autoTake.trigger', 'trigger');
  this.advanceFrames(40);
});
Then('the take pauses with the bus LEDs blinking', function (this: MixerWorld) {
  this.advanceFrames(5);
  assert.equal(take(this).phase, 'paused');
  assert.equal(runnerBlinking(take(this)), true);
});

// --- Any mapped control source fires Auto Take ---

Given(/^the control input "([^"]+)" is mapped to the Auto Take action$/, function (this: MixerWorld, source: string) {
  this.mappedTakeSource = source;
});
When('that control emits a trigger', function (this: MixerWorld) {
  const source = this.mappedTakeSource;
  if (/RS422/i.test(source)) {
    this.automation.triggerAutoTake(); // the local automation API (RS422/RS232C intent)
    this.framesSincePress = 0;
  } else if (/keyboard/i.test(source)) {
    const signal = chordToSignal('key:Space', this.bindingTable)!; // Space → autoTake.trigger by default
    this.emitSignal(signal.control, signal.mode, signal.value);
  } else if (/on-screen/i.test(source)) {
    this.dispatch({ type: 'PRESS_AUTO_TAKE', tick: this.now }); // pointer path (ADR-0014 exemption)
    this.framesSincePress = 0;
  } else {
    this.emitSignal('autoTake.trigger', 'trigger'); // GPI contact input
  }
});
Then('an Auto Take begins with the current TRANSITION time and transition type', function (this: MixerWorld) {
  const typeBefore = this.snapshot().transition.type;
  this.advanceFrames(1);
  const r = take(this);
  assert.equal(r.phase, 'running');
  assert.equal(r.durationTicks, this.snapshot().transitionFrames);
  assert.equal(this.snapshot().transition.type, typeBefore);
});
