// The per-bus processing pass (ADR-0004 per-bus stages): applies Colour Correction and
// the filter Digital Effects to one bus's frame, into an owned output texture. One
// instance per bus. Reads the panel snapshot to decide which effects apply to this bus
// (the Digital Effect block targets a single bus).

import { WORKING_FORMAT } from '../constants.js';
import { busEffectWGSL } from './shaders/bus-effect.wgsl.js';
import { TrailPass } from './trail.js';
import { ccActive, joystickActive } from '../core/colour-correct.js';
import { freezeActiveOn, intervalTicks, multiTilesPerAxis, strobeInterval, trailInterval } from '../core/digital-effect.js';
import {
  IDLE_AV_STROBE_HOLD,
  avSynchroPulsedOn,
  effectiveFilterOn,
  effectiveStillOn,
  stepAvSynchroStrobe,
} from '../core/av-synchro.js';
import type { AvSynchroStrobeHold, AvSynchroStrobeStep } from '../core/av-synchro.js';
import type { Size } from '../core/types.js';
import type { BusId } from '../core/types.js';
import type { AvSynchroEffect, PanelState } from '../state/state.js';

/** Shared empty pulsed set — avoids a per-frame allocation when A/V Synchro is disarmed. */
export const NO_PULSE: readonly AvSynchroEffect[] = [];

export class BusProcessor {
  private readonly pipeline: GPURenderPipeline;
  private readonly sampler: GPUSampler;
  private readonly uniform: GPUBuffer;
  private readonly output: GPUTexture;
  /** Held frame for Still/Strobe (the freeze texture, ADR-0007). */
  private readonly freeze: GPUTexture;
  private captured = false;
  private lastStrobeTick = Number.NEGATIVE_INFINITY;
  private avStrobeHold: AvSynchroStrobeHold = IDLE_AV_STROBE_HOLD;
  /** The Trail frame-memory accumulator (reference §8.8, ADR-0007). */
  private readonly trail: TrailPass;
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
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
    });
    this.freeze = device.createTexture({
      size: { width: size.width, height: size.height },
      format: WORKING_FORMAT,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.trail = new TrailPass(device, size);
  }

  /**
   * Apply this bus's colour correction + active filters to `sourceTex`, hold the frame if
   * Still/Strobe is engaged or A/V Synchro is pulsing a freeze (ADR-0007, reference §8.9),
   * then accumulate the Trail (reference §8.8). The filter flags are EFFECTIVE flags —
   * latched ON or pulsed this frame (core/av-synchro.ts). Returns the frame to composite.
   */
  render(
    sourceTex: GPUTexture,
    state: PanelState,
    bus: BusId,
    tick: number,
    pulsed: readonly AvSynchroEffect[] = NO_PULSE,
  ): GPUTexture {
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
    s[7] = effectiveFilterOn(de, bus, 'nega', pulsed) ? 1 : 0;
    s[8] = effectiveFilterOn(de, bus, 'mosaic', pulsed) ? 1 : 0;
    s[9] = effectiveFilterOn(de, bus, 'mono', pulsed) ? 1 : 0;
    s[10] = effectiveFilterOn(de, bus, 'paint', pulsed) ? 1 : 0;
    s[11] = de.mosaicSize;
    s[12] = de.paintLevel;
    s[13] = de.bus === bus && de.freeze.multi > 0 ? multiTilesPerAxis(de.freeze.multi) : 1;
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

    // Freeze family: Still (latched or pulsed) holds one captured frame; latched Strobe
    // re-captures on its interval; a PULSED Strobe captures on the audio trigger edge and
    // holds for the Effect Interval Timer window (ADR-0007, reference §8.9). All sample
    // the freeze texture between captures.
    const stillOn = effectiveStillOn(de, bus, pulsed);
    const strobeLatched = freezeActiveOn(de, bus, 'strobe');
    const period = intervalTicks(strobeInterval(de.strobeTime));
    let step: AvSynchroStrobeStep;
    if (strobeLatched) {
      // Latched Strobe dominates; kill any residual pulsed window.
      this.avStrobeHold = IDLE_AV_STROBE_HOLD;
      step = { hold: IDLE_AV_STROBE_HOLD, capture: false, holding: false };
    } else {
      // The stepper advances EVERY frame so pulse edge detection never desyncs.
      step = stepAvSynchroStrobe(this.avStrobeHold, avSynchroPulsedOn(de, bus, 'strobe', pulsed), tick, period);
      this.avStrobeHold = step.hold;
    }

    let held: GPUTexture;
    if (!stillOn && !strobeLatched && !step.holding) {
      this.captured = false;
      this.lastStrobeTick = Number.NEGATIVE_INFINITY;
      held = this.output;
    } else {
      let capture = false;
      if (stillOn) {
        capture = !this.captured;
      } else if (strobeLatched) {
        if (tick - this.lastStrobeTick >= period) {
          capture = true;
          this.lastStrobeTick = tick;
        }
      } else {
        capture = step.capture || !this.captured;
      }
      if (capture) {
        this.captured = true;
        const copy = device.createCommandEncoder();
        copy.copyTextureToTexture(
          { texture: this.output },
          { texture: this.freeze },
          { width: this.size.width, height: this.size.height },
        );
        device.queue.submit([copy.finish()]);
      }
      held = this.freeze;
    }

    // Trail (reference §8.8, ADR-0007): trails whatever the freeze family yields — live
    // output, the Still-held frame (LED-blink case), or the Strobe-refreshed frame — with
    // zero special cases.
    if (!freezeActiveOn(de, bus, 'trail')) {
      this.trail.reset();
      return held;
    }
    return this.trail.render(held, de.trailCorner, intervalTicks(trailInterval(de.trailTime)), tick);
  }
}
