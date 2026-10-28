// music-video.html — plays a music video FILE (document.ts) on one <mx-mixer> against its song.
//
// A session is one loaded video: the document, its compiled score, its clips and song. The
// default comes from `?video=<path>` (relative to the page) or video/first-cut.json; Load
// (or dropping files on the page) opens a .json together with any of its media picked from
// disk — what was not picked is fetched from video/web/ — and Save downloads the document.
//
// The song is the clock: every frame reads its playhead, loads the cue checkpoint for that
// time (only when the cue changes), dispatches the lane values on top, re-patches clips
// into the inputs and keeps each clip where the score says it is. Pausing and scrubbing
// therefore need no special path — the picture is a function of the playhead.
//
// Fetched media is read into Blobs first: object URLs seek anywhere, which a plain dev
// server without Range support cannot offer. Picked files are used as they are.
//
// A/V Synchro (reference §8.9) listens to the song itself: a low-passed analyser tap
// measures the kick, normalised to its recent peak, and the pure gate decides which
// effects pulse this frame — the same avPulse seam the console uses.

import { defineMixer } from '../../src/ui/mixer.js';
import { VideoSource } from '../../src/sources/video-source.js';
import { avSynchroActiveEffects } from '../../src/core/av-synchro.js';
import { errorsOf, formatProblem, loadMusicVideo, loadMusicVideoText, serializeMusicVideo, slugOf } from './document.js';
import { INPUTS, barTime, clipTime, cueIndexAt, laneCommandsAt, markerAt } from './score.js';
import type { MxMixer } from '../../src/ui/mixer.js';
import type { LoadedMusicVideo, Problem } from './document.js';
import type { ClipPlay, CompiledCue, Grid, Input, Score } from './score.js';
import type { PanelState } from '../../src/state/state.js';

const MEDIA = 'video/web/';
const DEFAULT_VIDEO = 'video/first-cut.json';

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

function stemOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/**
 * A picked file for a name in the document: the same name, else the same stem (track.wav for
 * track.m4a). Picked files have no folder, so "factory/track.m4a" is matched as "track.m4a".
 */
function pickedFor(file: string, picked: Map<string, File>): File | undefined {
  const name = file.slice(file.lastIndexOf('/') + 1);
  const exact = picked.get(name);
  if (exact) return exact;
  const stem = stemOf(name);
  let found: File | undefined;
  picked.forEach((f, name) => {
    if (!found && stemOf(name) === stem) found = f;
  });
  return found;
}

/** Object URLs for every file: picked from disk where given, else fetched from video/web/. */
async function resolveMedia(files: readonly string[], picked: Map<string, File>, onProgress: (fraction: number) => void): Promise<string[]> {
  const remote = files.filter((f) => !pickedFor(f, picked));
  const sizes = await Promise.all(
    remote.map((f) =>
      fetch(MEDIA + f, { method: 'HEAD' })
        .then((r) => (r.ok ? Number(r.headers.get('content-length')) || 0 : -1))
        .catch(() => -1),
    ),
  );
  const missing = remote.filter((_f, i) => sizes[i] === -1);
  if (missing.length) {
    throw new Error(`missing media: ${missing.join(', ')} — pick ${missing.length > 1 ? 'them' : 'it'} together with the .json`);
  }
  const total = sizes.reduce((a, b) => a + b, 0) || 1;
  let loaded = 0;
  onProgress(remote.length ? 0 : 1);
  return Promise.all(
    files.map((f) => {
      const file = pickedFor(f, picked);
      if (file) return Promise.resolve(URL.createObjectURL(file));
      return fetchBlobUrl(MEDIA + f, (n) => {
        loaded += n;
        onProgress(Math.min(1, loaded / total));
      });
    }),
  );
}

function whenLoaded(el: HTMLMediaElement, event: 'loadeddata' | 'canplay', name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    el.addEventListener(event, () => resolve(), { once: true });
    el.addEventListener('error', () => reject(new Error(`${name} cannot be decoded by this browser`)), { once: true });
  });
}

