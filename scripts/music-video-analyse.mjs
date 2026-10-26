// Measures a song for a music video file (docs/MUSIC-VIDEO-FORMAT.md): the tempo, the
// first downbeat, and the energy of every bar — the numbers `song.bpm` and
// `song.downbeat` need, and the map an author (or an LLM) cuts the sections against.
//
//   1. tempo: autocorrelation of an onset envelope, 70–180 bpm, then refined to 0.01 bpm
//      together with the beat phase on the low end (the kick)
//   2. the beat phase is pinned to the kick's attack by folding the waveform over the beat
//   3. the downbeat is the beat-in-four where the low end changes most from one bar to the
//      next — sections (drops, breaks) start on downbeats
//   4. per-bar energy, and suggested section starts where it jumps, snapped to 4 bars
//
// Heuristics, not ground truth: check the result by ear (the page's Shift+→ steps a bar).
// Needs ffmpeg on PATH.
//
// Run: npm run video:analyse -- video/song.wav [--json]

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const SR = 11025;

function decode(file) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], {
    maxBuffer: 1 << 30,
  });
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

/** One-pole low-pass, for the kick and bass. */
function lowpass(x, k) {
  const out = new Float32Array(x.length);
  let lp = 0;
  for (let i = 0; i < x.length; i++) {
    lp += k * (x[i] - lp);
    out[i] = lp;
  }
  return out;
}

/** RMS per hop. */
function envelope(x, hop, win) {
  const n = Math.max(0, Math.floor((x.length - win) / hop));
  const out = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let s = 0;
    for (let i = 0; i < win; i++) {
      const v = x[f * hop + i];
      s += v * v;
    }
    out[f] = Math.sqrt(s / win);
  }
  return out;
}

/** Positive log-energy flux. */
function onsets(env) {
  const out = new Float32Array(env.length);
  for (let f = 1; f < env.length; f++) out[f] = Math.max(0, Math.log(1e-4 + env[f]) - Math.log(1e-4 + env[f - 1]));
  return out;
}

function sampleAt(arr, t) {
  const i = Math.floor(t);
  const fr = t - i;
  return (arr[i] || 0) * (1 - fr) + (arr[i + 1] || 0) * fr;
}

function coarseTempo(x) {
  const hop = 256;
  const fps = SR / hop;
  const full = envelope(x, hop, 1024);
  const low = envelope(lowpass(x, 0.11), hop, 1024);
  const on = onsets(full);
  const onLow = onsets(low);
  for (let f = 0; f < on.length; f++) on[f] += 2 * onLow[f];
  const scores = [];
  for (let bpm = 70; bpm <= 180; bpm += 0.1) {
    const lag = (60 / bpm) * fps;
    let s = 0;
    for (let f = 0; f + 4 * lag < on.length; f++) {
      s += on[f] * (sampleAt(on, f + lag) + 0.5 * sampleAt(on, f + 2 * lag) + 0.25 * sampleAt(on, f + 4 * lag));
    }
    scores.push([bpm, s]);
  }
  scores.sort((a, b) => b[1] - a[1]);
  return scores;
}

/** Refine bpm (±0.6) and phase against the low-band onsets at a 6 ms hop. */
function refine(x, bpm0, length) {
  const hop = 64;
  const fps = SR / hop;
  const on = onsets(envelope(lowpass(x, 0.08), hop, 256).map((v) => v));
  const at = (t) => on[Math.round(t * fps)] || 0;
  const score = (bpm, t0) => {
    let s = 0;
    const p = 60 / bpm;
    for (let t = t0; t < length; t += p) s += at(t) + 0.5 * (at(t - 1 / fps) + at(t + 1 / fps));
    return s;
  };
  let best = [-1, bpm0, 0];
  for (let bpm = bpm0 - 0.6; bpm <= bpm0 + 0.6; bpm += 0.01) {
    const p = 60 / bpm;
    for (let t0 = 0; t0 < p; t0 += 0.004) {
      const s = score(bpm, t0);
      if (s > best[0]) best = [s, bpm, t0];
    }
  }
  return { bpm: best[1], phase: best[2] };
}

/** Pin the phase to the kick's attack: fold |x| over the beat and find the steepest rise. */
function kickPhase(x, bpm, phase, length) {
  const p = 60 / bpm;
  const bin = 0.004;
  const bins = Math.floor(p / bin);
  const sum = new Float64Array(bins);
  for (let t = phase; t < length - p; t += p) {
    for (let b = 0; b < bins; b++) {
      const s0 = Math.floor((t - p / 2 + b * bin) * SR);
      if (s0 < 0) continue;
      let a = 0;
      for (let i = 0; i < bin * SR; i++) a += Math.abs(x[s0 + i] || 0);
      sum[b] += a;
    }
  }
  let bestRise = -Infinity;
  let bestBin = Math.floor(bins / 2);
  for (let b = 2; b < bins; b++) {
    const rise = sum[b] - sum[b - 2];
    if (rise > bestRise) {
      bestRise = rise;
      bestBin = b - 1;
    }
  }
  let t = phase - p / 2 + bestBin * bin;
  while (t < 0) t += p;
  while (t >= p) t -= p;
  return t;
}

