// The two-tier still coordinator (ADR-0015, event-memory.feature §13): captured
// Scene-Grabber stills live as heavy blobs in the async BlobBackend (IndexedDB) while the
// panel snapshot carries only a still-reference id in localStorage. This module owns the
// ordering contract — blob set FIRST, then the bank commit, removals after — so the happy
// path can never create a durable dangling reference; a crash leaves at worst an orphan
// blob, retired by the boot sweep. Every tier operation serializes on one internal promise
// chain, and idle() settles when all queued work is done (the async test/shutdown seam).
// Pure of DOM and GPU: the GPU side enters through the narrow GpuStillPort.

import { stillKeyForSlot } from '../core/event-memory.js';
import type { GrabCapture, StillPixels, StillRecord } from '../core/positioner.js';
import type { BlobBackend } from './backend.js';
import type { Persistence } from './persistence.js';
import type { PanelSnapshot, PanelState } from '../state/state.js';

/** The GPU seam: the renderer (WipePass.freeze) implements this structurally. */
export interface GpuStillPort {
  readStill(): Promise<StillPixels>;
  currentGrab(): GrabCapture;
  injectStill(record: StillRecord): void;
}

export interface StillStore {
  /** Blob-first two-tier commit for one bank change. */
  commitBank(next: PanelState, prev: PanelState): Promise<void>;
  /** Recall path: load the record and re-upload pixels+grab to the GPU. false = missing (fresh-grab fallback). */
  recallStill(stillId: string | null | undefined): Promise<boolean>;
  /** Boot hygiene: remove blob keys not referenced by any slot's stillId (nor an extra root,
   *  e.g. the restored live panel's own reference). */
  sweepOrphans(slots: readonly (PanelSnapshot | null)[], extraRoots?: readonly (string | null | undefined)[]): Promise<void>;
  /** Mass-clear companion to persistence.clearBank() (MEMORY+SHIFT power-up). */
  clearAll(): Promise<void>;
  /** Settles when every queued tier operation has completed. */
  idle(): Promise<void>;
}

/**
 * Whether a bank change involves the still tier at all: a changed slot referencing a still
 * (in the next OR the previous bank), or a fresh live mint in flight. Still-less changes
 * should be mirrored SYNCHRONOUSLY (no async window in which a tab close loses the store).
 */
export function bankTouchesStills(next: PanelState, prev: PanelState): boolean {
  for (let i = 0; i < 8; i++) {
    const nextSlot = next.memory.slots[i] ?? null;
    const prevSlot = prev.memory.slots[i] ?? null;
    if (nextSlot === prevSlot) continue;
    if (nextSlot?.positioner.stillId != null || prevSlot?.positioner.stillId != null) return true;
  }
  return false;
}

export function createStillStore(blobs: BlobBackend, persistence: Persistence, gpu: GpuStillPort): StillStore {
  let tail: Promise<unknown> = Promise.resolve();
  const queue = <T>(work: () => Promise<T>): Promise<T> => {
    const next = tail.then(work, work);
    tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };

  return {
    commitBank(next, prev) {
      return queue(async () => {
        const removals: string[] = [];
        for (let i = 0; i < 8; i++) {
          const nextSlot = next.memory.slots[i] ?? null;
          const prevSlot = prev.memory.slots[i] ?? null;
          if (nextSlot === prevSlot) continue;
          const key = stillKeyForSlot(i + 1);
          // A freshly minted still store: the reducer stamps the slot key on BOTH the slot
          // and the LIVE panel while the grab is on screen — all three conditions, so a
          // LOAD_BANK import (which never touches the live positioner) can NEVER be misread
          // as a mint and overwrite a stored blob with the current freeze pixels. TIER 1 FIRST.
          if (nextSlot?.positioner.stillId === key && next.positioner.stillId === key && next.positioner.sceneGrabber) {
            try {
              const pixels = await gpu.readStill();
              await blobs.set(key, { ...pixels, grab: gpu.currentGrab() });
            } catch {
              // Degrade: the snapshot still persists; recall falls back to a live grab.
            }
          } else if (prevSlot?.positioner.stillId === key && nextSlot?.positioner.stillId !== key) {
            removals.push(key);
          }
        }
        // TIER 2 SECOND — only after every blob set resolved.
        persistence.saveBank(next.memory.slots);
        // Removals AFTER the bank commit: a crash leaves an orphan, never a dangling ref.
        for (let i = 0; i < removals.length; i++) {
          try {
            await blobs.remove(removals[i]!);
          } catch {
            // Orphan; the boot sweep retires it.
          }
        }
      });
    },

    recallStill(stillId) {
      return queue(async () => {
        if (stillId == null) return false;
        const record = await blobs.get(stillId);
        if (!record) return false;
        gpu.injectStill(record);
        return true;
      });
    },

    sweepOrphans(slots, extraRoots) {
      return queue(async () => {
        const referenced: string[] = [];
        for (let i = 0; i < slots.length; i++) {
          const id = slots[i]?.positioner.stillId;
          if (id != null) referenced.push(id);
        }
        if (extraRoots) {
          for (let i = 0; i < extraRoots.length; i++) {
            const id = extraRoots[i];
            if (id != null) referenced.push(id);
          }
        }
        const keys = await blobs.keys();
        for (let i = 0; i < keys.length; i++) {
          if (referenced.indexOf(keys[i]!) === -1) {
            try {
              await blobs.remove(keys[i]!);
            } catch {
              // Leave it for the next sweep.
            }
          }
        }
      });
    },

    clearAll() {
      return queue(async () => {
        const keys = await blobs.keys();
        for (let i = 0; i < keys.length; i++) {
          try {
            await blobs.remove(keys[i]!);
          } catch {
            // Leave it for the next sweep.
          }
        }
      });
    },

    idle() {
      return tail.then(
        () => undefined,
        () => undefined,
      );
    },
  };
}