// --- the song through Web Audio: A/V Synchro's ear and the recorder's audio track ---------

class SongAudio {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private tap: MediaStreamAudioDestinationNode | null = null;
  private input: AudioNode | null = null;
  private readonly sources = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>();
  private buf = new Float32Array(1024);
  private peak = 0.02;

  /** Route this song through the graph. Needs a user gesture the first time (Play/Record). */
  use(song: HTMLAudioElement): void {
    try {
      if (!this.ctx) {
        const ctx = new AudioContext();
        const lowpass = ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 140;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        lowpass.connect(analyser);
        this.tap = ctx.createMediaStreamDestination();
        this.analyser = analyser;
        this.input = lowpass;
        this.ctx = ctx;
      }
      void this.ctx.resume();
      let source = this.sources.get(song);
      if (!source) {
        source = this.ctx.createMediaElementSource(song);
        source.connect(this.ctx.destination);
        source.connect(this.input!);
        source.connect(this.tap!);
        this.sources.set(song, source);
      }
    } catch {
      // No Web Audio: A/V Synchro never fires and recordings are silent, but the song plays.
    }
  }

  /** Take a song out of the graph (a new session replaces it). */
  release(song: HTMLAudioElement): void {
    const source = this.sources.get(song);
    if (source) source.disconnect();
    this.sources.delete(song);
  }

