// Headless engine assembly: the store, logical clock, signal graph, and source
// bindings, with NO DOM and NO GPU dependencies (ADR-0004 core boundary). This is what
// the Gherkin domain specs (ADR-0016) and unit tests construct; the browser entry
// (main.ts) wraps it with GPU + a render loop.

import { PanelStore } from './state/store.js';
import { FACTORY_PRESET, fieldPreset } from './state/state.js';
import { LogicalClock } from './engine/clock.js';
import { createPhase0Graph } from './core/signal-graph.js';
import { SourceBindingRegistry } from './sources/binding.js';
import type { SignalGraph } from './core/signal-graph.js';
import type { PanelState } from './state/state.js';

export interface Engine {
  readonly store: PanelStore;
  readonly clock: LogicalClock;
  /** Frame type is GPUTexture in the browser; the graph itself is GPU-agnostic. */
  readonly graph: SignalGraph<GPUTexture>;
  readonly bindings: SourceBindingRegistry;
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
    graph: createPhase0Graph<GPUTexture>(),
    bindings: new SourceBindingRegistry(),
  };
}

/** Resolve the boot state from the Reset switch and an optionally persisted snapshot. */
export function bootState(reset: 'on' | 'off', saved: PanelState | null): PanelState {
  if (reset === 'on' || saved === null) return FACTORY_PRESET;
  return fieldPreset(saved);
}
