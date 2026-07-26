// The Mix/Wipe stage's centre-lever composites (reference §9.1–§9.3). The domain here
// is the compositing *parameters* — weights and rule — read by both the domain specs
// and the combine shader (gpu/shaders/combine.wgsl). Pixels live in the shader; the
// rule and weights live here.

import type { TransitionType } from '../state/state.js';

export interface MixWeights {
  a: number;
  b: number;
}

/**
 * Cross-dissolve weights for the Mix transition (reference §9.2). Lever 0 = full A-bus,
 * lever 1 = full B-bus; the two weights always sum to one (full-opacity image).
 */
export function mixWeights(lever: number): MixWeights {
  const b = lever < 0 ? 0 : lever > 1 ? 1 : lever;
  return { a: 1 - b, b };
}

/** The compositing rule a transition applies at the Mix/Wipe stage. */
export type CompositeRule = 'cross-dissolve' | 'nam-brighter' | 'wipe' | 'lum-key' | 'chroma-key';

export function compositeRule(type: TransitionType): CompositeRule {
  switch (type) {
    case 'mix':
      return 'cross-dissolve';
    case 'nam':
      return 'nam-brighter';
    case 'wipe':
      return 'wipe';
    case 'lum-key':
      return 'lum-key';
    case 'chroma-key':
      return 'chroma-key';
  }
}

/**
 * For NAM (reference §9.3), which bus an off-centre lever biases to dominate. At centre
 * neither dominates: the per-pixel brighter value simply wins.
 */
export function namDominant(lever: number): 'A' | 'B' | 'balanced' {
  if (lever < 0.5) return 'A';
  if (lever > 0.5) return 'B';
  return 'balanced';
}

/** The combine shader's numeric mode for a composite rule (host and shader must agree). */
export function combineMode(rule: CompositeRule): number {
  switch (rule) {
    case 'cross-dissolve':
      return 0;
    case 'nam-brighter':
      return 1;
    case 'lum-key':
      return 2;
    case 'chroma-key':
      return 3;
    case 'wipe':
      return 0; // Wipe uses its own pass, not the combine mode.
  }
}
