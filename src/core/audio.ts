// Audio mixer + Audio Follow domain math (reference §5, §12; ADR-0010). Pure and
// AudioContext-free — the browser Web Audio engine (src/audio/) reads these to set node
// gains, and the specs assert them headlessly. Program-Out *routing* lives in program.ts
// (programAudio); this layer turns that routing plus the fader positions into concrete
// linear gains.

import { programAudio } from './program.js';
import { busAudioSource } from './resolve.js';
import type { AudioContributor } from './program.js';
import type { MicAux2Input, PanelState } from '../state/state.js';

/** Fader travel that yields unity (0 dB): the centre detent (reference §5). */
export const FADER_UNITY = 0.5;
/** Linear gain at full fader travel — unity is 0 dB, the top is +12 dB. */
export const FADER_GMAX = 4;

/** Clamp to [0, 1]. */
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Linear gain for a fader at `position` travel (0..1). The bottom of travel is silence
 * (−∞ dB); unity (0.5) is 0 dB; the top is +12 dB. Between, the response is exponential in
 * travel, so equal travel means equal dB — a real fader law rather than a raw multiply.
 */
export function faderGain(position: number): number {
  if (position <= 0) return 0;
  const p = clamp01(position);
  return FADER_GMAX ** ((p - FADER_UNITY) / FADER_UNITY);
}

/** The fader position expressed in dB (−∞ at the bottom, 0 at unity, +12 at the top). */
export function faderDb(position: number): number {
  return linearToDb(faderGain(position));
}

export interface BusGains {
  a: number;
  b: number;
}

/**
 * The A/B bus gains under Audio Follow (reference §12): an equal-power crossfade tied to
 * the Mix/Wipe lever. Lever at A (0) → full A, silent B; at B (1) → silent A, full B;
 * centre → both at ~0.707. Equal power (a²+b²=1) keeps the summed loudness constant across
 * the sweep, so the mix never dips or bumps through the middle.
 */
export function audioFollowGains(lever: number): BusGains {
  const t = clamp01(lever) * (Math.PI / 2);
  return { a: Math.cos(t), b: Math.sin(t) };
}

/**
 * The gain each bus's audio path carries right now: the Audio-Follow crossfade when
 * engaged, otherwise each bus's own standing fader. The stored faders are never mutated by
 * the follow toggle, so disengaging restores them exactly (reference §12).
 */
export function effectiveBusGains(state: PanelState): BusGains {
  if (state.audio.audioFollow) return audioFollowGains(state.transition.lever);
  return { a: faderGain(state.audio.faders.a), b: faderGain(state.audio.faders.b) };
}

/** Aux 1 and Mic/Aux 2 are deliberately excluded from Audio Follow (reference §12). */
export const AUDIO_FOLLOW_EXCLUDED: readonly AudioContributor[] = ['aux1', 'aux2mic'];

/** Which input the shared MIC/AUX2 fader currently feeds (reference §2, §5). */
export function micAux2Active(state: PanelState): MicAux2Input {
  return state.audio.micAux2;
}

/** The MIC/AUX2 input that is muted (not selected by the switch). */
export function micAux2Muted(state: PanelState): MicAux2Input {
  return state.audio.micAux2 === 'mic' ? 'aux2' : 'mic';
}

/**
 * Whether the desk currently demands live mic capture (drives lazy getUserMedia): the
 * MIC/AUX2 switch on Mic AND that fader path routed and open. Deliberately pre-Fade and
 * pre-Master — a running fade or a closed Master must not flap device acquisition.
 */
export function micCaptureWanted(state: PanelState): boolean {
  return micAux2Active(state) === 'mic' && programAudioMix(state).gains.aux2mic > 0;
}

export interface ProgramAudioMix {
  gains: { busA: number; busB: number; aux1: number; aux2mic: number };
  /** Master gain applied to the whole mix — governs only in EFFECT (reference §2, §5). */
  master: number;
}

/**
 * The concrete linear gains reaching Program Out: the fader/follow gain for every input
 * the current Program Out routes (programAudio), zeroed for inputs it excludes and for a
 * bus resolving to the Matte (no audio follows the Matte, ADR-0006). Master is the
 * Master-fader gain in EFFECT and 1 (bypassed) in the A/B direct-outs.
 */
export function programAudioMix(state: PanelState): ProgramAudioMix {
  const { contributors, masterGoverns } = programAudio(state);
  const routed = (c: AudioContributor): boolean => contributors.indexOf(c) !== -1;
  const bus = effectiveBusGains(state);
  const gains = {
    busA: routed('busA') && busAudioSource(state.busA) !== null ? bus.a : 0,
    busB: routed('busB') && busAudioSource(state.busB) !== null ? bus.b : 0,
    aux1: routed('aux1') ? faderGain(state.audio.faders.aux1) : 0,
    aux2mic: routed('aux2mic') ? faderGain(state.audio.faders.micAux2) : 0,
  };
  const master = masterGoverns ? faderGain(state.audio.faders.master) : 1;
  return { gains, master };
}

/** Whether any audio reaches Program Out (Master open and at least one input contributing). */
export function programAudible(state: PanelState): boolean {
  const mix = programAudioMix(state);
  if (mix.master <= 0) return false;
  return mix.gains.busA > 0 || mix.gains.busB > 0 || mix.gains.aux1 > 0 || mix.gains.aux2mic > 0;
}

// --- Audio Level Indicator (reference §5). Live metering is the browser's job; these are
//     the pure dB/LED mapping and clip test that the meter and the specs share. ---

/** The LED that marks unity / reference level. */
export const ZERO_DB_LED = 0;
/** Peaks at or above this many dB are flagged as clipping. */
export const CLIP_CEILING_DB = 6;
/** The balanced programme peak that maps to the 0 dB LED. */
export const NOMINAL_PROGRAM_PEAK = 1;

/** Linear amplitude → dB (−∞ at silence). */
export function linearToDb(linear: number): number {
  return linear <= 0 ? -Infinity : 20 * Math.log10(linear);
}

/** dB above/below the 0 dB LED (positive = louder than reference). */
export function dbToLed(db: number): number {
  return db - ZERO_DB_LED;
}

/** Whether a programme level sits close enough to 0 dB to read as "around the 0 dB LED". */
export function nearZeroDb(db: number, tolerance = 1.5): boolean {
  return Math.abs(db - ZERO_DB_LED) <= tolerance;
}

/** Whether a peak counts as clipping — brief peaks below the ceiling do not (reference §5). */
export function isClipped(peakDb: number): boolean {
  return peakDb >= CLIP_CEILING_DB;
}
