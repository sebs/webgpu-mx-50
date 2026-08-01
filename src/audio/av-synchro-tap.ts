// A/V Synchro runtime tap (ADR-0010, reference §8.9). Each frame it reads the programme
// envelope from the AudioEngine's analyser and evaluates the pure gate in core/av-synchro.ts
// to decide which digital effects the audio is currently pulsing on. The result is a
// transient per-frame signal — never a dispatched command, never stored in PanelState — that
// the video layer reads to gate the selected effects on the target bus.
//
// Browser-only: it depends on the live AnalyserNode. The gate itself (avSynchroEffectApplied)
// is pure and fully unit-tested; only the envelope measurement is untestable headlessly.

import { avSynchroActiveEffects, avSynchroEffectApplied } from '../core/av-synchro.js';
import type { AvSynchroEffect, DigitalEffectState } from '../state/state.js';
import type { AudioEngine } from './engine.js';

export class AvSynchroTap {
  constructor(private readonly engine: AudioEngine) {}

  /** The measured programme envelope this frame (0..1). */
  envelope(): number {
    return this.engine.envelope();
  }

  /** Whether A/V Synchro is pulsing a given effect on right now. */
  applied(de: DigitalEffectState, effect: AvSynchroEffect): boolean {
    return avSynchroEffectApplied(de, effect, this.envelope());
  }

  /**
   * Every effect A/V Synchro is pulsing on this frame — empty when disarmed or below the
   * LEVEL threshold. Measures the envelope once; the render loop passes the result to
   * Renderer.render (the pure set logic lives in core/av-synchro.ts).
   */
  activeEffects(de: DigitalEffectState): AvSynchroEffect[] {
    return avSynchroActiveEffects(de, this.envelope());
  }
}
