// ADR-0018 MIDI control surface: the memory verbs in the resolver, the immediate
// RECALL_EVENT in the reducer, and the adapter's routing — Program Change, 14-bit CC
// pairs, relative encoders, MPE gesture voices, and the learn classifier. The adapter
// is driven through handle() (port-free); commands are asserted through a real
// coalescer flush, so the whole ADR-0014 path is under test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FACTORY_PRESET } from '../../src/state/state.js';
import { reduce } from '../../src/state/reducer.js';
import { resolveSignal, SignalCoalescer } from '../../src/control/resolver.js';
import { ABLETON_PROFILE, BindingTable } from '../../src/control/bindings.js';
import { MidiAdapter, classifyCapture } from '../../src/control/midi.js';
import { LEARN_TARGETS, learnedBinding } from '../../src/control/learnable.js';
import type { PanelState } from '../../src/state/state.js';
import type { Command } from '../../src/state/commands.js';
import type { CapturedEvent } from '../../src/control/midi.js';

const fresh = (): PanelState => structuredClone(FACTORY_PRESET);

/** Drive raw MIDI bytes through a real table+coalescer and return the flushed commands. */
function flushed(table: BindingTable, state: PanelState, messages: number[][], setup?: (midi: MidiAdapter) => void): Command[] {
  const coalescer = new SignalCoalescer();
  const midi = new MidiAdapter(table, coalescer);
  if (setup) setup(midi);
  for (const m of messages) midi.handle(new Uint8Array(m));
  const out: Command[] = [];
  coalescer.flush(state, 0, (command) => out.push(command));
  return out;
}

// --- resolver: memory verbs ---

test('memory verbs resolve: store-arm, the slot ritual, and immediate recall', () => {
  assert.deepEqual(resolveSignal({ control: 'memory.storeArm', mode: 'trigger' }, fresh(), 0), { type: 'PRESS_MEMORY' });
  assert.deepEqual(resolveSignal({ control: 'memory.slot', mode: 'set', value: 6 }, fresh(), 0), { type: 'PRESS_EVENT_NO', button: 2, shift: true });
  assert.deepEqual(resolveSignal({ control: 'memory.recall', mode: 'set', value: 3 }, fresh(), 0), { type: 'RECALL_EVENT', slot: 3 });
  // Out-of-range slots and wrong modes are meaningless, not clamped.
  assert.equal(resolveSignal({ control: 'memory.recall', mode: 'set', value: 9 }, fresh(), 0), null);
  assert.equal(resolveSignal({ control: 'memory.recall', mode: 'trigger', value: 1 }, fresh(), 0), null);
  assert.equal(resolveSignal({ control: 'memory.storeArm', mode: 'set', value: 1 }, fresh(), 0), null);
});

// --- reducer: RECALL_EVENT ---

test('RECALL_EVENT lands the slot immediately and advances the sequence cursor', () => {
  // Store the factory panel into slot 2, then walk the live lever away.
  let s = reduce(fresh(), { type: 'PRESS_MEMORY' });
  s = reduce(s, { type: 'PRESS_EVENT_NO', button: 2, shift: false });
  s = reduce(s, { type: 'SET_LEVER', position: 0.7 });
  const recalled = reduce(s, { type: 'RECALL_EVENT', slot: 2 });
  assert.equal(recalled.transition.lever, FACTORY_PRESET.transition.lever);
  // Sequential playback: only slot 2 occupied → the cursor advances to 3.
  assert.equal(recalled.memory.armedSlot, 3);
  // The bank itself is preserved (recall is not a LOAD_STATE).
  assert.notEqual(recalled.memory.slots[1], null);
});

test('RECALL_EVENT works while a slot is armed — armed state never blocks it', () => {
  let s = reduce(fresh(), { type: 'PRESS_MEMORY' });
  s = reduce(s, { type: 'PRESS_EVENT_NO', button: 1, shift: false }); // store slot 1
  s = reduce(s, { type: 'PRESS_EVENT_NO', button: 3, shift: false }); // arm slot 3 (empty arm is legal)
  assert.equal(s.memory.armedSlot, 3);
  s = reduce(s, { type: 'SET_LEVER', position: 0.4 });
  const recalled = reduce(s, { type: 'RECALL_EVENT', slot: 1 });
  assert.equal(recalled.transition.lever, FACTORY_PRESET.transition.lever);
  assert.equal(recalled.memory.armedSlot, 2); // recomputed from the recalled slot, not the old arm
});

test('RECALL_EVENT on an empty or invalid slot is the same-reference no-op', () => {
  const s = fresh();
  assert.equal(reduce(s, { type: 'RECALL_EVENT', slot: 5 }), s);
  assert.equal(reduce(s, { type: 'RECALL_EVENT', slot: 0 }), s);
  assert.equal(reduce(s, { type: 'RECALL_EVENT', slot: 9 }), s);
});

// --- adapter: routing through the Ableton profile ---

test('Program Change routes through the profile to an immediate recall command', () => {
  const commands = flushed(new BindingTable(ABLETON_PROFILE), fresh(), [[0xc0, 3]]);
  assert.deepEqual(commands, [{ type: 'RECALL_EVENT', slot: 4 }]);
});

test('profile notes select sources; unbound input is silent', () => {
  const commands = flushed(new BindingTable(ABLETON_PROFILE), fresh(), [
    [0x90, 60, 100], // busA source 1
    [0x90, 65, 100], // busB source 2
    [0x90, 10, 100], // unbound
  ]);
  assert.deepEqual(commands, [
    { type: 'ASSIGN_SOURCE', bus: 'A', source: 1 },
    { type: 'ASSIGN_SOURCE', bus: 'B', source: 2 },
  ]);
});

