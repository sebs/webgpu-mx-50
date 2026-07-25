// The per-bus processing pass (ADR-0004 per-bus stages): applies Colour Correction and
// the filter Digital Effects to one bus's frame, into an owned output texture. One
// instance per bus. Reads the panel snapshot to decide which effects apply to this bus
// (the Digital Effect block targets a single bus).

import { WORKING_FORMAT } from '../constants.js';
import { busEffectWGSL } from './shaders/bus-effect.wgsl.js';
import { ccActive, joystickActive } from '../core/colour-correct.js';
import { effectActiveOn } from '../core/digital-effect.js';
import type { Size } from '../core/types.js';
import type { BusId } from '../core/types.js';
import type { PanelState } from '../state/state.js';

export class BusProcessor {
  private readonly pipeline: GPURenderPipeline;
  private readonly sampler: GPUSampler;
  private readonly uniform: GPUBuffer;
  private readonly output: GPUTexture;
  private readonly scratch = new Float32Array(16);

  constructor(
    private readonly device: GPUDevice,
    private readonly size: Size,
  ) {
    const module = device.createShaderModule({ code: busEffectWGSL });
    this.pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format: WORKING_FORMAT }] },
      primitive: { topology: 'triangle-list' },
    });
    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.uniform = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.output = device.createTexture({
      size: { width: size.width, height: size.height },
      format: WORKING_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
  }

  /** Apply this bus's colour correction + active filters to `sourceTex`; returns the result. */
  render(sourceTex: GPUTexture, state: PanelState, bus: BusId): GPUTexture {
    const { device } = this;
    const cc = bus === 'A' ? state.busA.colourCorrect : state.busB.colourCorrect;
    const de = state.digitalEffect;
    const s = this.scratch;
    s[0] = this.size.width;
    s[1] = this.size.height;
    s[2] = ccActive(cc) ? 1 : 0;
    s[3] = joystickActive(cc) ? 1 : 0;
    s[4] = cc.chroma;
    s[5] = cc.joystickX;
    s[6] = cc.joystickY;
    s[7] = effectActiveOn(de, bus, 'nega') ? 1 : 0;
    s[8] = effectActiveOn(de, bus, 'mosaic') ? 1 : 0;
    s[9] = effectActiveOn(de, bus, 'mono') ? 1 : 0;
    s[10] = effectActiveOn(de, bus, 'paint') ? 1 : 0;
    s[11] = de.mosaicSize;
    s[12] = de.paintLevel;
    device.queue.writeBuffer(this.uniform, 0, s);

    const bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: sourceTex.createView() },
        { binding: 2, resource: { buffer: this.uniform } },
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