  /** The song as a live track, for recording; null without Web Audio. Never stop it. */
  track(): MediaStreamTrack | null {
    return this.tap ? (this.tap.stream.getAudioTracks()[0] ?? null) : null;
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

// --- sessions ---------------------------------------------------------------------------

interface Session {
  readonly loaded: LoadedMusicVideo;
  readonly score: Score;
  readonly grid: Grid;
  readonly title: string;
  readonly clipIds: readonly string[];
  readonly durations: Map<string, number>;
  readonly labels: Map<string, string>;
  readonly videos: Map<string, HTMLVideoElement>;
  readonly sources: Map<string, VideoSource>;
  readonly song: HTMLAudioElement;
  readonly urls: readonly string[];
  /** Aborts this session's event listeners. */
  readonly listeners: AbortController;
}

/** Best first: Chrome records H.264/AAC MP4 natively where it can, WebM everywhere else. */
const RECORD_TYPES = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

function download(blob: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

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
  mixer.setAttribute('width', '1920');
  mixer.setAttribute('height', '1080');
  mixer.setAttribute('aria-label', 'Program output of the music video');
  stage.insertBefore(mixer, stage.firstChild);

  const overlay = $('overlay');
  const status = $('status');
  mixer.addEventListener('mx-unavailable', (e) => {
    e.preventDefault();
    status.textContent = 'This page renders on WebGPU — open it in Chrome, Edge or Safari 18+.';
    overlay.classList.add('failed');
  });
  void mixer.whenReady().then(() => run(mixer));
}

function run(mixer: MxMixer): void {
  const store = mixer.engine!.store;
  const registry = mixer.registry!;
  const device = mixer.gpu!.device;
  const audio = new SongAudio();
  mixer.avPulse = (snapshot) => avSynchroActiveEffects(snapshot.digitalEffect, audio.measure());

  const overlay = $('overlay');
  const status = $('status');
  const progress = $('progress-bar');
  const playBig = $<HTMLButtonElement>('play-big');
  const playPause = $<HTMLButtonElement>('play');
  const scrubber = $<HTMLInputElement>('scrubber');
  const time = $('time');
  const sectionLabel = $('section');
  const ticks = $('ticks');
  const titleEl = $('title');
  const problemsEl = $<HTMLDetailsElement>('problems');
  const recordButton = $<HTMLButtonElement>('record');
  const recNote = $('rec-note');
  const onAir = $('onair');

  let session: Session | null = null;
  let loading = false;
  /** A failed load's problems are on show; going back to the playing video restores its own. */
  let showingFailure = false;

  // --- per-frame: the score at the song's playhead ---
  let lastCue = -1;
  let scrubTime: number | null = null;
  let forceSync = true;
  const applied = new Map<string, ClipPlay>();
  const patched = new Map<Input, string>();

  const now = (): number => (session ? (scrubTime !== null ? scrubTime : session.song.currentTime) : 0);

  function syncClips(s: Session, cue: CompiledCue, t: number, force: boolean): void {
    for (const id of s.clipIds) {
      const video = s.videos.get(id)!;
      const duration = s.durations.get(id)!;
      const play = cue.clips[id]!;
      const expected = clipTime(duration, play, t);
      if (video.playbackRate !== play.rate) video.playbackRate = play.rate;
      let off = Math.abs(video.currentTime - expected);
      off = Math.min(off, duration - off); // a loop's wrap is not drift
      if (force || applied.get(id) !== play || off > 0.2) {
        if (off > 1 / 30) video.currentTime = expected;
        applied.set(id, play);
      }
      if (s.song.paused && !video.paused) video.pause();
      if (!s.song.paused && video.paused) void video.play().catch(() => undefined);
    }
  }

  function applyPatch(s: Session, cue: CompiledCue): void {
    for (const input of INPUTS) {
      const clip = cue.patch[input];
      if (patched.get(input) === clip) continue;
      registry.set(input, s.sources.get(clip)!);
      patched.set(input, clip);
    }
  }

  mixer.beforeFrame(() => {
    const s = session;
    if (!s) return;
    const t = now();
    const index = cueIndexAt(s.score, t);
    const cue = s.score.cues[index]!;
    if (index !== lastCue) {
      store.dispatch({ type: 'LOAD_STATE', state: cue.state });
      applyPatch(s, cue);
      lastCue = index;
    }
    for (const command of laneCommandsAt(s.score, t)) store.dispatch(command);
    syncClips(s, cue, t, forceSync);
    forceSync = false;
  });

  // --- loading a music video ---

  function showProblems(problems: readonly Problem[]): void {
    const list = problemsEl.querySelector('ul')!;
    list.textContent = '';
    for (const p of problems) {
      const li = document.createElement('li');
      li.className = p.severity;
      li.textContent = formatProblem(p);
      list.appendChild(li);
    }
    const errors = errorsOf(problems).length;
    const warnings = problems.length - errors;
    const parts: string[] = [];
    if (errors) parts.push(`${errors} error${errors > 1 ? 's' : ''}`);
    if (warnings) parts.push(`${warnings} warning${warnings > 1 ? 's' : ''}`);
    problemsEl.querySelector('summary')!.textContent = `Music video file: ${parts.join(', ')}`;
    problemsEl.hidden = problems.length === 0;
    problemsEl.open = errors > 0;
  }

  function failLoad(message: string): void {
    loading = false;
    showingFailure = true;
    overlay.hidden = false;
    overlay.classList.remove('ready');
    overlay.classList.add('failed');
    status.textContent = message;
    if (session) {
      // The previous video is still loaded underneath; offer it back.
      overlay.classList.remove('failed');
      overlay.classList.add('ready');
      playBig.textContent = `Back to “${session.title}”`;
    }
  }

  async function open(text: string, name: string, picked: Map<string, File>): Promise<void> {
    if (loading || recorder) return;
    loading = true;
    session?.song.pause();
    overlay.hidden = false;
    overlay.classList.remove('ready', 'failed');
    progress.style.width = '0%';
    status.textContent = `Reading ${name}…`;

    const checked = loadMusicVideoText(text);
    showProblems(checked.problems);
    if (errorsOf(checked.problems).length) {
      failLoad(`${name} has errors — see the list below the player.`);
      return;
    }
    const clips = checked.clips;
    const files = clips.map((c) => c.file).concat([checked.doc.song.file]);
    let urls: string[];
    try {
      urls = await resolveMedia(files, picked, (f) => {
        progress.style.width = `${Math.round(f * 100)}%`;
        status.textContent = `Loading footage · ${Math.round(f * 100)}%`;
      });
    } catch (error) {
      failLoad(error instanceof Error ? error.message : String(error));
      return;
    }

    const videos = new Map<string, HTMLVideoElement>();
    const ready: Promise<void>[] = [];
    clips.forEach((clip, i) => {
      const video = document.createElement('video');
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.src = urls[i]!;
      ready.push(whenLoaded(video, 'loadeddata', clip.file));
      videos.set(clip.id, video);
    });
    const song = new Audio();
    song.preload = 'auto';
    song.src = urls[urls.length - 1]!;
    ready.push(whenLoaded(song, 'canplay', checked.doc.song.file));
    try {
      await Promise.all(ready);
    } catch (error) {
      for (const u of urls) URL.revokeObjectURL(u);
      failLoad(error instanceof Error ? error.message : String(error));
      return;
    }

    // Compile again with the song's measured length (the document may leave it out).
    const loaded = loadMusicVideo(checked.doc, { songLength: isFinite(song.duration) ? song.duration : undefined });
    showProblems(loaded.problems);
    const durations = new Map<string, number>();
    const labels = new Map<string, string>();
    const sources = new Map<string, VideoSource>();
    for (const clip of clips) {
      const video = videos.get(clip.id)!;
      durations.set(clip.id, clip.duration ?? video.duration);
      labels.set(clip.id, clip.label ?? clip.id);
      const source = new VideoSource(device, video);
      // Prime the texture with the clip's first decoded frame BEFORE acquire() allocates a
      // black one: a source patched in while its video is still seeking shows its last
      // copied frame, and a never-copied texture is black — which the DSK keys as one
      // full-screen character.
      source.getFrameTexture(device);
      void source.acquire();
      sources.set(clip.id, source);
    }

    activate({
      loaded,
      score: loaded.score!,
      grid: loaded.grid,
      title: loaded.doc.title,
      clipIds: clips.map((c) => c.id),
      durations,
      labels,
      videos,
      sources,
      song,
      urls,
      listeners: new AbortController(),
    });
  }

  function activate(next: Session): void {
    const previous = session;
    session = next;
    lastCue = -1;
    scrubTime = null;
    forceSync = true;
    applied.clear();
    patched.clear();
    loading = false;
    showingFailure = false;

    if (previous) {
      previous.listeners.abort();
      previous.song.pause();
      audio.release(previous.song);
      // The registry still points at the old sources until the next frame re-patches.
      setTimeout(() => {
        for (const source of previous.sources.values()) source.release();
        for (const u of previous.urls) URL.revokeObjectURL(u);
      }, 500);
    }

    const { song, score, title } = next;
    const signal = next.listeners.signal;
    song.addEventListener('play', () => {
      playPause.textContent = 'Pause';
      forceSync = true;
    }, { signal });
    song.addEventListener('pause', () => {
      playPause.textContent = 'Play';
      forceSync = true;
    }, { signal });
    song.addEventListener('ended', () => {
      if (recorder) stopRecording();
      overlay.hidden = false;
      playBig.textContent = 'Play again';
    }, { signal });

    document.title = `${title} — web-mx-50 music video`;
    titleEl.textContent = title;
    const first = markerAt(score, 0);
    sectionLabel.textContent = first ? first.label : '';
    time.textContent = `0:00 / ${formatTime(score.length)}`;
    scrubber.max = String(score.length);
    scrubber.value = '0';
    ticks.textContent = '';
    for (const m of score.markers) {
      const tick = document.createElement('button');
      tick.className = 'tick';
      tick.style.left = `${(m.at / score.length) * 100}%`;
      tick.title = m.label;
      tick.setAttribute('aria-label', `Jump to ${m.label}`);
      tick.addEventListener('click', () => seek(m.at));
      ticks.appendChild(tick);
    }
    overlay.hidden = false;
    overlay.classList.remove('failed');
    overlay.classList.add('ready');
    playBig.textContent = 'Play';
    status.textContent = `Ready · ${title} · ${formatTime(score.length)}`;
  }

  // --- transport ---

  function seek(t: number): void {
    const s = session;
    if (!s || recorder) return; // a recording runs straight through
    s.song.currentTime = Math.max(0, Math.min(s.score.length - 0.05, t));
    forceSync = true;
  }

  function play(): void {
    const s = session;
    if (!s || loading) return;
    if (showingFailure) {
      showProblems(s.loaded.problems);
      showingFailure = false;
    }
    audio.use(s.song);
    overlay.hidden = true;
    void s.song.play();
  }

  function toggle(): void {
    if (recorder) stopRecording();
    else if (session && session.song.paused) play();
    else session?.song.pause();
  }

  playBig.addEventListener('click', play);
  playPause.addEventListener('click', toggle);
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
    const s = session;
    if (!s) return;
    const t = now();
    if (e.key === ' ') {
      e.preventDefault();
      toggle();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      // Jump a section; with Shift, a bar.
      if (e.shiftKey) {
        seek(t + (e.key === 'ArrowRight' ? 1 : -1) * (barTime(s.grid, 1) - barTime(s.grid, 0)));
      } else if (e.key === 'ArrowRight') {
        const next = s.score.markers.filter((m) => m.at > t + 0.01)[0];
        if (next) seek(next.at);
      } else {
        const prev = s.score.markers.filter((m) => m.at < t - 1);
        seek(prev.length ? prev[prev.length - 1]!.at : 0);
      }
    }
  });

