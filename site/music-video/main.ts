// music-video.html — the edit in edit.ts, played on one <mx-mixer> against the song.
//
// The song is the clock: every frame reads its playhead, loads the cue checkpoint for that
// time (only when the cue changes), dispatches the lane values on top, re-patches clips
// into the inputs and keeps each clip where the score says it is. Pausing and scrubbing
// therefore need no special path — the picture is a function of the playhead.
//
// Media is fetched into Blobs first: object URLs seek anywhere, which a plain dev server
// without Range support cannot offer, and the page knows everything is decodable before
// the first cut.
//
// A/V Synchro (reference §8.9) listens to the song itself: a low-passed analyser tap
// measures the kick, normalised to its recent peak, and the pure gate decides which
// effects pulse this frame — the same avPulse seam the console uses.

import { defineMixer } from '../../src/ui/mixer.js';
import { VideoSource } from '../../src/sources/video-source.js';
import { avSynchroActiveEffects } from '../../src/core/av-synchro.js';
import { MUSIC_VIDEO } from './edit.js';
import { CLIPS, INPUTS, SONG_FILE, at, clipTime, cueIndexAt, laneCommandsAt, markerAt } from './score.js';
import type { MxMixer } from '../../src/ui/mixer.js';
import type { ClipId, ClipPlay, CompiledCue, Input } from './score.js';
import type { PanelState } from '../../src/state/state.js';

const MEDIA = 'video/web/';
const score = MUSIC_VIDEO;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

// --- media ------------------------------------------------------------------------------

/** Fetch a file as an object URL, reporting bytes as they arrive. */
async function fetchBlobUrl(url: string, onBytes: (n: number) => void): Promise<string> {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`${url}: HTTP ${response.status}`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    onBytes(value.byteLength);
  }
  const type = response.headers.get('content-type') ?? '';
  return URL.createObjectURL(new Blob(chunks as BlobPart[], { type: type === 'application/octet-stream' ? '' : type }));
}

async function loadMedia(onProgress: (fraction: number) => void): Promise<{ videos: Map<ClipId, HTMLVideoElement>; song: HTMLAudioElement }> {
  const files = CLIPS.map((c) => c.file).concat([SONG_FILE]);
  // Sizes up front, so progress is by bytes, not by file.
  const sizes = await Promise.all(
    files.map((f) =>
      fetch(MEDIA + f, { method: 'HEAD' })
        .then((r) => Number(r.headers.get('content-length')) || 0)
        .catch(() => 0),
    ),
  );
  const total = sizes.reduce((a, b) => a + b, 0) || 1;
  let loaded = 0;
  const urls = await Promise.all(
    files.map((f) =>
      fetchBlobUrl(MEDIA + f, (n) => {
        loaded += n;
        onProgress(Math.min(1, loaded / total));
      }),
    ),
  );

  const videos = new Map<ClipId, HTMLVideoElement>();
  const ready: Promise<unknown>[] = [];
  CLIPS.forEach((clip, i) => {
    const video = document.createElement('video');
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = urls[i]!;
    ready.push(new Promise((resolve) => video.addEventListener('loadeddata', resolve, { once: true })));
    videos.set(clip.id, video);
  });
  const song = new Audio();
  song.preload = 'auto';
  song.src = urls[urls.length - 1]!;
  ready.push(new Promise((resolve) => song.addEventListener('canplay', resolve, { once: true })));
  await Promise.all(ready);
  return { videos, song };
}

// --- A/V Synchro listening to the song ---------------------------------------------------

class KickEnvelope {
  private analyser: AnalyserNode | null = null;
  private buf = new Float32Array(1024);
  private peak = 0.02;

