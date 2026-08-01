// Event Memory sequencing (reference §13). Pure helpers over the 8-slot bank: which slots are
// occupied, and which slot the next AUTO TAKE arms after recalling one (sequential playback
// walks occupied slots in numerical order, skipping empties, ending past the last). The bank
// itself lives in the store (state.memory.slots); this module never touches storage.
//
// banira lib floor: for-loops + index arithmetic only (no Array.includes / ** ).

import type { PanelSnapshot } from '../state/state.js';

/** IndexedDB key for a slot's captured still (1..8). DB-scoped, so no "mx50:" prefix needed. */
export function stillKeyForSlot(slot: number): string {
  return 'still:' + slot;
}

/** The 1-based slot numbers that currently hold a snapshot. */
export function occupiedSlots(slots: readonly (PanelSnapshot | null)[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < slots.length; i++) if (slots[i] !== null) out.push(i + 1);
  return out;
}

/**
 * The slot to arm after recalling `current` (reference §13): the lowest OCCUPIED slot above
 * `current` (skipping empties), else `current + 1` while that is within 1..8, else null once the
 * cursor walks past slot 8. The trailing `current + 1` keeps the cursor advancing across a fully
 * occupied bank; sequential playback stops when a later recall finds an empty/absent slot.
 */
export function nextArmedSlot(slots: readonly (PanelSnapshot | null)[], current: number): number | null {
  for (let s = current + 1; s <= 8; s++) if (slots[s - 1] !== null) return s;
  return current < 8 ? current + 1 : null;
}
