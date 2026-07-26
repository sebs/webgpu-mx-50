// Every mutation to the panel is a typed command (ADR-0011). `dispatch` is the only
// write path, so UI widgets, the input-mapping layer, Auto Take, and Event Memory
// recall all serialize through one place instead of racing. The reducer
// (reducer.ts) maps (state, command) -> next state as a pure function.

import type { BusId, BusSource } from '../core/types.js';
import type {
  AvSynchroEffect,
  DigitalEffectName,
  DskEdgeStyle,
  DskFill,
  DskKeySource,
  FreezeEffect,
  MicAux2Input,
  PanelState,
  ProgramOut,
  TransitionType,
  WipeFamily,
} from './state.js';

export type Command =
  | { type: 'ASSIGN_SOURCE'; bus: BusId; source: BusSource }
  | { type: 'SET_LEVER'; position: number }
  | { type: 'SET_TRANSITION_TYPE'; transition: TransitionType }
  | { type: 'SET_PROGRAM_OUT'; mode: ProgramOut }
  | { type: 'SET_MATTE_COLOR'; colorIndex: number }
  | { type: 'STEP_MATTE_COLOR'; direction: 'up' | 'down' }
  | { type: 'SET_MATTE_LEVEL'; level: number }
  | { type: 'SET_GRADATION'; on: boolean }
  // --- colour correction (reference §6) ---
  | { type: 'PRESS_COLOUR_CORRECT'; bus: BusId } // cycle off → chroma → +joystick → off
  | { type: 'SET_CHROMA'; bus: BusId; value: number }
  | { type: 'SET_CC_JOYSTICK'; bus: BusId; x: number; y: number }
  // --- digital effect: filters (reference §8.1–§8.4) ---
  | { type: 'SELECT_EFFECT_BUS'; bus: BusId }
  | { type: 'CHOOSE_EFFECT'; effect: DigitalEffectName }
  | { type: 'PRESS_EFFECT_ON' } // toggle the armed effect on the target bus
  | { type: 'SET_MOSAIC_SIZE'; step: number } // 1..31
  | { type: 'SET_PAINT_LEVEL'; level: number } // 0..1
  // --- digital effect: freeze family (reference §8.5–§8.8, ADR-0007) ---
  | { type: 'ENGAGE_FREEZE'; effect: FreezeEffect; on: boolean }
  | { type: 'PRESS_MULTI' } // cycle single → 4 → 9 → 16 → single
  | { type: 'SET_MULTI_GRID'; count: number } // 0 | 4 | 9 | 16 (direct set)
  | { type: 'SET_MULTI_MODE'; mode: 'once' | 'repeat' }
  | { type: 'SET_TRAIL_CORNER'; corner: 'upper-left' | 'upper-right' }
  | { type: 'SET_STROBE_TIME'; position: number } // 0..1
  | { type: 'SET_MULTI_TIME'; position: number }
  | { type: 'SET_TRAIL_TIME'; position: number }
  | { type: 'ATTEMPT_AV_SYNCHRO'; on: boolean }
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
  | { type: 'SET_ASPECT_ON'; on: boolean } // ASPECT ON button (reference §7)
  // --- positioner & scene grabber (reference §7) ---
  | { type: 'PRESS_POSITIONER' } // toggle; ON only on Square, doubles size; OFF cancels grab
  | { type: 'SET_POSITIONER_SIZE'; value: number } // 0..1
  | { type: 'SET_POSITIONER_JOYSTICK'; x: number; y: number } // -1..1
  | { type: 'PRESS_SCENE_GRABBER' } // toggle; only when the Positioner is active
  // --- keys (reference §9.5–§9.6) ---
  | { type: 'PRESS_LUM_KEY' } // toggle mix <-> lum-key
  | { type: 'PRESS_CHROMA_KEY' } // toggle mix <-> chroma-key
  | { type: 'SET_SLICE'; value: number } // 0..1 SLICE knob (shared lum/chroma)
  | { type: 'SET_HUE'; angle: number } // 0..1 HUE knob (chroma), wraps
  // --- downstream key (reference §10) ---
  | { type: 'SET_DSK_ON'; on: boolean }
  | { type: 'SET_DSK_FILL'; fill: DskFill }
  | { type: 'SET_DSK_KEY_SOURCE'; source: DskKeySource }
  | { type: 'SET_DSK_LOW'; level: number } // 0..1
  | { type: 'SET_DSK_HIGH'; level: number } // 0..1
  | { type: 'PRESS_DSK_EDGE' } // cycle the 6-style ring
  | { type: 'SET_DSK_EDGE'; edge: DskEdgeStyle }
  | { type: 'SET_DSK_EDGE_COLOR'; colorIndex: number } // ignored when fill === 'matte'
  | { type: 'PRESS_DSK_REVERSE' }
  // --- audio mixer / follow (reference §5, §12) ---
  | { type: 'SET_AUDIO_FADER'; fader: 'a' | 'b' | 'aux1' | 'micAux2' | 'master'; level: number } // 0..1 travel
  | { type: 'SET_MIC_AUX2_SWITCH'; position: MicAux2Input }
  | { type: 'PRESS_AUDIO_FOLLOW' } // toggle
  // --- A/V Synchro (reference §8.9) ---
  | { type: 'SET_AV_SYNCHRO_LEVEL'; level: number } // 0..1 threshold
  | { type: 'SET_AV_SYNCHRO_EFFECT'; effect: AvSynchroEffect; on: boolean }
  | { type: 'LOAD_STATE'; state: PanelState };

/** Discriminant union of all command type tags, handy for exhaustiveness. */
export type CommandType = Command['type'];