  // --- load & save ---

  const filePicker = $<HTMLInputElement>('file-picker');
  $('load').addEventListener('click', () => filePicker.click());
  filePicker.addEventListener('change', () => {
    if (filePicker.files) void openFiles(Array.prototype.slice.call(filePicker.files) as File[]);
    filePicker.value = '';
  });
  document.addEventListener('dragover', (e) => {
    if (e.dataTransfer && e.dataTransfer.types.indexOf('Files') !== -1) e.preventDefault();
  });
  document.addEventListener('drop', (e) => {
    if (!e.dataTransfer || !e.dataTransfer.files.length) return;
    e.preventDefault();
    void openFiles(Array.prototype.slice.call(e.dataTransfer.files) as File[]);
  });

  async function openFiles(files: File[]): Promise<void> {
    const docs = files.filter((f) => /\.json$/i.test(f.name));
    if (docs.length !== 1) {
      failLoad(docs.length ? 'Pick one music video .json at a time (plus any of its media).' : 'Pick a music video .json (plus any of its song and clips).');
      return;
    }
    const picked = new Map<string, File>();
    for (const f of files) if (f !== docs[0]) picked.set(f.name, f);
    await open(await docs[0]!.text(), docs[0]!.name, picked);
  }

  $('save').addEventListener('click', () => {
    if (!session) return;
    const doc = session.loaded.doc;
    download(new Blob([serializeMusicVideo(doc)], { type: 'application/json' }), `${slugOf(doc.title)}.json`);
  });

