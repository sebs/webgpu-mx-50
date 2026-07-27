// Browser entry point. Feature-detects WebGPU (ADR-0002), initialises the device and
// sRGB swapchain, builds the four Source slots + Matte, wires the headless store to the
// two-bus renderer and the control strip, and runs the render loop. Phase 1: two buses,
// Program Out selection, and Mix/NAM come alive.

import { detectWebGPU, WEBGPU_REQUIREMENT_MESSAGE } from './gpu/capabilities.js';
import { initGpu } from './gpu/device.js';
import type { GpuContext } from './gpu/device.js';
import { GeneratedSource } from './sources/generated-source.js';
import { MatteSource } from './sources/matte-source.js';
import { SourceRegistry } from './sources/registry.js';
import { Renderer } from './engine/renderer.js';
import { RenderLoop } from './engine/loop.js';
import { createEngine } from './app.js';
import { createControlStrip } from './ui/control-strip.js';
import { AudioEngine } from './audio/engine.js';
import { AvSynchroTap } from './audio/av-synchro-tap.js';
import { createPersistence } from './persistence/persistence.js';
import { LocalStorageBackend } from './persistence/backend.js';
import { attachPersistence } from './persistence/subscriber.js';
import type { Size } from './core/types.js';
import type { SourceSlot } from './core/types.js';

function showCapabilityMessage(text: string): void {
  const message = document.getElementById('capability');
  const canvas = document.getElementById('program');
  if (message) {
    message.hidden = false;
    message.innerHTML = `<h1>WebGPU required</h1><p>${text}</p>`;
  }
  if (canvas) canvas.hidden = true;
}

async function boot(): Promise<void> {
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

  // Four Source slots (distinct generated patterns) + the Matte generator.
  const generated: GeneratedSource[] = [1, 2, 3, 4].map(
    (slot) => new GeneratedSource(gpu.device, { size, variant: slot - 1 }),
  );
  const matte = new MatteSource(gpu.device, size);

  const registry = new SourceRegistry();
  ([1, 2, 3, 4] as SourceSlot[]).forEach((slot, i) => registry.set(slot, generated[i]!));
  registry.set('matte', matte);
  await registry.acquireAll();

  const renderer = new Renderer({ gpu, registry, generated, matte, size });

  // First control surface, bound to the single store (ADR-0013). The tick provider lets the
  // AUTO TAKE / AUTO FADE buttons stamp their press with the current logical tick (ADR-0012).
  const controls = createControlStrip(engine.store, () => engine.clock.tick);
  document.getElementById('app')?.appendChild(controls);

  // Audio engine (ADR-0010): the Web Audio graph, driven live by the store. It starts
  // suspended — browsers only let audio run after a user gesture, so resume on first click.
  const audio = new AudioEngine(engine.store);
  const tap = new AvSynchroTap(audio);
  const resumeAudio = (): void => {
    void audio.resume();
    window.removeEventListener('pointerdown', resumeAudio);
  };
  window.addEventListener('pointerdown', resumeAudio);

  let lastAvSynchro = '';
  const loop = new RenderLoop(engine.clock, (_alpha, tick) => {
    // Advance the Auto Take / Auto Fade runners for this logical tick (ADR-0012). Idle is a
    // no-op: the reducer returns the same snapshot and the store skips notification.
    engine.store.dispatch({ type: 'ADVANCE_TIMELINE', tick });
    const snapshot = engine.store.getSnapshot();
    renderer.render(snapshot, tick);
    // A/V Synchro (§8.9): reflect the audio-gated effects as a transient per-frame signal.
    // Full per-frame GPU picture-gating is a deferred browser-only integration (see ROADMAP).
    const active = tap.activeEffects(snapshot.digitalEffect).join(' ');
    if (active !== lastAvSynchro) {
      controls.dataset.avSynchroActive = active;
      lastAvSynchro = active;
    }
  });
  loop.start();
}

boot().catch((error) => showCapabilityMessage(String(error)));
