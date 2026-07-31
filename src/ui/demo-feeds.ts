// Demo video feeds for Source 1 and Source 2 (ADR-0008 video path). Each feed is an
// HTMLVideoElement the VideoSource reads from; by default it plays a self-contained
// procedural clip (an animated 2D canvas via captureStream — no assets, no network),
// and a per-feed file picker swaps in any local video file without touching the
// Source binding. The component shows both feeds as labelled preview monitors, so
// what the Mix/Wipe lever blends is visible before it hits the buses.
//
// This is presentation-side demo content: it draws on wall-clock time and never
// touches the store or the logical clock (ADR-0012 stays authoritative for the mixer).

const FEED_W = 640;
const FEED_H = 360;

const STYLE = `
mx-demo-feeds { display:block; width:min(100%,1280px); margin:0.75rem auto 0; color:#e6e8eb; }
mx-demo-feeds .feeds { display:flex; gap:0.75rem; flex-wrap:wrap; }
mx-demo-feeds .feed { flex:1 1 260px; padding:0.5rem; border:1px solid #23272e; border-radius:8px; background:#111418; }
mx-demo-feeds .feed video { width:100%; aspect-ratio:16/9; background:#000; border-radius:4px; display:block; object-fit:cover; }
mx-demo-feeds .feed .bar { display:flex; gap:0.5rem; align-items:center; margin-top:0.4rem; }
mx-demo-feeds .feed .label { font-size:0.72rem; letter-spacing:0.04em; text-transform:uppercase; color:#8b93a1; flex:1; }
mx-demo-feeds .feed button { font:inherit; font-size:0.8rem; padding:0.25rem 0.55rem; border-radius:6px; border:1px solid #2a2f38; background:#171b21; color:#cfd4dc; cursor:pointer; }
mx-demo-feeds .feed button:hover { background:#1e232b; }
`;

/** captureStream is universal in WebGPU-era browsers, but keep the lib floor honest. */
type CapturableCanvas = HTMLCanvasElement & {
  captureStream?(frameRate?: number): MediaStream;
};

type DrawFn = (ctx: CanvasRenderingContext2D, t: number, frame: number) => void;

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
  // Bouncing ball on a sine path.
  const x = FEED_W * (0.5 + 0.42 * Math.sin(t * 0.9));
  const y = FEED_H * (0.55 - 0.35 * Math.abs(Math.sin(t * 2.1)));
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, 26, 0, Math.PI * 2);
  ctx.fill();
  // Ident + timecode strip.
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
  // Deterministic star placement (tiny LCG) so the feed needs no stored state.
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
  // Orbiting wireframe square.
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

  connectedCallback(): void {
    if (!document.getElementById('mx-demo-feeds-style')) {
      const style = document.createElement('style');
      style.id = 'mx-demo-feeds-style';
      style.textContent = STYLE;
      document.head.appendChild(style);
    }

    const row = document.createElement('div');
    row.className = 'feeds';
    this.feeds.forEach((feed, i) => row.appendChild(this.buildPanel(feed, i + 1)));
    this.appendChild(row);

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

    const feed: Feed = { video, canvas, ctx, draw, fileUrl: null, onPattern: true };
    draw(ctx, 0, 0); // First frame before the loop starts, so the stream is never blank.
    this.usePattern(feed);
    return feed;
  }

  /** Point the feed's video at the live canvas stream. */
  private usePattern(feed: Feed): void {
    feed.onPattern = true;
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
  }

  /** Point the feed's video at a user-selected local clip (looped, muted). */
  private useFile(feed: Feed, file: File): void {
    feed.onPattern = false;
    if (feed.fileUrl) URL.revokeObjectURL(feed.fileUrl);
    feed.fileUrl = URL.createObjectURL(file);
    feed.video.srcObject = null;
    feed.video.src = feed.fileUrl;
    feed.video.loop = true;
    void feed.video.play().catch(() => undefined);
  }

  private buildPanel(feed: Feed, slot: number): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'feed';

    const bar = document.createElement('div');
    bar.className = 'bar';
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = `Source ${slot} — live feed`;

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
    load.textContent = 'Load clip…';
    load.addEventListener('click', () => picker.click());

    const pattern = document.createElement('button');
    pattern.type = 'button';
    pattern.textContent = 'Pattern';
    pattern.addEventListener('click', () => this.usePattern(feed));

    bar.append(label, load, pattern, picker);
    panel.append(feed.video, bar);
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
