// The single pure reducer: (state, command) -> next state (ADR-0011). It never
// mutates its input; it returns a new immutable snapshot, or the same reference when a
// command changes nothing. Cross-control invariants that the reference dictates live
// here so they cannot drift. Because it is pure it is asserted directly by the domain
// specs (ADR-0016), no GPU or DOM needed.

import { MATTE_COLOR_COUNT } from './state.js';
import { blindsLegal, pressBorder, pressSoft, VARIANT_COUNT } from '../core/wipe.js';
import { wrapUnit } from '../core/key.js';
import { nextDskEdgeStyle } from '../core/dsk.js';
import type { BusId } from '../core/types.js';
import type {
  ColourCorrectMode,
  ColourCorrectState,
  DigitalEffectState,
  DskState,
  FreezeEffect,
  FreezeState,
  PanelState,
  WipeState,
} from './state.js';
import type { Command } from './commands.js';

const FILTER_SET: ReadonlySet<string> = new Set(['nega', 'mosaic', 'mono', 'paint']);

/** Clear the wipe Compression modifier (freeze effects exclude it, reference §8.5/§8.6). */
function compressionCleared(state: PanelState): PanelState {
  const w = state.transition.wipe;
  if (w.modifiers.compression === 0) return state;
  return { ...state, transition: { ...state.transition, wipe: { ...w, modifiers: { ...w.modifiers, compression: 0 } } } };
}

/**
 * Engage or disengage a freeze-family effect, enforcing the single-owner exclusion rules
 * (ADR-0007, reference §8.5–§8.8): Still ⊥ Strobe/Multi/Compression; Trail may run with
 * Still; Trail ⊥ A/V Synchro. The newly-engaged effect wins and disables its conflicts.
 */
function engageFreeze(state: PanelState, effect: FreezeEffect, on: boolean): PanelState {
  const de = state.digitalEffect;
  if (effect === 'trail' && on && de.avSynchro) return state; // Trail ⊥ A/V Synchro
  const freeze: FreezeState = { ...de.freeze };
  let next = state;
  switch (effect) {
    case 'still':
      freeze.still = on;
      if (on) {
        freeze.strobe = false;
        freeze.multi = 0;
        next = compressionCleared(state);
      }
      break;
    case 'strobe':
      freeze.strobe = on;
      if (on) {
        freeze.still = false;
        next = compressionCleared(state);
      }
      break;
    case 'multi':
      freeze.multi = on ? 4 : 0;
      if (on) freeze.still = false;
      break;
    case 'trail':
      freeze.trail = on;
      break;
  }
  return { ...next, digitalEffect: { ...next.digitalEffect, freeze } };
}

const CC_CYCLE: Record<ColourCorrectMode, ColourCorrectMode> = {
  off: 'chroma-only',
  'chroma-only': 'chroma-plus-joystick',
  'chroma-plus-joystick': 'off',
};

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

/** Return a new state with a bus's colour correction replaced. */
function withBusCC(state: PanelState, bus: BusId, cc: ColourCorrectState): PanelState {
  const key = bus === 'A' ? 'busA' : 'busB';
  return { ...state, [key]: { ...state[key], colourCorrect: cc } };
}

/** Return a new state with the digital-effect block replaced. */
function withEffect(state: PanelState, digitalEffect: DigitalEffectState): PanelState {
  return { ...state, digitalEffect };
}

