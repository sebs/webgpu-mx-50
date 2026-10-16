// Source monitors for Source 1–4 (ADR-0008 video path), styled per
// docs/STYLEGUIDE.md: each feed is a monitor card — video, scanline veil, corner
// label, tally — with a caption row holding the feed controls. The feed itself is an
// HTMLVideoElement the VideoSource reads: by default a self-contained procedural clip
// (animated 2D canvas via captureStream — no assets, no network); the caption buttons
// swap in a local video file, a still, a camera, or a WGSL shader feed
// (feed-shaders.ts, same captureStream route) without touching the Source binding.
//
// Tallies are display-only and driven from outside (main.ts derives them from the
// store snapshot): 'onair' when the source feeds Program Out, 'ready' when it is
// selected on a bus. This component never reads the store (ADR-0011 stays one-way).
//
// Presentation-side demo content: draws on wall-clock time, never touches the
// logical clock (ADR-0012 stays authoritative for the mixer).

import { ensureTheme } from './theme.js';
import { CameraFeedController } from '../sources/camera.js';
import { FeedShaderRunner, nextShader } from './feed-shaders.js';
import type { FeedShaderName } from './feed-shaders.js';
import { FEED_W, FEED_H, PATTERN_DRAWS } from './pattern-feeds.js';
import type { CapturableCanvas, DrawFn } from './pattern-feeds.js';

const STYLE = `
mx-demo-feeds { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-content: start; }
mx-demo-feeds .mon-caption { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; margin-top: 5px; }
mx-demo-feeds .mon-caption .mx-note { flex: 1; min-width: 0; letter-spacing: 0.14em; white-space: nowrap; }
`;

export type TallyState = 'off' | 'ready' | 'onair';

export type FeedProviderKind = 'generated' | 'video' | 'camera' | 'image';

export interface FeedBoundDetail {
  /** 0-based feed index; the SourceSlot is index + 1. */
  index: number;
  kind: FeedProviderKind;
  /** 'pattern:N' | 'file:<name>' | 'camera:<deviceId>' | 'image:<name>' */
  providerId: string;
  /** kind 'image' only: the picked file — the listener decodes it (GPU side). */
  file?: File;
  /** kind 'camera' only: the live stream (audio-adoption seam for the audio engine). */
  stream?: MediaStream;
}

export interface FeedUnavailableDetail {
  index: number;
  providerId: string;
}

interface Feed {
  video: HTMLVideoElement;
  canvas: CapturableCanvas;
  ctx: CanvasRenderingContext2D;
  draw: DrawFn;
  /** Object URL of a user-loaded clip, revoked when replaced. */
  fileUrl: string | null;
  onPattern: boolean;
  label: HTMLElement | null;
  tally: HTMLElement | null;
  clipName: string;
  /** Still-image overlay (kind 'image'). */
  still: HTMLImageElement | null;
  stillUrl: string | null;
  stillFile: File | null;
  /** Camera capture (kind 'camera'); constructed lazily on the first click. */
  camera: CameraFeedController | null;
  deviceSelect: HTMLSelectElement | null;
  /** WGSL shader feed (kind 'generated'); the runner is built lazily on the first click. */
  shader: FeedShaderRunner | null;
  shaderName: FeedShaderName | null;
}

export class MxDemoFeeds extends HTMLElement {
  private readonly feeds: Feed[] = [];
  private raf = 0;

  /** The four live feed elements, in Source-slot order (Source 1 … Source 4). */
  get feedVideos(): readonly HTMLVideoElement[] {
    return this.feeds.map((feed) => feed.video);
  }

  constructor() {
    super();
    this.feeds.push(
      ...PATTERN_DRAWS.map((draw) => this.makeFeed(draw)),
    );
  }

  /** Drive the monitor tally: 'onair' | 'ready' | 'off' (styleguide LED semantics). */
  setTally(index: number, state: TallyState): void {
    const feed = this.feeds[index];
    if (feed?.tally) feed.tally.setAttribute('data-state', state);
  }

