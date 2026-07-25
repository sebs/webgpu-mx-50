// A synthetic Source produced entirely on the GPU (ADR-0008). Phase 0 uses it as the
// first on-screen source: SMPTE-style colour bars with a moving sweep (test-pattern
// shader), rendered into an owned linear working texture (ADR-0005). This doubles as
// the Matte generator's flat-colour path in later phases.

import { WORKING_FORMAT } from '../constants.js';
import { testPatternWGSL } from '../gpu/shaders/test-pattern.wgsl.js';
import type { Size } from '../core/types.js';
import type { Source } from './source.js';

export interface GeneratedOptions {
  size: Size;
}

export class GeneratedSource implements Source {
  readonly kind = 'generated' as const;
  readonly intrinsicSize: Size;
  isReady = false;

  /** Animation phase in logical ticks; the app sets this each frame (see main.ts). */
  phase = 0;

  private texture: GPUTexture | null = null;
  private pipeline: GPURenderPipeline | null = null;
  private uniform: GPUBuffer | null = null;
  private bindGroup: GPUBindGroup | null = null;

  constructor(
    private readonly device: GPUDevice,
    options: GeneratedOptions,
  ) {
    this.intrinsicSize = options.size;
  }

  async acquire(): Promise<void> {
    const { device } = this;
    const { width, height } = this.intrinsicSize;

    this.texture = device.createTexture({
      size: { width, height },
      format: WORKING_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    const module = device.createShaderModule({ code: testPatternWGSL });
    this.pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format: WORKING_FORMAT }] },
      primitive: { topology: 'triangle-list' },
    });

    // Uniforms: resolution (vec2f) + phase (f32) + pad (f32) = 16 bytes.
    this.uniform = device.createBuffer({
      size: 16,
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
      throw new Error('GeneratedSource.getFrameTexture() called before acquire().');
    }

    const { width, height } = this.intrinsicSize;
    device.queue.writeBuffer(uniform, 0, new Float32Array([width, height, this.phase, 0]));

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: texture.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
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
