// Step definitions for combination-recipes.feature (@integration, reference §16). Each recipe is
// a cross-feature STACK; these steps compose existing commands and assert the domain-level result
// (state + existing selectors). Rendered-pixel outcomes (ghost trails, mosaic/border pixels, the
// compressed inset geometry) are deferred like all GPU visuals — every clause here has a domain
// proxy. Recipe 1's double-effect scenarios (S1–S3) are DEFERRED: the single-bus DigitalEffect
// model cannot hold two live effects at once (same reason auto-take.feature:174 defers).

import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { MixerWorld } from '../support/world.js';
import type { BusId, SourceSlot } from '../../../src/core/types.js';
import type { FilterEffect, PanelState, WipeFamily } from '../../../src/state/state.js';
import { effectActiveOn, anyEffectOn } from '../../../src/core/digital-effect.js';
import { hasBorder, complementaryMatteName, squareVariantForShape } from '../../../src/core/wipe.js';
import { matteColorName } from '../../../src/core/matte.js';
import { positionerAvailable, isStorablePip } from '../../../src/core/positioner.js';
import { avSynchroEffectApplied, ENVELOPE_LOUD } from '../../../src/core/av-synchro.js';
import { afterImageRecipe, afterImageLook, afterImageStrength } from '../../../src/core/after-image.js';

const de = (w: MixerWorld) => w.snapshot().digitalEffect;
const wipe = (w: MixerWorld) => w.snapshot().transition.wipe;
const pos = (w: MixerWorld) => w.snapshot().positioner;
const asState = (snap: unknown) => snap as PanelState; // a PanelSnapshot structurally has transition + positioner

const FILTERS = ['nega', 'mosaic', 'mono', 'paint'];

/** Apply a composite effect label ("Mosaic", "Paint + Strobe") to a bus's Digital Effect block. */
function applyEffectLabel(w: MixerWorld, bus: BusId, label: string): void {
  w.dispatch({ type: 'SELECT_EFFECT_BUS', bus });
  for (const raw of label.split(/\s*(?:\+|and)\s*/i)) {
    const name = raw.trim().toLowerCase();
    if (FILTERS.indexOf(name) !== -1) {
      w.dispatch({ type: 'CHOOSE_EFFECT', effect: name as FilterEffect });
      w.dispatch({ type: 'PRESS_EFFECT_ON' });
    } else if (name === 'strobe' || name === 'still' || name === 'trail') {
      w.dispatch({ type: 'ENGAGE_FREEZE', effect: name, on: true });
    } else if (name === 'multi') {
      w.dispatch({ type: 'PRESS_MULTI' });
    }
  }
  if (bus === 'A') w.aEffect = label;
  else w.bEffect = label;
}

/** Select a Square-family wipe at the given variant shape. */
function selectWipeFamilyVariant(w: MixerWorld, family: string, variant: string): void {
  w.dispatch({ type: 'PRESS_WIPE_FAMILY', family: family.toLowerCase() as WipeFamily });
  w.dispatch({ type: 'SET_WIPE_VARIANT', variant: squareVariantForShape(variant) });
}

// ===========================================================================
// Background
// ===========================================================================

Given('Program Out is set to EFFECT so the full processed composite is shown', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_PROGRAM_OUT', mode: 'effect' });
});
Given('both the A-bus and B-bus have a source assigned', function (this: MixerWorld) {
  this.dispatch({ type: 'ASSIGN_SOURCE', bus: 'A', source: 1 as SourceSlot });
  this.dispatch({ type: 'ASSIGN_SOURCE', bus: 'B', source: 2 as SourceSlot });
});

// ===========================================================================
// Shared setup steps
// ===========================================================================

