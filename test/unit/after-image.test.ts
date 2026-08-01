import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce } from '../../src/state/reducer.js';
import { FACTORY_PRESET } from '../../src/state/state.js';
import type { PanelState } from '../../src/state/state.js';
import { anyDigitalEffectOn, strobeInterval } from '../../src/core/digital-effect.js';
import { afterImageRecipe, afterImageLook, afterImageStrength } from '../../src/core/after-image.js';

const fresh = (): PanelState => structuredClone(FACTORY_PRESET);

/** The canonical Recipe-3 setup: same source both buses, Strobe on A, MIX, partial lever. */
function canonical(): PanelState {
  let s = reduce(fresh(), { type: 'ASSIGN_SOURCE', bus: 'A', source: 1 });
  s = reduce(s, { type: 'ASSIGN_SOURCE', bus: 'B', source: 1 });
  s = reduce(s, { type: 'SELECT_EFFECT_BUS', bus: 'A' });
  s = reduce(s, { type: 'ENGAGE_FREEZE', effect: 'strobe', on: true });
  s = reduce(s, { type: 'SET_TRANSITION_TYPE', transition: 'mix' });
  s = reduce(s, { type: 'SET_LEVER', position: 0.5 });
  return s;
}

test('the After-Image recipe needs same source, Strobe, MIX and a partial lever', () => {
  const s = canonical();
  assert.equal(afterImageRecipe(s), true);
  assert.equal(afterImageRecipe(reduce(s, { type: 'SET_TRANSITION_TYPE', transition: 'wipe' })), false);
  assert.equal(afterImageRecipe(reduce(s, { type: 'SET_LEVER', position: 0 })), false);
  assert.equal(afterImageRecipe(reduce(s, { type: 'SET_LEVER', position: 1 })), false);
  assert.equal(afterImageRecipe(reduce(s, { type: 'ENGAGE_FREEZE', effect: 'strobe', on: false })), false);
  assert.equal(afterImageRecipe(reduce(s, { type: 'ASSIGN_SOURCE', bus: 'B', source: 2 })), false);
});

test('ghost weight is the strobed bus mix weight and spacing is the Strobe interval', () => {
  let s = reduce(canonical(), { type: 'SET_LEVER', position: 0.3 });
  let look = afterImageLook(s);
  assert.ok(look);
  assert.ok(Math.abs(look.ghostAlpha - 0.7) < 1e-9); // strobe on A → weight 1 - lever
  assert.ok(Math.abs(look.liveAlpha - 0.3) < 1e-9);
  // Strobe on B instead → the ghost weight is the lever.
  let b = reduce(s, { type: 'SELECT_EFFECT_BUS', bus: 'B' });
  b = reduce(b, { type: 'ENGAGE_FREEZE', effect: 'strobe', on: true });
  const lookB = afterImageLook(b);
  assert.ok(lookB && Math.abs(lookB.ghostAlpha - 0.3) < 1e-9);
  for (const t of [0.1, 0.9]) {
    const timed = reduce(s, { type: 'SET_STROBE_TIME', position: t });
    look = afterImageLook(timed);
    assert.ok(look && look.spacingSeconds === strobeInterval(timed.digitalEffect.strobeTime));
  }
  assert.equal(afterImageLook(reduce(s, { type: 'SET_TRANSITION_TYPE', transition: 'nam' })), null);
});

test('strength classifies the S9 outline rows', () => {
  const at = (time: number, lever: number) => {
    let s = reduce(canonical(), { type: 'SET_STROBE_TIME', position: time });
    s = reduce(s, { type: 'SET_LEVER', position: lever });
    const look = afterImageLook(s);
    assert.ok(look);
    return afterImageStrength(look);
  };
  assert.equal(at(0.1, 0.5), 'many-faint-close');
  assert.equal(at(0.9, 0.5), 'few-wide');
  assert.equal(at(0.9, 0.85), 'subtle-lopsided'); // near-A: ghost on A dominates ↔ lever near B is lopsided too
  assert.equal(at(0.9, 0.15), 'subtle-lopsided');
});

test('the recipe leaves the one-bus Digital Effect invariant untouched', () => {
  const s = canonical();
  assert.equal(anyDigitalEffectOn(s.digitalEffect, 'B'), false);
  assert.equal(s.digitalEffect.freeze.strobe, true);
  assert.equal(s.digitalEffect.bus, 'A');
});
