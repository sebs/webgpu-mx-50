// The Special-Mode macro pass (reference §14): realises one SpecialFrame from
// core/special-mode-geometry.ts — the compressed-image looks (Stream, Cork Screw, Bounce,
// Flip, Shutter, Vibrate, Satellite) and the Mosaic Mix. Replaces the Mix/Wipe combine
// stage while a macro drives the picture; DSK and Fade still apply downstream. Owns its
// output texture; the Matte is bound as a texture so GRADATION and Colour Bar work free.

import { WORKING_FORMAT } from '../constants.js';
import { specialFxWGSL } from './shaders/special-fx.wgsl.js';
import { bgLayerCode, fgLayerCode } from '../core/special-mode-geometry.js';
import type { SpecialFrame } from '../core/special-mode-geometry.js';
import type { Size } from '../core/types.js';

export class SpecialFxPass {
  private readonly pipeline: GPURenderPipeline;
  private readonly sampler: GPUSampler;
  private readonly uniform: GPUBuffer;
  private readonly output: GPUTexture;
  private readonly scratch = new Float32Array(12);

  constructor(
    private readonly device: GPUDevice,
    size: Size,
  ) {
    const module = device.createShaderModule({ code: specialFxWGSL });
    this.pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format: WORKING_FORMAT }] },
      primitive: { topology: 'triangle-list' },
    });
    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.uniform = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.output = device.createTexture({
      size: { width: size.width, height: size.height },
      format: WORKING_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
  }

  /** Render the macro picture for this frame; returns the owned output texture. */
  render(texA: GPUTexture, texB: GPUTexture, texMatte: GPUTexture, frame: SpecialFrame): GPUTexture {
    const { device } = this;
    const s = this.scratch;
    s[0] = frame.center[0];
    s[1] = frame.center[1];
    s[2] = frame.half[0];
    s[3] = frame.half[1];
    s[4] = frame.angle;
    s[5] = frame.shape;
    s[6] = bgLayerCode(frame.bg);
    s[7] = fgLayerCode(frame.fg);
    s[8] = frame.mix;
    s[9] = frame.mosaic;
    s[10] = 0;
    s[11] = 0;
    device.queue.writeBuffer(this.uniform, 0, s);

    const bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: texA.createView() },
        { binding: 2, resource: texB.createView() },
        { binding: 3, resource: texMatte.createView() },
        { binding: 4, resource: { buffer: this.uniform } },
      ],
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        { view: this.output.createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' },
      ],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);

    return this.output;
  }
}
