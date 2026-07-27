import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FACTORY_PRESET, panelSnapshot, fieldPreset } from '../../src/state/state.js';
import type { PanelSnapshot, PanelState } from '../../src/state/state.js';
import { reduce } from '../../src/state/reducer.js';
import { occupiedSlots, nextArmedSlot } from '../../src/core/event-memory.js';

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
