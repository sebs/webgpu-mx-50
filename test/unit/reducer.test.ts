import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce, clamp } from '../../src/state/reducer.js';
import { FACTORY_PRESET, fieldPreset, panelSnapshot, MATTE_COLOR_COUNT } from '../../src/state/state.js';
import type { PanelSnapshot, PanelState } from '../../src/state/state.js';

test('clamp bounds a value into range', () => {
  assert.equal(clamp(-1, 0, 1), 0);
  assert.equal(clamp(2, 0, 1), 1);
  assert.equal(clamp(0.4, 0, 1), 0.4);
});

test('SET_LEVER clamps the position into [0, 1]', () => {
  const s = structuredClone(FACTORY_PRESET);
  assert.equal(reduce(s, { type: 'SET_LEVER', position: 1.7 }).transition.lever, 1);
  assert.equal(reduce(s, { type: 'SET_LEVER', position: -0.3 }).transition.lever, 0);
});

test('ASSIGN_SOURCE accepts the Matte as a bus source', () => {
  const s = structuredClone(FACTORY_PRESET);
  const next = reduce(s, { type: 'ASSIGN_SOURCE', bus: 'B', source: 'matte' });
  assert.equal(next.busB.source, 'matte');
});

test('SET_MATTE_COLOR wraps within the 9-colour ring', () => {
  const s = structuredClone(FACTORY_PRESET);
  assert.equal(reduce(s, { type: 'SET_MATTE_COLOR', colorIndex: MATTE_COLOR_COUNT }).matte.colorIndex, 0);
  assert.equal(reduce(s, { type: 'SET_MATTE_COLOR', colorIndex: -1 }).matte.colorIndex, MATTE_COLOR_COUNT - 1);
});

test('reduce never mutates its input', () => {
  const s = structuredClone(FACTORY_PRESET);
  const snapshot = JSON.stringify(s);
  reduce(s, { type: 'SET_LEVER', position: 0.5 });
  reduce(s, { type: 'ASSIGN_SOURCE', bus: 'A', source: 4 });
  assert.equal(JSON.stringify(s), snapshot);
});

test('an unchanged command returns the same state reference', () => {
  const s = structuredClone(FACTORY_PRESET);
  assert.equal(reduce(s, { type: 'ASSIGN_SOURCE', bus: 'A', source: s.busA.source }), s);
});

test('fieldPreset returns an independent clone (reference §18 seam)', () => {
  const saved = structuredClone(FACTORY_PRESET);
  const restored = fieldPreset(saved);
  assert.notEqual(restored, saved);
  assert.deepEqual(restored, saved);
});

test('ASSIGN_SOURCE tracks the blinking substitute (last non-Matte source, ADR-0006)', () => {
  const s0 = structuredClone(FACTORY_PRESET);
  const s1 = reduce(s0, { type: 'ASSIGN_SOURCE', bus: 'A', source: 3 });
  assert.equal(s1.busA.source, 3);
  assert.equal(s1.busA.substituteSource, 3);

  const s2 = reduce(s1, { type: 'ASSIGN_SOURCE', bus: 'A', source: 'matte' });
  assert.equal(s2.busA.source, 'matte');
  assert.equal(s2.busA.substituteSource, 3); // preserved while Matte is selected
});

test('ASSIGN_SOURCE preserves other per-bus fields (e.g. colourCorrect)', () => {
  let s = structuredClone(FACTORY_PRESET);
  s = reduce(s, { type: 'PRESS_COLOUR_CORRECT', bus: 'A' }); // cc → chroma-only
  const next = reduce(s, { type: 'ASSIGN_SOURCE', bus: 'A', source: 3 });
  assert.equal(next.busA.source, 3);
  assert.ok(next.busA.colourCorrect, 'colourCorrect must survive ASSIGN_SOURCE');
  assert.equal(next.busA.colourCorrect.mode, 'chroma-only');
});

test('SET_PROGRAM_OUT switches the program mode', () => {
  const s = structuredClone(FACTORY_PRESET);
  assert.equal(reduce(s, { type: 'SET_PROGRAM_OUT', mode: 'A' }).programOut, 'A');
});

test('STEP_MATTE_COLOR wraps up (Black -> Colour Bar) and down', () => {
  const s = structuredClone(FACTORY_PRESET);
  s.matte.colorIndex = 8; // Black
  assert.equal(reduce(s, { type: 'STEP_MATTE_COLOR', direction: 'up' }).matte.colorIndex, 0);
  s.matte.colorIndex = 0; // Colour Bar
  assert.equal(reduce(s, { type: 'STEP_MATTE_COLOR', direction: 'down' }).matte.colorIndex, 8);
});

