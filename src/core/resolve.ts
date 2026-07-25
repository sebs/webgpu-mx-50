// The single authoritative Matte-substitution resolver (ADR-0006). Keys, DSK, fade,
// and direct program-out all consume this — none re-derive the rule — so they cannot
// disagree about what a bus resolves to. Pure and GPU-free (ADR-0016).

import type { BusState } from '../state/state.js';
import type { BusSource, SourceSlot } from './types.js';

/** Where a bus's video is consumed. Matte is legal only for `mixWipe` (reference §3/§4). */
export type ResolveContext = 'mixWipe' | 'key' | 'dsk' | 'fade' | 'directOut';

/**
 * The effective video source a bus provides for a given consumer (ADR-0006). Matte is
 * returned as-is for the Mix/Wipe stage; everywhere else Matte is illegal and the
 * blinking substitute source stands in — the unit never keys/fades/direct-outs the Matte.
 */
export function resolveBusSource(bus: BusState, context: ResolveContext): BusSource {
  if (bus.source !== 'matte') return bus.source;
  return context === 'mixWipe' ? 'matte' : bus.substituteSource;
}

/** True when this bus contributes the Matte colour to the given consumer (no substitution). */
export function usesMatte(bus: BusState, context: ResolveContext): boolean {
  return resolveBusSource(bus, context) === 'matte';
}

/**
 * The audio source a bus contributes (ADR-0006, "audio follows video"). Selecting Matte
 * yields no bus audio (null); the bus fader still governs the — silent — bus audio path.
 */
export function busAudioSource(bus: BusState): SourceSlot | null {
  return bus.source === 'matte' ? null : bus.source;
}
