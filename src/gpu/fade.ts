// The Fade pass (ADR-0004 `fade` stage, reference §11): mixes the PRE-DSK composite
// toward the fade target by the VIDEO-element amount (the DSK element is applied inside
// the DSK pass as key opacity — selective fading, reference §11). Owns its output
// texture. The target (flat colour vs bus texture) and amount come from core/fade.ts; the
// caller binds the uneffected A/B bus texture for the bus targets. Pixel verification is
// deferred (no headless-WebGPU runner), like the other GPU passes.

import { WORKING_FORMAT } from '../constants.js';
import { fadeWGSL } from './shaders/fade.wgsl.js';
import { fadeVideoTarget, videoFadeAmount } from '../core/fade.js';
import type { Size } from '../core/types.js';
import type { PanelState } from '../state/state.js';

export class FadePass {
  private readonly pipeline: GPURenderPipeline;
  private readonly sampler: GPUSampler;
  private readonly uniform: GPUBuffer;
  private readonly output: GPUTexture;
  private readonly scratch = new Float32Array(8);

  constructor(
    private readonly device: GPUDevice,
    size: Size,
  ) {
    const module = device.createShaderModule({ code: fadeWGSL });
    this.pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format: WORKING_FORMAT }] },
      primitive: { topology: 'triangle-list' },
    });
    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.uniform = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.output = device.createTexture({
      size: { width: size.width, height: size.height },
      format: WORKING_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
  }

  /**
   * Fade `composite` toward the state's target by the video-fade amount; returns the owned
   * output. `targetTex` is the uneffected A/B bus texture for bus targets (ignored for the
   * flat-colour matte/white/black targets — the caller may bind any valid texture there).
   */
  render(composite: GPUTexture, targetTex: GPUTexture, state: PanelState): GPUTexture {
    const { device } = this;
    const target = fadeVideoTarget(state);
    const s = this.scratch;
    s[0] = target.kind === 'bus' ? 1 : 0; // targetMode
    s[1] = videoFadeAmount(state.fade); // amount
    s[2] = 0;
    s[3] = 0;
    if (target.kind === 'colour') {
      s[4] = target.rgb[0];
      s[5] = target.rgb[1];
      s[6] = target.rgb[2];
    } else {
      s[4] = 0;
      s[5] = 0;
      s[6] = 0;
    }
    s[7] = 0;
    device.queue.writeBuffer(this.uniform, 0, s);

    const bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: composite.createView() },
        { binding: 2, resource: targetTex.createView() },
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
