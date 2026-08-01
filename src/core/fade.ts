// The Fade stage (reference §11) — the LAST signal-graph stage (ADR-0004). Pure and
// tick-free: the fade lever lives in state.fade.lever (written by the Auto Fade runner in the
// reducer, never derived here), so every function reads the panel state directly. Video-fade
// helpers answer "what does the picture fade to, and how far"; the audio helpers wrap
// programAudioMix so the fade retargets/silences the programme audio after the mixer.

import { programAudioMix } from './audio.js';
import { matteFlatColor } from './matte.js';
import { busAudioSource, resolveBusSource } from './resolve.js';
import type { ProgramAudioMix } from './audio.js';
import type { BusId, BusSource, SourceSlot } from './types.js';
import type { FadeElement, FadeState, FadeTarget, PanelState } from '../state/state.js';

/** How much a given element is faded: 0 when its enable is unlit, else the shared fade lever. */
export function elementFadeAmount(fade: FadeState, element: FadeElement): number {
  return fade[element] ? fade.lever : 0;
}

/** Whether anything is fading at all: at least one enable lit AND the lever off IN. */
export function isFading(fade: FadeState): boolean {
  return fade.lever > 0 && (fade.video || fade.dsk || fade.audio);
}

/** The composite→target mix amount for the video element (0 = composite, 1 = full target). */
export function videoFadeAmount(fade: FadeState): number {
  return elementFadeAmount(fade, 'video');
}

/**
 * The key-mask opacity the DSK keys the title with after the Fade stage's DSK element:
 * 1 − elementFadeAmount(fade, 'dsk') while the DSK is on; 0 when the DSK itself is off
 * (no title exists to fade). 1 = title fully on screen, 0 = title gone (reference §11
 * selective fading: VIDEO-only leaves the title; DSK-only removes only the title).
 */
export function dskTitleOpacity(state: PanelState): number {
  if (!state.dsk.on) return 0;
  return 1 - elementFadeAmount(state.fade, 'dsk');
}

/** What the video fades to. A/B are the UNEFFECTED bus (effects + Mix/Wipe bypassed, §11). */
export type FadeVideoResult =
  | { kind: 'colour'; rgb: [number, number, number] }
  | { kind: 'bus'; bus: BusId; source: BusSource; effected: false };

/**
 * The video RESULT at full OUT for the current target. A/B resolve through the `fade` context
 * (Matte → substitute; effects & Mix/Wipe bypassed — the clean source, realised on the GPU by
 * binding the raw bus texture). Matte returns its flat colour (Colour Bar flattens to black).
 */
export function fadeVideoTarget(state: PanelState): FadeVideoResult {
  switch (state.fade.target) {
    case 'white':
      return { kind: 'colour', rgb: [1, 1, 1] };
    case 'black':
      return { kind: 'colour', rgb: [0, 0, 0] };
    case 'matte':
      return { kind: 'colour', rgb: matteFlatColor(state.matte) };
    case 'A':
      return { kind: 'bus', bus: 'A', source: resolveBusSource(state.busA, 'fade'), effected: false };
    case 'B':
      return { kind: 'bus', bus: 'B', source: resolveBusSource(state.busB, 'fade'), effected: false };
  }
}

/** IN/OUT LED state (reference §11): solid at the extremes, blinking while a manual fade is incomplete. */
export type FadeLed = 'solid' | 'off' | 'blink';
export interface FadeLeverLeds {
  in: FadeLed;
  out: FadeLed;
}
export function fadeLeverLeds(lever: number): FadeLeverLeds {
  if (lever <= 0) return { in: 'solid', out: 'off' };
  if (lever >= 1) return { in: 'off', out: 'solid' };
  return { in: 'blink', out: 'blink' };
}

/** Whether the manual fade is partway (neither fully IN nor fully OUT). */
export function fadeIncomplete(lever: number): boolean {
  return lever > 0 && lever < 1;
}

/** An enable button's LED: off when unlit; blink while the Auto Fade runner is paused; else solid. */
export function fadeEnableLed(fade: FadeState, element: FadeElement): FadeLed {
  if (!fade[element]) return 'off';
  return fade.auto.phase === 'paused' ? 'blink' : 'solid';
}

type MixGains = ProgramAudioMix['gains'];

/** The gain set the audio would reach at full OUT for a target: a card = silence; a bus = that bus + aux. */
function fadeAudioTargetGains(base: MixGains, target: FadeTarget): MixGains {
  switch (target) {
    case 'matte':
    case 'white':
    case 'black':
      return { busA: 0, busB: 0, aux1: 0, aux2mic: 0 };
    case 'A':
      return { busA: base.busA, busB: 0, aux1: base.aux1, aux2mic: base.aux2mic };
    case 'B':
      return { busA: 0, busB: base.busB, aux1: base.aux1, aux2mic: base.aux2mic };
  }
}

/**
 * The programme audio AFTER the Fade stage (reference §11). Wraps programAudioMix unchanged;
 * when AUDIO is enabled it crossfades the base mix toward the target gains by fade.lever —
 * dipping to silence for a matte/white/black card, or to that bus + Aux/Mic when fading to A/B.
 * Master is carried through (the fade runs within the current Program Out).
 */
export function programFadeAudioMix(state: PanelState): ProgramAudioMix {
  const base = programAudioMix(state);
  const amount = state.fade.audio ? state.fade.lever : 0;
  if (amount <= 0) return base;
  const target = fadeAudioTargetGains(base.gains, state.fade.target);
  const blend = (a: number, b: number): number => a * (1 - amount) + b * amount;
  return {
    gains: {
      busA: blend(base.gains.busA, target.busA),
      busB: blend(base.gains.busB, target.busB),
      aux1: blend(base.gains.aux1, target.aux1),
      aux2mic: blend(base.gains.aux2mic, target.aux2mic),
    },
    master: base.master,
  };
}

/** Whether any audio reaches Program Out after the fade (Master open and a live contributor). */
export function programFadeAudible(state: PanelState): boolean {
  const mix = programFadeAudioMix(state);
  if (mix.master <= 0) return false;
  const g = mix.gains;
  return g.busA > 0 || g.busB > 0 || g.aux1 > 0 || g.aux2mic > 0;
}

/** The headphone monitor is tapped before the Fade stage — it is never attenuated (reference §11). */
export const HEADPHONE_MONITOR_BYPASSES_FADE = true;

// --- per-source programme gains (real audio capture, ADR-0010) --------------

/** Post-Fade linear gain each Source slot's audio receives at Program Out. */
export interface ProgramSourceMix {
  slots: Record<SourceSlot, number>;
  aux1: number;
  aux2mic: number;
  master: number;
}

/**
 * Map the per-fader programme gains onto per-SOURCE slot gains: audio follows the bus
 * that holds the source ("A Fader follows the source assigned to the A-bus"), Matte
 * contributes silence and the blinking substitute never carries audio (busAudioSource,
 * ADR-0006), and the same source on both buses sums both fader paths. Wraps
 * programFadeAudioMix so Program-Out routing, Audio Follow, and the Fade stage are
 * inherited, never re-derived.
 */
export function programFadeSourceMix(state: PanelState): ProgramSourceMix {
  const { gains, master } = programFadeAudioMix(state);
  const slots: Record<SourceSlot, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const a = busAudioSource(state.busA);
  const b = busAudioSource(state.busB);
  if (a !== null) slots[a] += gains.busA;
  if (b !== null) slots[b] += gains.busB;
  return { slots, aux1: gains.aux1, aux2mic: gains.aux2mic, master };
}
