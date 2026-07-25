// Every mutation to the panel is a typed command (ADR-0011). `dispatch` is the only
// write path, so UI widgets, the input-mapping layer, Auto Take, and Event Memory
// recall all serialize through one place instead of racing. The reducer
// (reducer.ts) maps (state, command) -> next state as a pure function.

import type { BusId, BusSource } from '../core/types.js';
import type { PanelState, TransitionType } from './state.js';

export type Command =
  | { type: 'ASSIGN_SOURCE'; bus: BusId; source: BusSource }
  | { type: 'SET_LEVER'; position: number }
  | { type: 'SET_TRANSITION_TYPE'; transition: TransitionType }
  | { type: 'SET_MATTE_COLOR'; colorIndex: number }
  | { type: 'LOAD_STATE'; state: PanelState };

/** Discriminant union of all command type tags, handy for exhaustiveness. */
export type CommandType = Command['type'];
