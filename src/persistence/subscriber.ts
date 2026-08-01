// Passive persistence subscriber (ADR-0015): mirrors store changes to storage without ever
// driving the render loop or reading storage on the hot path. It watches the settings, the
// Event Memory bank, and (under Reset OFF) debounces a field-preset capture so a fader tick
// does not thrash localStorage. When a StillStore is wired, bank changes route through its
// blob-first two-tier commit, and a recall that rehydrates a still reference triggers the
// blob→GPU reload. Browser-wired from main.ts.

import type { PanelStore, Unsubscribe } from '../state/store.js';
import type { Persistence } from './persistence.js';
import type { StillStore } from './still-store.js';

const FIELD_PRESET_DEBOUNCE_MS = 250;

/** Subscribe `persistence` to `store`; returns the unsubscribe handle. */
export function attachPersistence(store: PanelStore, persistence: Persistence, stills?: StillStore): Unsubscribe {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return store.subscribe((next, prev) => {
    if (next.system.reset !== prev.system.reset) persistence.saveSettings({ reset: next.system.reset });
    if (next.memory.slots !== prev.memory.slots) {
      if (stills) void stills.commitBank(next, prev);
      else persistence.saveBank(next.memory.slots);
    } else if (
      // Recall discriminator: recallSlot preserves the slots array identity while a store
      // always replaces it, so a stillId change without a slots change is a recall
      // rehydrating a referenced still onto the live panel.
      stills &&
      next.positioner.stillId != null &&
      next.positioner.stillId !== prev.positioner.stillId &&
      next.positioner.sceneGrabber
    ) {
      void stills.recallStill(next.positioner.stillId);
    }
    if (next.system.reset !== 'off') return;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => persistence.captureFieldPreset(next), FIELD_PRESET_DEBOUNCE_MS);
  });
}