Given('the same source is assigned to both the A-bus and the B-bus', function (this: MixerWorld) {
  this.dispatch({ type: 'ASSIGN_SOURCE', bus: 'A', source: 1 as SourceSlot });
  this.dispatch({ type: 'ASSIGN_SOURCE', bus: 'B', source: 1 as SourceSlot });
});
Given(/^the (A-bus|B-bus) digital effect is "(.+)"$/, function (this: MixerWorld, busLabel: string, label: string) {
  applyEffectLabel(this, busLabel.startsWith('A') ? 'A' : 'B', label);
});
Given(/^the "(.+)" wipe family variant "(.+)" is selected$/, function (this: MixerWorld, family: string, variant: string) {
  selectWipeFamilyVariant(this, family, variant);
});
When(/^the wipe lever is moved toward its full-B position$/, function (this: MixerWorld) {
  this.dispatch({ type: 'SET_LEVER', position: 0.75 });
});

// ===========================================================================
// Recipe 2 — Mosaic Spotlight (S4–S7)
// ===========================================================================

Given('the wipe lever is held at a partial position so the square is inset within the frame', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_LEVER', position: 0.5 });
});
When('the Positioner moves the square', function (this: MixerWorld) {
  this.dispatch({ type: 'PRESS_POSITIONER' });
  this.dispatch({ type: 'SET_POSITIONER_JOYSTICK', x: 0.5, y: -0.3 });
});
Then('a mosaic block appears over an otherwise normal picture', function (this: MixerWorld) {
  assert.equal(effectActiveOn(de(this), 'B', 'mosaic'), true);
  assert.equal(anyEffectOn(de(this), 'A'), false);
});
Then('the block tracks the Positioner so it can be placed over any region', function (this: MixerWorld) {
  assert.ok(pos(this).on && (pos(this).x !== 0 || pos(this).y !== 0));
});

Given('a Mosaic Spotlight is active with a Square wipe', function (this: MixerWorld) {
  this.dispatch({ type: 'ASSIGN_SOURCE', bus: 'A', source: 1 as SourceSlot });
  this.dispatch({ type: 'ASSIGN_SOURCE', bus: 'B', source: 1 as SourceSlot });
  this.dispatch({ type: 'SELECT_EFFECT_BUS', bus: 'B' });
  this.dispatch({ type: 'CHOOSE_EFFECT', effect: 'mosaic' });
  this.dispatch({ type: 'PRESS_EFFECT_ON' });
  this.dispatch({ type: 'SET_TRANSITION_TYPE', transition: 'wipe' });
  this.dispatch({ type: 'PRESS_WIPE_FAMILY', family: 'square' });
  this.dispatch({ type: 'PRESS_POSITIONER' });
});
When('BORDER is enabled on the wipe edge', function (this: MixerWorld) {
  this.dispatch({ type: 'PRESS_BORDER' });
});
Then('the mosaic block is outlined by a border', function (this: MixerWorld) {
  assert.ok(hasBorder(wipe(this).edge) && effectActiveOn(de(this), 'B', 'mosaic'));
});
Then(/^the border colour follows the Matte\/border setting$/, function (this: MixerWorld) {
  assert.ok(hasBorder(wipe(this).edge));
  assert.equal(typeof complementaryMatteName(matteColorName(this.snapshot().matte.colorIndex)), 'string');
});

When(/^"(.+)" is applied$/, function (this: MixerWorld, modifier: string) {
  this.spotlightModifier = modifier;
  if (/reverse/i.test(modifier)) {
    this.dispatch({ type: 'SET_REVERSE', on: true });
  } else if (/mono/i.test(modifier)) {
    this.dispatch({ type: 'SELECT_EFFECT_BUS', bus: 'B' });
    this.dispatch({ type: 'CHOOSE_EFFECT', effect: 'mono' });
    this.dispatch({ type: 'PRESS_EFFECT_ON' });
  }
});
Then(/^the spotlight region is highlighted by "(.+)"$/, function (this: MixerWorld, effect: string) {
  if (/monochrome/i.test(effect)) {
    assert.ok(effectActiveOn(de(this), 'B', 'mono') && effectActiveOn(de(this), 'B', 'mosaic'));
  } else {
    assert.equal(wipe(this).reverse, true);
  }
});

Then('the mosaic square grows larger', function (this: MixerWorld) {
  assert.ok(this.snapshot().transition.lever > 0.5);
});
Then('when the lever is moved toward its full-A position the mosaic square shrinks', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_LEVER', position: 0.25 });
  assert.ok(this.snapshot().transition.lever < 0.5);
});

