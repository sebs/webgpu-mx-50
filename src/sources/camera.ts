// Per-feed camera capture glue (ADR-0008, inputs-and-devices.feature). Thin wrapper over
// navigator.mediaDevices: getUserMedia is called ONLY from open(), which callers invoke
// inside a user-gesture handler — the app never prompts at boot. Browser-only,
// typechecked but CI-excluded (same status as control/midi.ts / serial.ts).

export interface CameraDevice {
  readonly deviceId: string;
  readonly label: string;
}

export interface CameraOpenResult {
  stream: MediaStream;
  /** The settled deviceId/label from the live track (post-grant, real label). */
  deviceId: string;
  label: string;
}

export class CameraFeedController {
  private current: MediaStream | null = null;
  private endedCb: ((deviceId: string) => void) | null = null;
  /** Generation counter: every open()/close() invalidates in-flight opens, so the losing
   *  side of a race stops its own tracks instead of leaking a live capture. */
  private generation = 0;

  constructor(private readonly media: MediaDevices | undefined = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined) {}

  get stream(): MediaStream | null {
    return this.current;
  }

  /**
   * Permission-gated — call ONLY from a user-gesture handler. Acquires the NEW stream
   * FIRST and only then swaps out the previous one, so a denied/failed request leaves the
   * feed's current content untouched (nothing is torn down up front). Concurrent opens and
   * an intervening close() cancel the in-flight request: its stream is stopped and the
   * promise rejects with an AbortError the caller treats as a silent no-op. Rejects with
   * the DOMException (NotAllowedError / NotFoundError / OverconstrainedError) otherwise.
   */
  async open(video: HTMLVideoElement, deviceId?: string): Promise<CameraOpenResult> {
    if (!this.media) throw new DOMException('mediaDevices unavailable', 'NotFoundError');
    const gen = ++this.generation;
    const stream = await this.media.getUserMedia({
      video: deviceId ? { deviceId: { exact: deviceId } } : true,
      audio: false,
    });
    if (gen !== this.generation) {
      // A newer open() or a close() superseded this request while the prompt was up.
      for (const track of stream.getTracks()) track.stop();
      throw new DOMException('camera request superseded', 'AbortError');
    }
    this.stopCurrent();
    this.current = stream;
    const track = stream.getVideoTracks()[0];
    const settledId = track?.getSettings().deviceId ?? deviceId ?? 'camera';
    if (track) {
      track.addEventListener('ended', () => {
        if (this.current === stream) this.current = null;
        this.endedCb?.(settledId);
      });
    }
    video.srcObject = stream;
    void video.play().catch(() => undefined);
    return { stream, deviceId: settledId, label: track?.label ?? '' };
  }

  private stopCurrent(): void {
    if (this.current) {
      for (const track of this.current.getTracks()) track.stop();
      this.current = null;
    }
  }

  /** Stop every track + detach srcObject (camera light off), and cancel any in-flight
   *  open(). stop() fires no 'ended', so deliberate switches never read as device loss. */
  close(video: HTMLVideoElement): void {
    this.generation++;
    this.stopCurrent();
    if (video.srcObject) video.srcObject = null;
  }

  /** Labeled videoinput devices; labels are blank strings until a grant has occurred. */
  async enumerate(): Promise<CameraDevice[]> {
    if (!this.media) return [];
    try {
      const all = await this.media.enumerateDevices();
      const out: CameraDevice[] = [];
      for (const d of all) {
        if (d.kind === 'videoinput') out.push({ deviceId: d.deviceId, label: d.label });
      }
      return out;
    } catch {
      return [];
    }
  }

  /** Subscribe to 'devicechange'; returns an unsubscribe. */
  onDeviceChange(cb: () => void): () => void {
    if (!this.media) return () => undefined;
    this.media.addEventListener('devicechange', cb);
    return () => this.media?.removeEventListener('devicechange', cb);
  }

  /** Fires when the OPEN stream's video track ends externally (unplug / OS revoke). */
  onEnded(cb: (deviceId: string) => void): void {
    this.endedCb = cb;
  }
}
