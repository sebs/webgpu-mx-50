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

export async function initGpu(canvas: HTMLCanvasElement): Promise<GpuContext> {
  if (!navigator.gpu) throw new Error('WebGPU is unavailable (navigator.gpu missing).');

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('No suitable WebGPU adapter was found.');

  const device = await adapter.requestDevice();
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
