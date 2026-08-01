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

/** requestVideoFrameCallback is near-universal in WebGPU-era browsers; feature-detected. */
type RvfcVideo = HTMLVideoElement & {
  requestVideoFrameCallback?(cb: () => void): number;
  cancelVideoFrameCallback?(handle: number): void;
};

export class VideoSource implements Source {
  readonly kind = 'video' as const;
  isReady = false;

  private texture: GPUTexture | null = null;
  private textureSize: Size = { width: 0, height: 0 };
  /** Copy gating: with rVFC, only frames the video actually PRESENTED are re-imported
   *  (a 30 fps clip on a 120 Hz display imports 30×/s, not 120×). Without rVFC the flag
   *  stays permanently true — the exact previous copy-every-frame behaviour. */
  private dirty = true;
  private rvfcHandle = 0;

  constructor(
    private readonly device: GPUDevice,
    readonly video: HTMLVideoElement,
  ) {
    const v = video as RvfcVideo;
    if (typeof v.requestVideoFrameCallback === 'function') {
      this.dirty = false;
      const onFrame = (): void => {
        this.dirty = true;
        this.rvfcHandle = v.requestVideoFrameCallback!(onFrame);
      };
      this.rvfcHandle = v.requestVideoFrameCallback(onFrame);
    }
  }

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
      const reallocated = this.ensureTexture(size);
      if (this.dirty || reallocated) {
        device.queue.copyExternalImageToTexture(
          { source: video },
          { texture: this.texture!, colorSpace: 'srgb' },
          size,
        );
        this.dirty = false;
      }
    } else {
      this.ensureTexture(this.intrinsicSize);
    }
    return this.texture!;
  }

  release(): void {
    const v = this.video as RvfcVideo;
    if (this.rvfcHandle && typeof v.cancelVideoFrameCallback === 'function') {
      v.cancelVideoFrameCallback(this.rvfcHandle);
      this.rvfcHandle = 0;
    }
    this.video.pause();
    this.texture?.destroy();
    this.texture = null;
    this.textureSize = { width: 0, height: 0 };
    this.isReady = false;
  }

  /** (Re)allocate the frame texture when the content size changes; starts out black.
   *  Returns true when a fresh (black) texture was allocated and needs a copy. */
  private ensureTexture(size: Size): boolean {
    if (this.texture && this.textureSize.width === size.width && this.textureSize.height === size.height) {
      return false;
    }
    this.texture?.destroy();
    this.texture = this.device.createTexture({
      size: { width: size.width, height: size.height },
      format: 'rgba8unorm-srgb',
      usage:
        GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.textureSize = size;
    return true;
  }
}
