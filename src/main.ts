// Browser entry point. Feature-detects WebGPU (ADR-0002), initialises the device and
// sRGB swapchain, builds the four Source slots (all live video feeds with their own
// monitors) + Matte, wires the headless store to the two-bus renderer and the operator
// console, and runs the render loop. The monitor bridge (source monitors + Program
// monitor chrome) is display-only and store-driven.

import { detectWebGPU, WEBGPU_REQUIREMENT_MESSAGE } from './gpu/capabilities.js';
import { initGpu } from './gpu/device.js';
import type { GpuContext } from './gpu/device.js';
import { MatteSource } from './sources/matte-source.js';
import { VideoSource } from './sources/video-source.js';
import { SourceRegistry } from './sources/registry.js';
import { Renderer } from './engine/renderer.js';
import { RenderLoop } from './engine/loop.js';
import { createEngine } from './app.js';
import { createConsole } from './ui/console.js';
import { createDemoFeeds } from './ui/demo-feeds.js';
import { ensureTheme } from './ui/theme.js';
import { AudioEngine } from './audio/engine.js';
import { AvSynchroTap } from './audio/av-synchro-tap.js';
import { createPersistence } from './persistence/persistence.js';
import { LocalStorageBackend } from './persistence/backend.js';
import { attachPersistence } from './persistence/subscriber.js';
import { BindingTable } from './control/bindings.js';
import { SignalCoalescer } from './control/resolver.js';
import { KeyboardAdapter } from './control/keyboard.js';
import { GamepadAdapter } from './control/gamepad.js';
import { MidiAdapter } from './control/midi.js';
import { SerialGpiAdapter } from './control/serial.js';
import { resolveBusSource } from './core/resolve.js';
import { directOutSource } from './core/program.js';
import type { TallyState } from './ui/demo-feeds.js';
import type { PanelState } from './state/state.js';
import type { Size, SourceSlot } from './core/types.js';

function showCapabilityMessage(text: string): void {
  const message = document.getElementById('capability');
  if (message) {
    message.hidden = false;
    message.innerHTML = `<h1>WebGPU required</h1><p>${text}</p>`;
  }
  setStatus('webgpu unavailable');
}

