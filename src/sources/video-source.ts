// A live video Source backed by an HTMLVideoElement (ADR-0008): a camera stream, a
// canvas captureStream, or a decoded file — the element is the abstraction, so one
// implementation covers all three. Each frame is copied into an `rgba8unorm-srgb`
// texture: the bytes stay sRGB-encoded, so sampling yields linear light and the
// ADR-0005 working-space contract holds at every sample site without an extra pass.
//
// acquire() never waits on media readiness — boot must not block on autoplay policy
// or metadata timing. Until the element has a decodable frame the source shows black;
// the texture is (re)allocated lazily to the video's intrinsic size, so swapping the
// element's content for a differently-sized clip just works.

import type { Size } from '../core/types.js';
import type { Source } from './source.js';

const HAVE_CURRENT_DATA = 2;

export class VideoSource implements Source {
  readonly kind = 'video' as const;
  isReady = false;

  private texture: GPUTexture | null = null;
  private textureSize: Size = { width: 0, height: 0 };

  constructor(
    private readonly device: GPUDevice,
    readonly video: HTMLVideoElement,
  ) {}

  get intrinsicSize(): Size {
    if (this.video.videoWidth > 0 && this.video.videoHeight > 0) {
      return { width: this.video.videoWidth, height: this.video.videoHeight };
    }
    return this.textureSize.width > 0 ? this.textureSize : { width: 2, height: 2 };
  }

  async acquire(): Promise<void> {
    this.ensureTexture(this.intrinsicSize);
    this.isReady = true;
  }

  getFrameTexture(device: GPUDevice): GPUTexture {
    const { video } = this;
    const hasFrame =
      video.readyState >= HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0;
    if (hasFrame) {
      const size = { width: video.videoWidth, height: video.videoHeight };
      this.ensureTexture(size);
      device.queue.copyExternalImageToTexture(
        { source: video },
        { texture: this.texture!, colorSpace: 'srgb' },
        size,
      );
    } else {
      this.ensureTexture(this.intrinsicSize);
    }
    return this.texture!;
  }

  release(): void {
    this.video.pause();
    this.texture?.destroy();
    this.texture = null;
    this.textureSize = { width: 0, height: 0 };
    this.isReady = false;
  }

  /** (Re)allocate the frame texture when the content size changes; starts out black. */
  private ensureTexture(size: Size): void {
    if (this.texture && this.textureSize.width === size.width && this.textureSize.height === size.height) {
      return;
    }
    this.texture?.destroy();
    this.texture = this.device.createTexture({
      size: { width: size.width, height: size.height },
      format: 'rgba8unorm-srgb',
      usage:
        GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.textureSize = size;
  }
}
