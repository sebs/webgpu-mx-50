// Browser entry point. Feature-detects WebGPU (ADR-0002), initialises the device and
// sRGB swapchain, wires the headless engine to a render loop, and draws one generated
// source through the (pass-through) signal graph to Program Out.

import { detectWebGPU, WEBGPU_REQUIREMENT_MESSAGE } from './gpu/capabilities.js';
import { initGpu } from './gpu/device.js';
import type { GpuContext } from './gpu/device.js';
import { PresentPass } from './gpu/present.js';
import { GeneratedSource } from './sources/generated-source.js';
import { RenderLoop } from './engine/loop.js';
import { createEngine } from './app.js';

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

  const source = new GeneratedSource(gpu.device, {
    size: { width: canvas.width, height: canvas.height },
  });
  await source.acquire();

  const present = new PresentPass(gpu.device, gpu.srgbView);

  const loop = new RenderLoop(engine.clock, (subTickAlpha, tick) => {
    // One immutable snapshot per frame; the render path never calls into the UI
    // (ADR-0011, ADR-0012). Phase 0 does not yet read parameters from it.
    void engine.store.getSnapshot();

    source.phase = tick + subTickAlpha;
    const sourceTexture = source.getFrameTexture(gpu.device);
    const programOut = engine.graph.run(sourceTexture); // Phase 0: pass-through
    present.render(gpu.context, programOut, gpu.srgbView);
  });

  loop.start();
}

boot().catch((error) => showCapabilityMessage(String(error)));