function setStatus(text: string): void {
  const status = document.getElementById('mx-status');
  if (status) status.textContent = text;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Monitor tally for a Source slot: red on Program Out, green when selected on a bus. */
function tallyFor(slot: SourceSlot, s: PanelState): TallyState {
  let onAir = false;
  if (s.programOut === 'A' || s.programOut === 'B') {
    onAir = directOutSource(s, s.programOut) === slot;
  } else {
    const lever = s.transition.lever;
    onAir =
      (resolveBusSource(s.busA, 'mixWipe') === slot && lever < 0.98) ||
      (resolveBusSource(s.busB, 'mixWipe') === slot && lever > 0.02);
  }
  if (onAir) return 'onair';
  return s.busA.source === slot || s.busB.source === slot ? 'ready' : 'off';
}

/** The Program-monitor caption: transition mode + lever, e.g. "WIPE STRAIGHT V1 · 42%". */
function transitionLabel(s: PanelState): string {
  const lever = `${Math.round(s.transition.lever * 100)}%`;
  const type = s.transition.type;
  if (type === 'wipe') {
    return `WIPE ${s.transition.wipe.family.toUpperCase()} V${s.transition.wipe.variant + 1} · ${lever}`;
  }
  if (type === 'lum-key') return `LUM KEY · ${lever}`;
  if (type === 'chroma-key') return `CHROMA KEY · ${lever}`;
  return `${type.toUpperCase()} · ${lever}`;
}

async function boot(): Promise<void> {
  ensureTheme();
  const capability = detectWebGPU();
  if (!capability.ok) {
    showCapabilityMessage(WEBGPU_REQUIREMENT_MESSAGE);
    return;
  }

  const canvas = document.getElementById('program') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('#program canvas element not found.');

  let gpu: GpuContext;
  try {
    gpu = await initGpu(canvas);
  } catch (error) {
    showCapabilityMessage(`${WEBGPU_REQUIREMENT_MESSAGE} (${String(error)})`);
    return;
  }

  // Persistence (ADR-0015): boot the store from storage (Reset policy + saved bank/field
  // preset), then mirror future changes back. The module owns all localStorage access.
  const persistence = createPersistence(new LocalStorageBackend(window.localStorage));
  const engine = createEngine(persistence.restoreOnBoot());
  attachPersistence(engine.store, persistence);
  const size: Size = { width: canvas.width, height: canvas.height };

  // Source 1–4: live video feeds (ADR-0008 video path) shown on the source monitor
  // wall — distinct procedural clips by default, each swappable for a local video file
  // via its monitor's picker. Matte is the internal generator. Blend with the lever.
  const feeds = createDemoFeeds();
  const videoSources = feeds.feedVideos.map((video) => new VideoSource(gpu.device, video));
  const matte = new MatteSource(gpu.device, size);

  const registry = new SourceRegistry();
  ([1, 2, 3, 4] as SourceSlot[]).forEach((slot, i) => registry.set(slot, videoSources[i]!));
  registry.set('matte', matte);
  await registry.acquireAll();

  const renderer = new Renderer({ gpu, registry, generated: [], matte, size });

  // The operator console (ADR-0013, styled per docs/STYLEGUIDE.md), bound to the single
  // store. The tick provider lets AUTO TAKE / AUTO FADE stamp their press (ADR-0012).
  document.getElementById('mx-sources')?.appendChild(feeds);
  const controls = createConsole(engine.store, () => engine.clock.tick);
  document.getElementById('mx-console-mount')?.appendChild(controls);

  // Monitor-bridge chrome: program chip, transition caption, and the source tallies
  // reflect every store change; the timecode advances with the logical clock below.
  const pgmLabel = document.getElementById('mx-pgm-label');
  const pgmCaption = document.getElementById('mx-transition-label');
  const reflectBridge = (s: PanelState): void => {
    if (pgmLabel) pgmLabel.textContent = `PROGRAM OUT · ${s.programOut.toUpperCase()}`;
    if (pgmCaption) pgmCaption.textContent = transitionLabel(s);
    ([1, 2, 3, 4] as SourceSlot[]).forEach((slot, i) => feeds.setTally(i, tallyFor(slot, s)));
  };
  engine.store.subscribe(reflectBridge);
  reflectBridge(engine.store.getSnapshot());

  // Control-input mapping (ADR-0014): every remappable surface normalises onto logical-control
  // signals, coalesced and resolved into store commands once per tick. Bindings persist (ADR-0015);
  // pointer/touch stays on the console's direct path. Non-keyboard surfaces are capability-detected.
  const bindings = new BindingTable(persistence.loadBindings() ?? undefined, persistence.saveBindings);
  const coalescer = new SignalCoalescer();
  new KeyboardAdapter(bindings, coalescer).attach(window);
  const gamepad = new GamepadAdapter(bindings, coalescer);
  if ('requestMIDIAccess' in navigator) void new MidiAdapter(bindings, coalescer).start();
  if ('serial' in navigator) void new SerialGpiAdapter(bindings, coalescer).start();

  // Audio engine (ADR-0010): the Web Audio graph, driven live by the store. It starts
  // suspended — browsers only let audio run after a user gesture, so resume on first click.
  const audio = new AudioEngine(engine.store);
  const tap = new AvSynchroTap(audio);
  const resumeAudio = (): void => {
    void audio.resume();
    window.removeEventListener('pointerdown', resumeAudio);
  };
  window.addEventListener('pointerdown', resumeAudio);

  const timecode = document.getElementById('mx-timecode');
  let lastTimecode = '';
  let lastAvSynchro = '';
  const loop = new RenderLoop(engine.clock, (_alpha, tick) => {
    // Poll gamepads and flush coalesced input signals to store commands (ADR-0014) — the one
    // place resolveSignal fires, passing the tick purely. Then advance the timeline runners.
    gamepad.poll();
    coalescer.flush(engine.store.getSnapshot(), tick, (command) => engine.store.dispatch(command));
    // Advance the Auto Take / Auto Fade runners for this logical tick (ADR-0012). Idle is a
    // no-op: the reducer returns the same snapshot and the store skips notification.
    engine.store.dispatch({ type: 'ADVANCE_TIMELINE', tick });
    const snapshot = engine.store.getSnapshot();
    // A/V Synchro (§8.9): measure the envelope once and gate the bus effects with it —
    // a transient per-frame signal, never dispatched or stored (ADR-0010).
    const avPulsed = tap.activeEffects(snapshot.digitalEffect);
    renderer.render(snapshot, tick, avPulsed);
    // Timecode chip on the Program monitor: the logical clock as mm:ss:ff at 60.
    if (timecode) {
      const seconds = Math.floor(tick / 60);
      const text = `${pad2(Math.floor(seconds / 60) % 60)}:${pad2(seconds % 60)}:${pad2(tick % 60)}`;
      if (text !== lastTimecode) {
        timecode.textContent = text;
        lastTimecode = text;
      }
    }
    // Console LED cue for the same pulsed set (the gating itself happened in render above).
    const active = avPulsed.join(' ');
    if (active !== lastAvSynchro) {
      controls.dataset.avSynchroActive = active;
      lastAvSynchro = active;
    }
  });
  loop.start();
  setStatus('ready');
}

boot().catch((error) => showCapabilityMessage(String(error)));
