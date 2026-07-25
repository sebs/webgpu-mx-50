// The single pure reducer: (state, command) -> next state (ADR-0011). It never
// mutates its input; it returns a new immutable snapshot, or the same reference when a
// command changes nothing. Cross-control invariants that the reference dictates live
// here so they cannot drift. Because it is pure it is asserted directly by the domain
// specs (ADR-0016), no GPU or DOM needed.

import { MATTE_COLOR_COUNT } from './state.js';
import type { PanelState } from './state.js';
import type { Command } from './commands.js';

/** Clamp a value into [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Step an index into the 9-colour ring, wrapping (reference §4). */
function wrapColor(index: number): number {
  const n = MATTE_COLOR_COUNT;
  return ((index % n) + n) % n;
}

export function reduce(state: PanelState, command: Command): PanelState {
  switch (command.type) {
    case 'ASSIGN_SOURCE': {
      const busKey = command.bus === 'A' ? 'busA' : 'busB';
      const bus = state[busKey];
      // The blinking substitute is the last non-Matte source held (ADR-0006).
      const substituteSource =
        command.source === 'matte' ? bus.substituteSource : command.source;
      if (bus.source === command.source && bus.substituteSource === substituteSource) {
        return state;
      }
      return { ...state, [busKey]: { source: command.source, substituteSource } };
    }

    case 'SET_LEVER': {
      const lever = clamp(command.position, 0, 1);
      if (lever === state.transition.lever) return state;
      return { ...state, transition: { ...state.transition, lever } };
    }

    case 'SET_TRANSITION_TYPE':
      if (state.transition.type === command.transition) return state;
      return { ...state, transition: { ...state.transition, type: command.transition } };

    case 'SET_PROGRAM_OUT':
      if (state.programOut === command.mode) return state;
      return { ...state, programOut: command.mode };

    case 'SET_MATTE_COLOR': {
      const colorIndex = wrapColor(command.colorIndex);
      if (colorIndex === state.matte.colorIndex) return state;
      return { ...state, matte: { ...state.matte, colorIndex } };
    }

    case 'STEP_MATTE_COLOR': {
      const delta = command.direction === 'up' ? 1 : -1;
      const colorIndex = wrapColor(state.matte.colorIndex + delta);
      return { ...state, matte: { ...state.matte, colorIndex } };
    }

    case 'SET_MATTE_LEVEL': {
      const level = clamp(command.level, 0, 1);
      if (level === state.matte.level) return state;
      return { ...state, matte: { ...state.matte, level } };
    }

    case 'SET_GRADATION':
      if (state.matte.gradation === command.on) return state;
      return { ...state, matte: { ...state.matte, gradation: command.on } };

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
