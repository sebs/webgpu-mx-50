// Measures the footage for a music video file (docs/MUSIC-VIDEO-FORMAT.md), the way
// video:analyse measures the song: for every clip its length, its shots (the cuts inside
// it) and the phases of each shot (where the picture changes without a cut — a camera
// move from the sky down to the street), and per phase the numbers the keys work with —
//
//   luma    10th / 50th / 90th percentile as the Luminance Key's SLICE and the DSK window
//           compare it (linear light, ADR-0005) — a DSK window up to the 10th percentile
//           draws only the darkest tenth of the picture
//   grey    the share of the picture with no colour to key (core/key.ts CHROMA_KEY_FLOOR)
//   hues    the main colours, with where they sit in the frame and how much of the
//           picture the Chroma Key removes at that HUE for a narrow, middle and wide SLICE
//
// and a contact sheet per clip. Shots come from ffmpeg's scene detection; check them on the
// sheet. Needs ffmpeg and ffprobe on PATH.
//
// Run: npm run video:clips -- video/hale-rock [more clips or folders …] [--json]
//   → video/render/clips/<folder>/<clip>.jpg

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHROMA_KEY_FLOOR, chromaKeyAlpha, decodeSrgb, hueOf, luminance } from '../src/core/key.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VIDEO = join(ROOT, 'video');
const EXTENSIONS = ['.mp4', '.mov', '.m4v', '.webm', '.mkv'];
const W = 96;
const H = 54;
const FPS = 4; // samples per second for the statistics
const SCENE = 0.4; // ffmpeg scene-change score that counts as a cut
const EDGE = 0.25; // a "cut" this close to either end is the encoder's first/last frame
const CHANGE = 0.3; // how far (0..1) the picture's colour and brightness move across a phase change
const PHASE = 2; // shortest phase, in seconds
const SLICES = [0.1, 0.25, 0.4];
const HUE_BINS = 36;
const HUE_NAMES = ['red', 'orange', 'yellow', 'lime', 'green', 'teal', 'cyan', 'azure', 'blue', 'violet', 'magenta', 'pink'];

const LINEAR = Array.from({ length: 256 }, (_, v) => decodeSrgb(v / 255));

function ffprobe(file) {
  const out = execFileSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate:format=duration', '-of', 'json', file],
    { encoding: 'utf8' },
  );
  const j = JSON.parse(out);
  const [num, den] = j.streams[0].r_frame_rate.split('/').map(Number);
  return { duration: Number(j.format.duration), width: j.streams[0].width, height: j.streams[0].height, fps: num / (den || 1) };
}

/** Times (s) of the cuts inside a clip; showinfo logs each selected frame to stderr. */
function cutTimes(file, duration) {
  const run = spawnSync('ffmpeg', ['-v', 'info', '-i', file, '-an', '-vf', `scale=320:-2,select='gt(scene,${SCENE})',showinfo`, '-f', 'null', '-'], {
    encoding: 'utf8',
    maxBuffer: 1 << 26,
  });
  if (run.status !== 0) throw new Error(`${file}: ffmpeg failed\n${run.stderr}`);
  const times = [];
  for (const m of run.stderr.matchAll(/pts_time:([\d.]+)/g)) {
    const t = Number(m[1]);
    if (t < EDGE || t > duration - EDGE) continue;
    if (!times.length || t - times[times.length - 1] > 0.3) times.push(t);
  }
  return times;
}

/** The decoded samples: FPS frames a second, W×H, 8-bit sRGB. */
function samples(file) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-an', '-vf', `fps=${FPS},scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {
    maxBuffer: 1 << 30,
  });
  const size = W * H * 3;
  const frames = [];
  for (let o = 0; o + size <= buf.length; o += size) frames.push(buf.subarray(o, o + size));
  return frames;
}

