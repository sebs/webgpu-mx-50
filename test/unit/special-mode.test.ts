import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SPECIAL_MACROS,
  VIBRATE_FRAMES,
  macroFromButton,
  macroName,
  macroByName,
  macroCharacter,
  macroNeedsLeverAtB,
  canRunMacro,
  shutterRevealShape,
  memoryLedBlinking,
} from '../../src/core/special-mode.js';
import type { SpecialMacro } from '../../src/core/special-mode.js';

test('the eight macros are ordered 1..8 with the reference names', () => {
  const expected = ['Mosaic Mix', 'Stream', 'Cork Screw', 'Bounce', 'Flip', 'Shutter', 'Vibrate', 'Satellite'];
  assert.equal(SPECIAL_MACROS.length, 8);
  SPECIAL_MACROS.forEach((m, i) => {
    assert.equal(m.ordinal, i + 1);
    assert.equal(m.name, expected[i]);
  });
});

test('macroFromButton maps Event buttons (±SHIFT) to the right macro', () => {
  const table: [number, boolean, SpecialMacro][] = [
    [1, false, 'mosaic-mix'],
    [2, false, 'stream'],
    [3, false, 'cork-screw'],
    [4, false, 'bounce'],
    [1, true, 'flip'],
    [2, true, 'shutter'],
    [3, true, 'vibrate'],
    [4, true, 'satellite'],
  ];
  for (const [button, shift, id] of table) assert.equal(macroFromButton(button, shift), id);
});

test('macroName and macroByName round-trip', () => {
  for (const m of SPECIAL_MACROS) {
    assert.equal(macroName(m.id), m.name);
    assert.equal(macroByName(m.name), m.id);
  }
  assert.throws(() => macroByName('Nope'));
});

test('the described character of the compressed-image macros matches the reference', () => {
  assert.equal(macroCharacter('mosaic-mix'), 'the mix itself becomes mosaic-pixelated mid-transition');
  assert.equal(macroCharacter('stream'), 'a compressed image zooms in from a corner');
  assert.equal(macroCharacter('cork-screw'), 'a compressed image corkscrews in from a corner');
  assert.equal(macroCharacter('bounce'), 'a compressed image drops in and bounces');
  assert.equal(macroCharacter('flip'), 'a vertical split compressed wipe reveals over the Matte colour');
});

test('only Shutter, Vibrate and Satellite require the lever at B', () => {
  for (const m of SPECIAL_MACROS) {
    const needs = m.id === 'shutter' || m.id === 'vibrate' || m.id === 'satellite';
    assert.equal(macroNeedsLeverAtB(m.id), needs, m.id);
  }
  // canRunMacro gates the B-group on the lever fully at B (>= 1).
  assert.equal(canRunMacro('vibrate', 0), false);
  assert.equal(canRunMacro('vibrate', 0.9), false);
  assert.equal(canRunMacro('vibrate', 1), true);
  assert.equal(canRunMacro('bounce', 0), true); // no precondition
});

test('Shutter is a horizontal split, or a circle wipe when Square Wipe is active', () => {
  assert.equal(shutterRevealShape(false), 'horizontal-split');
  assert.equal(shutterRevealShape(true), 'circle-wipe');
});

test('Vibrate lasts 64 frames and the MEMORY LED blinks iff Special Mode is active', () => {
  assert.equal(VIBRATE_FRAMES, 64);
  assert.equal(memoryLedBlinking(true), true);
  assert.equal(memoryLedBlinking(false), false);
});
