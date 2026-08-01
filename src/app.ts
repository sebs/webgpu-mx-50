// Headless engine assembly: the store, logical clock, and source bindings, with NO DOM
// and NO GPU dependencies (ADR-0004 core boundary). This is what the Gherkin domain
// specs (ADR-0016) and unit tests construct. The browser entry (main.ts) wraps it with
// the GPU renderer and a render loop; the renderer owns the GPU signal graph.

import { PanelStore } from './state/store.js';
import { FACTORY_PRESET, fieldPreset } from './state/state.js';
import { LogicalClock } from './engine/clock.js';
import { SourceBindingRegistry } from './sources/binding.js';
import { AudioInputBindingRegistry } from './sources/audio-binding.js';
import { MediaDeviceCatalog } from './sources/device-catalog.js';
import type { PanelState } from './state/state.js';

export interface Engine {
  readonly store: PanelStore;
  readonly clock: LogicalClock;
  readonly bindings: SourceBindingRegistry;
  /** Aux/Mic audio channel bindings (inputs-and-devices Rule 4). */
  readonly audioBindings: AudioInputBindingRegistry;
  /** Headless permission + enumeration model (inputs-and-devices Rule 5). */
  readonly catalog: MediaDeviceCatalog;
}

/**
 * Build the engine. Boot state follows the Reset switch (reference §18): Reset ON
 * loads the factory preset; Reset OFF restores a saved snapshot through the field-preset
 * sanitiser. Both converge on one LOAD path.
 */
export function createEngine(initial: PanelState = FACTORY_PRESET): Engine {
  return {
    store: new PanelStore(initial),
    clock: new LogicalClock(),
    bindings: new SourceBindingRegistry(),
    audioBindings: new AudioInputBindingRegistry(),
    catalog: new MediaDeviceCatalog(),
  };
}

/** Resolve the boot state from the Reset switch and an optionally persisted snapshot. */
export function bootState(reset: 'on' | 'off', saved: PanelState | null): PanelState {
  if (reset === 'on' || saved === null) return FACTORY_PRESET;
  return fieldPreset(saved);
}
