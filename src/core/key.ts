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

/** Linear light → the sRGB-encoded signal value. */
export function encodeSrgb(x: number): number {
  const c = clamp01(x);
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** The sRGB-encoded signal value → linear light. */
export function decodeSrgb(x: number): number {
  const c = clamp01(x);
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** HSV hue (0..1) of an RGB triple; 0 for a grey. */
export function hueOf(r: number, g: number, b: number): number {
  const mx = Math.max(r, g, b);
  const d = mx - Math.min(r, g, b);
  if (d < 1e-5) return 0;
  const h = mx === r ? (g - b) / d : mx === g ? 2 + (b - r) / d : 4 + (r - g) / d;
  return wrapUnit(h / 6);
}

/** Distance between two hues round the colour wheel (0..0.5). */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(wrapUnit(a) - wrapUnit(b));
  return Math.min(d, 1 - d);
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/**
 * The colour-difference length (|R−Y, B−Y| of the encoded signal) over which a pixel goes
 * from "grey, no hue" to "coloured enough to key". A keyer compares colour-difference
 * vectors, and a grey has none: whites, greys and blacks are never keyed, whatever HUE says.
 */
export const CHROMA_KEY_FLOOR: readonly [number, number] = [0.035, 0.08];

/** Half-width of the hue match for a SLICE (fraction of the colour wheel). */
export function chromaHueWidth(slice: number): number {
  return chromaTolerance(slice) * 0.4;
}

/** The soft edge either side of the hue match: narrow SLICE settings key with a sharper edge. */
export function chromaEdgeSoftness(slice: number): number {
  return 0.01 + chromaHueWidth(slice) * 0.25;
}

/**
 * How much of a B-bus pixel the Chroma Key removes: 0 keeps it, 1 shows the A-bus through
 * it. Takes the linear working-space colour (ADR-0005) and decides on the encoded signal,
 * as the hardware keyed its gamma-encoded colour-difference signals; the blend that uses
 * this stays linear. Mirrored by combine.wgsl.ts.
 */
export function chromaKeyAlpha(r: number, g: number, b: number, hue: number, slice: number): number {
  const er = encodeSrgb(r);
  const eg = encodeSrgb(g);
  const eb = encodeSrgb(b);
  const y = luminance(er, eg, eb);
  const chroma = Math.hypot(er - y, eb - y);
  const width = chromaHueWidth(slice);
  const soft = chromaEdgeSoftness(slice);
  const match = 1 - smoothstep(width - soft, width + soft, hueDistance(hueOf(er, eg, eb), hue));
  return match * smoothstep(CHROMA_KEY_FLOOR[0], CHROMA_KEY_FLOOR[1], chroma);
}