function percentile(sorted, q) {
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

function hueName(h) {
  return HUE_NAMES[Math.round(h * 12) % 12];
}

function where(meanRow) {
  return meanRow < 0.36 ? 'top' : meanRow > 0.64 ? 'bottom' : 'middle';
}

/** Statistics over the sampled frames of one shot. */
function shotStats(frames) {
  const lumas = [];
  const pixels = []; // [r, g, b] linear, for the key simulation
  const bins = Array.from({ length: HUE_BINS }, () => ({ n: 0, hue: 0, row: 0 }));
  let grey = 0;
  for (const f of frames) {
    for (let i = 0, p = 0; i < f.length; i += 3, p++) {
      const er = f[i] / 255;
      const eg = f[i + 1] / 255;
      const eb = f[i + 2] / 255;
      const r = LINEAR[f[i]];
      const g = LINEAR[f[i + 1]];
      const b = LINEAR[f[i + 2]];
      lumas.push(luminance(r, g, b));
      pixels.push(r, g, b);
      const y = luminance(er, eg, eb);
      const chroma = Math.hypot(er - y, eb - y);
      if (chroma < CHROMA_KEY_FLOOR[0]) {
        grey++;
        continue;
      }
      if (chroma < CHROMA_KEY_FLOOR[1]) continue;
      const h = hueOf(er, eg, eb);
      const bin = bins[Math.floor(h * HUE_BINS) % HUE_BINS];
      bin.n++;
      bin.hue += h;
      bin.row += Math.floor(p / W) / (H - 1);
    }
  }
  const total = lumas.length;
  lumas.sort((a, b) => a - b);

  // Peaks of the hue histogram: a bin above both neighbours, merged with them.
  const n = (k) => bins[(k + HUE_BINS) % HUE_BINS].n;
  const peaks = [];
  for (let k = 0; k < HUE_BINS; k++) {
    if (n(k) === 0 || n(k) < n(k - 1) || n(k) <= n(k + 1)) continue;
    const group = [k - 1, k, k + 1].map((j) => bins[(j + HUE_BINS) % HUE_BINS]);
    const count = group.reduce((s, b) => s + b.n, 0);
    // Average the hue round the wheel, so a red peak straddling 0 does not land on cyan.
    let x = 0;
    let y = 0;
    let row = 0;
    for (const b of group) {
      if (!b.n) continue;
      const h = b.hue / b.n;
      x += Math.cos(2 * Math.PI * h) * b.n;
      y += Math.sin(2 * Math.PI * h) * b.n;
      row += b.row;
    }
    const hue = (Math.atan2(y, x) / (2 * Math.PI) + 1) % 1;
    peaks.push({ hue: +hue.toFixed(3), share: count / total, row: row / count });
  }
  peaks.sort((a, b) => b.share - a.share);
  const main = peaks.filter((p) => p.share >= 0.03).slice(0, 3);

  // How much of the picture the Chroma Key removes at each main hue.
  for (const p of main) {
    p.keyed = SLICES.map((slice) => {
      let s = 0;
      for (let i = 0; i < pixels.length; i += 3) s += chromaKeyAlpha(pixels[i], pixels[i + 1], pixels[i + 2], p.hue, slice);
      return +(s / total).toFixed(3);
    });
  }

  return {
    luma: [0.1, 0.5, 0.9].map((q) => +percentile(lumas, q).toFixed(3)),
    grey: +(grey / total).toFixed(3),
    hues: main.map((p) => ({ hue: p.hue, name: hueName(p.hue), share: +p.share.toFixed(3), where: where(p.row), keyed: p.keyed })),
  };
}

/** A sample frame's look: shares of 12 hues among coloured pixels and of 4 brightness bands. */
function signature(f) {
  const v = new Float64Array(16);
  const n = f.length / 3;
  for (let i = 0; i < f.length; i += 3) {
    const er = f[i] / 255;
    const eg = f[i + 1] / 255;
    const eb = f[i + 2] / 255;
    const y = luminance(er, eg, eb);
    v[12 + Math.min(3, Math.floor(y * 4))] += 1 / n;
    if (Math.hypot(er - y, eb - y) >= CHROMA_KEY_FLOOR[1]) v[Math.floor(hueOf(er, eg, eb) * 12) % 12] += 1 / n;
  }
  return v;
}

/**
 * Where a shot's picture changes a lot without a cut — a camera move from the sky to the
 * street: the second after a point compared with the second before it, peaks above CHANGE,
 * at least PHASE seconds apart. `frames` start at `start` seconds; times are the clip's.
 */
function phaseChanges(frames, start, from, to) {
  const sigs = frames.map(signature);
  const mean = (a, b) => {
    const m = new Float64Array(16);
    for (let k = a; k < b; k++) for (let j = 0; j < 16; j++) m[j] += sigs[k][j] / (b - a);
    return m;
  };
  const dist = [];
  for (let k = 0; k < sigs.length; k++) {
    const t = start + k / FPS;
    if (t - from < PHASE || to - t < PHASE) {
      dist.push(0);
      continue;
    }
    const before = mean(k - FPS, k);
    const after = mean(k, k + FPS);
    let d = 0;
    for (let j = 0; j < 16; j++) d += Math.abs(after[j] - before[j]);
    dist.push(d / 2); // each half (hues, brightness) sums to at most 1
  }
  const changes = [];
  for (let k = 1; k + 1 < dist.length; k++) {
    if (dist[k] < CHANGE || dist[k] < dist[k - 1] || dist[k] < dist[k + 1]) continue;
    const t = start + k / FPS;
    const last = changes.length ? changes[changes.length - 1] : from;
    if (t - last >= PHASE) changes.push(t);
  }
  return changes;
}

function analyse(file, sheetDir) {
  const info = ffprobe(file);
  const cuts = cutTimes(file, info.duration);
  const frames = samples(file);
  const at = (from, to) => frames.filter((_f, k) => (k + 0.5) / FPS >= from && (k + 0.5) / FPS < to);
  const bounds = [0, ...cuts, info.duration];
  const shots = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const from = bounds[i];
    const to = bounds[i + 1];
    const first = Math.ceil(from * FPS);
    const inShot = frames.slice(first, Math.ceil(to * FPS));
    const edges = [from, ...phaseChanges(inShot, first / FPS, from, to), to];
    const phases = [];
    for (let j = 0; j + 1 < edges.length; j++) {
      const span = at(edges[j], edges[j + 1]);
      phases.push({ from: +edges[j].toFixed(2), to: +edges[j + 1].toFixed(2), ...shotStats(span.length ? span : frames.slice(0, 1)) });
    }
    shots.push({ from: +from.toFixed(3), to: +to.toFixed(3), phases });
  }

  mkdirSync(sheetDir, { recursive: true });
  const sheet = join(sheetDir, `${basename(file, extname(file))}.jpg`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-frames:v', '1', '-vf', `fps=8/${info.duration},scale=240:-2,tile=8x1`, sheet]);

  const rel = relative(VIDEO, file);
  const id = basename(file, extname(file));
  return {
    clip: { id, file: join(dirname(rel), `${id}.mp4`), duration: +info.duration.toFixed(3) },
    size: `${info.width}×${info.height}`,
    fps: +info.fps.toFixed(2),
    shots,
    sheet: relative(ROOT, sheet),
  };
}

function clipsIn(paths) {
  const out = [];
  for (const p of paths) {
    const full = resolve(p);
    if (!existsSync(full)) throw new Error(`${p}: not found`);
    if (statSync(full).isDirectory()) {
      for (const name of readdirSync(full).sort()) if (EXTENSIONS.indexOf(extname(name).toLowerCase()) !== -1) out.push(join(full, name));
    } else out.push(full);
  }
  return out;
}

const pct = (x) => `${Math.round(x * 100)}%`;

function print(r) {
  const s = process.stdout;
  s.write(`\n${r.clip.file}   ${r.clip.duration} s · ${r.size} · ${r.fps} fps · ${r.shots.length} shot${r.shots.length > 1 ? 's' : ''}\n`);
  s.write(`  ${JSON.stringify(r.clip)}\n`);
  r.shots.forEach((shot, i) => {
    const many = shot.phases.length > 1;
    s.write(`  shot ${i + 1}  ${shot.from.toFixed(2)}–${shot.to.toFixed(2)} s${many ? `, ${shot.phases.length} phases` : ''}\n`);
    for (const ph of shot.phases) {
      s.write(
        `    ${many ? `${ph.from.toFixed(2).padStart(6)}–${ph.to.toFixed(2).padStart(6)} s  ` : ''}luma ${ph.luma.map((v) => v.toFixed(2)).join(' / ')}   grey ${pct(ph.grey)}\n`,
      );
      for (const h of ph.hues) {
        s.write(
          `      hue ${h.hue.toFixed(3)} ${h.name.padEnd(7)} ${pct(h.share).padStart(4)} · ${h.where.padEnd(6)}  keyed at slice ${SLICES.join(' / ')}: ${h.keyed.map(pct).join(' / ')}\n`,
        );
      }
    }
  });
  s.write(`  sheet  ${r.sheet}\n`);
}

function main() {
  process.stdout.on('error', (error) => {
    if (error.code === 'EPIPE') process.exit(0);
    throw error;
  });
  const args = process.argv.slice(2);
  const json = args.indexOf('--json') !== -1;
  const paths = args.filter((a) => a !== '--json');
  if (!paths.length) {
    process.stderr.write('usage: npm run video:clips -- <video/folder | clip> [more …] [--json]\n');
    process.exit(2);
  }
  const results = [];
  for (const file of clipsIn(paths)) {
    const r = analyse(file, join(VIDEO, 'render', 'clips', relative(VIDEO, dirname(file))));
    results.push(r);
    if (!json) print(r);
  }
  if (json) process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
