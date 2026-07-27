// The local automation API (ADR-0014): the browser analogue of the WJ-MX50's RS422/RS232C
// editor-control ports (reference §17). It exposes the same command vocabulary a resolver emits
// — run a transition, call a wipe pattern number, step Event Memory, trigger Auto Take — as a
// small in-process interface, with NO transport (no serial/network). Single-control ops route
// through resolveSignal (the sole emitter); the composite wipe-pattern call decomposes via the
// pure core/wipe.ts numbering oracle. Pure and testable.

import { resolveSignal } from './resolver.js';
import { forwardIndex, numberToPattern } from '../core/wipe.js';
import { WIPE_FAMILIES } from '../core/wipe.js';
import type { Command } from '../state/commands.js';
import type { PanelState } from '../state/state.js';

export interface AutomationApi {
  triggerAutoTake(): void;
  triggerAutoFade(): void;
  /** Optionally set the TRANSITION time, then fire Auto Take (an "external take"). */
  runTransition(frames?: number): void;
  /** Call a wipe pattern by its RS422 number (1..255; +128 = the reversed pattern). */
  selectWipePattern(n: number): void;
  /** Advance sequential Event-Memory playback one step (AUTO TAKE walks the bank). */
  stepEventMemory(): void;
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
  };
}

/** The RS422 pattern number for a wipe (family + variant), forward direction — for round-trip tests. */
export function wipePatternNumber(family: (typeof WIPE_FAMILIES)[number], variant: number): number {
  return forwardIndex(family, variant);
}
