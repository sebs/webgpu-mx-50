// Step definitions for downstream-key.feature (reference §10). The DSK is a downstream
// stage (after Mix/Wipe, before Fade). Dispatch typed commands and assert against
// core/dsk.ts and the fixed STAGE_ORDER. Reuses shared steps (mixer.steps).

import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { MixerWorld } from '../support/world.js';
import type { DskFill, DskKeySource } from '../../../src/state/state.js';
import { stageIsBefore } from '../../../src/core/signal-graph.js';
import {
  dskFillColour,
  dskEdgeColour,
  dskEdgeColourSelectable,
  edgeHasBorderOrShadow,
  isDskCharacter,
  dskEdgeStyleByLabel,
} from '../../../src/core/dsk.js';
import { matteFlatColor, matteColorAt } from '../../../src/core/matte.js';

const dskOf = (w: MixerWorld) => w.snapshot().dsk;
const keySourceFromText = (t: string): DskKeySource =>
  /ext/i.test(t) ? 'ext-camera' : /a-bus/i.test(t) ? 'A' : 'B';

// --- Background / signal-chain position ------------------------------------

Given(/^the DSK stage sits downstream of the Digital Effect and Mix\/Wipe blocks$/, function () {
  assert.equal(stageIsBefore('digital-effect', 'downstream-key'), true);
  assert.equal(stageIsBefore('mix-wipe', 'downstream-key'), true);
});
Given(/^the Mix\/Wipe Lever is at the B-bus position$/, function (this: MixerWorld) {
  this.dispatch({ type: 'SET_LEVER', position: 1 });
});
Given('a title source carries white lettering on a black card', function () {});
Given('the title source carries white lettering on a black card', function () {});
Given('a digital effect is applied to the composite beneath the key', function () {});

When('I turn the DSK ON', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_DSK_ON', on: true });
});
Given('the DSK is ON', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_DSK_ON', on: true });
});
Given('the DSK is OFF', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_DSK_ON', on: false });
});
Given('the DSK is ON with a title superimposed', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_DSK_ON', on: true });
});
Given('the DSK is ON with REVERSE engaged', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_DSK_ON', on: true });
  this.dispatch({ type: 'PRESS_DSK_REVERSE' });
});

Then('the keyed characters are superimposed over the effected composite', function (this: MixerWorld) {
  assert.equal(dskOf(this).on, true);
});
Then('the characters stay sharp regardless of the effect underneath', function (this: MixerWorld) {
  assert.equal(dskOf(this).on, true);
});
Then(/^the DSK acts after both the Digital Effect and Mix\/Wipe stages$/, function () {
  assert.equal(stageIsBefore('digital-effect', 'downstream-key'), true);
  assert.equal(stageIsBefore('mix-wipe', 'downstream-key'), true);
});
Then('the title fades together with the composite beneath it', function () {
  assert.equal(stageIsBefore('downstream-key', 'fade'), true);
});
Then('the Fade stage acts on the full composite including the key', function () {
  assert.equal(stageIsBefore('downstream-key', 'fade'), true);
});
When('the Fade stage fades the program out', function () {});

// --- Basic keying + fill ---------------------------------------------------

Given(/^the DSK fill is set to (WHITE|MATTE)$/, function (this: MixerWorld, fill: string) {
  this.dispatch({ type: 'SET_DSK_FILL', fill: fill.toLowerCase() as DskFill });
});
Given('the key source is EXT. CAMERA', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_DSK_KEY_SOURCE', source: 'ext-camera' });
});
Then('the fill colour appears inside the keyed characters', function (this: MixerWorld) {
  assert.equal(dskOf(this).on, true);
});
Then('the composite beneath shows through everywhere outside the characters', function (this: MixerWorld) {
  assert.equal(dskOf(this).on, true);
});
Then('no title is superimposed on the composite', function (this: MixerWorld) {
  assert.equal(dskOf(this).on, false);
});
Then('the composite is passed through the DSK stage unchanged', function (this: MixerWorld) {
  assert.equal(dskOf(this).on, false);
});
Then(/^the keyed characters are filled with (.+)$/, function (this: MixerWorld, result: string) {
  const fill = dskFillColour(dskOf(this), this.snapshot().matte);
  if (result.trim() === 'white') assert.deepEqual(fill, [1, 1, 1]);
  else assert.equal(dskOf(this).fill, 'matte');
});
Given('the Matte Generator colour is changed', function (this: MixerWorld) {
  this.dispatch({ type: 'STEP_MATTE_COLOR', direction: 'up' });
});
Then('the keyed characters take on the newly selected matte colour', function (this: MixerWorld) {
  assert.deepEqual(dskFillColour(dskOf(this), this.snapshot().matte), matteFlatColor(this.snapshot().matte));
});

// --- Key level window ------------------------------------------------------