/** Return a new state with the DSK block replaced. */
function withDsk(state: PanelState, dsk: DskState): PanelState {
  return { ...state, dsk };
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
      // Spread the existing bus so other per-bus fields (e.g. colourCorrect) are preserved.
      return { ...state, [busKey]: { ...bus, source: command.source, substituteSource } };
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
      let next = withWipe(state, {
        ...w,
        family: command.family,
        variant: 0,
        modifiers: { ...w.modifiers, blinds },
      });
      // The Positioner requires a Square-family wipe; leaving Square disengages it (§7).
      if (command.family !== 'square' && state.positioner.on) {
        next = { ...next, positioner: { ...state.positioner, on: false, sceneGrabber: false } };
      }
      return next;
    }

    case 'SET_WIPE_VARIANT': {
      const w = state.transition.wipe;
      const variant = ((command.variant % VARIANT_COUNT) + VARIANT_COUNT) % VARIANT_COUNT;
      if (variant === w.variant) return state;
      return withWipe(state, { ...w, variant });
    }

    case 'PRESS_COMPRESSION': {
      const w = state.transition.wipe;
      const de = state.digitalEffect;
      if (de.freeze.strobe) return state; // Compression is disabled during Strobe (§8.6)
      const compression = (((w.modifiers.compression + 1) % 3) as 0 | 1 | 2);
      let next = withWipe(state, { ...w, modifiers: { ...w.modifiers, compression } });
      if (compression > 0 && de.freeze.still) {
        // Engaging Compression switches Still off (§8.5).
        next = { ...next, digitalEffect: { ...de, freeze: { ...de.freeze, still: false } } };
      }
      return next;
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

    case 'SET_ASPECT_ON':
      if (state.transition.wipe.aspectOn === command.on) return state;
      return withWipe(state, { ...state.transition.wipe, aspectOn: command.on });

    // --- positioner & scene grabber (reference §7) ---

    case 'PRESS_POSITIONER': {
      const p = state.positioner;
      if (p.on) {
        // Turning the Positioner off cancels any Scene Grabber (§7).
        return { ...state, positioner: { ...p, on: false, sceneGrabber: false } };
      }
      if (state.transition.wipe.family !== 'square') return state; // unavailable off Square
      return { ...state, positioner: { ...p, on: true, size: clamp(p.size * 2, 0, 1) } };
    }

    case 'SET_POSITIONER_SIZE':
      return { ...state, positioner: { ...state.positioner, size: clamp(command.value, 0, 1) } };

    case 'SET_POSITIONER_JOYSTICK':
      return {
        ...state,
        positioner: { ...state.positioner, x: clamp(command.x, -1, 1), y: clamp(command.y, -1, 1) },
      };

    case 'PRESS_SCENE_GRABBER': {
      const p = state.positioner;
      if (!p.on) return state; // Scene Grabber needs the Positioner active
      return { ...state, positioner: { ...p, sceneGrabber: !p.sceneGrabber } };
    }

    // --- keys (reference §9.5–§9.6) ---

    case 'PRESS_LUM_KEY': {
      const type = state.transition.type === 'lum-key' ? 'mix' : 'lum-key';
      return { ...state, transition: { ...state.transition, type } };
    }

    case 'PRESS_CHROMA_KEY': {
      const type = state.transition.type === 'chroma-key' ? 'mix' : 'chroma-key';
      return { ...state, transition: { ...state.transition, type } };
    }

    case 'SET_SLICE': {
      const slice = clamp(command.value, 0, 1);
      if (slice === state.transition.slice) return state;
      return { ...state, transition: { ...state.transition, slice } };
    }

    case 'SET_HUE': {
      const hue = wrapUnit(command.angle);
      if (hue === state.transition.hue) return state;
      return { ...state, transition: { ...state.transition, hue } };
    }

    // --- downstream key (reference §10) ---

    case 'SET_DSK_ON':
      if (state.dsk.on === command.on) return state;
      return withDsk(state, { ...state.dsk, on: command.on });

    case 'SET_DSK_FILL':
      if (state.dsk.fill === command.fill) return state;
      return withDsk(state, { ...state.dsk, fill: command.fill });

    case 'SET_DSK_KEY_SOURCE':
      if (state.dsk.keySource === command.source) return state;
      return withDsk(state, { ...state.dsk, keySource: command.source });

    case 'SET_DSK_LOW': {
      const low = clamp(command.level, 0, 1);
      if (low === state.dsk.low) return state;
      return withDsk(state, { ...state.dsk, low });
    }

    case 'SET_DSK_HIGH': {
      const high = clamp(command.level, 0, 1);
      if (high === state.dsk.high) return state;
      return withDsk(state, { ...state.dsk, high });
    }

    case 'PRESS_DSK_EDGE':
      return withDsk(state, { ...state.dsk, edge: nextDskEdgeStyle(state.dsk.edge) });

    case 'SET_DSK_EDGE':
      if (state.dsk.edge === command.edge) return state;
      return withDsk(state, { ...state.dsk, edge: command.edge });

    case 'SET_DSK_EDGE_COLOR': {
      if (state.dsk.fill === 'matte') return state; // matte fill forces a black edge (§10)
      const edgeColorIndex = wrapColor(command.colorIndex);
      if (edgeColorIndex === state.dsk.edgeColorIndex) return state;
      return withDsk(state, { ...state.dsk, edgeColorIndex });
    }

    case 'PRESS_DSK_REVERSE':
      return withDsk(state, { ...state.dsk, reverse: !state.dsk.reverse });

    // --- colour correction (reference §6) ---

    case 'PRESS_COLOUR_CORRECT': {
      const cc = command.bus === 'A' ? state.busA.colourCorrect : state.busB.colourCorrect;
      return withBusCC(state, command.bus, { ...cc, mode: CC_CYCLE[cc.mode] });
    }

    case 'SET_CHROMA': {
      const cc = command.bus === 'A' ? state.busA.colourCorrect : state.busB.colourCorrect;
      const chroma = clamp(command.value, 0, 1);
      if (chroma === cc.chroma) return state;
      return withBusCC(state, command.bus, { ...cc, chroma });
    }

    case 'SET_CC_JOYSTICK': {
      const cc = command.bus === 'A' ? state.busA.colourCorrect : state.busB.colourCorrect;
      return withBusCC(state, command.bus, {
        ...cc,
        joystickX: clamp(command.x, -1, 1),
        joystickY: clamp(command.y, -1, 1),
      });
    }

    // --- digital effect: filters (reference §8) ---

    case 'SELECT_EFFECT_BUS': {
      const de = state.digitalEffect;
      if (de.bus === command.bus) return state;
      // The block targets one bus at a time; moving it leaves the old bus clean.
      return withEffect(state, {
        ...de,
        bus: command.bus,
        active: { nega: false, mosaic: false, mono: false, paint: false },
        freeze: { still: false, strobe: false, multi: 0, trail: false },
      });
    }

    case 'CHOOSE_EFFECT':
      if (state.digitalEffect.armed === command.effect) return state;
      return withEffect(state, { ...state.digitalEffect, armed: command.effect });

    case 'PRESS_EFFECT_ON': {
      const de = state.digitalEffect;
      if (!de.armed) return state;
      if (FILTER_SET.has(de.armed)) {
        const armed = de.armed as 'nega' | 'mosaic' | 'mono' | 'paint';
        return withEffect(state, { ...de, active: { ...de.active, [armed]: !de.active[armed] } });
      }
      const freezeName = de.armed as FreezeEffect;
      const currentlyOn = freezeName === 'multi' ? de.freeze.multi > 0 : de.freeze[freezeName];
      return engageFreeze(state, freezeName, !currentlyOn);
    }

    case 'SET_MOSAIC_SIZE': {
      const step = clamp(Math.round(command.step), 1, 31);
      if (step === state.digitalEffect.mosaicSize) return state;
      return withEffect(state, { ...state.digitalEffect, mosaicSize: step });
    }

    case 'SET_PAINT_LEVEL': {
      const level = clamp(command.level, 0, 1);
      if (level === state.digitalEffect.paintLevel) return state;
      return withEffect(state, { ...state.digitalEffect, paintLevel: level });
    }

    // --- digital effect: freeze family (reference §8.5–§8.8, ADR-0007) ---

    case 'ENGAGE_FREEZE':
      return engageFreeze(state, command.effect, command.on);

    case 'PRESS_MULTI': {
      const de = state.digitalEffect;
      const next = de.freeze.multi === 0 ? 4 : de.freeze.multi === 4 ? 9 : de.freeze.multi === 9 ? 16 : 0;
      const freeze = { ...de.freeze, multi: next };
      if (next > 0) freeze.still = false; // engaging Multi switches Still off (§8.5)
      return withEffect(state, { ...de, freeze });
    }

    case 'SET_MULTI_GRID': {
      const de = state.digitalEffect;
      const count = command.count === 4 || command.count === 9 || command.count === 16 ? command.count : 0;
      const freeze = { ...de.freeze, multi: count };
      if (count > 0) freeze.still = false;
      return withEffect(state, { ...de, freeze });
    }

    case 'SET_MULTI_MODE':
      return withEffect(state, { ...state.digitalEffect, multiMode: command.mode });

    case 'SET_TRAIL_CORNER':
      return withEffect(state, { ...state.digitalEffect, trailCorner: command.corner });

    case 'SET_STROBE_TIME':
      return withEffect(state, { ...state.digitalEffect, strobeTime: clamp(command.position, 0, 1) });

    case 'SET_MULTI_TIME':
      return withEffect(state, { ...state.digitalEffect, multiTime: clamp(command.position, 0, 1) });

    case 'SET_TRAIL_TIME':
      return withEffect(state, { ...state.digitalEffect, trailTime: clamp(command.position, 0, 1) });

    case 'ATTEMPT_AV_SYNCHRO': {
      const de = state.digitalEffect;
      if (command.on && de.freeze.trail) return state; // Trail ⊥ A/V Synchro (§8.8)
      return withEffect(state, { ...de, avSynchro: command.on });
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
