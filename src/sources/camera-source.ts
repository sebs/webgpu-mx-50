// The External Camera In (reference §10, ADR-0008): a gesture-gated camera-backed Source
// for the DSK key. Composes a VideoSource (the per-frame rgba8unorm-srgb copy) with the
// pure camera lifecycle (camera-lifecycle.ts); this class owns only the stream. acquire()
// is a hard no-op so registry.acquireAll() at boot can never prompt — attach() is the one
// getUserMedia entry, only ever called from the monitor's button click. Browser-only,
// typechecked but CI-excluded.

import { VideoSource } from './video-source.js';
import { CAMERA_UNBOUND, stepCamera } from './camera-lifecycle.js';
import type { CameraEvent, CameraLifecycle } from './camera-lifecycle.js';
import type { Size } from '../core/types.js';
import type { Source } from './source.js';

export type GetUserMedia = (c: MediaStreamConstraints) => Promise<MediaStream>;

const HAVE_CURRENT_DATA = 2;

export class CameraSource implements Source {
  readonly kind = 'camera' as const;
  /** Fired on every lifecycle step; main.ts bridges it to bindings + UI chrome. */
  onLifecycle: ((s: CameraLifecycle) => void) | null = null;

  private readonly inner: VideoSource;
  private state: CameraLifecycle = CAMERA_UNBOUND;
  private stream: MediaStream | null = null;

  constructor(
    device: GPUDevice,
    private readonly video: HTMLVideoElement,
    private readonly getMedia: GetUserMedia = (c) => navigator.mediaDevices.getUserMedia(c),
  ) {
    this.inner = new VideoSource(device, video);
  }

  get lifecycle(): CameraLifecycle {
    return this.state;
  }

  /** Live AND delivering decoded frames — a granted-but-black texture must not key
   *  (the DSK's low=0/high=1 defaults would fill the whole screen). */
  get isReady(): boolean {
    return this.state.phase === 'live' && this.video.readyState >= HAVE_CURRENT_DATA && this.video.videoWidth > 0;
  }

  get intrinsicSize(): Size {
    return this.inner.intrinsicSize;
  }

  /** NO-OP: boot-time acquireAll must never prompt. */
  acquire(): Promise<void> {
    return Promise.resolve();
  }

  private step(e: CameraEvent): void {
    this.state = stepCamera(this.state, e);
    this.onLifecycle?.(this.state);
  }

  /** Gesture-gated entry: getUserMedia({video, audio:false}), wire track.onended.
   *  Attaching while LIVE is a device switch: the current stream is released first
   *  (REQUEST does not transition out of 'live' — by design, so a stale grant can
   *  never clobber a healthy stream without this explicit detach). */
  async attach(deviceId?: string): Promise<CameraLifecycle> {
    if (this.state.phase === 'live') this.detach();
    this.step({ type: 'REQUEST' });
    if (this.state.phase !== 'requesting') return this.state;
    let stream: MediaStream;
    try {
      stream = await this.getMedia({ video: deviceId ? { deviceId: { exact: deviceId } } : true, audio: false });
    } catch {
      this.step({ type: 'DENIED' });
      return this.state;
    }
    if (this.state.phase !== 'requesting') {
      // Detached mid-prompt: the pure machine ignores the stale grant; stop the tracks.
      for (const track of stream.getTracks()) track.stop();
      return this.state;
    }
    this.stream = stream;
    this.video.srcObject = stream;
    await this.inner.acquire();
    void this.video.play().catch(() => undefined);
    const track = stream.getVideoTracks()[0];
    const settledId = track?.getSettings().deviceId ?? deviceId ?? 'ext-camera';
    if (track) {
      track.addEventListener('ended', () => {
        if (this.stream === stream) this.handleEnded();
      });
    }
    this.step({ type: 'GRANTED', deviceId: settledId });
    return this.state;
  }

  private handleEnded(): void {
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    this.video.srcObject = null;
    this.step({ type: 'TRACK_ENDED' });
  }

  detach(): void {
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    this.video.srcObject = null;
    this.step({ type: 'DETACH' });
  }

  getFrameTexture(device: GPUDevice): GPUTexture {
    return this.inner.getFrameTexture(device);
  }

  release(): void {
    this.detach();
    this.inner.release();
  }
}
