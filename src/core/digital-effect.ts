// The Digital Effect block domain (reference §8, this slice covers the four filters).
// The block targets one bus at a time; these helpers answer "is effect X live on bus Y?"
// and encode the Mono-overrides-colour-correction rule (reference §6/§8.3). GPU-free.

import type { BusId } from './types.js';
import type { DigitalEffectState, FilterEffect, PanelState } from '../state/state.js';

/** Whether a filter is active on a given bus (the block targets a single bus). */
export function effectActiveOn(de: DigitalEffectState, bus: BusId, effect: FilterEffect): boolean {
  return de.bus === bus && de.active[effect];
}

/** Whether any filter is active on a given bus. */
export function anyEffectOn(de: DigitalEffectState, bus: BusId): boolean {
  return de.bus === bus && (de.active.nega || de.active.mosaic || de.active.mono || de.active.paint);
}

/**
 * Colour correction applies to a bus unless the Mono digital effect is active on that bus,
 * which overrides it (reference §6, §8.3).
 */
export function colourCorrectApplies(state: PanelState, bus: BusId): boolean {
  const cc = bus === 'A' ? state.busA.colourCorrect : state.busB.colourCorrect;
  return cc.mode !== 'off' && !effectActiveOn(state.digitalEffect, bus, 'mono');
}

/** Paint coarseness from its LEVEL: MIN = finest, mid = moderate, MAX = coarsest (reference §8.4). */
export function paintCoarseness(level: number): 'finest' | 'moderate' | 'coarsest' {
  if (level < 1 / 3) return 'finest';
  if (level < 2 / 3) return 'moderate';
  return 'coarsest';
}
