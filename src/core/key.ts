// Shared keying domain for the Mix/Wipe-stage keys (reference §9.5 Luminance, §9.6 Chroma).
// The B-bus is always the key (foreground) source over the A-bus background. Pure and
// GPU-free; the same luminance/tolerance functions back the cucumber layer and the shader.

import type { BusId } from './types.js';

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Rec.601 luminance — the single luma definition shared by keys, DSK, and bus-effect. */
export function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Wrap a value into [0, 1). */
export function wrapUnit(x: number): number {
  return x - Math.floor(x);
}

// The B-bus is always the key source; the A-bus is always the background (reference §9.5/§9.6).
export const KEY_SOURCE_BUS: BusId = 'B';
export const KEY_BACKGROUND_BUS: BusId = 'A';
export const keySource = (): BusId => KEY_SOURCE_BUS;
export const keyBackground = (): BusId => KEY_BACKGROUND_BUS;

// --- Luminance Key (reference §9.5) ---------------------------------------

/** A B pixel at or above the slice level stays opaque (1); below becomes transparent (0). */
export function lumKeyMask(luma: number, slice: number): number {
  return luma >= slice ? 1 : 0;
}

/** The opaque foreground is composited at the lever's opacity (fully B = full opacity). */
export function keyForegroundOpacity(mask: number, lever: number): number {
  return mask * clamp01(lever);
}

/**
 * Fraction of the B image retained as foreground: a low slice keeps most of the image, a
 * high slice keeps only the brightest highlights (reference §9.5).
 */
export function keyedFraction(slice: number): number {
  return 1 - clamp01(slice);
}

// --- Chroma Key (reference §9.6) ------------------------------------------

/** Hue angle (0..1) for a named solid backdrop colour. */
export function backdropHue(name: string): number {
  switch (name.trim().toLowerCase()) {
    case 'red':
      return 0;
    case 'green':
      return 1 / 3;
    case 'blue':
      return 2 / 3;
    default:
      throw new Error(`Unknown backdrop colour: ${name}`);
  }
}

/** Colour-match tolerance from SLICE: narrow (low) keys only near hues, wide (high) broadens. */
export function chromaTolerance(slice: number): number {
  return clamp01(slice);
}
