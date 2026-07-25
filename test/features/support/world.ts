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

  // --- wipe scratch state (Phase 2) ---
  wipeFamily: WipeFamily = 'straight';
  readonly num: { base: number; reversed: number } = { base: 0, reversed: 0 };
  readonly travel: { ab: number; ba: number; after: number; noted: number } = { ab: 0, ba: 0, after: 0, noted: 0 };

  get bindings(): SourceBindingRegistry {
    return this.engine.bindings;
  }

  snapshot(): PanelState {
    return this.engine.store.getSnapshot();
  }

  dispatch(command: Command): void {
    this.engine.store.dispatch(command);
  }
}

setWorldConstructor(MixerWorld);