  // --- recording: the Program Out canvas and the song, in real time, to a download ---
  let recorder: MediaRecorder | null = null;

  async function startRecording(): Promise<void> {
    const s = session;
    if (!s || loading) return;
    const canvas = mixer.querySelector(':scope > canvas') as HTMLCanvasElement | null;
    if (!canvas || typeof MediaRecorder === 'undefined') {
      recNote.hidden = false;
      recNote.textContent = 'This browser cannot record the canvas (no MediaRecorder).';
      return;
    }
    audio.use(s.song);
    s.song.pause();
    const rewound = new Promise((resolve) => {
      s.song.addEventListener('seeked', resolve, { once: true });
      setTimeout(resolve, 1000);
    });
    s.song.currentTime = 0;
    forceSync = true;
    await rewound;

    const stream = canvas.captureStream(60);
    const track = audio.track();
    if (track) stream.addTrack(track);
    const mimeType = RECORD_TYPES.filter((t) => MediaRecorder.isTypeSupported(t))[0] ?? '';
    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 16000000, audioBitsPerSecond: 192000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    rec.onstop = () => {
      for (const t of stream.getVideoTracks()) t.stop(); // the audio tap stays live for the next take
      const type = rec.mimeType || mimeType || 'video/webm';
      download(new Blob(chunks, { type }), `${slugOf(s.title)}.${type.indexOf('mp4') !== -1 ? 'mp4' : 'webm'}`);
      recorder = null;
      recordButton.textContent = 'Record';
      scrubber.disabled = false;
      onAir.classList.remove('rec');
      recNote.textContent = 'Recording saved to your downloads.';
    };
    recorder = rec;
    recordButton.textContent = 'Stop recording';
    scrubber.disabled = true;
    onAir.classList.add('rec');
    recNote.hidden = false;
    recNote.textContent = 'Recording in real time · keep this tab visible until the song ends — the file downloads then.';
    rec.start(1000);
    play();
  }

