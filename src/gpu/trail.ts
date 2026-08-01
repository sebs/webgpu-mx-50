// The Trail frame-memory accumulator (reference §8.8, ADR-0007): a ping-pong texture pair
// that bakes a corner-anchored, progressively-smaller copy of the bus frame every TIME
// interval (older copies decaying toward black), plus a per-frame composite that draws the
// compressed live lead on top. Deliberately PanelState-free (primitives only) so it can be
// reused downstream of any stage; all bookkeeping is render-side (precedent:
// BusProcessor.lastStrobeTick) and tick-driven (ADR-0012).

import { WORKING_FORMAT } from '../constants.js';
import { trailWGSL } from './shaders/trail.wgsl.js';
import { TRAIL_BAKE_OPACITY, TRAIL_DECAY, trailCopyRect, trailStep } from '../core/digital-effect.js';
import type { TrailCorner, TrailRect } from '../core/digital-effect.js';
import type { Size } from '../core/types.js';

export class TrailPass {
  private readonly pipeline: GPURenderPipeline;
  private readonly sampler: GPUSampler;
  private readonly bakeUniform: GPUBuffer;
  private readonly leadUniform: GPUBuffer;
  private readonly accum: [GPUTexture, GPUTexture];
  private readonly out: GPUTexture;
  /** Accumulator index holding the current trail. */
  private cur = 0;
  private engaged = false;
  private spawns = 0;
  private lastSpawnTick = Number.NEGATIVE_INFINITY;
  private readonly scratch = new Float32Array(8);

  constructor(
    private readonly device: GPUDevice,
    size: Size,
  ) {
    const module = device.createShaderModule({ code: trailWGSL });
    this.pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format: WORKING_FORMAT }] },
      primitive: { topology: 'triangle-list' },
    });
    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.bakeUniform = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.leadUniform = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const make = (): GPUTexture =>
      device.createTexture({
        size: { width: size.width, height: size.height },
        format: WORKING_FORMAT,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
    this.accum = [make(), make()];
    this.out = make();
  }

  /** Disengage: the next render() restarts the shrink sequence with cleared accumulators. */
  reset(): void {
    this.engaged = false;
  }

  private writeRect(buffer: GPUBuffer, rect: TrailRect, decay: number, opacity: number): void {
    const s = this.scratch;
    s[0] = rect.x;
    s[1] = rect.y;
    s[2] = rect.width;
    s[3] = rect.height;
    s[4] = decay;
    s[5] = opacity;
    s[6] = 0;
    s[7] = 0;
    this.device.queue.writeBuffer(buffer, 0, s);
  }

  private bindGroup(acc: GPUTexture, source: GPUTexture, uniform: GPUBuffer): GPUBindGroup {
    return this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: acc.createView() },
        { binding: 2, resource: source.createView() },
        { binding: 3, resource: { buffer: uniform } },
      ],
    });
  }

  /**
   * Accumulate `source` (live output, or the Still/Strobe-held frame) into the trail and
   * return the composite: the decaying copies with the compressed lead drawn on top.
   */
  render(source: GPUTexture, corner: TrailCorner, periodTicks: number, tick: number): GPUTexture {
    const { device } = this;
    const encoder = device.createCommandEncoder();

    let spawn: boolean;
    if (!this.engaged) {
      this.engaged = true;
      this.spawns = 0;
      // Clear both accumulators so a fresh engagement starts from black.
      for (const tex of this.accum) {
        encoder
          .beginRenderPass({
            colorAttachments: [
              { view: tex.createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' },
            ],
          })
          .end();
      }
      spawn = true;
    } else {
      spawn = tick - this.lastSpawnTick >= periodTicks;
    }

    if (spawn) {
      const rect = trailCopyRect(trailStep(this.spawns), corner);
      this.writeRect(this.bakeUniform, rect, TRAIL_DECAY, TRAIL_BAKE_OPACITY);
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: this.accum[1 - this.cur]!.createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.bindGroup(this.accum[this.cur]!, source, this.bakeUniform));
      pass.draw(3);
      pass.end();
      this.cur = 1 - this.cur;
      this.spawns++;
      this.lastSpawnTick = tick;
    }

    // The lead is one step smaller than the newest baked copy: the live image leads the trail.
    const leadRect = trailCopyRect(trailStep(this.spawns), corner);
    this.writeRect(this.leadUniform, leadRect, 1, 1);
    const lead = encoder.beginRenderPass({
      colorAttachments: [
        { view: this.out.createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' },
      ],
    });
    lead.setPipeline(this.pipeline);
    lead.setBindGroup(0, this.bindGroup(this.accum[this.cur]!, source, this.leadUniform));
    lead.draw(3);
    lead.end();
    device.queue.submit([encoder.finish()]);
    return this.out;
  }
}
