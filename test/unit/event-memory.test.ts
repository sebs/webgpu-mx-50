import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FACTORY_PRESET, panelSnapshot, fieldPreset } from '../../src/state/state.js';
import type { PanelSnapshot, PanelState } from '../../src/state/state.js';
import { reduce } from '../../src/state/reducer.js';
import { occupiedSlots, nextArmedSlot, stillKeyForSlot } from '../../src/core/event-memory.js';

const fresh = (): PanelState => structuredClone(FACTORY_PRESET);

/** An 8-slot bank occupied at the given 1-based slot numbers (snapshots are distinct-but-opaque). */
function bank(...occupied: number[]): (PanelSnapshot | null)[] {
  const slots: (PanelSnapshot | null)[] = [null, null, null, null, null, null, null, null];
  for (const s of occupied) slots[s - 1] = panelSnapshot(fresh());
  return slots;
}

// --- sequencing ---

test('occupiedSlots lists the 1-based occupied slots', () => {
  assert.deepEqual(occupiedSlots(bank(1, 4, 7)), [1, 4, 7]);
  assert.deepEqual(occupiedSlots(bank()), []);
});

test('nextArmedSlot walks occupied slots, skipping empties, ending past the last', () => {
  assert.equal(nextArmedSlot(bank(2), 2), 3); // {2}, recall 2 → n+1
  assert.equal(nextArmedSlot(bank(1, 4), 1), 4); // {1,4}, recall 1 → skip 2,3
  assert.equal(nextArmedSlot(bank(1, 2, 3), 1), 2); // step-through
  assert.equal(nextArmedSlot(bank(1, 2, 3), 3), 4); // n+1 past the occupied tail
  assert.equal(nextArmedSlot(bank(1, 2), 8), null); // cursor past slot 8
  assert.equal(nextArmedSlot(bank(1, 4, 7), 4), 7); // skip 5,6
});

// --- the panelSnapshot projection ---

test('panelSnapshot strips the bank + Special Mode and idles the runners', () => {
  let s = fresh();
  s = reduce(s, { type: 'PRESS_AUTO_TAKE', tick: 0 }); // a running take
  s = reduce(s, { type: 'PRESS_MEMORY_SHIFT' }); // Special Mode active
  const snap = panelSnapshot(s) as Record<string, unknown>;
  assert.equal('memory' in snap, false);
  assert.equal('specialMode' in snap, false);
  assert.equal(s.transition.auto.phase, 'running');
  assert.equal((snap.transition as PanelState['transition']).auto.phase, 'idle', 'runner idled in the snapshot');
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(snap)));
});

test('a stored snapshot equals the projection of the live panel and preserves every panel field', () => {
  let s = fresh();
  s = reduce(s, { type: 'ASSIGN_SOURCE', bus: 'A', source: 3 });
  s = reduce(s, { type: 'SET_TRANSITION_TYPE', transition: 'wipe' });
  s = reduce(s, { type: 'PRESS_MEMORY' });
  s = reduce(s, { type: 'PRESS_EVENT_NO', button: 2, shift: false });
  const stored = s.memory.slots[1]!;
  assert.equal(stored.busA.source, 3);
  assert.equal(stored.transition.type, 'wipe');
  assert.deepEqual(stored, panelSnapshot(s));
});

// --- fieldPreset stripping (reference §18) ---

test('fieldPreset strips Still/Strobe/Special + memory latches but keeps filters, wipe, and slots', () => {
  const s = fresh();
  s.digitalEffect.freeze.still = true;
  s.digitalEffect.freeze.strobe = true;
  s.digitalEffect.freeze.trail = true;
  s.digitalEffect.active.nega = true;
  s.transition.type = 'wipe';
  s.specialMode = { ...s.specialMode, active: true };
  s.memory = { ...s.memory, armedSlot: 3, memoryArmed: true, slots: bank(5) };
  const restored = fieldPreset(s);
  assert.equal(restored.digitalEffect.freeze.still, false, 'Still stripped');
  assert.equal(restored.digitalEffect.freeze.strobe, false, 'Strobe stripped');
  assert.equal(restored.digitalEffect.freeze.trail, true, 'Trail kept');
  assert.equal(restored.digitalEffect.active.nega, true, 'filter kept');
  assert.equal(restored.transition.type, 'wipe', 'wipe kept');
  assert.equal(restored.specialMode.active, false, 'Special Mode stripped');
  assert.equal(restored.memory.armedSlot, null);
  assert.equal(restored.memory.memoryArmed, false);
  assert.notEqual(restored.memory.slots[4], null, 'stored slot kept');
  assert.equal(restored.transition.auto.phase, 'idle');
});

test('fieldPreset of the factory preset is the factory preset (no regression)', () => {
  assert.deepEqual(fieldPreset(structuredClone(FACTORY_PRESET)), FACTORY_PRESET);
});

// --- still-reference minting (ADR-0015 two-tier stills) ---------------------

