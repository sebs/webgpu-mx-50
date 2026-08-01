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

// --- compression / slide / blinds geometry (reference §9.4) ----------------
// The uv-remap math the wipe shader consumes as plain affines: the affected side of the
// boundary samples a compressed (whole, scaled-down) or sliding copy of its FULL frame
// instead of a crop. Computed on the CPU so the WGSL never duplicates per-family geometry.

/** Axis-aligned envelope of the incoming ({f > 0}) region, in UV. */
export interface RevealRect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Which frame edge the incoming region grows from, per axis. */
export type AxisAnchor = 'low' | 'high' | 'center' | 'full';
export interface RevealAnchors {
  x: AxisAnchor;
  y: AxisAnchor;
}

/** Per-axis affine sample remap: sample = uv * scale + offset. */
export interface SampleAffine {
  sx: number;
  sy: number;
  ox: number;
  oy: number;
}

/** Venetian-blind strip count (reference §9.4). Host and shader must agree. */
export const BLINDS_STRIPS = 12;

const EPS = 1e-4;

const clampP = (p: number): number => (p < 0 ? 0 : p > 1 ? 1 : p);

/** Which frame edge the incoming scene grows from, per family/variant (matches the WGSL fields). */
export function revealAnchors(family: WipeFamily, variant: number): RevealAnchors {
  const v = ((variant % VARIANT_COUNT) + VARIANT_COUNT) % VARIANT_COUNT;
  switch (family) {
    case 'straight':
    case 'mosaic':
      if (v === 0) return { x: 'low', y: 'full' };
      if (v === 1) return { x: 'high', y: 'full' };
      if (v === 2) return { x: 'full', y: 'low' };
      return { x: 'full', y: 'high' };
    case 'corner':
    case 'diagonal':
      if (v === 0) return { x: 'low', y: 'low' };
      if (v === 1) return { x: 'high', y: 'low' };
      if (v === 2) return { x: 'low', y: 'high' };
      return { x: 'high', y: 'high' };
    case 'triangle':
      if (v === 0) return { x: 'center', y: 'high' };
      if (v === 1) return { x: 'center', y: 'low' };
      if (v === 2) return { x: 'low', y: 'center' };
      return { x: 'high', y: 'center' };
    case 'split':
      if (v === 0) return { x: 'center', y: 'full' };
      if (v === 1) return { x: 'full', y: 'center' };
      return { x: 'center', y: 'center' };
    case 'square':
      return { x: 'center', y: 'center' };
  }
}

/** The envelope of the revealed region at `progress`, derived from the exact shader fields. */
export function revealRect(family: WipeFamily, variant: number, progress: number, aspect: number): RevealRect {
  const p = clampP(progress);
  const v = ((variant % VARIANT_COUNT) + VARIANT_COUNT) % VARIANT_COUNT;
  switch (family) {
    case 'straight':
    case 'mosaic': {
      if (v === 0) return { x0: 0, x1: p, y0: 0, y1: 1 };
      if (v === 1) return { x0: 1 - p, x1: 1, y0: 0, y1: 1 };
      if (v === 2) return { x0: 0, x1: 1, y0: 0, y1: p };
      return { x0: 0, x1: 1, y0: 1 - p, y1: 1 };
    }
    case 'corner': {
      const s = p;
      if (v === 0) return { x0: 0, x1: s, y0: 0, y1: s };
      if (v === 1) return { x0: 1 - s, x1: 1, y0: 0, y1: s };
      if (v === 2) return { x0: 0, x1: s, y0: 1 - s, y1: 1 };
      return { x0: 1 - s, x1: 1, y0: 1 - s, y1: 1 };
    }
    case 'diagonal': {
      const s = Math.min(2 * p, 1);
      if (v === 0) return { x0: 0, x1: s, y0: 0, y1: s };
      if (v === 1) return { x0: 1 - s, x1: 1, y0: 0, y1: s };
      if (v === 2) return { x0: 0, x1: s, y0: 1 - s, y1: 1 };
      return { x0: 1 - s, x1: 1, y0: 1 - s, y1: 1 };
    }
    case 'triangle': {
      const e = Math.min(1.5 * p, 1);
      const c = Math.min(1.5 * p, 0.5);
      if (v === 0) return { x0: 0.5 - c, x1: 0.5 + c, y0: 1 - e, y1: 1 };
      if (v === 1) return { x0: 0.5 - c, x1: 0.5 + c, y0: 0, y1: e };
      if (v === 2) return { x0: 0, x1: e, y0: 0.5 - c, y1: 0.5 + c };
      return { x0: 1 - e, x1: 1, y0: 0.5 - c, y1: 0.5 + c };
    }
    case 'split': {
      const h = p * 0.5;
      if (v === 0) return { x0: 0.5 - h, x1: 0.5 + h, y0: 0, y1: 1 };
      if (v === 1) return { x0: 0, x1: 1, y0: 0.5 - h, y1: 0.5 + h };
      return { x0: 0.5 - h, x1: 0.5 + h, y0: 0.5 - h, y1: 0.5 + h };
    }
    case 'square': {
      const hx = Math.min((0.75 * p) / Math.max(1 + aspect, 0.05), 0.5);
      let hy0 = (0.75 * p) / Math.max(1 - aspect, 0.05);
      if (v === 2) hy0 /= 1.4;
      const hy = Math.min(hy0, 0.5);
      return { x0: 0.5 - hx, x1: 0.5 + hx, y0: 0.5 - hy, y1: 0.5 + hy };
    }
  }
}

