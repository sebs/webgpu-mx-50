// Source monitors for Source 1 and Source 2 (ADR-0008 video path), styled per
// docs/STYLEGUIDE.md: each feed is a monitor card — video, scanline veil, corner
// label, tally — with a caption row holding the feed controls. The feed itself is an
// HTMLVideoElement the VideoSource reads: by default a self-contained procedural clip
// (animated 2D canvas via captureStream — no assets, no network); the file picker
// swaps in any local video file without touching the Source binding.
//
// Tallies are display-only and driven from outside (main.ts derives them from the
// store snapshot): 'onair' when the source feeds Program Out, 'ready' when it is
// selected on a bus. This component never reads the store (ADR-0011 stays one-way).
//
// Presentation-side demo content: draws on wall-clock time, never touches the
// logical clock (ADR-0012 stays authoritative for the mixer).

import { ensureTheme } from './theme.js';

const FEED_W = 640;
const FEED_H = 360;

const STYLE = `
mx-demo-feeds { display: flex; flex-direction: column; gap: 10px; }
mx-demo-feeds .mon-caption { display: flex; align-items: center; gap: 6px; margin-top: 6px; }
mx-demo-feeds .mon-caption .mx-note { flex: 1; letter-spacing: 0.18em; }
`;

/** captureStream is universal in WebGPU-era browsers, but keep the lib floor honest. */
type CapturableCanvas = HTMLCanvasElement & {
  captureStream?(frameRate?: number): MediaStream;
};

type DrawFn = (ctx: CanvasRenderingContext2D, t: number, frame: number) => void;

export type TallyState = 'off' | 'ready' | 'onair';

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Feed 1 — colour bars, a bouncing ball, and a running timecode. */
function drawFeedOne(ctx: CanvasRenderingContext2D, t: number, frame: number): void {
  const bars = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
  const w = FEED_W / bars.length;
  for (let i = 0; i < bars.length; i++) {
    ctx.fillStyle = bars[i]!;
    ctx.fillRect(i * w, 0, w + 1, FEED_H);
  }
  const x = FEED_W * (0.5 + 0.42 * Math.sin(t * 0.9));
  const y = FEED_H * (0.55 - 0.35 * Math.abs(Math.sin(t * 2.1)));
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(0, FEED_H - 64, FEED_W, 64);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 40px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('FEED 1', 18, FEED_H - 32);
  const totalSeconds = Math.floor(frame / 60);
  const tc = `${pad2(Math.floor(totalSeconds / 60))}:${pad2(totalSeconds % 60)}:${pad2(frame % 60)}`;
  ctx.font = '32px ui-monospace, monospace';
  ctx.fillText(tc, FEED_W - 190, FEED_H - 32);
}

/** Feed 2 — a drifting starfield with an orbiting wireframe square. */
function drawFeedTwo(ctx: CanvasRenderingContext2D, t: number, _frame: number): void {
  const sky = ctx.createLinearGradient(0, 0, 0, FEED_H);
  sky.addColorStop(0, '#0a1030');
  sky.addColorStop(1, '#20104a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, FEED_W, FEED_H);
  let seed = 42;
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 90; i++) {
    seed = (seed * 48271) % 2147483647;
    const sx = (seed % FEED_W) + ((t * (10 + (i % 5) * 14)) % FEED_W);
    seed = (seed * 48271) % 2147483647;
    const sy = seed % FEED_H;
    const r = 1 + (i % 3);
    ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + i));
    ctx.fillRect((sx % FEED_W) - r / 2, sy - r / 2, r, r);
  }
  ctx.globalAlpha = 1;
  ctx.save();
  ctx.translate(FEED_W / 2 + 120 * Math.cos(t * 0.7), FEED_H / 2 + 70 * Math.sin(t * 0.7));
  ctx.rotate(t * 1.3);
  ctx.strokeStyle = '#7ee0ff';
  ctx.lineWidth = 5;
  ctx.strokeRect(-55, -55, 110, 110);
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 40px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('FEED 2', 18, 40);
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
}

export class MxDemoFeeds extends HTMLElement {
  private readonly feeds: Feed[] = [];
  private raf = 0;

  /** The two live feed elements, in Source-slot order (Source 1, Source 2). */
  get feedVideos(): readonly HTMLVideoElement[] {
    return this.feeds.map((feed) => feed.video);
  }

  constructor() {
    super();
    this.feeds.push(this.makeFeed(drawFeedOne), this.makeFeed(drawFeedTwo));
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
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  disconnectedCallback(): void {
    cancelAnimationFrame(this.raf);
    for (const feed of this.feeds) {
      if (feed.fileUrl) URL.revokeObjectURL(feed.fileUrl);
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
    };
    draw(ctx, 0, 0); // First frame before the loop starts, so the stream is never blank.
    this.usePattern(feed);
    return feed;
  }

  /** Point the feed's video at the live canvas stream. */
  private usePattern(feed: Feed): void {
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
  }

  /** Point the feed's video at a user-selected local clip (looped, muted). */
  private useFile(feed: Feed, file: File): void {
    feed.onPattern = false;
    feed.clipName = file.name;
    if (feed.fileUrl) URL.revokeObjectURL(feed.fileUrl);
    feed.fileUrl = URL.createObjectURL(file);
    feed.video.srcObject = null;
    feed.video.src = feed.fileUrl;
    feed.video.loop = true;
    void feed.video.play().catch(() => undefined);
    this.updateLabel(feed);
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
    monitor.append(feed.video, scan, label, tally);
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

    const pattern = document.createElement('button');
    pattern.type = 'button';
    pattern.className = 'mx-ghostbtn';
    pattern.textContent = 'Pattern';
    pattern.addEventListener('click', () => this.usePattern(feed));

    caption.append(name, load, pattern, picker);
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