  /** Needs a user gesture (the first Play). Safe to call more than once. */
  attach(song: HTMLAudioElement): void {
    if (this.analyser) return;
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaElementSource(song);
      source.connect(ctx.destination);
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 140;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(lowpass);
      lowpass.connect(analyser);
      this.analyser = analyser;
      void ctx.resume();
    } catch {
      this.analyser = null; // no Web Audio: A/V Synchro simply never fires
    }
  }

  /** 0..1: the low end's RMS against its slowly-decaying recent peak. */
  measure(): number {
    if (!this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i]! * this.buf[i]!;
    const rms = Math.sqrt(sum / this.buf.length);
    this.peak = Math.max(rms, this.peak * 0.998, 0.02);
    return rms / this.peak;
  }
}

// --- the player -------------------------------------------------------------------------

const CLIP_LABEL = new Map<ClipId, string>(CLIPS.map((c) => [c.id, c.label]));

function formatTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function inputName(input: Input): string {
  return input === 'ext-camera' ? 'EXT CAM' : `SRC ${input}`;
}

function boot(): void {
  defineMixer();
  const stage = $('stage');
  const mixer = document.createElement('mx-mixer') as MxMixer;
  mixer.setAttribute('width', '1280');
  mixer.setAttribute('height', '720');
  mixer.setAttribute('aria-label', 'Program output of the music video');
  stage.insertBefore(mixer, stage.firstChild);

  const overlay = $('overlay');
  const playButton = $<HTMLButtonElement>('play-big');
  const status = $('status');
  const bar = $('progress-bar');

  mixer.addEventListener('mx-unavailable', (e) => {
    e.preventDefault();
    status.textContent = 'This page renders on WebGPU — open it in Chrome, Edge or Safari 18+.';
    overlay.classList.add('failed');
  });

  const media = loadMedia((f) => {
    bar.style.width = `${Math.round(f * 100)}%`;
    status.textContent = `Loading footage · ${Math.round(f * 100)}%`;
  });

  void Promise.all([mixer.whenReady(), media])
    .then(([, { videos, song }]) => start(mixer, videos, song))
    .catch((error: unknown) => {
      status.textContent = `Could not load the footage (${String(error)}). Run \`npm run video:media\` first.`;
      overlay.classList.add('failed');
    });

  playButton.addEventListener('click', () => {
    overlay.dispatchEvent(new CustomEvent('mv-play'));
  });
}