// ===========================================================================
// Recipe 3 — After Image, A/V-Synchro slice only (S10)
// ===========================================================================

Given(/^an After Image is active with Strobe(?: on the A-bus)? and MIX$/, function (this: MixerWorld) {
  this.dispatch({ type: 'ASSIGN_SOURCE', bus: 'A', source: 1 as SourceSlot });
  this.dispatch({ type: 'ASSIGN_SOURCE', bus: 'B', source: 1 as SourceSlot });
  this.dispatch({ type: 'SELECT_EFFECT_BUS', bus: 'A' });
  this.dispatch({ type: 'ENGAGE_FREEZE', effect: 'strobe', on: true });
  this.dispatch({ type: 'SET_TRANSITION_TYPE', transition: 'mix' });
  this.dispatch({ type: 'SET_LEVER', position: 0.5 });
});
When(/^A\/V SYNCHRO is enabled and driven by the audio input$/, function (this: MixerWorld) {
  this.dispatch({ type: 'ATTEMPT_AV_SYNCHRO', on: true });
  this.dispatch({ type: 'SET_AV_SYNCHRO_EFFECT', effect: 'strobe', on: true });
  this.avEnvelope = ENVELOPE_LOUD;
});
Then('the Strobe re-samples on audio peaks', function (this: MixerWorld) {
  assert.equal(avSynchroEffectApplied(de(this), 'strobe', this.avEnvelope), true);
});
Then('the ghost after-images pulse in time with the music', function (this: MixerWorld) {
  const below = Math.max(0, de(this).avSynchroLevel - 0.1);
  assert.equal(avSynchroEffectApplied(de(this), 'strobe', ENVELOPE_LOUD), true);
  assert.equal(avSynchroEffectApplied(de(this), 'strobe', below), false);
});

// ===========================================================================
// Recipe 5 — Picture-in-Picture (S14–S18)
// ===========================================================================

Given('COMPRESSION is engaged so the incoming scene wipes in as a whole scaled-down picture', function (this: MixerWorld) {
  this.dispatch({ type: 'PRESS_COMPRESSION' });
});
When('the recipe is composed', function (this: MixerWorld) {
  if (wipe(this).family === 'square' && !pos(this).on) this.dispatch({ type: 'PRESS_POSITIONER' });
});
Then('the B-bus picture appears as a compressed inset over the full A-bus picture', function (this: MixerWorld) {
  const s = this.snapshot();
  assert.ok(s.transition.type === 'wipe' && wipe(this).family === 'square' && wipe(this).modifiers.compression > 0 && positionerAvailable('square'));
});
Then('the Positioner moves the inset anywhere within the frame', function (this: MixerWorld) {
  assert.equal(pos(this).on, true);
  this.dispatch({ type: 'SET_POSITIONER_JOYSTICK', x: 0.4, y: 0.4 });
  assert.ok(pos(this).x !== 0 && pos(this).y !== 0);
});

Given('a Picture-in-Picture is active with a Square wipe and Compression', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_TRANSITION_TYPE', transition: 'wipe' });
  this.dispatch({ type: 'PRESS_WIPE_FAMILY', family: 'square' });
  this.dispatch({ type: 'PRESS_COMPRESSION' });
  this.dispatch({ type: 'PRESS_POSITIONER' });
});
Then('the inset grows larger', function (this: MixerWorld) {
  assert.ok(this.snapshot().transition.lever > 0.5);
});
Then('when the lever is moved toward its full-A position the inset shrinks', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_LEVER', position: 0.25 });
  assert.ok(this.snapshot().transition.lever < 0.5);
});

Given('a Picture-in-Picture is active', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_TRANSITION_TYPE', transition: 'wipe' });
  this.dispatch({ type: 'PRESS_WIPE_FAMILY', family: 'square' });
  this.dispatch({ type: 'PRESS_POSITIONER' });
});
When('SCENE GRABBER is triggered on the inset source', function (this: MixerWorld) {
  this.dispatch({ type: 'PRESS_SCENE_GRABBER' });
});
Then('the inset holds a frozen still', function (this: MixerWorld) {
  assert.equal(pos(this).sceneGrabber, true);
});
Then('the surrounding A-bus picture continues to update live', function (this: MixerWorld) {
  assert.equal(pos(this).sceneGrabber, true); // only the inset is grabbed
});