  connectedCallback(): void {
    ensureTheme();
    if (!document.getElementById('mx-demo-feeds-style')) {
      const style = document.createElement('style');
      style.id = 'mx-demo-feeds-style';
      style.textContent = STYLE;
      document.head.appendChild(style);
    }

    this.feeds.forEach((feed, i) => this.appendChild(this.buildPanel(feed, i + 1)));

    const start = performance.now();
    const tick = (): void => {
      const t = (performance.now() - start) / 1000;
      const frame = Math.floor(t * 60);
      for (const feed of this.feeds) {
        if (feed.onPattern) feed.draw(feed.ctx, t, frame);
        else if (feed.shaderName && feed.shader) feed.shader.render(t);
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  disconnectedCallback(): void {
    cancelAnimationFrame(this.raf);
    for (const feed of this.feeds) {
      if (feed.fileUrl) URL.revokeObjectURL(feed.fileUrl);
      if (feed.stillUrl) URL.revokeObjectURL(feed.stillUrl);
      feed.camera?.close(feed.video);
    }
  }

  private makeFeed(draw: DrawFn): Feed {
    const canvas = document.createElement('canvas') as CapturableCanvas;
    canvas.width = FEED_W;
    canvas.height = FEED_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is unavailable for the demo feeds.');

    const video = document.createElement('video');
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;

    const feed: Feed = {
      video, canvas, ctx, draw, fileUrl: null, onPattern: true, label: null, tally: null, clipName: 'Pattern',
      still: null, stillUrl: null, stillFile: null, camera: null, deviceSelect: null,
      shader: null, shaderName: null,
    };
    draw(ctx, 0, 0); // First frame before the loop starts, so the stream is never blank.
    this.usePattern(feed, false); // construction: no listeners yet, nothing to emit

    return feed;
  }

  private emitBound(feed: Feed, kind: FeedProviderKind, providerId: string, extra?: { file?: File; stream?: MediaStream }): void {
    const detail: FeedBoundDetail = { index: this.feeds.indexOf(feed), kind, providerId, ...extra };
    this.dispatchEvent(new CustomEvent<FeedBoundDetail>('mx-feed-bound', { detail, bubbles: true }));
  }

  /** Park camera, shader, and still overlays before switching provider. */
  private parkExtras(feed: Feed): void {
    feed.camera?.close(feed.video);
    feed.shaderName = null; // the runner is kept for instant re-use; drawing stops
    if (feed.still) feed.still.hidden = true;
    if (feed.stillUrl) {
      URL.revokeObjectURL(feed.stillUrl);
      feed.stillUrl = null;
    }
    feed.stillFile = null;
  }

  /** Point the feed's video at the live canvas stream. */
  private usePattern(feed: Feed, emit = true): void {
    this.parkExtras(feed);
    feed.onPattern = true;
    feed.clipName = 'Pattern';
    if (feed.fileUrl) {
      URL.revokeObjectURL(feed.fileUrl);
      feed.fileUrl = null;
    }
    feed.video.removeAttribute('src');
    feed.video.loop = false;
    if (feed.canvas.captureStream) {
      feed.video.srcObject = feed.canvas.captureStream(60);
      void feed.video.play().catch(() => undefined);
    }
    this.updateLabel(feed);
    if (emit) this.emitBound(feed, 'generated', 'pattern:' + (this.feeds.indexOf(feed) + 1));
  }

  /** Point the feed's video at a user-selected local clip (looped; the audio engine's
   *  element tap governs audibility, so the element itself may be unmuted by the engine). */
  private useFile(feed: Feed, file: File): void {
    this.parkExtras(feed);
    feed.onPattern = false;
    feed.clipName = file.name;
    if (feed.fileUrl) URL.revokeObjectURL(feed.fileUrl);
    feed.fileUrl = URL.createObjectURL(file);
    feed.video.srcObject = null;
    feed.video.src = feed.fileUrl;
    feed.video.loop = true;
    void feed.video.play().catch(() => undefined);
    this.updateLabel(feed);
    this.emitBound(feed, 'video', 'file:' + file.name);
  }

  /** Gesture-gated camera capture for this feed (the click IS the gesture). */
  private async useCamera(feed: Feed, deviceId?: string): Promise<void> {
    if (!feed.camera) {
      feed.camera = new CameraFeedController();
      feed.camera.onEnded((endedId) => {
        // Device loss: fall back to the demo pattern (the wall never goes black) and
        // report the provider unavailable — a stand-in picture, not a rebinding.
        this.usePattern(feed, false);
        const detail: FeedUnavailableDetail = { index: this.feeds.indexOf(feed), providerId: 'camera:' + endedId };
        this.dispatchEvent(new CustomEvent<FeedUnavailableDetail>('mx-feed-unavailable', { detail, bubbles: true }));
      });
    }
    if (feed.still) feed.still.hidden = true;
    try {
      const result = await feed.camera.open(feed.video, deviceId);
      feed.onPattern = false;
      feed.shaderName = null; // the camera stream now owns the element
      feed.clipName = result.label || 'Camera';
      if (feed.fileUrl) {
        URL.revokeObjectURL(feed.fileUrl);
        feed.fileUrl = null;
      }
      feed.video.removeAttribute('src');
      this.updateLabel(feed);
      this.emitBound(feed, 'camera', 'camera:' + result.deviceId, { stream: result.stream });
      // Post-grant re-enumeration: labels are real now; reveal the device chooser.
      void feed.camera.enumerate().then((devices) => this.fillDevices(feed, devices.map((d) => ({ id: d.deviceId, label: d.label }))));
    } catch (error) {
      const name = (error as DOMException | null)?.name;
      if (name === 'AbortError') return; // superseded by a newer choice: silent no-op
      feed.clipName = name === 'NotFoundError' ? 'No camera' : 'Camera denied';
      this.updateLabel(feed);
      // The feed keeps its current content (open() acquires before it swaps); the button
      // stays clickable, so a re-prompt is one click away.
    }
  }

  /** WGSL shader feed: first click binds the first shader, further clicks cycle them.
   *  The shader renders into its own WebGPU canvas whose captureStream feeds the same
   *  video element every other provider uses — downstream stays the ADR-0008 video path. */
  private async useShader(feed: Feed): Promise<void> {
    const name = nextShader(feed.shaderName);
    if (!feed.shader) {
      try {
        feed.shader = await FeedShaderRunner.create(FEED_W, FEED_H);
      } catch {
        feed.clipName = 'No WebGPU';
        this.updateLabel(feed);
        return; // the feed keeps its current content; the button stays clickable
      }
    }
    this.parkExtras(feed);
    feed.onPattern = false;
    feed.shaderName = name;
    feed.shader.use(name);
    feed.shader.render(0); // first frame before the loop picks it up, so the stream is never blank
    feed.clipName = 'Shader · ' + name;
    if (feed.fileUrl) {
      URL.revokeObjectURL(feed.fileUrl);
      feed.fileUrl = null;
    }
    feed.video.removeAttribute('src');
    feed.video.loop = false;
    const canvas = feed.shader.canvas as CapturableCanvas;
    if (canvas.captureStream) {
      feed.video.srcObject = canvas.captureStream(60);
      void feed.video.play().catch(() => undefined);
    }
    this.updateLabel(feed);
    this.emitBound(feed, 'generated', 'shader:' + name);
  }

  private fillDevices(feed: Feed, devices: readonly { id: string; label: string }[]): void {
    const select = feed.deviceSelect;
    if (!select) return;
    select.innerHTML = '';
    for (const d of devices) {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.label || 'Camera';
      select.appendChild(opt);
    }
    select.hidden = devices.length === 0;
  }

  /** A picked still image: a single unchanging frame overlaid on the monitor. */
  private useStill(feed: Feed, file: File): void {
    feed.camera?.close(feed.video);
    feed.onPattern = false;
    feed.shaderName = null;
    feed.clipName = file.name;
    if (feed.fileUrl) {
      URL.revokeObjectURL(feed.fileUrl);
      feed.fileUrl = null;
    }
    feed.video.srcObject = null;
    feed.video.removeAttribute('src');
    if (feed.stillUrl) URL.revokeObjectURL(feed.stillUrl);
    feed.stillUrl = URL.createObjectURL(file);
    feed.stillFile = file;
    if (feed.still) {
      feed.still.src = feed.stillUrl;
      feed.still.hidden = false;
    }
    this.updateLabel(feed);
    this.emitBound(feed, 'image', 'image:' + file.name, { file });
  }

  private updateLabel(feed: Feed): void {
    if (!feed.label) return;
    const slot = this.feeds.indexOf(feed) + 1;
    feed.label.textContent = `SOURCE ${slot} · ${feed.clipName.toUpperCase()}`;
  }

  private buildPanel(feed: Feed, slot: number): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'mx-srcmon';

    const monitor = document.createElement('div');
    monitor.className = 'mx-monitor';
    const scan = document.createElement('div');
    scan.className = 'scan';
    const label = document.createElement('div');
    label.className = 'mon-label';
    const tally = document.createElement('span');
    tally.className = 'mx-tally';
    tally.setAttribute('data-state', 'off');
    tally.title = 'Tally: red = on Program Out, green = selected on a bus';
    const still = document.createElement('img');
    still.hidden = true;
    still.style.position = 'absolute';
    still.style.inset = '0';
    still.style.width = '100%';
    still.style.height = '100%';
    still.style.objectFit = 'cover';
    feed.still = still;
    monitor.append(feed.video, still, scan, label, tally);
    feed.label = label;
    feed.tally = tally;
    this.updateLabel(feed);

    const caption = document.createElement('div');
    caption.className = 'mon-caption';
    const name = document.createElement('span');
    name.className = 'mx-note';
    name.textContent = `Source ${slot} monitor`;

    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'video/*';
    picker.hidden = true;
    picker.addEventListener('change', () => {
      const file = picker.files && picker.files[0];
      if (file) this.useFile(feed, file);
    });

    const load = document.createElement('button');
    load.type = 'button';
    load.className = 'mx-ghostbtn';
    load.textContent = 'Load clip…';
    load.addEventListener('click', () => picker.click());

    const stillPicker = document.createElement('input');
    stillPicker.type = 'file';
    stillPicker.accept = 'image/*';
    stillPicker.hidden = true;
    stillPicker.addEventListener('change', () => {
      const file = stillPicker.files && stillPicker.files[0];
      if (file) this.useStill(feed, file);
    });
    const stillBtn = document.createElement('button');
    stillBtn.type = 'button';
    stillBtn.className = 'mx-ghostbtn';
    stillBtn.textContent = 'Still…';
    stillBtn.addEventListener('click', () => stillPicker.click());

    const cameraBtn = document.createElement('button');
    cameraBtn.type = 'button';
    cameraBtn.className = 'mx-ghostbtn';
    cameraBtn.textContent = 'Camera';
    cameraBtn.addEventListener('click', () => void this.useCamera(feed));

    const deviceSelect = document.createElement('select');
    deviceSelect.className = 'mx-ghostbtn';
    deviceSelect.hidden = true;
    deviceSelect.title = 'Camera device';
    deviceSelect.addEventListener('change', () => void this.useCamera(feed, deviceSelect.value));
    feed.deviceSelect = deviceSelect;

    const pattern = document.createElement('button');
    pattern.type = 'button';
    pattern.className = 'mx-ghostbtn';
    pattern.textContent = 'Pattern';
    pattern.addEventListener('click', () => this.usePattern(feed));

    const shaderBtn = document.createElement('button');
    shaderBtn.type = 'button';
    shaderBtn.className = 'mx-ghostbtn';
    shaderBtn.textContent = 'Shader';
    shaderBtn.title = 'WGSL shader feed — click again to cycle plasma → tunnel → waves';
    shaderBtn.addEventListener('click', () => void this.useShader(feed));

    caption.append(name, load, stillBtn, cameraBtn, deviceSelect, pattern, shaderBtn, picker, stillPicker);
    panel.append(monitor, caption);
    return panel;
  }
}

let defined = false;

/** Define the element (once) and return an instance with both feeds running. */
export function createDemoFeeds(): MxDemoFeeds {
  if (!defined) {
    customElements.define('mx-demo-feeds', MxDemoFeeds);
    defined = true;
  }
  return document.createElement('mx-demo-feeds') as MxDemoFeeds;
}
