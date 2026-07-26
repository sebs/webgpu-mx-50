// Positioner & Scene Grabber domain (reference §7). Positioning works only with the
// Square-family wipe; ASPECT applies only when its ON button is lit. Pure and GPU-free.

import type { WipeFamily, WipeState } from '../state/state.js';

/** The Positioner is available only with a Square-family wipe pattern (reference §7). */
export function positionerAvailable(family: WipeFamily): boolean {
  return family === 'square';
}

/** ASPECT stretches the Square pattern only when its ON button is lit (reference §7, §9.4). */
export function aspectEffective(wipe: WipeState): boolean {
  return wipe.family === 'square' && wipe.aspectOn;
}
