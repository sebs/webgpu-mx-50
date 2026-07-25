// The internal 9-colour Matte generator's palette and control semantics (reference §4).
// The colour ring, and how LEVEL / GRADATION affect each colour, live here as pure
// functions shared by the domain specs and the matte shader (gpu/shaders/matte.wgsl).

import type { MatteState } from '../state/state.js';

export type MatteColorKind = 'bars' | 'white' | 'chromatic' | 'black';

export interface MatteColor {
  name: string;
  kind: MatteColorKind;
  /** Base linear-RGB at full level; `bars` is a special test pattern, not a flat colour. */
  rgb: [number, number, number];
}

/** The 9 colours in cycle order (reference §4): index 0 = Colour Bar … 8 = Black. */
export const MATTE_PALETTE: readonly MatteColor[] = [
  { name: 'Colour Bar', kind: 'bars', rgb: [0, 0, 0] },
  { name: 'White', kind: 'white', rgb: [1, 1, 1] },
  { name: 'Yellow', kind: 'chromatic', rgb: [1, 1, 0] },
  { name: 'Cyan', kind: 'chromatic', rgb: [0, 1, 1] },
  { name: 'Green', kind: 'chromatic', rgb: [0, 1, 0] },
  { name: 'Magenta', kind: 'chromatic', rgb: [1, 0, 1] },
  { name: 'Red', kind: 'chromatic', rgb: [1, 0, 0] },
  { name: 'Blue', kind: 'chromatic', rgb: [0, 0, 1] },
  { name: 'Black', kind: 'black', rgb: [0, 0, 0] },
];

export function matteColorAt(index: number): MatteColor {
  const wrapped = ((index % MATTE_PALETTE.length) + MATTE_PALETTE.length) % MATTE_PALETTE.length;
  return MATTE_PALETTE[wrapped]!;
}

export function matteColorName(index: number): string {
  return matteColorAt(index).name;
}

export function matteIndexByName(name: string): number {
  const index = MATTE_PALETTE.findIndex((c) => c.name === name);
  if (index < 0) throw new Error(`Unknown Matte colour: ${name}`);
  return index;
}

/** Whether the LEVEL control changes this colour's output at all (reference §4). */
export function levelAffectsOutput(index: number): boolean {
  const kind = matteColorAt(index).kind;
  return kind === 'chromatic' || kind === 'white';
}

/** For a chromatic colour LEVEL sets chroma (saturation); otherwise chroma is not adjusted. */
export function matteChroma(state: MatteState): number {
  return matteColorAt(state.colorIndex).kind === 'chromatic' ? state.level : 0;
}

/** For White LEVEL sets brightness (black→white); otherwise brightness is unchanged (full). */
export function matteBrightness(state: MatteState): number {
  return matteColorAt(state.colorIndex).kind === 'white' ? state.level : 1;
}

/**
 * A level-independent-where-appropriate signature of the rendered flat matte. Colour Bar
 * and Black ignore LEVEL entirely (reference §4), so their signature never changes with
 * level; White and chromatic colours do.
 */
export function matteRenderSignature(state: MatteState): string {
  const color = matteColorAt(state.colorIndex);
  switch (color.kind) {
    case 'bars':
      return 'bars';
    case 'black':
      return 'rgb(0,0,0)';
    case 'white': {
      const v = state.level;
      return `rgb(${v},${v},${v})`;
    }
    case 'chromatic': {
      // Chroma scales saturation toward mid-grey as LEVEL falls (0 = grey, 1 = full colour).
      const [r, g, b] = color.rgb;
      const toward = (x: number) => 0.5 + (x - 0.5) * state.level;
      return `rgb(${toward(r)},${toward(g)},${toward(b)})`;
    }
  }
}

/**
 * Intensity of the matte at vertical position y (0 = top, 1 = bottom). A flat matte is
 * uniform at the set level; GRADATION ramps from least-intense at the top to the set
 * level at the bottom (reference §4).
 */
export function matteIntensityAtY(state: MatteState, y: number): number {
  return state.gradation ? state.level * y : state.level;
}

/** True when the selected colour is the Colour Bar test pattern (rendered specially). */
export function isColourBar(index: number): boolean {
  return matteColorAt(index).kind === 'bars';
}

/**
 * The flat linear-RGB the Matte renders (before any GRADATION ramp), with LEVEL applied:
 * White scales brightness, chromatic colours desaturate toward mid-grey as LEVEL falls,
 * Black is always black. Colour Bar is a pattern, not a flat colour, and returns black
 * here (callers check `isColourBar`).
 */
export function matteFlatColor(state: MatteState): [number, number, number] {
  const color = matteColorAt(state.colorIndex);
  const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
  switch (color.kind) {
    case 'white':
      return [state.level, state.level, state.level];
    case 'black':
    case 'bars':
      return [0, 0, 0];
    case 'chromatic': {
      const [r, g, b] = color.rgb;
      const toward = (x: number) => clamp01(0.5 + (x - 0.5) * state.level);
      return [toward(r), toward(g), toward(b)];
    }
  }
}
