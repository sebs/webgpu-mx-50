// WebGPU device acquisition and canvas configuration (ADR-0002, ADR-0005).
//
// Colour pipeline: the swapchain is configured with the preferred canvas format
// (e.g. bgra8unorm) plus its `-srgb` view format. Every frame we render into the
// sRGB *view*, so the final linear composite is encoded to sRGB exactly once by the
// hardware at present time — the clean-modern "linear working space, sRGB output"
// contract (ADR-0005).

export interface GpuContext {
  device: GPUDevice;
  context: GPUCanvasContext;
  /** The format the canvas is configured with (linear, e.g. bgra8unorm). */
  format: GPUTextureFormat;
  /** The sRGB view format for the final encode (e.g. bgra8unorm-srgb). */
  srgbView: GPUTextureFormat;
  canvas: HTMLCanvasElement;
}

/** Acquire a fresh adapter + device (ADR-0002). */
export async function requestGpuDevice(): Promise<GPUDevice> {
  if (!navigator.gpu) throw new Error('WebGPU is unavailable (navigator.gpu missing).');

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('No suitable WebGPU adapter was found.');

  return adapter.requestDevice();
}

let shared: Promise<GPUDevice> | null = null;

/**
 * One device per page for every caller that opts in (the docs-site budget rule: several
 * small mixers, one device). A lost device is forgotten, so the next caller gets a fresh
 * one; a failed acquisition is not cached either.
 */
export function sharedGpuDevice(): Promise<GPUDevice> {
  if (!shared) {
    const pending = requestGpuDevice();
    shared = pending;
    pending.then(
      (device) => {
        void device.lost.then(() => {
          if (shared === pending) shared = null;
        });
      },
      () => {
        if (shared === pending) shared = null;
      },
    );
  }
  return shared;
}

/** Configure `canvas` for presentation from `device` (the ADR-0005 sRGB-view contract). */
export function configureCanvas(canvas: HTMLCanvasElement, device: GPUDevice): GpuContext {
  const context = canvas.getContext('webgpu');
  if (!context) throw new Error('Could not create a WebGPU canvas context.');

  const format = navigator.gpu.getPreferredCanvasFormat();
  const srgbView = `${format}-srgb` as GPUTextureFormat;
  context.configure({
    device,
    format,
    viewFormats: [srgbView],
    alphaMode: 'opaque',
  });

  return { device, context, format, srgbView, canvas };
}

/** Acquire a device (or reuse `device`) and configure `canvas` for it. */
export async function initGpu(canvas: HTMLCanvasElement, device?: GPUDevice): Promise<GpuContext> {
  return configureCanvas(canvas, device ?? (await requestGpuDevice()));
}
