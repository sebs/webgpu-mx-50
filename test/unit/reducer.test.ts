import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce, clamp } from '../../src/state/reducer.js';
import { FACTORY_PRESET, fieldPreset, MATTE_COLOR_COUNT } from '../../src/state/state.js';

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
