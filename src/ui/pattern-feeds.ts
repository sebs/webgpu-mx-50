// The four procedural Source feeds (ADR-0008 video path): self-contained animated 2D
// clips — no assets, no network — each exposed as an HTMLVideoElement fed by the
// canvas's captureStream, which is exactly the element a VideoSource reads. The monitor
// wall (demo-feeds.ts) shows them with pickers around them; a bare <mx-mixer feeds>
// binds them straight into its registry with no wall at all (ADR-0017 amendment).
//
// Drawing is caller-driven: `draw(t, frame)` paints one frame, so a host can tie the
// feeds to its own cadence — the mixer draws on its logical clock, which is also what
// pauses the feeds whenever the mixer's render loop is paused.

export const FEED_W = 640;
export const FEED_H = 360;

/** captureStream is universal in WebGPU-era browsers, but keep the lib floor honest. */
export type CapturableCanvas = HTMLCanvasElement & {
  captureStream?(frameRate?: number): MediaStream;
};

export type DrawFn = (ctx: CanvasRenderingContext2D, t: number, frame: number) => void;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Feed 1 — colour bars, a bouncing ball, and a running timecode. */
export function drawFeedOne(ctx: CanvasRenderingContext2D, t: number, frame: number): void {
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
  ctx.fillRect(FEED_W - 210, FEED_H - 64, 210, 64);
  const totalSeconds = Math.floor(frame / 60);
  const tc = `${pad2(Math.floor(totalSeconds / 60))}:${pad2(totalSeconds % 60)}:${pad2(frame % 60)}`;
  ctx.fillStyle = '#ffffff';
  ctx.font = '32px ui-monospace, monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText(tc, FEED_W - 190, FEED_H - 32);
}

/** Feed 2 — a drifting starfield with an orbiting wireframe square. */
export function drawFeedTwo(ctx: CanvasRenderingContext2D, t: number, _frame: number): void {
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
}

/** Feed 3 — teal ground with pulsing concentric rings. */
export function drawFeedThree(ctx: CanvasRenderingContext2D, t: number, _frame: number): void {
  const sea = ctx.createLinearGradient(0, 0, FEED_W, FEED_H);
  sea.addColorStop(0, '#062e2a');
  sea.addColorStop(1, '#0a4d3c');
  ctx.fillStyle = sea;
  ctx.fillRect(0, 0, FEED_W, FEED_H);
  const cx = FEED_W / 2 + 60 * Math.sin(t * 0.5);
  const cy = FEED_H / 2 + 30 * Math.cos(t * 0.8);
  for (let i = 0; i < 7; i++) {
    const r = ((t * 60 + i * 46) % 320) + 6;
    ctx.strokeStyle = '#3fe0b0';
    ctx.globalAlpha = Math.max(0, 1 - r / 320) * 0.9;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Feed 4 — a warm scrolling checkerboard with a roaming diamond. */
export function drawFeedFour(ctx: CanvasRenderingContext2D, t: number, _frame: number): void {
  const tile = 40;
  const offset = (t * 60) % (tile * 2);
  for (let y = -1; y < FEED_H / tile + 1; y++) {
    for (let x = -2; x < FEED_W / tile + 2; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#7a3d0e' : '#b8641a';
      ctx.fillRect(x * tile + offset - tile, y * tile, tile, tile);
    }
  }
  ctx.save();
  ctx.translate(FEED_W / 2 + 140 * Math.sin(t * 1.1), FEED_H / 2 + 80 * Math.cos(t * 0.6));
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = '#ffd98a';
  ctx.fillRect(-45, -45, 90, 90);
  ctx.restore();
}

/** The four patterns in Source-slot order (Source 1 … Source 4). */
export const PATTERN_DRAWS: readonly DrawFn[] = [drawFeedOne, drawFeedTwo, drawFeedThree, drawFeedFour];

/** One procedural feed: a 2D canvas, its captured stream, and the video element carrying it. */
export interface PatternFeed {
  readonly canvas: CapturableCanvas;
  readonly video: HTMLVideoElement;
  /** Paint one frame at `t` seconds / `frame` frames. */
  draw(t: number, frame: number): void;
}

/** Build feed `index` (0-based, Source slot = index + 1), with its first frame painted. */
export function createPatternFeed(index: number): PatternFeed {
  const drawFn = PATTERN_DRAWS[index % PATTERN_DRAWS.length]!;
  const canvas = document.createElement('canvas') as CapturableCanvas;
  canvas.width = FEED_W;
  canvas.height = FEED_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is unavailable for the pattern feeds.');
  drawFn(ctx, 0, 0); // first frame before any loop runs, so the stream is never blank

  const video = document.createElement('video');
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  if (canvas.captureStream) {
    video.srcObject = canvas.captureStream(60);
    void video.play().catch(() => undefined);
  }
  return { canvas, video, draw: (t, frame) => drawFn(ctx, t, frame) };
}
