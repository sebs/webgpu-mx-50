// Per-bus colour correction domain (reference §6, ADR-0004). The tri-state control
// (off → CHROMA only → +RGB joystick), CHROMA saturation (centre = original, MIN =
// black & white), and the RGB-joystick tint semantics — including the "single mono tint"
// that appears only when CHROMA is at MIN. Pure and GPU-free.

import type { ColourCorrectState } from '../state/state.js';

export function ccActive(cc: ColourCorrectState): boolean {
  return cc.mode !== 'off';
}
export function chromaActive(cc: ColourCorrectState): boolean {
  return cc.mode !== 'off';
}
export function joystickActive(cc: ColourCorrectState): boolean {
  return cc.mode === 'chroma-plus-joystick';
}

/** At CHROMA fully MIN (0) the image is black & white (reference §6). */
export function isBlackAndWhite(cc: ColourCorrectState): boolean {
  return ccActive(cc) && cc.chroma === 0;
}

/** Saturation multiplier from CHROMA: 0.5 centre = 1 (original), 0 = 0 (B&W), 1 = 2 (boost). */
export function saturation(cc: ColourCorrectState): number {
  return ccActive(cc) ? cc.chroma * 2 : 1;
}

export function joystickOffCentre(cc: ColourCorrectState): boolean {
  return joystickActive(cc) && (cc.joystickX !== 0 || cc.joystickY !== 0);
}

/** The three tint-joystick basis directions (120° apart, like RGB on a hue wheel). */
export const TINT_BASIS: Record<'red' | 'green' | 'blue', { x: number; y: number }> = {
  red: { x: 1, y: 0 },
  green: { x: -0.5, y: 0.866 },
  blue: { x: -0.5, y: -0.866 },
};

/**
 * The single mono tint (reference §6): only when the image is black & white (CHROMA MIN)
 * and the joystick is off centre does the whole scene take a mono tint toward the
 * joystick colour. Above MIN the joystick shifts hue/balance instead (not a mono tint).
 */
export function monoTint(cc: ColourCorrectState): 'red' | 'green' | 'blue' | 'none' {
  if (!isBlackAndWhite(cc) || !joystickOffCentre(cc)) return 'none';
  let best: 'red' | 'green' | 'blue' = 'red';
  let bestDot = -Infinity;
  for (const k of ['red', 'green', 'blue'] as const) {
    const basis = TINT_BASIS[k];
    const dot = cc.joystickX * basis.x + cc.joystickY * basis.y;
    if (dot > bestDot) {
      bestDot = dot;
      best = k;
    }
  }
  return best;
}