const grabbedPip = () => {
  let s = structuredClone(FACTORY_PRESET);
  s = reduce(s, { type: 'SET_TRANSITION_TYPE', transition: 'wipe' });
  s = reduce(s, { type: 'PRESS_WIPE_FAMILY', family: 'square' });
  s = reduce(s, { type: 'PRESS_COMPRESSION' });
  s = reduce(s, { type: 'PRESS_POSITIONER' });
  s = reduce(s, { type: 'PRESS_SCENE_GRABBER' });
  return s;
};

test('PRESS_EVENT_NO with a live grabbed still mints the slot-keyed stillId in slot AND live panel', () => {
  let s = grabbedPip();
  s = reduce(s, { type: 'PRESS_MEMORY' });
  s = reduce(s, { type: 'PRESS_EVENT_NO', button: 1, shift: true }); // slot 5
  assert.equal(s.positioner.stillId, stillKeyForSlot(5));
  assert.equal(s.memory.slots[4]!.positioner.stillId, stillKeyForSlot(5));
  // The symmetry that keeps the existing deepEqual store steps green:
  assert.deepEqual(s.memory.slots[4], panelSnapshot(s));
});

test('a still-less store leaves stillId absent, not null', () => {
  let s = structuredClone(FACTORY_PRESET);
  s = reduce(s, { type: 'PRESS_MEMORY' });
  s = reduce(s, { type: 'PRESS_EVENT_NO', button: 1, shift: false });
  assert.equal('stillId' in s.memory.slots[0]!.positioner, false);
});

test('releasing the grab or switching the Positioner off clears stillId to null', () => {
  let s = grabbedPip();
  s = reduce(s, { type: 'PRESS_MEMORY' });
  s = reduce(s, { type: 'PRESS_EVENT_NO', button: 1, shift: true });
  const released = reduce(s, { type: 'PRESS_SCENE_GRABBER' });
  assert.equal(released.positioner.stillId, null);
  const posOff = reduce(s, { type: 'PRESS_POSITIONER' });
  assert.equal(posOff.positioner.stillId, null);
  assert.equal(posOff.positioner.sceneGrabber, false);
});

test('recall rehydrates positioner.stillId from the slot and preserves the slots array identity', () => {
  let s = grabbedPip();
  s = reduce(s, { type: 'PRESS_MEMORY' });
  s = reduce(s, { type: 'PRESS_EVENT_NO', button: 1, shift: true }); // store slot 5
  s = reduce(s, { type: 'PRESS_SCENE_GRABBER' }); // release: live stillId → null
  s = reduce(s, { type: 'PRESS_EVENT_NO', button: 1, shift: true }); // arm slot 5
  const slotsBefore = s.memory.slots;
  const recalled = reduce(s, { type: 'PRESS_AUTO_TAKE', tick: 0 });
  assert.equal(recalled.positioner.stillId, stillKeyForSlot(5));
  assert.equal(recalled.positioner.sceneGrabber, true);
  assert.equal(recalled.memory.slots, slotsBefore); // identity preserved (the subscriber's discriminator)
});

test('a snapshot carrying a stillId stays plain JSON', () => {
  let s = grabbedPip();
  s = reduce(s, { type: 'PRESS_MEMORY' });
  s = reduce(s, { type: 'PRESS_EVENT_NO', button: 1, shift: true });
  const snap = s.memory.slots[4]!;
  assert.deepEqual(JSON.parse(JSON.stringify(snap)), snap);
});

// --- LOAD_BANK (preset import) ----------------------------------------------

test('LOAD_BANK replaces the slots and clears the latches, preserving the live panel', () => {
  let s = structuredClone(FACTORY_PRESET);
  s = reduce(s, { type: 'SET_TRANSITION_TYPE', transition: 'nam' });
  s = reduce(s, { type: 'PRESS_MEMORY' });
  s = reduce(s, { type: 'PRESS_EVENT_NO', button: 2, shift: false }); // store slot 2
  s = reduce(s, { type: 'PRESS_EVENT_NO', button: 3, shift: false }); // arm slot 3
  const snap = panelSnapshot(structuredClone(FACTORY_PRESET));
  const next = reduce(s, { type: 'LOAD_BANK', slots: [snap, snap] });
  assert.deepEqual(next.memory.slots[0], snap);
  assert.deepEqual(next.memory.slots[1], snap);
  for (let i = 2; i < 8; i++) assert.equal(next.memory.slots[i], null);
  assert.equal(next.memory.memoryArmed, false);
  assert.equal(next.memory.armedSlot, null);
  assert.equal(next.memory.lastStoredSlot, null);
  assert.equal(next.transition, s.transition); // live panel untouched
  assert.equal(next.busA, s.busA);
});

test('LOAD_BANK pads short and truncates overlong slot arrays to 8', () => {
  const snap = panelSnapshot(structuredClone(FACTORY_PRESET));
  const short = reduce(structuredClone(FACTORY_PRESET), { type: 'LOAD_BANK', slots: [snap] });
  assert.equal(short.memory.slots.length, 8);
  assert.equal(short.memory.slots.filter((x) => x !== null).length, 1);
  const long = reduce(structuredClone(FACTORY_PRESET), { type: 'LOAD_BANK', slots: new Array(10).fill(snap) });
  assert.equal(long.memory.slots.length, 8);
});
