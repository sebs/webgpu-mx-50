// The wipe combine pass (ADR-0009): composites A-bus and B-bus through the compositional
// wipe shader, driven by the lever and the composed WipeState. Owns its output texture.
// Border colour is the complement of the current Matte (reference §9.4, ADR-0006),
// computed on the CPU and passed in.

import { WORKING_FORMAT } from '../constants.js';
import { wipeWGSL } from './shaders/wipe.wgsl.js';
import { WIPE_FAMILIES, hasBorder, hasSoft, isWideEdge } from '../core/wipe.js';
import { complementaryMatteIndex } from '../core/wipe.js';
import { aspectEffective } from '../core/positioner.js';
import { matteFlatColor } from '../core/matte.js';
import type { Size } from '../core/types.js';
import type { PanelState, WipeState } from '../state/state.js';

function softWidth(wipe: WipeState): number {
  if (!hasSoft(wipe.edge)) return 0;
  return isWideEdge(wipe.edge) ? 0.08 : 0.03;
}

function borderWidth(wipe: WipeState): number {
  if (!hasBorder(wipe.edge)) return 0;
  return isWideEdge(wipe.edge) ? 0.03 : 0.012;
}

export class WipePass {
  private readonly pipeline: GPURenderPipeline;
  private readonly sampler: GPUSampler;
  private readonly uniform: GPUBuffer;
  private readonly output: GPUTexture;
  private readonly scratch = new Float32Array(16);

  constructor(
    private readonly device: GPUDevice,
    size: Size,
  ) {
    const module = device.createShaderModule({ code: wipeWGSL });
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

  /** Composite A and B through the composed wipe at the given lever position. */
  render(texA: GPUTexture, texB: GPUTexture, state: PanelState): GPUTexture {
    const { device } = this;
    const wipe = state.transition.wipe;
    const [br, bg, bb] = matteFlatColor({
      colorIndex: complementaryMatteIndex(state.matte.colorIndex),
      level: 1,
      gradation: false,
    });

    const s = this.scratch;
    s[0] = Math.max(0, WIPE_FAMILIES.indexOf(wipe.family));
    s[1] = wipe.variant;
    s[2] = state.transition.lever;
    s[3] = softWidth(wipe);
    s[4] = borderWidth(wipe);
    s[5] = wipe.reverse ? 1 : 0;
    s[6] = aspectEffective(wipe) ? wipe.aspect : 0; // ASPECT applies only when its ON button is lit (§7)
    s[7] = wipe.modifiers.multi;
    s[8] = wipe.modifiers.pairing ? 1 : 0;
    s[9] = state.positioner.on ? 1 : 0;
    s[10] = state.positioner.x;
    s[11] = state.positioner.y;
    s[12] = br;
    s[13] = bg;
    s[14] = bb;
    s[15] = state.positioner.size;
    device.queue.writeBuffer(this.uniform, 0, s);

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
