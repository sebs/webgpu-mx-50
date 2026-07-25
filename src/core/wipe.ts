// The compositional wipe engine's pure domain (ADR-0009, reference §9.4/§9.7): the 7
// families and their variants, the numbering oracle (001 plain, +128 = reversed),
// external addressing limits, modifier legality, the Border complementary colour, edge
// treatment, and the direction model. All GPU-free and shared by the domain specs and
// the wipe shader.

import { matteColorName, matteIndexByName } from './matte.js';
import type { WipeEdge, WipeFamily, WipeState } from '../state/state.js';

// --- families & variants ---------------------------------------------------

/** Family order used for numbering (reference §9.4). */
export const WIPE_FAMILIES: readonly WipeFamily[] = [
  'straight',
  'corner',
  'diagonal',
  'triangle',
  'split',
  'mosaic',
  'square',
];

/** Every Pattern Select button cycles through 4 variants (reference §9.4). */
export const VARIANT_COUNT = 4;

/** Square-family variant shapes, by variant index (reference §9.4). */
export const SQUARE_SHAPES = ['square', 'circle', 'oval', 'diamond'] as const;

export function squareShapeName(variant: number): string {
  return SQUARE_SHAPES[((variant % 4) + 4) % 4]!;
}

export function squareVariantForShape(shape: string): number {
  const i = SQUARE_SHAPES.indexOf(shape as (typeof SQUARE_SHAPES)[number]);
  if (i < 0) throw new Error(`Unknown Square shape: ${shape}`);
  return i;
}

// --- numbering oracle (reference §9.4/§9.7) --------------------------------

/** The plain wipe (Straight, first variant, no modifiers) is pattern 001. */
export const PLAIN_WIPE_NUMBER = 1;

/** Reverse is bit 7 of the 0–255 index: n and n+128 are the same wipe, reversed. */
export const REVERSE_OFFSET = 128;

/** Highest number the RS-422 protocol can address; 256–287 exist but are panel-only. */
export const RS422_MAX = 255;

/** Forward (non-reversed) 1-based index of a family+variant (Straight v0 = 1). */
export function forwardIndex(family: WipeFamily, variant: number): number {
  const familyIndex = WIPE_FAMILIES.indexOf(family);
  return familyIndex * VARIANT_COUNT + (((variant % VARIANT_COUNT) + VARIANT_COUNT) % VARIANT_COUNT) + 1;
}

/** The Wipe Pattern Indicator number for a composed wipe (forward index, +128 if reversed). */
export function patternNumber(wipe: WipeState): number {
  return forwardIndex(wipe.family, wipe.variant) + (wipe.reverse ? REVERSE_OFFSET : 0);
}

export function isReversed(n: number): boolean {
  return n > REVERSE_OFFSET;
}

/** Strip the reverse bit to the forward number. */
export function forwardNumber(n: number): number {
  return isReversed(n) ? n - REVERSE_OFFSET : n;
}

/** The reversed number of a forward pattern (reference §9.4: same wipe, +128). */
export function reverseNumber(forward: number): number {
  return forward + REVERSE_OFFSET;
}

/** Invert a number to its family/variant/reverse (used for the plain-wipe oracle). */
export function numberToPattern(n: number): { family: WipeFamily; variant: number; reverse: boolean } {
  const forward = forwardNumber(n);
  const zero = forward - 1;
  const family = WIPE_FAMILIES[Math.floor(zero / VARIANT_COUNT)];
  if (!family) throw new Error(`Number ${n} is outside the forward pattern space`);
  return { family, variant: zero % VARIANT_COUNT, reverse: isReversed(n) };
}

/** RS-422 reaches 001–255 (reference §9.7). */
export function rs422Addressable(n: number): boolean {
  return n >= 1 && n <= RS422_MAX;
}

/** 256–287 exist on the panel but cannot be called externally (reference §9.7). */
export function isExternallyAddressable(n: number): boolean {
  return n <= RS422_MAX;
}

export type AgA800Call = { kind: 'pattern'; number: number } | { kind: 'current' } | { kind: 'invalid' };

/** The AG-A800 edit controller calls 01–99; 99 = "whatever is currently set up" (reference §9.7). */
export function agA800Call(n: number): AgA800Call {
  if (n === 99) return { kind: 'current' };
  if (n >= 1 && n <= 98) return { kind: 'pattern', number: n };
  return { kind: 'invalid' };
}

// --- modifier legality (reference §9.4) ------------------------------------

/** Blinds is legal only with Straight, Corner, Diagonal, Triangle, and Split (reference §9.4). */
export function blindsLegal(family: WipeFamily): boolean {
  return family === 'straight' || family === 'corner' || family === 'diagonal' || family === 'triangle' || family === 'split';
}

// --- Border complementary colour (reference §9.4, ADR-0006) ----------------

// Complement pairs by palette index: White↔Black, Yellow↔Blue, Cyan↔Red, Green↔Magenta.
// Colour Bar (index 0) has no chromatic complement and maps to itself.
const COMPLEMENT_INDEX = [0, 8, 7, 6, 5, 4, 3, 2, 1] as const;

export function complementaryMatteIndex(index: number): number {
  return COMPLEMENT_INDEX[((index % 9) + 9) % 9]!;
}

export function complementaryMatteName(name: string): string {
  return matteColorName(complementaryMatteIndex(matteIndexByName(name)));
}

// --- edge treatment (reference §9.4) ---------------------------------------

export function hasBorder(edge: WipeEdge): boolean {
  return edge === 'border-narrow' || edge === 'border-wide';
}

export function hasSoft(edge: WipeEdge): boolean {
  return edge === 'soft-narrow' || edge === 'soft-wide';
}

export function isWideEdge(edge: WipeEdge): boolean {
  return edge === 'border-wide' || edge === 'soft-wide';
}

/** Next edge state when BORDER is pressed (narrow → wide → off; replaces Soft). */
export function pressBorder(edge: WipeEdge): WipeEdge {
  if (edge === 'border-narrow') return 'border-wide';
  if (edge === 'border-wide') return 'hard';
  return 'border-narrow';
}

/** Next edge state when SOFT is pressed (narrow ↔ wide; replaces Border). */
export function pressSoft(edge: WipeEdge): WipeEdge {
  if (edge === 'soft-narrow') return 'soft-wide';
  if (edge === 'soft-wide') return 'soft-narrow';
  return 'soft-narrow';
}

// --- direction (reference §9.4) --------------------------------------------

/**
 * The visual travel direction of a wipe for a lever swing (+1 or -1). By default the wipe
 * alternates with the swing direction; ONE-WAY forces the same direction every swing;
 * REVERSE mirrors it. `swingDir` is +1 for an A→B swing, -1 for B→A.
 */
export function visualTravel(oneWay: boolean, reverse: boolean, swingDir: number): number {
  const travel = oneWay ? 1 : swingDir;
  return reverse ? -travel : travel;
}

/** ONE-WAY together with REVERSE produces symmetrical wiping (reference §9.4). */
export function isSymmetricalWiping(oneWay: boolean, reverse: boolean): boolean {
  return oneWay && reverse;
}

// --- aspect (reference §9.4) -----------------------------------------------

/** ASPECT stretches only the Square family; other families ignore it (reference §9.4). */
export function aspectAffects(family: WipeFamily): boolean {
  return family === 'square';
}