test('SET_MATTE_LEVEL clamps and SET_GRADATION toggles', () => {
  const s = structuredClone(FACTORY_PRESET);
  assert.equal(reduce(s, { type: 'SET_MATTE_LEVEL', level: 1.5 }).matte.level, 1);
  assert.equal(reduce(s, { type: 'SET_GRADATION', on: true }).matte.gradation, true);
});

// --- Phase 6: fade control + automatic transitions (reference §11/§15, ADR-0012) ---

test('fade enable / target / lever no-op on an unchanged value and otherwise update', () => {
  const s = structuredClone(FACTORY_PRESET);
  assert.equal(reduce(s, { type: 'SET_FADE_ENABLE', element: 'video', on: false }), s); // already off
  assert.equal(reduce(s, { type: 'SET_FADE_ENABLE', element: 'video', on: true }).fade.video, true);
  assert.equal(reduce(s, { type: 'SET_FADE_TARGET', target: 'black' }), s); // factory default
  assert.equal(reduce(s, { type: 'SET_FADE_TARGET', target: 'matte' }).fade.target, 'matte');
  assert.equal(reduce(s, { type: 'SET_FADE_LEVER', position: 1.5 }).fade.lever, 1);
  assert.equal(reduce(s, { type: 'SET_FADE_LEVER', position: 0 }), s); // already at IN
});

test('SET_TRANSITION_TIME quantises to a 2-frame step and no-ops when unchanged', () => {
  const s = structuredClone(FACTORY_PRESET);
  assert.equal(reduce(s, { type: 'SET_TRANSITION_TIME', frames: 61 }).transitionFrames, 60);
  assert.equal(reduce(s, { type: 'SET_TRANSITION_TIME', frames: 600 }).transitionFrames, 510);
  assert.equal(reduce(s, { type: 'SET_TRANSITION_TIME', frames: 60 }), s); // factory default is 60
});

test('PRESS_AUTO_TAKE starts a run toward B, then pauses and resumes', () => {
  const s = structuredClone(FACTORY_PRESET); // lever at 0, frames 60
  const started = reduce(s, { type: 'PRESS_AUTO_TAKE', tick: 5 });
  const r = started.transition.auto;
  assert.equal(r.phase, 'running');
  assert.equal(r.startTick, 5);
  assert.equal(r.durationTicks, 60);
  assert.equal(r.from, 0);
  assert.equal(r.to, 1);
  const paused = reduce(started, { type: 'PRESS_AUTO_TAKE', tick: 20 });
  assert.equal(paused.transition.auto.phase, 'paused');
  assert.equal(reduce(paused, { type: 'PRESS_AUTO_TAKE', tick: 25 }).transition.auto.phase, 'running');
});

test('PRESS_AUTO_FADE starts an Auto Fade toward OUT', () => {
  const s = structuredClone(FACTORY_PRESET);
  const r = reduce(s, { type: 'PRESS_AUTO_FADE', tick: 0 }).fade.auto;
  assert.equal(r.phase, 'running');
  assert.equal(r.from, 0);
  assert.equal(r.to, 1);
});

test('ADVANCE_TIMELINE is a same-ref no-op while both runners are idle', () => {
  const s = structuredClone(FACTORY_PRESET);
  assert.equal(reduce(s, { type: 'ADVANCE_TIMELINE', tick: 10 }), s);
});

test('ADVANCE_TIMELINE drives the lever from the runner and lands exactly at B', () => {
  let s = structuredClone(FACTORY_PRESET);
  s.transitionFrames = 60;
  s = reduce(s, { type: 'PRESS_AUTO_TAKE', tick: 0 });
  s = reduce(s, { type: 'ADVANCE_TIMELINE', tick: 30 });
  assert.equal(s.transition.lever, 0.5);
  s = reduce(s, { type: 'ADVANCE_TIMELINE', tick: 60 });
  assert.equal(s.transition.lever, 1);
  assert.equal(s.transition.auto.phase, 'complete');
});

test('fieldPreset resets both runners to idle while preserving fade settings and frames', () => {
  let s = structuredClone(FACTORY_PRESET);
  s.fade = { ...s.fade, video: true, target: 'matte', lever: 0.5 };
  s.transitionFrames = 120;
  s = reduce(s, { type: 'PRESS_AUTO_TAKE', tick: 3 });
  s = reduce(s, { type: 'PRESS_AUTO_FADE', tick: 3 });
  const restored = fieldPreset(s);
  assert.equal(restored.transition.auto.phase, 'idle');
  assert.equal(restored.fade.auto.phase, 'idle');
  assert.equal(restored.fade.video, true);
  assert.equal(restored.fade.target, 'matte');
  assert.equal(restored.fade.lever, 0.5);
  assert.equal(restored.transitionFrames, 120);
});