Given('the Low Level Key slider is at the bottom', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_DSK_LOW', level: 0 });
});
Given('the High Level Key slider is at the top', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_DSK_HIGH', level: 1 });
});
Then('luminance values within the window are treated as characters and filled', function (this: MixerWorld) {
  assert.equal(isDskCharacter(0.5, dskOf(this)), true);
});
Then('luminance values outside the window let the composite show through', function (this: MixerWorld) {
  assert.equal(isDskCharacter(-0.5, dskOf(this)), false);
});
Given('the title source carries black lettering on a white card', function () {});
When('I adjust the Low Level Key slider', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_DSK_LOW', level: 0.1 });
});
When('I adjust the High Level Key slider', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_DSK_HIGH', level: 0.9 });
});
Then('the character edges resolve to a clean key against the black background', function (this: MixerWorld) {
  assert.equal(dskOf(this).on, true);
});
Then('the character edges resolve to a clean key against the white background', function (this: MixerWorld) {
  assert.equal(dskOf(this).on, true);
});
Given('the title source is the WJ-KB50 character generator', function () {});
When('I set both the Low Level and High Level Key sliders to the low end', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_DSK_LOW', level: 0.05 });
  this.dispatch({ type: 'SET_DSK_HIGH', level: 0.15 });
});
Then('the keyboard characters key cleanly with the fill colour', function (this: MixerWorld) {
  assert.equal(dskOf(this).on, true);
});

// --- Key source ------------------------------------------------------------

Given(/^the key source is set to (.+)$/, function (this: MixerWorld, source: string) {
  this.dispatch({ type: 'SET_DSK_KEY_SOURCE', source: keySourceFromText(source) });
});
Then(/^the key window is derived from the luminance of (.+)$/, function (this: MixerWorld, source: string) {
  assert.equal(dskOf(this).keySource, keySourceFromText(source));
});
Given('the external camera input carries a title card', function () {});
Then('the title card luminance defines the keyed characters', function (this: MixerWorld) {
  assert.equal(dskOf(this).keySource, 'ext-camera');
  assert.equal(dskOf(this).on, true);
});

// --- EDGE styles -----------------------------------------------------------

Given(/^the current DSK edge style is (.+)$/, function (this: MixerWorld, label: string) {
  this.dispatch({ type: 'SET_DSK_EDGE', edge: dskEdgeStyleByLabel(label) });
});
Given(/^the DSK edge style is (.+)$/, function (this: MixerWorld, label: string) {
  this.dispatch({ type: 'SET_DSK_EDGE', edge: dskEdgeStyleByLabel(label) });
});
When('I press EDGE', function (this: MixerWorld) {
  this.dispatch({ type: 'PRESS_DSK_EDGE' });
});
Then(/^the DSK edge style becomes (.+)$/, function (this: MixerWorld, label: string) {
  assert.equal(dskOf(this).edge, dskEdgeStyleByLabel(label));
});
Then('the keyed characters have no added border or shadow', function (this: MixerWorld) {
  assert.equal(edgeHasBorderOrShadow(dskOf(this).edge), false);
});
When('I set the edge colour to one of the 9 matte colours', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_DSK_EDGE_COLOR', colorIndex: 4 });
});
Then('the character edge takes on the selected matte colour', function (this: MixerWorld) {
  assert.equal(dskEdgeColourSelectable(dskOf(this)), true);
  assert.deepEqual(dskEdgeColour(dskOf(this)), [...matteColorAt(dskOf(this).edgeColorIndex).rgb]);
});
When('I enable GRADATION on the edge colour', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_GRADATION', on: true });
});
Then('the character edge is filled with a graded matte colour', function (this: MixerWorld) {
  assert.equal(this.snapshot().matte.gradation, true);
  assert.equal(dskEdgeColourSelectable(dskOf(this)), true);
});
Then('the character edge is always black', function (this: MixerWorld) {
  assert.deepEqual(dskEdgeColour(dskOf(this)), [0, 0, 0]);
});
Then('the edge colour cannot be set to a matte colour', function (this: MixerWorld) {
  assert.equal(dskEdgeColourSelectable(dskOf(this)), false);
});

// --- REVERSE ---------------------------------------------------------------

When('I press REVERSE', function (this: MixerWorld) {
  this.dispatch({ type: 'PRESS_DSK_REVERSE' });
});
Then('the luminance range treated as characters swaps with the range treated as background', function (this: MixerWorld) {
  assert.equal(dskOf(this).reverse, true);
});
Then('the lettering is knocked out of the background instead of filled', function (this: MixerWorld) {
  assert.equal(dskOf(this).reverse, true);
});
Then('the key returns to its original polarity', function (this: MixerWorld) {
  assert.equal(dskOf(this).reverse, false);
});
Then('the keyed characters are filled as before', function (this: MixerWorld) {
  assert.equal(dskOf(this).reverse, false);
});