test('a fine binding assembles CC MSB/LSB pairs into a 14-bit lever position', () => {
  const commands = flushed(new BindingTable(ABLETON_PROFILE), fresh(), [
    [0xb0, 1, 64], // CC1 MSB — emits immediately (LSB 0)
    [0xb0, 33, 127], // CC33 LSB — refines; coalescer keeps last-wins
  ]);
  assert.equal(commands.length, 1);
  const lever = commands[0] as { type: string; position: number };
  assert.equal(lever.type, 'SET_LEVER');
  assert.ok(Math.abs(lever.position - ((64 << 7) | 127) / 16383) < 1e-9);
});

test('a relative binding turns binary-offset encoder ticks into summed nudges', () => {
  const table = new BindingTable(ABLETON_PROFILE);
  table.rebind('midi:cc/0/20', { control: 'lever.position', mode: 'set', relative: true });
  const state = fresh();
  state.transition.lever = 0.5;
  const commands = flushed(table, state, [
    [0xb0, 20, 127], // -1 tick
    [0xb0, 20, 127], // -1 tick (nudges sum in the coalescer)
  ]);
  assert.equal(commands.length, 1);
  const lever = commands[0] as { type: string; position: number };
  assert.ok(Math.abs(lever.position - (0.5 - 2 / 127)) < 1e-9);
});

// --- adapter: MPE gesture voices ---

test('an MPE voice binds per-note bend to a control, and dies with its note', () => {
  const table = new BindingTable({});
  table.rebind('mpe:pad/48/bend', { control: 'lever.position', mode: 'set' });
  // Held note on member channel 2 (index 1): bend drives the lever.
  const on = flushed(table, fresh(), [
    [0x91, 48, 100],
    [0xe1, 127, 127], // full bend → 1.0
  ], (midi) => midi.setMpe(true));
  assert.deepEqual(on, [{ type: 'SET_LEVER', position: 1 }]);
  // After note-off, bend on that channel is a dead voice — no signal.
  const off = flushed(table, fresh(), [
    [0x91, 48, 100],
    [0x81, 48, 0],
    [0xe1, 127, 127],
  ], (midi) => midi.setMpe(true));
  assert.deepEqual(off, []);
});

test('with MPE off, member-channel notes take the plain note path', () => {
  const table = new BindingTable({});
  table.rebind('midi:note/1/48', { control: 'autoTake.trigger', mode: 'trigger' });
  const commands = flushed(table, fresh(), [[0x91, 48, 100]]);
  assert.deepEqual(commands, [{ type: 'PRESS_AUTO_TAKE', tick: 0 }]);
});

// --- learn: classification + binding construction ---

test('classifyCapture: notes and PCs bind directly; a lone CC stays plain', () => {
  assert.deepEqual(classifyCapture([{ kind: 'note', channel: 0, number: 60, value: 100 }]), {
    address: 'midi:note/0/60', kind: 'note', channel: 0, number: 60, fine: false, relative: false,
  });
  assert.deepEqual(classifyCapture([{ kind: 'pc', channel: 0, number: 5, value: 0 }]), {
    address: 'midi:pc/0/5', kind: 'pc', channel: 0, number: 5, fine: false, relative: false,
  });
  assert.deepEqual(classifyCapture([{ kind: 'cc', channel: 0, number: 21, value: 90 }]), {
    address: 'midi:cc/0/21', kind: 'cc', channel: 0, number: 21, fine: false, relative: false,
  });
  assert.equal(classifyCapture([]), null);
});

test('classifyCapture: an n/n+32 pair is 14-bit; centred triples are a relative encoder', () => {
  const pair: CapturedEvent[] = [
    { kind: 'cc', channel: 0, number: 5, value: 40 },
    { kind: 'cc', channel: 0, number: 37, value: 88 },
  ];
  const finePair = classifyCapture(pair)!;
  assert.equal(finePair.address, 'midi:cc/0/5');
  assert.equal(finePair.fine, true);
  const encoder: CapturedEvent[] = [
    { kind: 'cc', channel: 0, number: 20, value: 65 },
    { kind: 'cc', channel: 0, number: 20, value: 63 },
    { kind: 'cc', channel: 0, number: 20, value: 65 },
  ];
  const rel = classifyCapture(encoder)!;
  assert.equal(rel.relative, true);
  assert.equal(rel.fine, false);
});

test('learnedBinding builds bindings by target nature and capture evidence', () => {
  const lever = LEARN_TARGETS[0]!; // continuous
  assert.deepEqual(
    learnedBinding(lever, { address: 'midi:cc/0/5', kind: 'cc', channel: 0, number: 5, fine: true, relative: false }),
    { control: 'lever.position', mode: 'set', fine: true },
  );
  assert.deepEqual(
    learnedBinding(lever, { address: 'midi:cc/0/20', kind: 'cc', channel: 0, number: 20, fine: false, relative: true }),
    { control: 'lever.position', mode: 'set', relative: true },
  );
  assert.deepEqual(
    learnedBinding(lever, { address: 'midi:cc/0/21', kind: 'cc', channel: 0, number: 21, fine: false, relative: false }),
    { control: 'lever.position', mode: 'set', range: { lo: 0, hi: 127 } },
  );
  const recall3 = LEARN_TARGETS.filter((t) => t.control === 'memory.recall')[2]!;
  assert.deepEqual(
    learnedBinding(recall3, { address: 'midi:pc/0/9', kind: 'pc', channel: 0, number: 9, fine: false, relative: false }),
    { control: 'memory.recall', mode: 'set', value: 3 },
  );
});