  function stopRecording(): void {
    session?.song.pause();
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }

  recordButton.addEventListener('click', () => {
    if (recorder) stopRecording();
    else void startRecording();
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
  mixer.onFrame((state: PanelState) => {
    const s = session;
    if (!s || frame++ % 3 !== 0) return;
    const t = now();
    if (scrubTime === null) scrubber.value = String(t);
    time.textContent = `${formatTime(t)} / ${formatTime(s.score.length)}`;
    const marker = markerAt(s.score, t);
    const label = marker ? marker.label : '';
    if (sectionLabel.textContent !== label) sectionLabel.textContent = label;
    renderReadout(state, s.score.cues[cueIndexAt(s.score, t)]!, s.labels, readout);
  });

  // --- the first video: ?video=<path>, else the default ---
  const requested = new URLSearchParams(location.search).get('video') ?? DEFAULT_VIDEO;
  status.textContent = `Loading ${requested}…`;
  fetch(requested)
    .then((r) => {
      if (!r.ok) throw new Error(`${requested}: HTTP ${r.status}`);
      return r.text();
    })
    .then((text) => open(text, requested, new Map()))
    .catch((error: unknown) => failLoad(`Could not load ${requested} (${String(error)}).`));
}

function renderReadout(
  s: PanelState,
  cue: CompiledCue,
  labels: Map<string, string>,
  ro: { a: HTMLElement; b: HTMLElement; transition: HTMLElement; lever: HTMLElement; effect: HTMLElement; dsk: HTMLElement; fade: HTMLElement; patch: HTMLElement },
): void {
  const set = (el: HTMLElement, text: string): void => {
    if (el.textContent !== text) el.textContent = text;
  };
  const sourceName = (source: PanelState['busA']['source']): string =>
    source === 'matte' ? 'MATTE' : `SRC ${source} · ${labels.get(cue.patch[source])}`;
  set(ro.a, sourceName(s.busA.source));
  set(ro.b, sourceName(s.busB.source));

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
  set(ro.dsk, d.on ? `${d.keySource === 'ext-camera' ? `EXT CAM · ${labels.get(cue.patch['ext-camera'])}` : `bus ${d.keySource}`} · ${d.fill} fill · ${d.edge}` : 'off');

  const f = s.fade;
  const parts: string[] = [];
  if (f.video) parts.push('video');
  if (f.dsk) parts.push('dsk');
  set(ro.fade, f.lever > 0.001 ? `${Math.round(f.lever * 100)}% to ${f.target} · ${parts.join('+')}` : '—');

  set(ro.patch, INPUTS.map((input) => `${inputName(input)} ${labels.get(cue.patch[input])}`).join('  ·  '));
}

boot();