function start(mixer: MxMixer, videos: Map<ClipId, HTMLVideoElement>, song: HTMLAudioElement): void {
  const engine = mixer.engine!;
  const registry = mixer.registry!;
  const device = mixer.gpu!.device;
  const store = engine.store;

  const sources = new Map<ClipId, VideoSource>();
  for (const clip of CLIPS) {
    const source = new VideoSource(device, videos.get(clip.id)!);
    // Prime the texture with the clip's first decoded frame BEFORE acquire() allocates a
    // black one: a source patched in while its video is still seeking shows its last
    // copied frame, and a never-copied texture is black — which the DSK keys as one
    // full-screen character.
    source.getFrameTexture(device);
    void source.acquire();
    sources.set(clip.id, source);
  }

  const kick = new KickEnvelope();
  mixer.avPulse = (snapshot) => avSynchroActiveEffects(snapshot.digitalEffect, kick.measure());

  // --- per-frame: the score at the song's playhead ---
  let lastCue = -1;
  let scrubTime: number | null = null;
  const applied = new Map<ClipId, ClipPlay>();
  const patched = new Map<Input, ClipId>();

  const now = (): number => (scrubTime !== null ? scrubTime : song.currentTime);

  function syncClips(cue: CompiledCue, t: number, force: boolean): void {
    for (const clip of CLIPS) {
      const video = videos.get(clip.id)!;
      const play = cue.clips[clip.id];
      const expected = clipTime(clip, play, t);
      if (video.playbackRate !== play.rate) video.playbackRate = play.rate;
      let off = Math.abs(video.currentTime - expected);
      off = Math.min(off, clip.duration - off); // a loop's wrap is not drift
      if (force || applied.get(clip.id) !== play || off > 0.2) {
        if (off > 1 / 30) video.currentTime = expected;
        applied.set(clip.id, play);
      }
      if (song.paused && !video.paused) video.pause();
      if (!song.paused && video.paused) void video.play().catch(() => undefined);
    }
  }

  function applyPatch(cue: CompiledCue): void {
    for (const input of INPUTS) {
      const clip = cue.patch[input];
      if (patched.get(input) === clip) continue;
      registry.set(input, sources.get(clip)!);
      patched.set(input, clip);
    }
  }

  let forceSync = true;
  mixer.beforeFrame(() => {
    const t = now();
    const index = cueIndexAt(score, t);
    const cue = score.cues[index]!;
    if (index !== lastCue) {
      store.dispatch({ type: 'LOAD_STATE', state: cue.state });
      applyPatch(cue);
      lastCue = index;
    }
    for (const command of laneCommandsAt(score, t)) store.dispatch(command);
    syncClips(cue, t, forceSync);
    forceSync = false;
  });

  // --- transport ---
  const overlay = $('overlay');
  const playPause = $<HTMLButtonElement>('play');
  const scrubber = $<HTMLInputElement>('scrubber');
  const time = $('time');
  const sectionLabel = $('section');
  const ticks = $('ticks');

  scrubber.max = String(score.length);
  for (const m of score.markers) {
    const tick = document.createElement('button');
    tick.className = 'tick';
    tick.style.left = `${(m.at / score.length) * 100}%`;
    tick.title = m.label;
    tick.setAttribute('aria-label', `Jump to ${m.label}`);
    tick.addEventListener('click', () => seek(m.at));
    ticks.appendChild(tick);
  }

  function seek(t: number): void {
    song.currentTime = Math.max(0, Math.min(score.length - 0.05, t));
    forceSync = true;
  }

  function play(): void {
    kick.attach(song);
    overlay.hidden = true;
    void song.play();
  }

  function toggle(): void {
    if (song.paused) play();
    else song.pause();
  }

  overlay.classList.add('ready');
  $('status').textContent = 'Ready · 5:09 · headphones recommended';
  overlay.addEventListener('mv-play', play);
  playPause.addEventListener('click', toggle);
  song.addEventListener('play', () => {
    playPause.textContent = 'Pause';
    forceSync = true;
  });
  song.addEventListener('pause', () => {
    playPause.textContent = 'Play';
    forceSync = true;
  });
  song.addEventListener('ended', () => {
    overlay.hidden = false;
    $('play-big').textContent = 'Play again';
  });

  scrubber.addEventListener('input', () => {
    scrubTime = Number(scrubber.value);
    forceSync = true;
  });
  scrubber.addEventListener('change', () => {
    seek(Number(scrubber.value));
    scrubTime = null;
  });

  document.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
    const t = now();
    if (e.key === ' ') {
      e.preventDefault();
      toggle();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      // Jump a section; with Shift, a bar.
      if (e.shiftKey) {
        seek(t + (e.key === 'ArrowRight' ? 1 : -1) * (at(1) - at(0)));
      } else if (e.key === 'ArrowRight') {
        const next = score.markers.filter((m) => m.at > t + 0.01)[0];
        if (next) seek(next.at);
      } else {
        const prev = score.markers.filter((m) => m.at < t - 1);
        seek(prev.length ? prev[prev.length - 1]!.at : 0);
      }
    }
  });

  // --- the panel readout: what the operator is doing right now ---
  const readout = {
    a: $('ro-a'),
    b: $('ro-b'),
    transition: $('ro-transition'),
    lever: $('ro-lever'),
    effect: $('ro-effect'),
    dsk: $('ro-dsk'),
    fade: $('ro-fade'),
    patch: $('ro-patch'),
  };
  let frame = 0;
  mixer.onFrame((s: PanelState) => {
    if (frame++ % 3 !== 0) return;
    const t = now();
    if (scrubTime === null) scrubber.value = String(t);
    time.textContent = `${formatTime(t)} / ${formatTime(score.length)}`;
    const marker = markerAt(score, t);
    const label = marker ? marker.label : '';
    if (sectionLabel.textContent !== label) sectionLabel.textContent = label;
    renderReadout(s, score.cues[cueIndexAt(score, t)]!, readout);
  });
}

