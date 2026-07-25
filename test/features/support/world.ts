// Cucumber World for the domain specs: it constructs the headless engine (store +
// source bindings, no GPU/DOM) so the .feature files in ../../../features execute
// against real code (ADR-0016). Phase 0 wires the inputs-and-devices bindings.

import { setWorldConstructor, World } from '@cucumber/cucumber';
import { createEngine } from '../../../src/app.js';
import type { Engine } from '../../../src/app.js';
import type { SourceBindingRegistry } from '../../../src/sources/binding.js';

export class MixerWorld extends World {
  readonly engine: Engine = createEngine();

  /** Fake device enumeration; real enumeration is browser-only and out of scope headless. */
  enumeratedDevices: string[] = [];

  /** Last provider id bound, so "available on either bus" assertions can find it. */
  lastProvider = '';

  /** Remembers the last provider per kind so "the same X" reuses it. */
  readonly lastProviderByKind = new Map<string, string>();

  get bindings(): SourceBindingRegistry {
    return this.engine.bindings;
  }
}

setWorldConstructor(MixerWorld);
