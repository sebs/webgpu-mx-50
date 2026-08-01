// A/V Synchro domain math (reference §8.9; ADR-0004, ADR-0010). A/V Synchro adds no new
// effect — it gates existing Digital Effects (Nega/Mosaic/Mono/Paint/Still/Strobe) on and
// off in step with the programme audio. Pure and audio-context-free: the browser tap
// (src/audio/) measures the envelope each frame and calls avSynchroTriggered; the specs
// assert the whole truth table headlessly. The audio envelope is always a runtime argument,
// never stored in PanelState.

import { effectActiveOn, freezeActiveOn, strobeInterval } from './digital-effect.js';
import type { AvSynchroEffect, DigitalEffectState, FilterEffect } from '../state/state.js';
import type { BusId } from './types.js';

/** The effects A/V Synchro may pulse (reference §8.9): the four filters plus Still and Strobe. */
export const AV_SYNCHRO_EFFECTS: readonly AvSynchroEffect[] = [
  'nega',
  'mosaic',
  'mono',
  'paint',
  'still',
  'strobe',
];

// Representative audio-envelope magnitudes (0..1) and LEVEL settings the specs exercise.
export const ENVELOPE_SILENT = 0;
export const ENVELOPE_QUIET = 0.2;
export const ENVELOPE_MODERATE = 0.5;
export const ENVELOPE_LOUD = 0.95;
export const LEVEL_TOWARD_MAX = 0.9;
export const LEVEL_TOWARD_MIN = 0.1;

/** Whether a name is an effect A/V Synchro can drive. */
export function avSynchroEligible(effect: string): effect is AvSynchroEffect {
  return (AV_SYNCHRO_EFFECTS as readonly string[]).indexOf(effect) !== -1;
}

/**
 * The trigger threshold the LEVEL control sets (reference §8.9). Toward MAX (→1) only the
 * loudest envelopes clear it; toward MIN (→0) even quiet sound does. It is simply the
 * clamped LEVEL position on the same 0..1 scale as the measured envelope.
 */
export function avSynchroThreshold(level: number): number {
  return level < 0 ? 0 : level > 1 ? 1 : level;
}

/** Whether the current audio envelope clears the LEVEL threshold. */
export function avSynchroTriggered(level: number, envelope: number): boolean {
  return envelope > avSynchroThreshold(level);
}

/** Whether A/V Synchro is set to drive a given effect (independent of the audio). */
export function avSynchroSelected(de: DigitalEffectState, effect: AvSynchroEffect): boolean {
  return de.avSynchroEffects[effect];
}

/**
 * Whether an effect is applied right now: A/V Synchro must be armed, the effect selected,
 * and the audio envelope above the LEVEL threshold. Below threshold (or silent) every armed
 * effect is held off, leaving the untreated picture (reference §8.9).
 */
export function avSynchroEffectApplied(
  de: DigitalEffectState,
  effect: AvSynchroEffect,
  envelope: number,
): boolean {
  return de.avSynchro && de.avSynchroEffects[effect] && avSynchroTriggered(de.avSynchroLevel, envelope);
}

/** How an A/V-Synchro effect's hold time is determined (reference §8.9). */
export type AvSynchroHold = 'audio-duration' | 'effect-interval-timer';

/**
 * The hold rule for an effect: Nega/Mosaic/Mono/Paint/Still hold for as long as the audio
 * stays above threshold; Strobe's hold comes from the Effect Interval Timer instead and is
 * not extended by how long the audio stays up (reference §8.9).
 */
export function avSynchroHold(effect: AvSynchroEffect): AvSynchroHold {
  return effect === 'strobe' ? 'effect-interval-timer' : 'audio-duration';
}

/** Strobe's A/V-Synchro hold interval in seconds, from the Effect Interval Timer (reference §8.6/§8.9). */
export function avSynchroIntervalSeconds(de: DigitalEffectState): number {
  return strobeInterval(de.strobeTime);
}

/**
 * The on/off pulse train an effect would show over a sequence of measured envelopes at a
 * given LEVEL — each sample is on iff it clears the threshold. Models a rhythmic track
 * pulsing the effect in step with the beats (reference §8.9).
 */
export function avSynchroPulseTrain(level: number, envelopes: readonly number[]): boolean[] {
  return envelopes.map((e) => avSynchroTriggered(level, e));
}

// --- per-frame picture gating (reference §8.9, ADR-0010) --------------------
// The transient signal the render loop threads into the bus processors: which
// effects the audio is pulsing on THIS frame, and how they merge with the
// latched ON flags. Pulses force effects on; they never suppress a latched one.

/** Every effect A/V Synchro is pulsing on for a measured envelope (the tap delegates here). */
export function avSynchroActiveEffects(de: DigitalEffectState, envelope: number): AvSynchroEffect[] {
  return AV_SYNCHRO_EFFECTS.filter((e) => avSynchroEffectApplied(de, e, envelope));
}

/** Whether a pulsed effect lands on a bus: pulses target the block's single bus only. */
export function avSynchroPulsedOn(
  de: DigitalEffectState,
  bus: BusId,
  effect: AvSynchroEffect,
  pulsed: readonly AvSynchroEffect[],
): boolean {
  return de.bus === bus && pulsed.indexOf(effect) !== -1;
}

/** The EFFECTIVE filter flag the bus shader renders: latched ON, or pulsed this frame. */
export function effectiveFilterOn(
  de: DigitalEffectState,
  bus: BusId,
  effect: FilterEffect,
  pulsed: readonly AvSynchroEffect[],
): boolean {
  return effectActiveOn(de, bus, effect) || avSynchroPulsedOn(de, bus, effect, pulsed);
}

/** Effective Still: latched, or pulsed (audio-duration hold — releases with the envelope). */
export function effectiveStillOn(de: DigitalEffectState, bus: BusId, pulsed: readonly AvSynchroEffect[]): boolean {
  return freezeActiveOn(de, bus, 'still') || avSynchroPulsedOn(de, bus, 'still', pulsed);
}

/**
 * Pulsed-Strobe hold bookkeeping (plain JSON, tick-driven per ADR-0012). Strobe's hold is
 * governed by the Effect Interval Timer, not the audio duration: a rising pulse captures a
 * frame and opens a window of `periodTicks`; a sustained pulse neither re-captures nor
 * extends it; a release-and-re-cross opens a fresh window (one freeze per beat).
 */
export interface AvSynchroStrobeHold {
  holdUntilTick: number;
  prevPulsed: boolean;
}

export const IDLE_AV_STROBE_HOLD: AvSynchroStrobeHold = {
  holdUntilTick: Number.NEGATIVE_INFINITY,
  prevPulsed: false,
};

export interface AvSynchroStrobeStep {
  hold: AvSynchroStrobeHold;
  capture: boolean;
  holding: boolean;
}

export function stepAvSynchroStrobe(
  prev: AvSynchroStrobeHold,
  pulsed: boolean,
  tick: number,
  periodTicks: number,
): AvSynchroStrobeStep {
  const rising = pulsed && !prev.prevPulsed;
  const holdUntilTick = rising ? tick + Math.max(1, periodTicks) : prev.holdUntilTick;
  return { hold: { holdUntilTick, prevPulsed: pulsed }, capture: rising, holding: tick < holdUntilTick };
}
