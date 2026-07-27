// Passive persistence subscriber (ADR-0015): mirrors store changes to storage without ever
// driving the render loop or reading storage on the hot path. It watches the settings, the
// Event Memory bank, and (under Reset OFF) debounces a field-preset capture so a fader tick
// does not thrash localStorage. Browser-wired from main.ts.

import type { PanelStore, Unsubscribe } from '../state/store.js';
import type { Persistence } from './persistence.js';

const FIELD_PRESET_DEBOUNCE_MS = 250;

/** Subscribe `persistence` to `store`; returns the unsubscribe handle. */
export function attachPersistence(store: PanelStore, persistence: Persistence): Unsubscribe {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return store.subscribe((next, prev) => {
    if (next.system.reset !== prev.system.reset) persistence.saveSettings({ reset: next.system.reset });
    if (next.memory.slots !== prev.memory.slots) persistence.saveBank(next.memory.slots);
    if (next.system.reset !== 'off') return;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => persistence.captureFieldPreset(next), FIELD_PRESET_DEBOUNCE_MS);
  });
}