// --- Phase 7: Event Memory (reference §13) ---

function bankOf(...occupied: number[]): (PanelSnapshot | null)[] {
  const slots: (PanelSnapshot | null)[] = [null, null, null, null, null, null, null, null];
  for (const n of occupied) {
    const s = structuredClone(FACTORY_PRESET) as PanelState;
    s.matte.colorIndex = n; // a distinctive, comparable marker per slot
    slots[n - 1] = panelSnapshot(s);
  }
  return slots;
}

test('PRESS_MEMORY then EVENT NO. stores the snapshot, consumes the latch, and marks the LED slot', () => {
  let s = structuredClone(FACTORY_PRESET);
  s = reduce(s, { type: 'PRESS_MEMORY' });
  assert.equal(s.memory.memoryArmed, true);
  s = reduce(s, { type: 'PRESS_EVENT_NO', button: 3, shift: false });
  assert.deepEqual(s.memory.slots[2], panelSnapshot(structuredClone(FACTORY_PRESET)));
  assert.equal(s.memory.memoryArmed, false);
  assert.equal(s.memory.lastStoredSlot, 3);
  assert.equal('memory' in s.memory.slots[2]!, false, 'stored slot is not recursive');
});

test('SHIFT + EVENT NO. addresses slots 5..8', () => {
  let s = structuredClone(FACTORY_PRESET);
  s = reduce(s, { type: 'PRESS_MEMORY' });
  s = reduce(s, { type: 'PRESS_EVENT_NO', button: 2, shift: true });
  assert.notEqual(s.memory.slots[5], null); // slot 6
  assert.equal(s.memory.slots[1], null);
});

test('storing into an occupied slot overwrites it', () => {
  let s = structuredClone(FACTORY_PRESET);
  s.memory = { ...s.memory, slots: bankOf(4) };
  const before = s.memory.slots[3];
  s.matte.colorIndex = 7; // different look
  s = reduce(s, { type: 'PRESS_MEMORY' });
  s = reduce(s, { type: 'PRESS_EVENT_NO', button: 4, shift: false });
  assert.notDeepEqual(s.memory.slots[3], before);
  assert.equal(s.memory.slots[3]!.matte.colorIndex, 7);
});

test('EVENT NO. without AUTO TAKE only arms the slot; AUTO TAKE recalls it and preserves + advances the bank', () => {
  let s = structuredClone(FACTORY_PRESET);
  s.memory = { ...s.memory, slots: bankOf(1, 2, 3) };
  s.matte.colorIndex = 0; // live differs from slot 1 (colorIndex 1)
  s = reduce(s, { type: 'PRESS_EVENT_NO', button: 1, shift: false });
  assert.equal(s.memory.armedSlot, 1);
  assert.equal(s.matte.colorIndex, 0, 'arming does not rehydrate');
  s = reduce(s, { type: 'PRESS_AUTO_TAKE', tick: 0 });
  assert.equal(s.matte.colorIndex, 1, 'recalled from slot 1');
  assert.equal(s.memory.armedSlot, 2, 'sequence cursor advanced');
  assert.deepEqual(s.memory.slots, bankOf(1, 2, 3), 'bank preserved through recall');
});

test('recalling an empty armed slot is a same-ref no-op', () => {
  let s = structuredClone(FACTORY_PRESET);
  s.memory = { ...s.memory, slots: bankOf(1), armedSlot: 6 }; // slot 6 empty
  assert.equal(reduce(s, { type: 'PRESS_AUTO_TAKE', tick: 0 }), s);
});

test('CLEAR_ALL_SLOTS empties the bank', () => {
  let s = structuredClone(FACTORY_PRESET);
  s.memory = { ...s.memory, slots: bankOf(1, 5), armedSlot: 5 };
  s = reduce(s, { type: 'CLEAR_ALL_SLOTS' });
  assert.deepEqual(s.memory.slots, [null, null, null, null, null, null, null, null]);
});

test('AUTO TAKE with no armed slot and no Special Mode is the unchanged Phase-6 take', () => {
  let s = structuredClone(FACTORY_PRESET);
  s = reduce(s, { type: 'PRESS_AUTO_TAKE', tick: 0 });
  assert.equal(s.transition.auto.phase, 'running');
  assert.equal(s.transition.auto.to, 1);
  assert.equal(s.specialMode.run.phase, 'idle');
});

