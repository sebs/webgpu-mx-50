// The wipe combine pass (ADR-0009): composites A-bus and B-bus through the compositional
// wipe shader, driven by the lever and the composed WipeState. Owns its output texture.
// Border colour is the complement of the current Matte (reference §9.4, ADR-0006),
// computed on the CPU and passed in. Compression/Slide upload plain affines from
// core/wipe.ts; the Positioner inset is lever-sized (core/positioner.ts) and the
// Scene-Grabber freeze (reference §7) is captured pass-side on the sceneGrabber rising
// edge as a render blit (texB may lack COPY_SRC), then bound at binding 4.

import { WORKING_FORMAT } from '../constants.js';
import { wipeWGSL } from './shaders/wipe.wgsl.js';
import { presentWGSL } from './shaders/present.wgsl.js';
import { WIPE_FAMILIES, hasBorder, hasSoft, isWideEdge, blindsAxes, incomingRemap, outgoingRemap } from '../core/wipe.js';
import { complementaryMatteIndex } from '../core/wipe.js';
import { aspectEffective, effectiveInsetSize, grabCapture } from '../core/positioner.js';
import type { GrabCapture } from '../core/positioner.js';
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
  /** The Scene-Grabber freeze (reference §7): the B frame blitted at the grab instant. */
  private readonly freeze: GPUTexture;
  private readonly grabBlit: GPURenderPipeline;
  private grabPrev = false;
  private grab: GrabCapture = { cu: 0.5, cv: 0.5, half: 0.1, compressed: false };
  private readonly scratch = new Float32Array(36);

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
    const blitModule = device.createShaderModule({ code: presentWGSL });
    this.grabBlit = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: blitModule, entryPoint: 'vs' },
      fragment: { module: blitModule, entryPoint: 'fs', targets: [{ format: WORKING_FORMAT }] },
      primitive: { topology: 'triangle-list' },
    });
    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.uniform = device.createBuffer({ size: 144, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.output = device.createTexture({
      size: { width: size.width, height: size.height },
      format: WORKING_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.freeze = device.createTexture({
      size: { width: size.width, height: size.height },
      format: WORKING_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
  }

  /**
   * Track the Scene-Grabber edge (reference §7): on sceneGrabber's rising edge, latch the
   * inset geometry and blit `texB` into the pass-owned freeze texture. Called every EFFECT
   * frame — whatever the transition type — so the capture fires at press time. Release
   * needs no GPU work: the grabOn uniform simply drops to 0.
   */
  trackGrab(texB: GPUTexture, state: PanelState): void {
    const grabbed = state.positioner.on && state.positioner.sceneGrabber;
    if (grabbed && !this.grabPrev) {
      this.grab = grabCapture(state.positioner, state.transition.lever, state.transition.wipe.modifiers.compression);
      const encoder = this.device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          { view: this.freeze.createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' },
        ],
      });
      pass.setPipeline(this.grabBlit);
      pass.setBindGroup(
        0,
        this.device.createBindGroup({
          layout: this.grabBlit.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: this.sampler },
            { binding: 1, resource: texB.createView() },
          ],
        }),
      );
      pass.draw(3);
      pass.end();
      this.device.queue.submit([encoder.finish()]);
    }
    this.grabPrev = grabbed;
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

    const asp = aspectEffective(wipe) ? wipe.aspect : 0; // ASPECT applies only when its ON button is lit (§7)
    const p = state.transition.lever;
    const m = wipe.modifiers;
    const axes = m.blinds ? blindsAxes(wipe.family, wipe.variant) : { x: false, y: false };
    const rb = incomingRemap(wipe, p, asp);
    const ra = outgoingRemap(wipe, p, asp);
    const grabbed = state.positioner.on && state.positioner.sceneGrabber;

    const s = this.scratch;
    s[0] = Math.max(0, WIPE_FAMILIES.indexOf(wipe.family));
    s[1] = wipe.variant;
    s[2] = p;
    s[3] = softWidth(wipe);
    s[4] = borderWidth(wipe);
    s[5] = wipe.reverse ? 1 : 0;
    s[6] = asp;
    s[7] = m.multi;
    s[8] = m.pairing ? 1 : 0;
    s[9] = state.positioner.on ? 1 : 0;
    s[10] = state.positioner.x;
    s[11] = state.positioner.y;
    s[12] = br;
    s[13] = bg;
    s[14] = bb;
    s[15] = effectiveInsetSize(state.positioner.size, p); // the lever sizes the inset (§7)
    s[16] = m.compression;
    s[17] = m.slide;
    s[18] = axes.x ? 1 : 0;
    s[19] = axes.y ? 1 : 0;
    s[20] = rb ? rb.sx : 1;
    s[21] = rb ? rb.sy : 1;
    s[22] = rb ? rb.ox : 0;
    s[23] = rb ? rb.oy : 0;
    s[24] = ra ? ra.sx : 1;
    s[25] = ra ? ra.sy : 1;
    s[26] = ra ? ra.ox : 0;
    s[27] = ra ? ra.oy : 0;
    s[28] = grabbed ? 1 : 0;
    s[29] = this.grab.cu;
    s[30] = this.grab.cv;
    s[31] = this.grab.half;
    s[32] = this.grab.compressed ? 1 : 0;
    s[33] = 0;
    s[34] = 0;
    s[35] = 0;
    device.queue.writeBuffer(this.uniform, 0, s);

    const bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: texA.createView() },
        { binding: 2, resource: texB.createView() },
        { binding: 3, resource: { buffer: this.uniform } },
        { binding: 4, resource: this.freeze.createView() },
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
