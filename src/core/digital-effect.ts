// The Digital Effect block domain (reference §8, this slice covers the four filters).
// The block targets one bus at a time; these helpers answer "is effect X live on bus Y?"
// and encode the Mono-overrides-colour-correction rule (reference §6/§8.3). GPU-free.

import { NTSC_FRAME_HZ } from '../constants.js';
import type { BusId } from './types.js';
import type { DigitalEffectState, FilterEffect, FreezeEffect, PanelState } from '../state/state.js';

/** Whether a filter is active on a given bus (the block targets a single bus). */
export function effectActiveOn(de: DigitalEffectState, bus: BusId, effect: FilterEffect): boolean {
  return de.bus === bus && de.active[effect];
}

/** Whether any filter is active on a given bus. */
export function anyEffectOn(de: DigitalEffectState, bus: BusId): boolean {
  return de.bus === bus && (de.active.nega || de.active.mosaic || de.active.mono || de.active.paint);
}

/**
 * Colour correction applies to a bus unless the Mono digital effect is active on that bus,
 * which overrides it (reference §6, §8.3).
 */
export function colourCorrectApplies(state: PanelState, bus: BusId): boolean {
  const cc = bus === 'A' ? state.busA.colourCorrect : state.busB.colourCorrect;
  return cc.mode !== 'off' && !effectActiveOn(state.digitalEffect, bus, 'mono');
}

/** Paint coarseness from its LEVEL: MIN = finest, mid = moderate, MAX = coarsest (reference §8.4). */
export function paintCoarseness(level: number): 'finest' | 'moderate' | 'coarsest' {
  if (level < 1 / 3) return 'finest';
  if (level < 2 / 3) return 'moderate';
  return 'coarsest';
}

// --- freeze family (reference §8.5–§8.8, ADR-0007) -------------------------

export function freezeActiveOn(de: DigitalEffectState, bus: BusId, effect: FreezeEffect): boolean {
  if (de.bus !== bus) return false;
  return effect === 'multi' ? de.freeze.multi > 0 : de.freeze[effect];
}

export function anyFreezeOn(de: DigitalEffectState, bus: BusId): boolean {
  return de.bus === bus && (de.freeze.still || de.freeze.strobe || de.freeze.multi > 0 || de.freeze.trail);
}

/** Any digital effect (filter or freeze) live on a bus. */
export function anyDigitalEffectOn(de: DigitalEffectState, bus: BusId): boolean {
  return anyEffectOn(de, bus) || anyFreezeOn(de, bus);
}

/** The Still LED blinks when Still and Trail run together (reference §8.5). */
export function stillLedBlinks(de: DigitalEffectState): boolean {
  return de.freeze.still && de.freeze.trail;
}

/** Multi grid label for a count (reference §8.7). */
export function multiGridLabel(count: number): string {
  return count === 4 ? '2x2' : count === 9 ? '3x3' : count === 16 ? '4x4' : 'single';
}

export function multiTilesPerAxis(count: number): number {
  return count === 4 ? 2 : count === 9 ? 3 : count === 16 ? 4 : 1;
}

/** Trail is capped at 16 progressively-placed copies (reference §8.8). */
export const TRAIL_MAX_COPIES = 16;

// TIME interval endpoints in seconds (reference §8.6–§8.8).
export const STROBE_MIN = 0.03;
export const STROBE_MAX = 2.1;
export const MULTI_MIN = 0.07;
export const MULTI_MAX = 2.1;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Strobe freeze interval (seconds) from the TIME control position 0..1 (reference §8.6). */
export function strobeInterval(position: number): number {
  return STROBE_MIN + clamp01(position) * (STROBE_MAX - STROBE_MIN);
}
/** Multi tile-capture interval (seconds) from TIME position 0..1 (reference §8.7). */
export function multiInterval(position: number): number {
  return MULTI_MIN + clamp01(position) * (MULTI_MAX - MULTI_MIN);
}
/** Trail copy interval (seconds) from TIME position 0..1 (reference §8.8). */
export function trailInterval(position: number): number {
  return multiInterval(position);
}

/** Convert a seconds interval to whole logical ticks (ADR-0012); at least one tick. */
export function intervalTicks(seconds: number): number {
  return Math.max(1, Math.round(seconds * NTSC_FRAME_HZ));
}

/** Trail makes the Compression Wipe unreliable / unsupported (reference §8.8). */
export function compressionReliable(state: PanelState): boolean {
  return !state.digitalEffect.freeze.trail;
}

/**
 * Frame field/frame button contract (reference §8.10, ADR-0005 §6). Clean-modern video is
 * full-resolution progressive RGBA with no interlace fields, so there is no field/frame
 * resolution trade: the Frame button NEVER alters the effect output. The renderer and the specs
 * both read this constant, so the no-op is stated in exactly one place.
 */
export const FRAME_MODE_AFFECTS_OUTPUT = false;