function sourceName(source: PanelState['busA']['source'], cue: CompiledCue): string {
  if (source === 'matte') return 'MATTE';
  return `SRC ${source} · ${CLIP_LABEL.get(cue.patch[source])}`;
}

function renderReadout(
  s: PanelState,
  cue: CompiledCue,
  ro: { a: HTMLElement; b: HTMLElement; transition: HTMLElement; lever: HTMLElement; effect: HTMLElement; dsk: HTMLElement; fade: HTMLElement; patch: HTMLElement },
): void {
  const set = (el: HTMLElement, text: string): void => {
    if (el.textContent !== text) el.textContent = text;
  };
  set(ro.a, sourceName(s.busA.source, cue));
  set(ro.b, sourceName(s.busB.source, cue));

  const tr = s.transition;
  let kind: string = tr.type.toUpperCase();
  if (tr.type === 'wipe') {
    const w = tr.wipe;
    const mods: string[] = [w.family];
    if (w.modifiers.multi) mods.push(`multi ${w.modifiers.multi}`);
    if (w.modifiers.blinds) mods.push('blinds');
    if (w.modifiers.pairing) mods.push('pairing');
    if (w.edge !== 'hard') mods.push(w.edge);
    if (s.positioner.on) mods.push('positioner');
    kind += ` · ${mods.join(' · ')}`;
  } else if (tr.type === 'lum-key') {
    kind += ` · slice ${tr.slice.toFixed(2)}`;
  }
  set(ro.transition, kind);
  ro.lever.style.setProperty('--lever', String(tr.lever));

  const de = s.digitalEffect;
  const on: string[] = [];
  for (const f of ['nega', 'mosaic', 'mono', 'paint'] as const) if (de.active[f]) on.push(f);
  if (de.freeze.still) on.push('still');
  if (de.freeze.strobe) on.push('strobe');
  if (de.freeze.trail) on.push('trail');
  if (de.freeze.multi) on.push(`multi ${de.freeze.multi}`);
  if (de.avSynchro) {
    const pulsed: string[] = [];
    for (const e of ['nega', 'mosaic', 'mono', 'paint', 'still', 'strobe'] as const) if (de.avSynchroEffects[e]) pulsed.push(e);
    on.push(`A/V synchro → ${pulsed.join('+')}`);
  }
  const cc = (bus: 'A' | 'B'): string => {
    const mode = (bus === 'A' ? s.busA : s.busB).colourCorrect.mode;
    return mode === 'off' ? '' : ` · CC ${bus}`;
  };
  set(ro.effect, (on.length ? `bus ${de.bus} · ${on.join(' · ')}` : '—') + cc('A') + cc('B'));

  const d = s.dsk;
  set(ro.dsk, d.on ? `${d.keySource === 'ext-camera' ? `EXT CAM · ${CLIP_LABEL.get(cue.patch['ext-camera'])}` : `bus ${d.keySource}`} · ${d.fill} fill · ${d.edge}` : 'off');

  const f = s.fade;
  const parts: string[] = [];
  if (f.video) parts.push('video');
  if (f.dsk) parts.push('dsk');
  set(ro.fade, f.lever > 0.001 ? `${Math.round(f.lever * 100)}% to ${f.target} · ${parts.join('+')}` : '—');

  set(ro.patch, INPUTS.map((input) => `${inputName(input)} ${CLIP_LABEL.get(cue.patch[input])}`).join('  ·  '));
}

boot();
