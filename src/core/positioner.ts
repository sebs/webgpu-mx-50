// Positioner & Scene Grabber domain (reference §7). Positioning works only with the
// Square-family wipe; ASPECT applies only when its ON button is lit. Pure and GPU-free.

import type { PanelState, WipeFamily, WipeState } from '../state/state.js';

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
