import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FACTORY_PRESET } from '../../src/state/state.js';
import type { PanelState } from '../../src/state/state.js';
import type { Command } from '../../src/state/commands.js';
import { resolveSignal, SignalCoalescer } from '../../src/control/resolver.js';
import { BindingTable, DEFAULT_BINDINGS } from '../../src/control/bindings.js';
import { keyChord, chordToSignal, isTyping } from '../../src/control/keyboard.js';
import { createAutomation } from '../../src/control/automation.js';

const fresh = (): PanelState => structuredClone(FACTORY_PRESET);

// --- resolver truth table ---

test('trigger controls resolve to the Auto Take / Auto Fade press carrying the tick', () => {
  assert.deepEqual(resolveSignal({ control: 'autoTake.trigger', mode: 'trigger' }, fresh(), 7), { type: 'PRESS_AUTO_TAKE', tick: 7 });
  assert.deepEqual(resolveSignal({ control: 'autoFade.trigger', mode: 'trigger' }, fresh(), 9), { type: 'PRESS_AUTO_FADE', tick: 9 });
});

test('lever.position set clamps and nudge steps from the current value', () => {
  assert.deepEqual(resolveSignal({ control: 'lever.position', mode: 'set', value: 1.4 }, fresh(), 0), { type: 'SET_LEVER', position: 1 });
  const s = fresh();
  s.transition.lever = 0.2;
  assert.deepEqual(resolveSignal({ control: 'lever.position', mode: 'nudge', value: 0.1 }, s, 0), { type: 'SET_LEVER', position: 0.30000000000000004 });
});

test('programOut toggle cycles A → B → EFFECT → A', () => {
  const s = fresh(); // factory programOut = 'effect'
  assert.deepEqual(resolveSignal({ control: 'programOut', mode: 'toggle' }, s, 0), { type: 'SET_PROGRAM_OUT', mode: 'A' });
  s.programOut = 'A';
  assert.deepEqual(resolveSignal({ control: 'programOut', mode: 'toggle' }, s, 0), { type: 'SET_PROGRAM_OUT', mode: 'B' });
  s.programOut = 'B';
  assert.deepEqual(resolveSignal({ control: 'programOut', mode: 'toggle' }, s, 0), { type: 'SET_PROGRAM_OUT', mode: 'effect' });
});

test('transition.type toggle cycles mix → nam → wipe → mix', () => {
  const s = fresh();
  assert.deepEqual(resolveSignal({ control: 'transition.type', mode: 'toggle' }, s, 0), { type: 'SET_TRANSITION_TYPE', transition: 'nam' });
  s.transition.type = 'nam';
  assert.deepEqual(resolveSignal({ control: 'transition.type', mode: 'toggle' }, s, 0), { type: 'SET_TRANSITION_TYPE', transition: 'wipe' });
  s.transition.type = 'wipe';
  assert.deepEqual(resolveSignal({ control: 'transition.type', mode: 'toggle' }, s, 0), { type: 'SET_TRANSITION_TYPE', transition: 'mix' });
});

test('source, positioner, and audio controls resolve to their commands', () => {
  assert.deepEqual(resolveSignal({ control: 'busA.source', mode: 'set', value: 3 }, fresh(), 0), { type: 'ASSIGN_SOURCE', bus: 'A', source: 3 });
  const s = fresh();
  s.positioner.y = 0.4;
  assert.deepEqual(resolveSignal({ control: 'positioner.x', mode: 'set', value: 0.5 }, s, 0), { type: 'SET_POSITIONER_JOYSTICK', x: 0.5, y: 0.4 });
  assert.deepEqual(resolveSignal({ control: 'audio.master', mode: 'set', value: 0.8 }, fresh(), 0), { type: 'SET_AUDIO_FADER', fader: 'master', level: 0.8 });
});

test('meaningless (control, mode) pairings resolve to null and never mutate the state', () => {
  const s = fresh();
  const before = JSON.stringify(s);
  assert.equal(resolveSignal({ control: 'lever.position', mode: 'trigger' }, s, 0), null);
  assert.equal(resolveSignal({ control: 'autoTake.trigger', mode: 'set', value: 1 }, s, 0), null);
  assert.equal(resolveSignal({ control: 'key.slice', mode: 'toggle' }, s, 0), null);
  assert.equal(JSON.stringify(s), before);
});

// --- coalescer ---

