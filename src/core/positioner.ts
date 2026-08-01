// Positioner & Scene Grabber domain (reference §7). Positioning works only with the
// Square-family wipe; ASPECT applies only when its ON button is lit. Pure and GPU-free.

import type { PanelState, PositionerState, WipeFamily, WipeState } from '../state/state.js';

/** The Positioner is available only with a Square-family wipe pattern (reference §7). */
export function positionerAvailable(family: WipeFamily): boolean {
  return family === 'square';
}

/** ASPECT stretches the Square pattern only when its ON button is lit (reference §7, §9.4). */
export function aspectEffective(wipe: WipeState): boolean {
  return wipe.family === 'square' && wipe.aspectOn;
}

/**
 * A Picture-in-Picture is a compressed inset produced by a Square-family wipe with the
 * Positioner engaged and Compression on (reference §16, recipe 5). The reducer guarantees the
 * Positioner can be ON only on Square (PRESS_POSITIONER no-ops off Square; leaving Square
 * auto-disengages it), so this is true only for a genuine square-wipe PiP.
 */
export function isPictureInPicture(state: PanelState): boolean {
  return state.transition.wipe.family === 'square' && state.positioner.on && state.transition.wipe.modifiers.compression > 0;
}

/** Only a square-wipe PiP is storable/recallable as a PiP (reference §16, recipe 5) — a pure read-time predicate. */
export const isStorablePip = isPictureInPicture;

// --- inset geometry & Scene Grabber sample math (reference §7, §16 recipe 5) --
// The formulas the wipe shader's Positioner branch hard-codes, extracted so the WGSL and
// the headless specs consume one source. UV is top-left origin, +y down.

/** Joystick ±1 → inset centre ±0.4 UV around screen centre. */
export const INSET_TRAVEL = 0.4;
/** Degenerate-inset floor. */
export const INSET_MIN_SIZE = 0.02;

const clampAxis = (v: number): number => (v < -1 ? -1 : v > 1 ? 1 : v);
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** UV centre of the Positioner inset for a joystick position. */
export function insetCentre(x: number, y: number): { u: number; v: number } {
  return { u: 0.5 + clampAxis(x) * INSET_TRAVEL, v: 0.5 + clampAxis(y) * INSET_TRAVEL };
}

/**
 * The lever-driven effective inset size (reference §7: the Mix/Wipe lever sizes the inset).
 * At lever centre this is exactly the stored size; toward B it doubles, toward A it collapses.
 */
export function effectiveInsetSize(size: number, lever: number): number {
  return clamp01(size * 2 * clamp01(lever));
}

/** UV half-extent of the inset mask for an (effective) size. */
export function insetHalf(size: number): number {
  return Math.max(size, INSET_MIN_SIZE) * 0.5;
}

/** Capture-time snapshot taken at the Scene-Grabber rising edge. */
export interface GrabCapture {
  cu: number;
  cv: number;
  half: number;
  compressed: boolean;
}

/** Tightly packed RGBA8 pixels of a captured still (width*height*4 bytes, ADR-0015). */
export interface StillPixels {
  width: number;
  height: number;
  pixels: ArrayBuffer;
}

/** A persisted still: the pixels plus the grab-edge latch that rides with the BLOB tier
 *  (the panel snapshot carries only a still-reference id). */
export interface StillRecord extends StillPixels {
  grab: GrabCapture;
}

/** Latch the inset geometry at the grab instant. `compression` is wipe.modifiers.compression. */
export function grabCapture(p: PositionerState, lever: number, compression: number): GrabCapture {
  const c = insetCentre(p.x, p.y);
  return { cu: c.u, cv: c.v, half: insetHalf(effectiveInsetSize(p.size, lever)), compressed: compression > 0 };
}

/**
 * Sample transform of a LIVE inset pixel: window mode is identity (the inset is a window
 * onto B); compressed (PiP) maps the whole B frame into the inset.
 */
export function insetSampleUV(
  u: number,
  v: number,
  centre: { u: number; v: number },
  half: number,
  compressed: boolean,
): { u: number; v: number } {
  if (!compressed) return { u, v };
  const h = Math.max(half, 0.005);
  return { u: (u - centre.u) / (2 * h) + 0.5, v: (v - centre.v) / (2 * h) + 0.5 };
}

/**
 * Sample transform of a FROZEN inset pixel — the exact math the WGSL uses. Window mode:
 * the still rides rigidly (each pixel keeps its capture-time offset from the inset centre).
 * Compressed mode: the frozen full frame squeezed into the moved inset, size held at grab.
 */
export function grabSampleUV(
  u: number,
  v: number,
  liveCentre: { u: number; v: number },
  g: GrabCapture,
): { u: number; v: number } {
  if (g.compressed) {
    const h = Math.max(g.half, 0.005);
    return { u: (u - liveCentre.u) / (2 * h) + 0.5, v: (v - liveCentre.v) / (2 * h) + 0.5 };
  }
  return { u: u - liveCentre.u + g.cu, v: v - liveCentre.v + g.cv };
}
