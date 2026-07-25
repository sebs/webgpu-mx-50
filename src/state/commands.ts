// Every mutation to the panel is a typed command (ADR-0011). `dispatch` is the only
// write path, so UI widgets, the input-mapping layer, Auto Take, and Event Memory
// recall all serialize through one place instead of racing. The reducer
// (reducer.ts) maps (state, command) -> next state as a pure function.

import type { BusId, BusSource } from '../core/types.js';
import type { PanelState, ProgramOut, TransitionType, WipeFamily } from './state.js';

export type Command =
  | { type: 'ASSIGN_SOURCE'; bus: BusId; source: BusSource }
  | { type: 'SET_LEVER'; position: number }
  | { type: 'SET_TRANSITION_TYPE'; transition: TransitionType }
  | { type: 'SET_PROGRAM_OUT'; mode: ProgramOut }
  | { type: 'SET_MATTE_COLOR'; colorIndex: number }
  | { type: 'STEP_MATTE_COLOR'; direction: 'up' | 'down' }
  | { type: 'SET_MATTE_LEVEL'; level: number }
  | { type: 'SET_GRADATION'; on: boolean }
  // --- wipe (reference §9.4, ADR-0009) ---
  | { type: 'PRESS_WIPE_FAMILY'; family: WipeFamily } // select family, or cycle its variant
  | { type: 'SET_WIPE_VARIANT'; variant: number }
  | { type: 'PRESS_COMPRESSION' } // 0 → 1 → 2 → 0
  | { type: 'PRESS_SLIDE' } // 0 → 1 → 2 → 0
  | { type: 'SET_WIPE_MULTI'; mode: number } // 0 = off, 1..6
  | { type: 'PRESS_WIPE_MULTI' } // cycle 1..6
  | { type: 'SET_PAIRING'; on: boolean }
  | { type: 'SET_BLINDS'; on: boolean }
  | { type: 'PRESS_BORDER' } // narrow → wide → off
  | { type: 'PRESS_SOFT' } // narrow ↔ wide
  | { type: 'SET_REVERSE'; on: boolean }
  | { type: 'SET_ONE_WAY'; on: boolean }
  | { type: 'SET_WIPE_ASPECT'; value: number } // -1..1, Square family only
  | { type: 'LOAD_STATE'; state: PanelState };

/** Discriminant union of all command type tags, handy for exhaustiveness. */
export type CommandType = Command['type'];