// --- Phase 7: Special Mode (reference §14) ---

test('MEMORY+SHIFT toggles Special Mode and clears memory arming on entry', () => {
  let s = structuredClone(FACTORY_PRESET);
  s.memory = { ...s.memory, armedSlot: 2 };
  s = reduce(s, { type: 'PRESS_MEMORY_SHIFT' });
  assert.equal(s.specialMode.active, true);
  assert.equal(s.memory.armedSlot, null, 'entry clears memory arming (branches exclusive)');
  s = reduce(s, { type: 'PRESS_MEMORY_SHIFT' });
  assert.equal(s.specialMode.active, false);
});

test('SELECT_SPECIAL_MACRO arms only when active, and re-arming a different macro clears orbit/prompt/run', () => {
  let s = structuredClone(FACTORY_PRESET);
  assert.equal(reduce(s, { type: 'SELECT_SPECIAL_MACRO', button: 3, shift: false }), s); // inactive → no-op
  s = reduce(s, { type: 'PRESS_MEMORY_SHIFT' }); // active
  s = reduce(s, { type: 'SELECT_SPECIAL_MACRO', button: 3, shift: false });
  assert.equal(s.specialMode.armed, 'cork-screw');
  assert.equal(reduce(s, { type: 'SELECT_SPECIAL_MACRO', button: 3, shift: false }), s); // clean re-arm → same ref
  s = { ...s, specialMode: { ...s.specialMode, orbiting: true, leverPrompt: true } };
  s = reduce(s, { type: 'SELECT_SPECIAL_MACRO', button: 4, shift: true }); // satellite
  assert.equal(s.specialMode.armed, 'satellite');
  assert.equal(s.specialMode.orbiting, false);
  assert.equal(s.specialMode.leverPrompt, false);
});

test('Satellite toggles its orbit on AUTO TAKE when the lever is at B', () => {
  let s = structuredClone(FACTORY_PRESET);
  s.transition.lever = 1; // at B
  s = reduce(s, { type: 'PRESS_MEMORY_SHIFT' });
  s = reduce(s, { type: 'SELECT_SPECIAL_MACRO', button: 4, shift: true }); // satellite
  s = reduce(s, { type: 'PRESS_AUTO_TAKE', tick: 0 });
  assert.equal(s.specialMode.orbiting, true);
  s = reduce(s, { type: 'PRESS_AUTO_TAKE', tick: 1 });
  assert.equal(s.specialMode.orbiting, false);
});

test('Vibrate runs a 64-frame macro that completes on tick 64, not 63', () => {
  let s = structuredClone(FACTORY_PRESET);
  s.transition.lever = 1;
  s = reduce(s, { type: 'PRESS_MEMORY_SHIFT' });
  s = reduce(s, { type: 'SELECT_SPECIAL_MACRO', button: 3, shift: true }); // vibrate
  s = reduce(s, { type: 'PRESS_AUTO_TAKE', tick: 0 });
  assert.equal(s.specialMode.run.durationTicks, 64);
  assert.equal(reduce(s, { type: 'ADVANCE_TIMELINE', tick: 63 }).specialMode.run.phase, 'running');
  assert.equal(reduce(s, { type: 'ADVANCE_TIMELINE', tick: 64 }).specialMode.run.phase, 'complete');
});

test('a lever-at-B macro refuses to start off B and raises the move-the-lever prompt', () => {
  let s = structuredClone(FACTORY_PRESET);
  s.transition.lever = 0; // not at B
  s = reduce(s, { type: 'PRESS_MEMORY_SHIFT' });
  s = reduce(s, { type: 'SELECT_SPECIAL_MACRO', button: 3, shift: true }); // vibrate
  s = reduce(s, { type: 'PRESS_AUTO_TAKE', tick: 0 });
  assert.equal(s.specialMode.leverPrompt, true);
  assert.equal(s.specialMode.run.phase, 'idle', 'macro did not start');
  assert.equal(reduce(s, { type: 'PRESS_AUTO_TAKE', tick: 1 }), s, 'already prompted → same ref');
});

test('a compressed-image macro (Bounce) runs as the standard take', () => {
  let s = structuredClone(FACTORY_PRESET);
  s = reduce(s, { type: 'PRESS_MEMORY_SHIFT' });
  s = reduce(s, { type: 'SELECT_SPECIAL_MACRO', button: 4, shift: false }); // bounce
  s = reduce(s, { type: 'PRESS_AUTO_TAKE', tick: 0 });
  assert.equal(s.transition.auto.phase, 'running');
  assert.equal(s.specialMode.run.phase, 'idle');
});