/** Affine that maps the full frame into the reveal rect (a 'full' axis is identity). */
export function compressionAffine(rect: RevealRect): SampleAffine {
  const w = Math.max(rect.x1 - rect.x0, EPS);
  const h = Math.max(rect.y1 - rect.y0, EPS);
  return { sx: 1 / w, sy: 1 / h, ox: -rect.x0 / w, oy: -rect.y0 / h };
}

/** Affine that translates the incoming frame so its trailing edge rides the boundary. */
export function slideAffine(anchors: RevealAnchors, rect: RevealRect): SampleAffine {
  const w = rect.x1 - rect.x0;
  const h = rect.y1 - rect.y0;
  const ox = anchors.x === 'low' ? 1 - w : anchors.x === 'high' ? w - 1 : 0;
  const oy = anchors.y === 'low' ? 1 - h : anchors.y === 'high' ? h - 1 : 0;
  return { sx: 1, sy: 1, ox, oy };
}

/**
 * The "both compressed" complement for the outgoing (A) scene. Non-null only when exactly
 * one axis anchors low/high and the other is 'full' (straight/mosaic — the only families
 * whose A-region is a rect); everywhere else A stays full-frame (documented degradation:
 * the Pattern Table marks most ×2 cells invalid).
 */
export function outgoingCompressionAffine(anchors: RevealAnchors, rect: RevealRect): SampleAffine | null {
  const xEdge = anchors.x === 'low' || anchors.x === 'high';
  const yEdge = anchors.y === 'low' || anchors.y === 'high';
  if (xEdge && anchors.y === 'full') {
    const s = rect.x1 - rect.x0;
    const rest = Math.max(1 - s, EPS);
    if (anchors.x === 'low') return { sx: 1 / rest, sy: 1, ox: -s / rest, oy: 0 };
    return { sx: 1 / rest, sy: 1, ox: 0, oy: 0 };
  }
  if (yEdge && anchors.x === 'full') {
    const s = rect.y1 - rect.y0;
    const rest = Math.max(1 - s, EPS);
    if (anchors.y === 'low') return { sx: 1, sy: 1 / rest, ox: 0, oy: -s / rest };
    return { sx: 1, sy: 1 / rest, ox: 0, oy: 0 };
  }
  return null;
}

/** Outgoing slide: A is pushed out by the boundary displacement (identity for centre/full). */
export function outgoingSlideAffine(anchors: RevealAnchors, rect: RevealRect): SampleAffine {
  const w = rect.x1 - rect.x0;
  const h = rect.y1 - rect.y0;
  const ox = anchors.x === 'low' ? -w : anchors.x === 'high' ? w : 0;
  const oy = anchors.y === 'low' ? -h : anchors.y === 'high' ? h : 0;
  return { sx: 1, sy: 1, ox, oy };
}

/** The incoming (B) remap for the composed modifiers; Compression takes precedence over Slide. */
export function incomingRemap(wipe: WipeState, progress: number, aspect: number): SampleAffine | null {
  const m = wipe.modifiers;
  if (m.compression >= 1) return compressionAffine(revealRect(wipe.family, wipe.variant, progress, aspect));
  if (m.slide >= 1) {
    return slideAffine(revealAnchors(wipe.family, wipe.variant), revealRect(wipe.family, wipe.variant, progress, aspect));
  }
  return null;
}

/** The outgoing (A) remap: only when the modifier is pressed twice ("both scenes"). */
export function outgoingRemap(wipe: WipeState, progress: number, aspect: number): SampleAffine | null {
  const m = wipe.modifiers;
  const anchors = revealAnchors(wipe.family, wipe.variant);
  const rect = revealRect(wipe.family, wipe.variant, progress, aspect);
  if (m.compression === 2) return outgoingCompressionAffine(anchors, rect);
  if (m.slide === 2) return outgoingSlideAffine(anchors, rect);
  return null;
}

/** Which axes get strip-tiled under Blinds (strips run along the travel axis). */
export function blindsAxes(family: WipeFamily, variant: number): { x: boolean; y: boolean } {
  const v = ((variant % VARIANT_COUNT) + VARIANT_COUNT) % VARIANT_COUNT;
  switch (family) {
    case 'straight':
      return v < 2 ? { x: true, y: false } : { x: false, y: true };
    case 'corner':
    case 'diagonal':
      return { x: true, y: true };
    case 'triangle':
      return v < 2 ? { x: false, y: true } : { x: true, y: false };
    case 'split':
      if (v === 0) return { x: true, y: false };
      if (v === 1) return { x: false, y: true };
      return { x: true, y: true };
    default:
      return { x: false, y: false }; // mosaic/square: illegal, reducer-enforced; defensive
  }
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
