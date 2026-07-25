// The single pure reducer: (state, command) -> next state (ADR-0011). It never
// mutates its input; it returns a new immutable snapshot, or the same reference when a
// command changes nothing. Cross-control invariants that the reference dictates live
// here so they cannot drift. Because it is pure it is asserted directly by the domain
// specs (ADR-0016), no GPU or DOM needed.

import { MATTE_COLOR_COUNT } from './state.js';
import { blindsLegal, pressBorder, pressSoft, VARIANT_COUNT } from '../core/wipe.js';
import type { PanelState, WipeState } from './state.js';
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

/** Return a new state with the wipe sub-state replaced. */
function withWipe(state: PanelState, wipe: WipeState): PanelState {
  return { ...state, transition: { ...state.transition, wipe } };
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

    // --- wipe (reference §9.4, ADR-0009) ---

    case 'PRESS_WIPE_FAMILY': {
      const w = state.transition.wipe;
      if (w.family === command.family) {
        return withWipe(state, { ...w, variant: (w.variant + 1) % VARIANT_COUNT });
      }
      // Switching family drops Blinds if it is illegal on the new family.
      const blinds = w.modifiers.blinds && blindsLegal(command.family);
      return withWipe(state, {
        ...w,
        family: command.family,
        variant: 0,
        modifiers: { ...w.modifiers, blinds },
      });
    }

    case 'SET_WIPE_VARIANT': {
      const w = state.transition.wipe;
      const variant = ((command.variant % VARIANT_COUNT) + VARIANT_COUNT) % VARIANT_COUNT;
      if (variant === w.variant) return state;
      return withWipe(state, { ...w, variant });
    }

    case 'PRESS_COMPRESSION': {
      const w = state.transition.wipe;
      const compression = (((w.modifiers.compression + 1) % 3) as 0 | 1 | 2);
      return withWipe(state, { ...w, modifiers: { ...w.modifiers, compression } });
    }

    case 'PRESS_SLIDE': {
      const w = state.transition.wipe;
      const slide = (((w.modifiers.slide + 1) % 3) as 0 | 1 | 2);
      return withWipe(state, { ...w, modifiers: { ...w.modifiers, slide } });
    }

    case 'SET_WIPE_MULTI': {
      const w = state.transition.wipe;
      const multi = clamp(Math.round(command.mode), 0, 6);
      if (multi === w.modifiers.multi) return state;
      return withWipe(state, { ...w, modifiers: { ...w.modifiers, multi } });
    }

    case 'PRESS_WIPE_MULTI': {
      const w = state.transition.wipe;
      const multi = w.modifiers.multi >= 6 || w.modifiers.multi < 1 ? 1 : w.modifiers.multi + 1;
      return withWipe(state, { ...w, modifiers: { ...w.modifiers, multi } });
    }

    case 'SET_PAIRING': {
      const w = state.transition.wipe;
      if (w.modifiers.pairing === command.on) return state;
      return withWipe(state, { ...w, modifiers: { ...w.modifiers, pairing: command.on } });
    }

    case 'SET_BLINDS': {
      const w = state.transition.wipe;
      if (command.on && !blindsLegal(w.family)) {
        // Illegal (reference §9.4): LED stays out and the pattern falls back to Straight.
        return withWipe(state, { ...w, family: 'straight', modifiers: { ...w.modifiers, blinds: false } });
      }
      if (w.modifiers.blinds === command.on) return state;
      return withWipe(state, { ...w, modifiers: { ...w.modifiers, blinds: command.on } });
    }

    case 'PRESS_BORDER': {
      const w = state.transition.wipe;
      return withWipe(state, { ...w, edge: pressBorder(w.edge) });
    }

    case 'PRESS_SOFT': {
      const w = state.transition.wipe;
      return withWipe(state, { ...w, edge: pressSoft(w.edge) });
    }

    case 'SET_REVERSE': {
      const w = state.transition.wipe;
      if (w.reverse === command.on) return state;
      return withWipe(state, { ...w, reverse: command.on });
    }

    case 'SET_ONE_WAY': {
      const w = state.transition.wipe;
      if (w.oneWay === command.on) return state;
      return withWipe(state, { ...w, oneWay: command.on });
    }

    case 'SET_WIPE_ASPECT': {
      const w = state.transition.wipe;
      const aspect = clamp(command.value, -1, 1);
      if (aspect === w.aspect) return state;
      return withWipe(state, { ...w, aspect });
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
