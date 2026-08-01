// A still-image Source (ADR-0008): a pre-decoded ImageBitmap uploaded EXACTLY once into
// an rgba8unorm-srgb texture — the bytes stay sRGB-encoded so sampling yields linear
// light (the exact VideoSource contract, ADR-0005). Takes the bitmap rather than a File
// so the still-blob rehydration path (blob → createImageBitmap → ImageSource) can reuse
// it unchanged. Browser/GPU glue, typechecked but CI-excluded.

import type { Size } from '../core/types.js';
import type { Source } from './source.js';

export class ImageSource implements Source {
  readonly kind = 'image' as const;
  isReady = false;

  private texture: GPUTexture | null = null;
  private fallback: GPUTexture | null = null;

  constructor(
    private readonly device: GPUDevice,
    private bitmap: ImageBitmap | null,
  ) {}

  get intrinsicSize(): Size {
    if (this.texture) return { width: this.texture.width, height: this.texture.height };
    if (this.bitmap) return { width: this.bitmap.width, height: this.bitmap.height };
    return { width: 2, height: 2 };
  }

  /** The single upload; closes the bitmap afterwards. */
  acquire(): Promise<void> {
    if (this.bitmap && !this.texture) {
      const { width, height } = this.bitmap;
      this.texture = this.device.createTexture({
        size: { width, height },
        format: 'rgba8unorm-srgb',
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this.device.queue.copyExternalImageToTexture(
        { source: this.bitmap },
        { texture: this.texture, colorSpace: 'srgb' },
        { width, height },
      );
      this.bitmap.close();
      this.bitmap = null;
      this.isReady = true;
    }
    return Promise.resolve();
  }

  /** Returns the same texture every frame — nothing is re-imported (still path). */
  getFrameTexture(): GPUTexture {
    if (this.texture) return this.texture;
    if (!this.fallback) {
      this.fallback = this.device.createTexture({
        size: { width: 2, height: 2 },
        format: 'rgba8unorm-srgb',
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
      });
    }
    return this.fallback;
  }

  release(): void {
    this.texture?.destroy();
    this.texture = null;
    this.fallback?.destroy();
    this.fallback = null;
    this.bitmap?.close();
    this.bitmap = null;
    this.isReady = false;
  }
}