test('the coalescer keeps last-wins for set, sums nudges, and passes triggers through distinctly', () => {
  const collect = (): { out: Command[]; dispatch: (c: Command) => void } => {
    const out: Command[] = [];
    return { out, dispatch: (c) => out.push(c) };
  };
  const lastWins = new SignalCoalescer();
  lastWins.push({ control: 'lever.position', mode: 'set', value: 0.2 });
  lastWins.push({ control: 'lever.position', mode: 'set', value: 0.7 });
  const a = collect();
  lastWins.flush(fresh(), 0, a.dispatch);
  assert.deepEqual(a.out, [{ type: 'SET_LEVER', position: 0.7 }]);

  const summed = new SignalCoalescer();
  summed.push({ control: 'lever.position', mode: 'nudge', value: 0.05 });
  summed.push({ control: 'lever.position', mode: 'nudge', value: 0.05 });
  const b = collect();
  summed.flush(fresh(), 0, b.dispatch); // lever starts at 0 → 0.10
  assert.deepEqual(b.out, [{ type: 'SET_LEVER', position: 0.1 }]);

  const pulses = new SignalCoalescer();
  pulses.push({ control: 'autoTake.trigger', mode: 'trigger' });
  pulses.push({ control: 'autoTake.trigger', mode: 'trigger' });
  const c = collect();
  pulses.flush(fresh(), 5, c.dispatch);
  assert.equal(c.out.length, 2);
});

// --- keyboard core + default bindings ---

test('keyChord builds the binding address, with modifiers in Ctrl,Alt,Shift,Meta order', () => {
  assert.equal(keyChord({ code: 'Space', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false }), 'key:Space');
  assert.equal(keyChord({ code: 'KeyA', ctrlKey: true, altKey: false, shiftKey: true, metaKey: false }), 'key:Ctrl+Shift+KeyA');
});

test('the default bindings map keys to their controls; unbound chords resolve to null', () => {
  const table = new BindingTable();
  assert.deepEqual(chordToSignal('key:Space', table), { control: 'autoTake.trigger', mode: 'trigger', value: undefined });
  assert.deepEqual(chordToSignal('key:Digit2', table), { control: 'busA.source', mode: 'set', value: 2 });
  assert.equal(chordToSignal('key:KeyZ', table), null);
  assert.equal(table.get('nope'), null);
  assert.equal(DEFAULT_BINDINGS['key:KeyP']!.mode, 'toggle');
});

test('isTyping suppresses shortcuts in text-entry elements only', () => {
  assert.equal(isTyping({ tagName: 'INPUT' }), true);
  assert.equal(isTyping({ tagName: 'TEXTAREA' }), true);
  assert.equal(isTyping({ isContentEditable: true }), true);
  assert.equal(isTyping({ tagName: 'BUTTON' }), false);
  assert.equal(isTyping(null), false);
});

// --- BindingTable rebind/reset + automation API ---

test('BindingTable rebind/unbind/reset fire onChange for persistence', () => {
  const saved: unknown[] = [];
  const table = new BindingTable(DEFAULT_BINDINGS, (m) => saved.push(m));
  table.rebind('key:KeyG', { control: 'autoTake.trigger', mode: 'trigger' });
  assert.deepEqual(table.get('key:KeyG'), { control: 'autoTake.trigger', mode: 'trigger' });
  table.unbind('key:KeyG');
  assert.equal(table.get('key:KeyG'), null);
  table.reset();
  assert.equal(saved.length, 3);
});

test('the automation API emits the same commands the resolver would', () => {
  const out: Command[] = [];
  let now = 12;
  const auto = createAutomation(fresh, (c) => out.push(c), () => now);
  auto.triggerAutoTake();
  assert.deepEqual(out[0], { type: 'PRESS_AUTO_TAKE', tick: 12 });
  out.length = 0;
  now = 0;
  auto.runTransition(40);
  assert.deepEqual(out, [{ type: 'SET_TRANSITION_TIME', frames: 40 }, { type: 'PRESS_AUTO_TAKE', tick: 0 }]);
  out.length = 0;
  auto.selectWipePattern(129); // 1 + 128 → straight/0 reversed
  assert.deepEqual(out, [
    { type: 'PRESS_WIPE_FAMILY', family: 'straight' },
    { type: 'SET_WIPE_VARIANT', variant: 0 },
    { type: 'SET_REVERSE', on: true },
  ]);
});
