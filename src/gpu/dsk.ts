// The Downstream Key pass (ADR-0004 `downstream-key` stage, reference §10): composites a
// keyed title over the finished composite, with the full EDGE-style ring (borders,
// attached shadows, drop shadow — core/dsk.ts geometry) and the Fade stage's DSK element
// applied as key opacity (reference §11 selective fading). Sits after Mix/Wipe — and,
// since the selective-fade rework, after the VIDEO-element fade. Owns its output texture.

import { WORKING_FORMAT } from '../constants.js';
import { dskWGSL } from './shaders/dsk.wgsl.js';
import { DSK_EDGE_MODE, dskEdgeColour, dskEdgeGeometry, dskEdgeGraded, dskFillColour, dskKeyWindow } from '../core/dsk.js';
import { elementFadeAmount } from '../core/fade.js';
import type { Size } from '../core/types.js';
import type { PanelState } from '../state/state.js';

export class DskPass {
  private readonly pipeline: GPURenderPipeline;
  private readonly sampler: GPUSampler;
  private readonly uniform: GPUBuffer;
  private readonly output: GPUTexture;
  private readonly aspectScale: number;
  private readonly scratch = new Float32Array(20);

  constructor(
    private readonly device: GPUDevice,
    size: Size,
  ) {
    const module = device.createShaderModule({ code: dskWGSL });
    this.pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format: WORKING_FORMAT }] },
      primitive: { topology: 'triangle-list' },
    });
    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.uniform = device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.output = device.createTexture({
      size: { width: size.width, height: size.height },
      format: WORKING_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.aspectScale = size.height / size.width;
  }

  /** Key the title (from `keyTex`) over `composite`; returns the owned output texture. */
  render(composite: GPUTexture, keyTex: GPUTexture, state: PanelState): GPUTexture {
    const { device } = this;
    const dsk = state.dsk;
    const { lo, hi } = dskKeyWindow(dsk);
    const [r, g, b] = dskFillColour(dsk, state.matte);
    const geo = dskEdgeGeometry(dsk.edge);
    const [er, eg, eb] = dskEdgeColour(dsk);
    const s = this.scratch;
    s[0] = dsk.on ? 1 : 0;
    s[1] = lo;
    s[2] = hi;
    s[3] = dsk.reverse ? 1 : 0;
    s[4] = r;
    s[5] = g;
    s[6] = b;
    s[7] = DSK_EDGE_MODE[geo.kind];
    s[8] = er;
    s[9] = eg;
    s[10] = eb;
    s[11] = geo.borderWidth;
    s[12] = geo.shadowOffset[0];
    s[13] = geo.shadowOffset[1];
    s[14] = geo.shadowOpacity;
    s[15] = dskEdgeGraded(dsk, state.matte) ? 1 : 0;
    s[16] = this.aspectScale;
    s[17] = elementFadeAmount(state.fade, 'dsk');
    s[18] = 0;
    s[19] = 0;
    device.queue.writeBuffer(this.uniform, 0, s);

    const bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: composite.createView() },
        { binding: 2, resource: keyTex.createView() },
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
