// The single pure reducer: (state, command) -> next state (ADR-0011). It never
// mutates its input; it returns a new immutable snapshot. Cross-control invariants
// that the reference dictates live here so they cannot drift. Because it is pure it
// is asserted directly by the domain specs (ADR-0016), no GPU or DOM needed.

import { MATTE_COLOR_COUNT } from './state.js';
import type { PanelState } from './state.js';
import type { Command } from './commands.js';

/** Clamp a value into [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function reduce(state: PanelState, command: Command): PanelState {
  switch (command.type) {
    case 'ASSIGN_SOURCE': {
      const busKey = command.bus === 'A' ? 'busA' : 'busB';
      if (state[busKey].source === command.source) return state; // no change
      return { ...state, [busKey]: { ...state[busKey], source: command.source } };
    }

    case 'SET_LEVER': {
      const lever = clamp(command.position, 0, 1);
      if (lever === state.transition.lever) return state;
      return { ...state, transition: { ...state.transition, lever } };
    }

    case 'SET_TRANSITION_TYPE':
      if (state.transition.type === command.transition) return state;
      return { ...state, transition: { ...state.transition, type: command.transition } };

    case 'SET_MATTE_COLOR': {
      // Wrap into the 9-colour ring so ∧/∨ stepping never lands out of range (reference §4).
      const count = MATTE_COLOR_COUNT;
      const colorIndex = ((command.colorIndex % count) + count) % count;
      if (colorIndex === state.matte.colorIndex) return state;
      return { ...state, matte: { ...state.matte, colorIndex } };
    }

    case 'LOAD_STATE':
      // Whole-panel replace: Event Memory recall, Reset/field-preset boot, preset import.
      return command.state;

    default: {
      // Exhaustiveness guard: a new Command variant without a case is a compile error.
      const _never: never = command;
      return _never;
    }
  }
}
