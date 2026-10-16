// A fresh factory panel for LOAD_STATE — the reducer adopts the object it is given, so every
// caller gets its own deep copy. Pure and dependency-light on purpose: pages that never
// create a mixer (the wipe wall) import it without pulling in the mixer host.

import { FACTORY_PRESET } from '../src/state/state.js';
import type { PanelState } from '../src/state/state.js';

export function factoryState(): PanelState {
  return JSON.parse(JSON.stringify(FACTORY_PRESET)) as PanelState;
}