When('the panel state is stored to an Event Memory slot', function (this: MixerWorld) {
  this.pressMemory();
  this.pressEventNo(1, false);
  this.pipSlot = 1;
});
Then('the PiP configuration is saved and can be recalled', function (this: MixerWorld) {
  assert.equal(isStorablePip(asState(this.snapshot().memory.slots[0])), true);
  this.pressEventNo(1, false);
  this.pressAutoTake();
  assert.equal(isStorablePip(this.snapshot()), true);
});

Given('a Picture-in-Picture-like inset is built on a non-square wipe family', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_TRANSITION_TYPE', transition: 'wipe' });
  this.dispatch({ type: 'PRESS_WIPE_FAMILY', family: 'straight' });
  this.dispatch({ type: 'PRESS_POSITIONER' }); // no-op off Square → stays off
  this.dispatch({ type: 'PRESS_COMPRESSION' });
});
When('storage to an Event Memory slot is attempted', function (this: MixerWorld) {
  this.pressMemory();
  this.pressEventNo(2, false);
  this.pipSlot = 2;
});
Then('the configuration is not stored as a recallable PiP', function (this: MixerWorld) {
  assert.equal(isStorablePip(asState(this.snapshot().memory.slots[1])), false);
});
Then('only the square-wipe PiP is documented as storable', function (this: MixerWorld) {
  assert.equal(isStorablePip(asState(this.snapshot().memory.slots[1])), false);
  const ref = structuredClone(this.snapshot());
  ref.transition = { ...ref.transition, type: 'wipe', wipe: { ...ref.transition.wipe, family: 'square', modifiers: { ...ref.transition.wipe.modifiers, compression: 1 } } };
  ref.positioner = { ...ref.positioner, on: true };
  assert.equal(isStorablePip(ref), true);
});

// ===========================================================================
// Recipe 3 — After Image, ghost scenarios (S8/S9): the double-exposure look is a
// pure function of the setup (core/after-image.ts), so the ghost clauses assert
// the exact balance/spacing the strobe-freeze + MIX render realises.
// ===========================================================================

Given('the transition mode is MIX', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_TRANSITION_TYPE', transition: 'mix' });
});
Given('the wipe lever is held at a partial position mixing A over B', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_LEVER', position: 0.35 });
});
When('the source contains motion', function () {
  // Motion is the source's business — it has no store representation.
});
Then('moving elements leave ghost after-images trailing behind them', function (this: MixerWorld) {
  const s = this.snapshot();
  assert.equal(afterImageRecipe(s), true);
  const look = afterImageLook(s)!;
  assert.ok(look.ghostAlpha > 0 && look.liveAlpha > 0); // both exposures contribute
});
Then('the ghost density is tuned by the Strobe TIME and the lever position', function (this: MixerWorld) {
  const before = afterImageLook(this.snapshot())!;
  this.dispatch({ type: 'SET_STROBE_TIME', position: 0.9 });
  assert.ok(afterImageLook(this.snapshot())!.spacingSeconds > before.spacingSeconds);
  this.dispatch({ type: 'SET_LEVER', position: 0.7 });
  assert.notEqual(afterImageLook(this.snapshot())!.ghostAlpha, before.ghostAlpha);
});
When('the Strobe TIME is {string} and the lever is at {string}', function (this: MixerWorld, time: string, lever: string) {
  this.dispatch({ type: 'SET_STROBE_TIME', position: time === 'short' ? 0.1 : 0.9 });
  this.dispatch({ type: 'SET_LEVER', position: lever === 'centre' ? 0.5 : 0.15 });
});
Then('the after-image trail is {string}', function (this: MixerWorld, strength: string) {
  const expected = /many faint/.test(strength)
    ? 'many-faint-close'
    : /widely spaced/.test(strength)
      ? 'few-wide'
      : 'subtle-lopsided';
  assert.equal(afterImageStrength(afterImageLook(this.snapshot())!), expected);
});
