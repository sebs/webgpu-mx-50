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

  const engine = createEngine();
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

  // First control surface, bound to the single store (ADR-0013).
  const controls = createControlStrip(engine.store);
  document.getElementById('app')?.appendChild(controls);

  const loop = new RenderLoop(engine.clock, (_alpha, tick) => {
    renderer.render(engine.store.getSnapshot(), tick);
  });
  loop.start();
}

boot().catch((error) => showCapabilityMessage(String(error)));
