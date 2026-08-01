// After-Image recipe domain (reference §16, Recipe 3): same source on both buses, Strobe
// on one, MIX at a partial lever — the program is a double exposure of the live picture
// and a periodically re-sampled frozen frame, so motion leaves ghost after-images. Pure
// read-time selectors: nothing here is stored, and the recipe composes entirely over
// tested invariants (one-bus Digital Effect, the strobe freeze, MIX weights).

import { freezeActiveOn, strobeInterval, STROBE_MIN, STROBE_MAX } from './digital-effect.js';
import type { PanelState } from '../state/state.js';

/** Whether the panel is set up as the After-Image recipe. */
export function afterImageRecipe(state: PanelState): boolean {
  const de = state.digitalEffect;
  const strobed = freezeActiveOn(de, 'A', 'strobe') || freezeActiveOn(de, 'B', 'strobe');
  const lever = state.transition.lever;
  return (
    state.busA.source === state.busB.source &&
    state.transition.type === 'mix' &&
    strobed &&
    lever > 0 &&
    lever < 1
  );
}

/** The double-exposure balance and ghost spacing of an active After Image. */
export interface AfterImageLook {
  /** Mix weight of the strobed (ghost) bus. */
  ghostAlpha: number;
  /** Mix weight of the live bus. */
  liveAlpha: number;
  /** Seconds between ghost re-samples (the Strobe TIME interval). */
  spacingSeconds: number;
}

export function afterImageLook(state: PanelState): AfterImageLook | null {
  const de = state.digitalEffect;
  if (state.transition.type !== 'mix') return null;
  const strobeOnA = freezeActiveOn(de, 'A', 'strobe');
  const strobeOnB = freezeActiveOn(de, 'B', 'strobe');
  if (!strobeOnA && !strobeOnB) return null;
  const lever = state.transition.lever;
  const ghostAlpha = strobeOnA ? 1 - lever : lever;
  return { ghostAlpha, liveAlpha: 1 - ghostAlpha, spacingSeconds: strobeInterval(de.strobeTime) };
}

/** The S9 outline's strength classes (features/combination-recipes.feature). */
export type AfterImageStrength = 'many-faint-close' | 'few-wide' | 'subtle-lopsided';

/**
 * A lopsided mix collapses the double-exposure contrast → subtle ghosting over a mostly
 * one-sided picture; near-centre mixes read as dense (short TIME) or sparse (long TIME).
 */
export function afterImageStrength(look: AfterImageLook): AfterImageStrength {
  if (look.ghostAlpha < 0.35 || look.ghostAlpha > 0.65) return 'subtle-lopsided';
  return look.spacingSeconds < (STROBE_MIN + STROBE_MAX) / 2 ? 'many-faint-close' : 'few-wide';
}
