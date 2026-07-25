// The whole panel as one plain, JSON-serializable value (ADR-0011). No class
// instances, no functions, no GPU / HTMLVideoElement / AudioNode handles — device
// bindings are referenced by id and resolved outside the store (ADR-0008). This is
// what makes Event Memory (8 slots) and preset import/export thin operations.
//
// Phase 1 models the front of the panel: two buses (source + Matte substitute),
// the Matte generator, the Mix/Wipe transition, and Program Out selection. Later
// phases extend this tree (colour correction, digital effects, DSK, fade, audio).

import type { BusSource, SourceSlot } from '../core/types.js';

/** Rear Reset switch: ON = factory preset each power-up, OFF = field preset (reference §18). */
export type ResetMode = 'on' | 'off';

/**
 * A bus's current selection plus its Matte substitute (ADR-0006). `source` is what
 * the operator picked (Source 1-4 or Matte); `substituteSource` is the last non-Matte
 * source held — the "blinking" button the unit falls back to wherever Matte is illegal
 * (keys, DSK, fade, direct program out).
 */
export interface BusState {
  source: BusSource;
  substituteSource: SourceSlot;
}

/** The internal Matte generator (reference §4). `colorIndex` steps the 9 colours. */
export interface MatteState {
  colorIndex: number;
  level: number; // 0..1
  gradation: boolean;
}

/** The Mix/Wipe block selection (reference §9). */
export type TransitionType = 'mix' | 'nam' | 'wipe' | 'lum-key' | 'chroma-key';

export interface TransitionState {
  type: TransitionType;
  /** Mix/Wipe lever position, 0 = fully A-bus, 1 = fully B-bus. */
  lever: number;
}

/** What leaves the unit (reference §2): A/B direct-out, or the full EFFECT composite. */
export type ProgramOut = 'A' | 'B' | 'effect';

/** Housekeeping switches (reference §18). */
export interface SystemState {
  reset: ResetMode;
}

/** The complete panel state. */
export interface PanelState {
  busA: BusState;
  busB: BusState;
  matte: MatteState;
  transition: TransitionState;
  programOut: ProgramOut;
  system: SystemState;
}

/** Number of Matte colours (Colour Bar, White, Yellow, Cyan, Green, Magenta, Red, Blue, Black). */
export const MATTE_COLOR_COUNT = 9;

/**
 * The single canonical factory preset (reference §18, Reset ON). Every power-up in
 * Reset-ON mode loads exactly this, guarding against odd states after a power fault.
 */
export const FACTORY_PRESET: PanelState = {
  busA: { source: 1, substituteSource: 1 },
  busB: { source: 2, substituteSource: 2 },
  matte: { colorIndex: 0, level: 1, gradation: false },
  transition: { type: 'mix', lever: 0 },
  programOut: 'effect',
  system: { reset: 'on' },
};

/** Deep structural clone of a panel state (plain JSON, so this is total and safe). */
export function clonePanelState(state: PanelState): PanelState {
  return structuredClone(state);
}

/**
 * Field-preset transform (reference §18, Reset OFF): restore the saved snapshot but
 * force the volatile Still/Strobe/Special-function state to cleared. Phase 1 has none
 * of those fields yet, so this is a pure clone — the seam is here so later phases add
 * the sanitising without touching the boot path (ADR-0011).
 */
export function fieldPreset(saved: PanelState): PanelState {
  const next = clonePanelState(saved);
  // TODO(phase>=3): clear next.<bus>.digitalEffect Still/Strobe and system.specialMode.
  return next;
}
