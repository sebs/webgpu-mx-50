// The present pass: blit a texture to the canvas' current sRGB view (ADR-0005). This
// is the terminal Program-Out step of the render loop; in Phase 0 its input is the
// pass-through graph output (the single generated source).

import { presentWGSL } from './shaders/present.wgsl.js';

export class PresentPass {
  private readonly pipeline: GPURenderPipeline;
  private readonly sampler: GPUSampler;

  constructor(
    private readonly device: GPUDevice,
    /** Must equal the sRGB view format the canvas is configured with (ADR-0005). */
    targetFormat: GPUTextureFormat,
  ) {
    const module = device.createShaderModule({ code: presentWGSL });
    this.pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format: targetFormat }] },
      primitive: { topology: 'triangle-list' },
    });
    this.sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });
  }

  render(context: GPUCanvasContext, source: GPUTexture, srgbView: GPUTextureFormat): void {
    const { device } = this;
    const view = context.getCurrentTexture().createView({ format: srgbView });
    const bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: source.createView() },
      ],
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }
}
