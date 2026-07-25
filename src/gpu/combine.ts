// The Mix/Wipe combine pass (ADR-0004 combine stage): composites the A-bus and B-bus
// textures into one, as a cross-dissolve (Mix) or per-pixel brighter (NAM), by the lever
// position. Owns its output texture so it never overwrites the source textures.

import { WORKING_FORMAT } from '../constants.js';
import { combineWGSL } from './shaders/combine.wgsl.js';
import type { Size } from '../core/types.js';
import type { CompositeRule } from '../core/transition.js';

export class CombinePass {
  private readonly pipeline: GPURenderPipeline;
  private readonly sampler: GPUSampler;
  private readonly uniform: GPUBuffer;
  private readonly output: GPUTexture;

  constructor(
    private readonly device: GPUDevice,
    size: Size,
  ) {
    const module = device.createShaderModule({ code: combineWGSL });
    this.pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format: WORKING_FORMAT }] },
      primitive: { topology: 'triangle-list' },
    });
    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.uniform = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.output = device.createTexture({
      size: { width: size.width, height: size.height },
      format: WORKING_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
  }

  /** Composite A and B by the given rule and lever; returns the owned composite texture. */
  render(texA: GPUTexture, texB: GPUTexture, rule: CompositeRule, lever: number): GPUTexture {
    const { device } = this;
    // Phase 1 realises Mix and NAM; other rules (wipe/keys) fall back to Mix for now.
    const mode = rule === 'nam-brighter' ? 1 : 0;
    device.queue.writeBuffer(this.uniform, 0, new Float32Array([mode, lever, 0, 0]));

    const bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: texA.createView() },
        { binding: 2, resource: texB.createView() },
        { binding: 3, resource: { buffer: this.uniform } },
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
