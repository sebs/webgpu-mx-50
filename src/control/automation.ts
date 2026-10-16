// The local automation API (ADR-0014): the browser analogue of the WJ-MX50's RS422/RS232C
// editor-control ports (reference §17). It exposes the same command vocabulary a resolver emits
// — run a transition, call a wipe pattern number, step Event Memory, trigger Auto Take — as a
// small in-process interface, with NO transport (no serial/network). Single-control ops route
// through resolveSignal (the sole emitter); the composite wipe-pattern call decomposes via the
// pure core/wipe.ts numbering oracle. Colour-correction and DSK ops (the scripted
// attract loop's vocabulary) dispatch the existing commands directly — there is no panel
// control to resolve for "set this bus's correction to that mode". Pure and testable.

import { resolveSignal } from './resolver.js';
import { forwardIndex, numberToPattern } from '../core/wipe.js';
import { WIPE_FAMILIES } from '../core/wipe.js';
import type { Command } from '../state/commands.js';
import type { ColourCorrectMode, DskEdgeStyle, DskKeySource, PanelState } from '../state/state.js';
import type { BusId } from '../core/types.js';

export interface ColourCorrectSetting {
  mode: ColourCorrectMode;
  chroma?: number; // 0..1, 0.5 = neutral saturation
  x?: number; // RGB joystick, -1..1
  y?: number;
}

export interface DskSetting {
  on: boolean;
  keySource?: DskKeySource;
  low?: number; // level window, 0..1
  high?: number;
  edge?: DskEdgeStyle;
}

const CC_CYCLE_ORDER: readonly ColourCorrectMode[] = ['off', 'chroma-only', 'chroma-plus-joystick'];

export interface AutomationApi {
  triggerAutoTake(): void;
  triggerAutoFade(): void;
  /** Optionally set the TRANSITION time, then fire Auto Take (an "external take"). */
  runTransition(frames?: number): void;
  /** Call a wipe pattern by its RS422 number (1..255; +128 = the reversed pattern). */
  selectWipePattern(n: number): void;
  /** Advance sequential Event-Memory playback one step (AUTO TAKE walks the bank). */
  stepEventMemory(): void;
  /** Put a bus's colour correction into `mode` (pressing the cycle button as often as needed), then set its controls. */
  setColourCorrection(bus: BusId, setting: ColourCorrectSetting): void;
  /** Switch the downstream key on/off and optionally set its key source, level window and edge. */
  setDsk(setting: DskSetting): void;
}

/**
 * Build the automation API over a store's read/dispatch and a clock reader. `clock` supplies the
 * tick purely (the resolver never reads a clock); every op ends in canonical store commands.
 */
export function createAutomation(
  getState: () => PanelState,
  dispatch: (command: Command) => void,
  clock: () => number,
): AutomationApi {
  const emit = (control: 'autoTake.trigger' | 'autoFade.trigger'): void => {
    const command = resolveSignal({ control, mode: 'trigger' }, getState(), clock());
    if (command) dispatch(command);
  };
  return {
    triggerAutoTake() {
      emit('autoTake.trigger');
    },
    triggerAutoFade() {
      emit('autoFade.trigger');
    },
    runTransition(frames) {
      if (frames !== undefined) dispatch({ type: 'SET_TRANSITION_TIME', frames });
      emit('autoTake.trigger');
    },
    selectWipePattern(n) {
      const { family, variant, reverse } = numberToPattern(n);
      dispatch({ type: 'PRESS_WIPE_FAMILY', family });
      dispatch({ type: 'SET_WIPE_VARIANT', variant });
      dispatch({ type: 'SET_REVERSE', on: reverse });
    },
    stepEventMemory() {
      emit('autoTake.trigger'); // AUTO TAKE performs the armed recall and arms the next event
    },
    setColourCorrection(bus, setting) {
      const current = (bus === 'A' ? getState().busA : getState().busB).colourCorrect.mode;
      const presses = (CC_CYCLE_ORDER.indexOf(setting.mode) - CC_CYCLE_ORDER.indexOf(current) + 3) % 3;
      for (let i = 0; i < presses; i++) dispatch({ type: 'PRESS_COLOUR_CORRECT', bus });
      if (setting.chroma !== undefined) dispatch({ type: 'SET_CHROMA', bus, value: setting.chroma });
      if (setting.x !== undefined || setting.y !== undefined) {
        dispatch({ type: 'SET_CC_JOYSTICK', bus, x: setting.x ?? 0, y: setting.y ?? 0 });
      }
    },
    setDsk(setting) {
      if (setting.keySource !== undefined) dispatch({ type: 'SET_DSK_KEY_SOURCE', source: setting.keySource });
      if (setting.low !== undefined) dispatch({ type: 'SET_DSK_LOW', level: setting.low });
      if (setting.high !== undefined) dispatch({ type: 'SET_DSK_HIGH', level: setting.high });
      if (setting.edge !== undefined) dispatch({ type: 'SET_DSK_EDGE', edge: setting.edge });
      dispatch({ type: 'SET_DSK_ON', on: setting.on });
    },
  };
}

/** The RS422 pattern number for a wipe (family + variant), forward direction — for round-trip tests. */
export function wipePatternNumber(family: (typeof WIPE_FAMILIES)[number], variant: number): number {
  return forwardIndex(family, variant);
}
