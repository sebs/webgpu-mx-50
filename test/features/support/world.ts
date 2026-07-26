// Cucumber World for the domain specs: it constructs the headless engine (store +
// source bindings, no GPU/DOM) so the .feature files in ../../../features execute
// against real code (ADR-0016).

import { setWorldConstructor, World } from '@cucumber/cucumber';
import { createEngine } from '../../../src/app.js';
import type { Engine } from '../../../src/app.js';
import type { SourceBindingRegistry } from '../../../src/sources/binding.js';
import type { PanelState, WipeFamily } from '../../../src/state/state.js';
import type { Command } from '../../../src/state/commands.js';
import type { ResolveContext } from '../../../src/core/resolve.js';

export class MixerWorld extends World {
  readonly engine: Engine = createEngine();

  // --- inputs-and-devices (Phase 0) ---
  enumeratedDevices: string[] = [];
  lastProvider = '';
  readonly lastProviderByKind = new Map<string, string>();

  // --- Phase 1 scratch state ---
  /** The consumer context set by "the signal reaches the … stage" (ADR-0006). */
  context: ResolveContext = 'mixWipe';
  /** Whether a Matte SELECT press has occurred (distinguishes precondition from assertion). */
  mattePressed = false;
  /** Minimal bus-fader gains, standing in for the Audio Mix engine (Phase 5, ADR-0010). */
  readonly busGain: { A: number; B: number } = { A: 0.5, B: 0.5 };

  /** Whether a colour-correction press has occurred (distinguishes precondition from assertion). */
  ccPressed = false;

  /** Whether a Multi-button press has occurred (distinguishes precondition from assertion). */
  multiPressed = false;

  /** The chroma-key backdrop hue for the current scenario (default green). */
  chromaBackdropHue = 1 / 3;

  // --- wipe scratch state (Phase 2) ---
  wipeFamily: WipeFamily = 'straight';
  readonly num: { base: number; reversed: number } = { base: 0, reversed: 0 };
  readonly travel: { ab: number; ba: number; after: number; noted: number } = { ab: 0, ba: 0, after: 0, noted: 0 };

  // --- audio scratch state (Phase 5: mixer §5 / follow §12 / A/V Synchro §8.9) ---
  /** Which program-mix gain a "raise the … Fader" step touched, and its value before. */
  raisedGainKey: 'busA' | 'busB' | 'aux1' | 'aux2mic' = 'busA';
  beforeRaiseGain = 0;
  /** Master fader position/gain captured before pulling it to minimum, to restore/compare. */
  prevMasterPos = 0;
  prevMasterGain = 0;
  /** Level-indicator scratch: the balanced programme peak and a representative brief peak. */
  programmePeakDb = 0;
  briefPeakDb = 0;
  /** Sampled Audio-Follow bus gains across a lever sweep. */
  sweepGains: { a: number; b: number }[] = [];
  /** The current A/V-Synchro audio envelope (0..1) and a beat sequence, plus armed selection. */
  avEnvelope = 0;
  avBeats: number[] = [];
  avSelected: string[] = [];
  avLastEffect = '';

  // --- transition-timeline scratch (Phase 6: Auto Take/Fade, ADR-0012) ---
  /** Frames advanced since the last Auto Take/Fade press, so a later step can advance the remainder. */
  framesSincePress = 0;

  get bindings(): SourceBindingRegistry {
    return this.engine.bindings;
  }

  snapshot(): PanelState {
    return this.engine.store.getSnapshot();
  }

  dispatch(command: Command): void {
    this.engine.store.dispatch(command);
  }

  /** The current logical tick (the World's clock starts at 0 per scenario). */
  get now(): number {
    return this.engine.clock.tick;
  }

  setTransitionTime(frames: number): void {
    this.dispatch({ type: 'SET_TRANSITION_TIME', frames });
  }

  pressAutoTake(): void {
    this.dispatch({ type: 'PRESS_AUTO_TAKE', tick: this.now });
    this.framesSincePress = 0;
  }

  pressAutoFade(): void {
    this.dispatch({ type: 'PRESS_AUTO_FADE', tick: this.now });
    this.framesSincePress = 0;
  }

  /** Step the logical clock n whole frames, dispatching ADVANCE_TIMELINE each tick (no rAF). */
  advanceFrames(n: number): void {
    for (let i = 0; i < n; i++) {
      this.engine.clock.advanceOneTick();
      this.dispatch({ type: 'ADVANCE_TIMELINE', tick: this.engine.clock.tick });
    }
    this.framesSincePress += n;
  }

  /** Advance so that framesSincePress reaches `target` (robust to step order). */
  advanceToFrame(target: number): void {
    const remaining = target - this.framesSincePress;
    if (remaining > 0) this.advanceFrames(remaining);
  }
}

setWorldConstructor(MixerWorld);
