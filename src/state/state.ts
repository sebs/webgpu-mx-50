// The whole panel as one plain, JSON-serializable value (ADR-0011). No class
// instances, no functions, no GPU / HTMLVideoElement / AudioNode handles — device
// bindings are referenced by id and resolved outside the store (ADR-0008). This is
// what makes Event Memory (8 slots) and preset import/export thin operations.
//
// Phase 1 models the front of the panel: two buses (source + Matte substitute),
// the Matte generator, the Mix/Wipe transition, and Program Out selection. Later
// phases extend this tree (colour correction, digital effects, DSK, fade, audio).

import type { BusId, BusSource, SourceSlot } from '../core/types.js';

/** Rear Reset switch: ON = factory preset each power-up, OFF = field preset (reference §18). */
export type ResetMode = 'on' | 'off';

/** Per-bus colour correction tri-state (reference §6): off → CHROMA only → +RGB joystick. */
export type ColourCorrectMode = 'off' | 'chroma-only' | 'chroma-plus-joystick';

export interface ColourCorrectState {
  mode: ColourCorrectMode;
  /** CHROMA/saturation, 0..1; 0.5 = centre (original), 0 = MIN (black & white). */
  chroma: number;
  /** RGB tint joystick, each axis -1..1; (0,0) = centre (original balance). */
  joystickX: number;
  joystickY: number;
}

/**
 * A bus's current selection plus its Matte substitute (ADR-0006) and its colour
 * correction (reference §6, applied before the Digital Effect stage).
 */
export interface BusState {
  source: BusSource;
  substituteSource: SourceSlot;
  colourCorrect: ColourCorrectState;
}

/** The filter-family digital effects (reference §8.1–§8.4). */
export type FilterEffect = 'nega' | 'mosaic' | 'mono' | 'paint';

/**
 * The Digital Effect block (reference §8). It targets exactly one bus at a time; `armed`
 * is the chosen-but-not-yet-ON effect. Phase 3 (this slice) covers the four filters; the
 * freeze family (Still/Strobe/Multi/Trail) lands next.
 */
export interface DigitalEffectState {
  bus: BusId;
  armed: FilterEffect | null;
  active: { nega: boolean; mosaic: boolean; mono: boolean; paint: boolean };
  mosaicSize: number; // 1..31 (reference §8.2)
  paintLevel: number; // 0..1, MIN..MAX (reference §8.4)
}

/** The internal Matte generator (reference §4). `colorIndex` steps the 9 colours. */
export interface MatteState {
  colorIndex: number;
  level: number; // 0..1
  gradation: boolean;
}

/** The Mix/Wipe block selection (reference §9). */
export type TransitionType = 'mix' | 'nam' | 'wipe' | 'lum-key' | 'chroma-key';

/** The 7 wipe pattern families (reference §9.4, ADR-0009). */
export type WipeFamily = 'straight' | 'corner' | 'diagonal' | 'triangle' | 'split' | 'mosaic' | 'square';

/** Boundary treatment: a hard edge, a coloured Border (narrow/wide), or a Soft feather. */
export type WipeEdge = 'hard' | 'border-narrow' | 'border-wide' | 'soft-narrow' | 'soft-wide';

/** The stackable Modify functions (reference §9.4). Each 0/false = off. */
export interface WipeModifiers {
  compression: 0 | 1 | 2; // 1 = incoming compressed, 2 = both
  slide: 0 | 1 | 2; // 1 = incoming slides, 2 = both
  multi: number; // 0 = off, 1..6 multi modes
  pairing: boolean;
  blinds: boolean;
}

/** The composed wipe (reference §9.4, ADR-0009). */
export interface WipeState {
  family: WipeFamily;
  variant: number; // 0..3
  modifiers: WipeModifiers;
  edge: WipeEdge;
  reverse: boolean;
  oneWay: boolean;
  aspect: number; // -1..1, 0 = centre; Square family only
}

export interface TransitionState {
  type: TransitionType;
  /** Mix/Wipe lever position, 0 = fully A-bus, 1 = fully B-bus. */
  lever: number;
  wipe: WipeState;
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
  digitalEffect: DigitalEffectState;
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
const NEUTRAL_CC: ColourCorrectState = { mode: 'off', chroma: 0.5, joystickX: 0, joystickY: 0 };

export const FACTORY_PRESET: PanelState = {
  busA: { source: 1, substituteSource: 1, colourCorrect: { ...NEUTRAL_CC } },
  busB: { source: 2, substituteSource: 2, colourCorrect: { ...NEUTRAL_CC } },
  matte: { colorIndex: 0, level: 1, gradation: false },
  digitalEffect: {
    bus: 'A',
    armed: null,
    active: { nega: false, mosaic: false, mono: false, paint: false },
    mosaicSize: 16,
    paintLevel: 0.5,
  },
  transition: {
    type: 'mix',
    lever: 0,
    wipe: {
      family: 'straight',
      variant: 0,
      modifiers: { compression: 0, slide: 0, multi: 0, pairing: false, blinds: false },
      edge: 'hard',
      reverse: false,
      oneWay: false,
      aspect: 0,
    },
  },
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
