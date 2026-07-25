// The internal Matte generator as a Source (ADR-0006/0008, reference §4). Renders the
// Colour Bar pattern or a flat linear colour with optional GRADATION into an owned
// working texture. The colour/level/gradation semantics live in core/matte.ts; the
// renderer pushes the current MatteState each frame via setMatte().

import { WORKING_FORMAT } from '../constants.js';
import { matteWGSL } from '../gpu/shaders/matte.wgsl.js';
import { matteFlatColor, isColourBar } from '../core/matte.js';
import type { Size } from '../core/types.js';
import type { MatteState } from '../state/state.js';
import type { Source } from './source.js';

export class MatteSource implements Source {
  readonly kind = 'generated' as const;
  readonly intrinsicSize: Size;
  isReady = false;

  private matte: MatteState = { colorIndex: 0, level: 1, gradation: false };

  private texture: GPUTexture | null = null;
  private pipeline: GPURenderPipeline | null = null;
  private uniform: GPUBuffer | null = null;
  private bindGroup: GPUBindGroup | null = null;

  constructor(
    private readonly device: GPUDevice,
    size: Size,
  ) {
    this.intrinsicSize = size;
  }

  /** Push the current Matte panel state (renderer calls this each frame). */
  setMatte(matte: MatteState): void {
    this.matte = matte;
  }

  async acquire(): Promise<void> {
    const { device } = this;
    const { width, height } = this.intrinsicSize;

    this.texture = device.createTexture({
      size: { width, height },
      format: WORKING_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    const module = device.createShaderModule({ code: matteWGSL });
    this.pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format: WORKING_FORMAT }] },
      primitive: { topology: 'triangle-list' },
    });

    // Uniforms: color (vec3f, 16-aligned) + gradation (f32) + isBars (f32) = 32 bytes.
    this.uniform = device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.uniform } }],
    });

    this.isReady = true;
  }

  getFrameTexture(device: GPUDevice): GPUTexture {
    const { texture, pipeline, uniform, bindGroup } = this;
    if (!texture || !pipeline || !uniform || !bindGroup) {
      throw new Error('MatteSource.getFrameTexture() called before acquire().');
    }

    const [r, g, b] = matteFlatColor(this.matte);
    const bars = isColourBar(this.matte.colorIndex) ? 1 : 0;
    const gradation = this.matte.gradation ? 1 : 0;
    // std140 layout: [r, g, b, pad, gradation, isBars, pad, pad]
    device.queue.writeBuffer(uniform, 0, new Float32Array([r, g, b, 0, gradation, bars, 0, 0]));

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        { view: texture.createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);

    return texture;
  }

  release(): void {
    this.texture?.destroy();
    this.uniform?.destroy();
    this.texture = null;
    this.pipeline = null;
    this.uniform = null;
    this.bindGroup = null;
    this.isReady = false;
  }
}
