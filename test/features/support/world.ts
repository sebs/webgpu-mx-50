// Cucumber World for the domain specs: it constructs the headless engine (store +
// source bindings, no GPU/DOM) so the .feature files in ../../../features execute
// against real code (ADR-0016).

import { setWorldConstructor, World } from '@cucumber/cucumber';
import type { IWorldOptions } from '@cucumber/cucumber';
import { createEngine } from '../../../src/app.js';
import { panelSnapshot } from '../../../src/state/state.js';
import { MemoryStorageBackend } from '../../../src/persistence/backend.js';
import { createPersistence } from '../../../src/persistence/persistence.js';
import { BindingTable, DEFAULT_BINDINGS } from '../../../src/control/bindings.js';
import { createAutomation } from '../../../src/control/automation.js';
import { resolveSignal } from '../../../src/control/resolver.js';
import type { Engine } from '../../../src/app.js';
import type { SourceBindingRegistry } from '../../../src/sources/binding.js';
import type { FrameMode, PanelSnapshot, PanelState, WipeFamily } from '../../../src/state/state.js';
import type { Command } from '../../../src/state/commands.js';
import type { ResolveContext } from '../../../src/core/resolve.js';
import type { Persistence } from '../../../src/persistence/persistence.js';
import type { AutomationApi } from '../../../src/control/automation.js';
import type { ControlMode, LogicalControlId } from '../../../src/control/logical-control.js';

export class MixerWorld extends World {
  engine: Engine = createEngine();

  constructor(options: IWorldOptions) {
    super(options);
    this.wireNotifyCounter();
  }

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

  // --- Event Memory + persistence scratch (Phase 7: §13, ADR-0015) ---
  /** In-memory storage backend — survives a simulated reload while the Map lives. */
  readonly storage = new MemoryStorageBackend();
  persistence: Persistence = createPersistence(this.storage);
  /** Store-notification counter, to prove recall dispatches through the normal update path. */
  notifyCount = 0;
  armNotifyMark = 0;
  lastReloadSync = false;
  /** The panel snapshot captured at scenario start, for "the panel state is unchanged" checks. */
  memBaseline: PanelSnapshot | null = null;
  /** Recall order (by the slot's distinctive marker) and the cursor after each sequential press. */
  readonly recalledOrder: number[] = [];
  readonly armedAfter: (number | null)[] = [];

  // --- Phase 8: control-mapping seam (ADR-0014) + recipe / frame scratch ---
  bindingTable = new BindingTable(DEFAULT_BINDINGS);
  automation: AutomationApi = createAutomation(() => this.snapshot(), (c) => this.dispatch(c), () => this.now);
  gpiEnabled = false;
  mappedTakeSource = '';
  /** Recipe scratch: the (single-block) A/B effect labels and the chosen spotlight modifier / PiP slot. */
  aEffect = '';
  bEffect = '';
  spotlightModifier = '';
  pipSlot = 0;
  /** Frame-mode scratch: effect-output signature before/after the toggle, and the mode before. */
  frameSigBefore = '';
  frameSigAfter = '';
  frameModeBefore: FrameMode = 'frame';

  /** Route an input through the resolver (the sole emitter) and dispatch its command, if any. */
  emitSignal(control: LogicalControlId, mode: ControlMode, value?: number): Command | null {
    const command = resolveSignal({ control, mode, value }, this.snapshot(), this.now);
    if (command) {
      this.dispatch(command);
      if (command.type === 'PRESS_AUTO_TAKE' || command.type === 'PRESS_AUTO_FADE') this.framesSincePress = 0;
    }
    return command;
  }

  /** Subscribe the notify counter to the current store (re-run after a reload swaps the engine). */
  wireNotifyCounter(): void {
    this.engine.store.subscribe(() => {
      this.notifyCount++;
    });
  }

  pressMemory(): void {
    this.dispatch({ type: 'PRESS_MEMORY' });
  }

  pressEventNo(button: number, shift: boolean): void {
    this.dispatch({ type: 'PRESS_EVENT_NO', button, shift });
    this.armNotifyMark = this.notifyCount; // baseline: any later notify is from the recall
  }

  pressMemoryShift(): void {
    this.dispatch({ type: 'PRESS_MEMORY_SHIFT' });
  }

  selectMacro(button: 1 | 2 | 3 | 4, shift: boolean): void {
    this.dispatch({ type: 'SELECT_SPECIAL_MACRO', button, shift });
  }

  /** Store a distinctive, comparable snapshot into `slot` (matte.colorIndex = slot marker). */
  storeDistinctiveSnapshot(slot: number): void {
    const priorColor = this.snapshot().matte.colorIndex;
    const priorType = this.snapshot().transition.type;
    this.dispatch({ type: 'SET_MATTE_COLOR', colorIndex: slot });
    this.dispatch({ type: 'SET_TRANSITION_TYPE', transition: 'wipe' });
    this.pressMemory();
    this.pressEventNo(((slot - 1) % 4) + 1, slot > 4);
    // Reset the live panel with granular commands — never LOAD_STATE, which would clobber the bank.
    this.dispatch({ type: 'SET_MATTE_COLOR', colorIndex: priorColor });
    this.dispatch({ type: 'SET_TRANSITION_TYPE', transition: priorType });
  }

  /** Press AUTO TAKE and record what the recall landed on + the advanced cursor (sequential playback). */
  pressAutoTakeCapturing(): void {
    this.pressAutoTake();
    this.recalledOrder.push(this.snapshot().matte.colorIndex);
    this.armedAfter.push(this.snapshot().memory.armedSlot);
  }

  /** Simulate a reload: persist the bank, then re-boot a fresh engine from the SAME storage. */
  reload(): void {
    this.persistence.saveBank(this.snapshot().memory.slots);
    this.lastReloadSync = !(this.persistence.loadBank() instanceof Promise); // read is synchronous
    this.persistence = createPersistence(this.storage);
    this.engine = createEngine(this.persistence.restoreOnBoot());
    this.wireNotifyCounter();
  }

  /** Power-off + MEMORY+SHIFT-on-power mass-clear (reference §13). */
  clearAllOnPowerUp(): void {
    this.dispatch({ type: 'CLEAR_ALL_SLOTS' });
    this.persistence.clearBank();
    this.reload();
  }

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