function main() {
  // Piping into `head` closes stdout early; that is not an error.
  process.stdout.on('error', (error) => {
    if (error.code === 'EPIPE') process.exit(0);
    throw error;
  });
  const args = process.argv.slice(2);
  const json = args.indexOf('--json') !== -1;
  const file = args.filter((a) => a !== '--json')[0];
  if (!file || !existsSync(file)) {
    process.stderr.write('usage: npm run video:analyse -- <song file> [--json]\n');
    process.exit(2);
  }
  const x = decode(file);
  const length = x.length / SR;

  const candidates = coarseTempo(x);
  const { bpm, phase } = refine(x, candidates[0][0], length);
  const beat0 = kickPhase(x, bpm, phase, length);
  const p = 60 / bpm;

  // Per-beat low-end energy, then which beat-in-four sees the biggest bar-to-bar changes.
  const low = lowpass(x, 0.05);
  const beatEnergy = [];
  for (let t = beat0; t + p < length; t += p) {
    let s = 0;
    const a = Math.floor(t * SR);
    const n = Math.floor(p * SR);
    for (let i = 0; i < n; i++) s += low[a + i] * low[a + i];
    beatEnergy.push(Math.sqrt(s / n));
  }
  const barSum = (k) => {
    let s = 0;
    for (let i = 0; i < 4; i++) s += beatEnergy[k + i] || 0;
    return s;
  };
  const change = [0, 0, 0, 0];
  for (let k = 4; k + 4 < beatEnergy.length; k++) change[k % 4] += Math.abs(barSum(k) - barSum(k - 4));
  let first = 0;
  for (let i = 1; i < 4; i++) if (change[i] > change[first]) first = i;
  const downbeat = beat0 + first * p;
  const bar = 4 * p;

  // Per-bar energy (whole band and low end), as 0..1 of the loudest bar.
  const full = lowpass(x, 1);
  const bars = [];
  for (let b = 0, t = downbeat; t + bar <= length + bar / 2; b++, t += bar) {
    const a = Math.floor(t * SR);
    const n = Math.min(Math.floor(bar * SR), x.length - a);
    if (n <= 0) break;
    let s = 0;
    let l = 0;
    for (let i = 0; i < n; i++) {
      s += full[a + i] * full[a + i];
      l += low[a + i] * low[a + i];
    }
    bars.push({ bar: b, time: +t.toFixed(3), energy: Math.sqrt(s / n), low: Math.sqrt(l / n) });
  }
  const maxE = Math.max(...bars.map((b) => b.energy)) || 1;
  const maxL = Math.max(...bars.map((b) => b.low)) || 1;
  for (const b of bars) {
    b.energy = +(b.energy / maxE).toFixed(3);
    b.low = +(b.low / maxL).toFixed(3);
  }

  // Section starts: where the low end's 2-bar average jumps by a quarter of its range or
  // more, snapped to 4-bar phrases. A section is "high" when its low end sits above the
  // middle of the range — drops are high, breaks and intros low.
  const lowAt = (i) => (bars[i] ? bars[i].low : 0);
  const minL = Math.min(...bars.map((b) => b.low));
  const mid = (minL + 1) / 2;
  const sections = [{ bar: 0, time: bars[0] ? bars[0].time : downbeat }];
  for (let i = 2; i + 1 < bars.length; i++) {
    const jump = (lowAt(i) + lowAt(i + 1)) / 2 - (lowAt(i - 2) + lowAt(i - 1)) / 2;
    if (Math.abs(jump) < 0.25) continue;
    const snapped = Math.round(i / 4) * 4;
    const last = sections[sections.length - 1];
    if (snapped - last.bar >= 4 && snapped < bars.length) sections.push({ bar: snapped, time: bars[snapped].time });
  }
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    const end = i + 1 < sections.length ? sections[i + 1].bar : bars.length;
    let sum = 0;
    for (let b = s.bar; b < end; b++) sum += bars[b].low;
    s.bars = end - s.bar;
    s.level = sum / Math.max(1, end - s.bar) > mid ? 'high' : 'low';
  }

  const result = {
    file,
    length: +length.toFixed(3),
    bpm: +bpm.toFixed(2),
    downbeat: +downbeat.toFixed(3),
    beatSeconds: +p.toFixed(5),
    barSeconds: +bar.toFixed(5),
    tempoCandidates: candidates.slice(0, 5).map(([b]) => +b.toFixed(1)),
    sections,
    bars,
  };

  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${file}\n`);
  process.stdout.write(`  length    ${result.length} s\n`);
  process.stdout.write(`  bpm       ${result.bpm}   (coarse candidates: ${result.tempoCandidates.join(', ')})\n`);
  process.stdout.write(`  downbeat  ${result.downbeat} s   (bar 0; one bar = ${result.barSeconds} s)\n`);
  process.stdout.write(`  for the file:  "song": { "file": "…", "bpm": ${result.bpm}, "downbeat": ${result.downbeat}, "length": ${result.length} }\n\n`);
  process.stdout.write('  suggested sections (bar · time · length · level):\n');
  for (const s of sections) {
    process.stdout.write(`    bar ${String(s.bar).padStart(4)}  ${s.time.toFixed(2).padStart(7)} s  ${String(s.bars).padStart(3)} bars  ${s.level}\n`);
  }
  process.stdout.write('\n  bars (energy · low end):\n');
  for (const b of bars) {
    process.stdout.write(
      `    ${String(b.bar).padStart(4)} ${b.time.toFixed(2).padStart(7)}  ${b.energy.toFixed(2)} ${b.low.toFixed(2)}  ${'#'.repeat(Math.round(b.low * 30))}\n`,
    );
  }
}

main();
