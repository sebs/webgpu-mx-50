// The music video FILE (docs/MUSIC-VIDEO-FORMAT.md): a versioned JSON document holding the
// song and its tempo grid, the clips, the starting patch, the sections, and the edit —
// CUES (moments: intent-level steps, re-patches, clip restarts) and MOVES (phrases over a
// span: cuts, takes, ramps, pumps, montages…). loadMusicVideo() validates it, expands it
// into score.ts cues and lanes, compiles it through the real reducer, and then checks
// that the panel accepted every intent — a Positioner off a Square wipe, Blinds on an
// illegal family or A/V Synchro next to Trail is refused by the machine itself, and the
// author (often an LLM) hears about it with the exact path.
//
// Positions are in BARS on the song's grid (16.5 = bar 16, beat 3); {"time": s} is an
// escape to seconds. Rhythmic lengths ("every", "length") are in BEATS, bar spans in bars.
//
// Pure and DOM-free: the page, the CLI checker and the unit suite share it.
// banira lib floor: index/`in`/`===` only — no Array.includes, no `**`.

import {
  AV_SYNCHRO_EFFECTS,
  INPUTS,
  LANE_NAMES,
  MATTE,
  applySteps,
  avSynchro,
  barTime,
  beatSeconds,
  borderColour,
  buses,
  colourCorrect,
  compileScore,
  dsk,
  effect,
  emptyLanes,
  fadeTo,
  matte,
  positioner,
  transition,
  wipe,
} from './score.js';
import { FACTORY_PRESET } from '../../src/state/state.js';
import type { Cue, Curve, EffectSet, Grid, Input, LaneName, LanePoint, Marker, Patch, Score, Step } from './score.js';
import type { Command } from '../../src/state/commands.js';
import type { AvSynchroEffect, PanelState } from '../../src/state/state.js';
import type { BusSource } from '../../src/core/types.js';

export const MUSIC_VIDEO_FORMAT = 'web-mx-50/music-video';
export const MUSIC_VIDEO_VERSION = 1;

// --- the document, as JSON ----------------------------------------------------------------

/** Bars on the song's grid, or seconds. */
export type Position = number | { time: number };

export interface ClipDoc {
  id: string;
  file: string;
  label?: string;
  /** Seconds; measured from the media when omitted. */
  duration?: number;
}

export type PatchDoc = { [input: string]: string }; // "1".."4", "ext"

export interface CueDoc {
  at: Position;
  do?: StepDoc[];
  patch?: PatchDoc;
  play?: { [clip: string]: { from?: number; rate?: number } };
  note?: string;
}

export type StepDoc = { [key: string]: unknown };
export type MoveDoc = { move: string; [key: string]: unknown };

export interface MusicVideoDoc {
  format: string;
  version: number;
  title: string;
  description?: string;
  song: { file: string; bpm: number; downbeat: number; length?: number };
  clips: ClipDoc[];
  patch: PatchDoc;
  /** Sections, cues and moves, in any order (usually grouped by section). */
  edit?: EditItem[];
}

export type SectionDoc = { section: string; at: Position };
export type EditItem = SectionDoc | CueDoc | MoveDoc;

export interface Problem {
  readonly severity: 'error' | 'warning';
  readonly path: string;
  readonly message: string;
}

export interface LoadedMusicVideo {
  readonly doc: MusicVideoDoc;
  readonly grid: Grid;
  readonly clips: readonly ClipDoc[];
  /** Null when there are errors. */
  readonly score: Score | null;
  readonly problems: readonly Problem[];
}

// --- vocabulary ---------------------------------------------------------------------------

const TOP_KEYS = ['format', 'version', 'title', 'description', 'song', 'clips', 'patch', 'edit'];
const PATCH_KEYS = ['1', '2', '3', '4', 'ext'];
const STEP_KEYS = ['buses', 'transition', 'wipe', 'effect', 'avSynchro', 'colourCorrect', 'dsk', 'fade', 'matte', 'border', 'positioner', 'command'];
const MOVE_KINDS = ['set', 'ramp', 'steps', 'cuts', 'takes', 'pump', 'flash', 'rotate', 'montage', 'punch'];
const TRANSITIONS = ['mix', 'nam', 'wipe', 'lum-key', 'chroma-key'];
const WIPE_EDGES = ['hard', 'border-narrow', 'border-wide', 'soft-narrow', 'soft-wide'];
const CC_MODES = ['off', 'chroma-only', 'chroma-plus-joystick'];
const DSK_EDGES = ['normal', 'narrow-border', 'wide-border', 'narrow-shadow', 'wide-shadow', 'drop-shadow'];
const FADE_TARGETS = ['matte', 'white', 'black', 'A', 'B'];
const CURVES = ['linear', 'hold', 'ease'];
const COLOURS = ['white', 'yellow', 'cyan', 'green', 'magenta', 'red', 'blue', 'black'];
const BUSES = ['A', 'B'];

/** Lane value ranges; hue and orbit are angles in turns, so any number goes. */
const LANE_RANGE: { [lane: string]: [number, number] | null } = {
  lever: [0, 1],
  fade: [0, 1],
  slice: [0, 1],
  mosaic: [1, 31],
  chromaA: [0, 1],
  chromaB: [0, 1],
  hueA: null,
  hueB: null,
  strobe: [0, 1],
  dskHigh: [0, 1],
  orbit: null,
  avLevel: [0, 1],
};

/**
 * Store commands a `command` step may send raw. Runners (Auto Take/Fade) are excluded —
 * they run on host ticks, which a seek cannot replay — and so are memory, audio-desk and
 * whole-state commands that have no place in an edit.
 */
const RAW_COMMANDS = [
  'ASSIGN_SOURCE', 'SET_TRANSITION_TYPE', 'SET_PROGRAM_OUT', 'SET_MATTE_COLOR', 'SET_MATTE_LEVEL', 'SET_GRADATION',
  'PRESS_COLOUR_CORRECT', 'SET_CHROMA', 'SET_CC_JOYSTICK', 'SELECT_EFFECT_BUS', 'CHOOSE_EFFECT', 'PRESS_EFFECT_ON',
  'SET_MOSAIC_SIZE', 'SET_PAINT_LEVEL', 'ENGAGE_FREEZE', 'SET_MULTI_GRID', 'SET_MULTI_MODE', 'SET_TRAIL_CORNER',
  'SET_STROBE_TIME', 'SET_MULTI_TIME', 'SET_TRAIL_TIME', 'ATTEMPT_AV_SYNCHRO', 'SET_AV_SYNCHRO_LEVEL',
  'SET_AV_SYNCHRO_EFFECT', 'PRESS_WIPE_FAMILY', 'SET_WIPE_VARIANT', 'SET_WIPE_PATTERN', 'PRESS_COMPRESSION',
  'PRESS_SLIDE', 'SET_WIPE_MULTI', 'SET_PAIRING', 'SET_BLINDS', 'PRESS_BORDER', 'PRESS_SOFT', 'SET_REVERSE',
  'SET_ONE_WAY', 'SET_WIPE_ASPECT', 'SET_ASPECT_ON', 'PRESS_POSITIONER', 'SET_POSITIONER_SIZE',
  'SET_POSITIONER_JOYSTICK', 'PRESS_SCENE_GRABBER', 'PRESS_LUM_KEY', 'PRESS_CHROMA_KEY', 'SET_SLICE', 'SET_HUE',
  'SET_DSK_ON', 'SET_DSK_FILL', 'SET_DSK_KEY_SOURCE', 'SET_DSK_LOW', 'SET_DSK_HIGH', 'PRESS_DSK_EDGE',
  'SET_DSK_EDGE', 'SET_DSK_EDGE_COLOR', 'PRESS_DSK_REVERSE', 'SET_FADE_ENABLE', 'SET_FADE_TARGET',
  'SET_LEVER', 'SET_FADE_LEVER',
];

/** Raw commands that a lane owns once it has points. */
const LANE_OWNED: { [type: string]: LaneName } = {
  SET_LEVER: 'lever',
  SET_FADE_LEVER: 'fade',
  SET_SLICE: 'slice',
  SET_MOSAIC_SIZE: 'mosaic',
  SET_STROBE_TIME: 'strobe',
  SET_DSK_HIGH: 'dskHigh',
  SET_POSITIONER_JOYSTICK: 'orbit',
  SET_AV_SYNCHRO_LEVEL: 'avLevel',
};

// --- the reader: typed access with a path, collecting problems ------------------------------

type Obj = { [key: string]: unknown };

function closest(word: string, options: readonly string[]): string | null {
  let best: string | null = null;
  let bestScore = Infinity;
  for (const o of options) {
    const d = editDistance(word.toLowerCase(), o.toLowerCase());
    if (d < bestScore) {
      bestScore = d;
      best = o;
    }
  }
  return best !== null && bestScore <= Math.max(2, Math.floor(word.length / 3)) ? best : null;
}

function editDistance(a: string, b: string): number {
  const row: number[] = [];
  for (let j = 0; j <= b.length; j++) row.push(j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length]!;
}

class Reader {
  readonly problems: Problem[] = [];

  error(path: string, message: string): void {
    this.problems.push({ severity: 'error', path, message });
  }

  warn(path: string, message: string): void {
    this.problems.push({ severity: 'warning', path, message });
  }

  obj(v: unknown, path: string): Obj | null {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) {
      this.error(path, `expected an object, got ${describe(v)}`);
      return null;
    }
    return v as Obj;
  }

  arr(v: unknown, path: string): unknown[] | null {
    if (!Array.isArray(v)) {
      this.error(path, `expected an array, got ${describe(v)}`);
      return null;
    }
    return v;
  }

  keys(o: Obj, path: string, allowed: readonly string[], required: readonly string[] = []): void {
    for (const k in o) {
      if (allowed.indexOf(k) === -1) {
        const hint = closest(k, allowed);
        this.error(`${path}.${k}`, `unknown key "${k}"${hint ? ` — did you mean "${hint}"?` : ''} (allowed: ${allowed.join(', ')})`);
      }
    }
    for (const k of required) if (!(k in o)) this.error(path, `missing required key "${k}"`);
  }

  num(v: unknown, path: string, min = -Infinity, max = Infinity, integer = false): number | null {
    if (typeof v !== 'number' || !isFinite(v)) {
      this.error(path, `expected a number, got ${describe(v)}`);
      return null;
    }
    if (integer && Math.round(v) !== v) {
      this.error(path, `expected a whole number, got ${v}`);
      return null;
    }
    if (v < min || v > max) {
      this.error(path, `${v} is out of range ${min}..${max}`);
      return null;
    }
    return v;
  }

  str(v: unknown, path: string): string | null {
    if (typeof v !== 'string' || v.length === 0) {
      this.error(path, `expected a non-empty string, got ${describe(v)}`);
      return null;
    }
    return v;
  }

  bool(v: unknown, path: string): boolean | null {
    if (typeof v !== 'boolean') {
      this.error(path, `expected true or false, got ${describe(v)}`);
      return null;
    }
    return v;
  }

  oneOf<T extends string>(v: unknown, path: string, options: readonly T[]): T | null {
    if (typeof v !== 'string' || options.indexOf(v as T) === -1) {
      const hint = typeof v === 'string' ? closest(v, options) : null;
      this.error(path, `expected one of ${options.join(' | ')}, got ${describe(v)}${hint ? ` — did you mean "${hint}"?` : ''}`);
      return null;
    }
    return v as T;
  }
}

function describe(v: unknown): string {
  if (v === undefined) return 'nothing';
  if (typeof v === 'string') return `"${v}"`;
  if (Array.isArray(v)) return 'an array';
  if (v === null) return 'null';
  if (typeof v === 'object') return 'an object';
  return String(v);
}

// --- loading --------------------------------------------------------------------------------

export function errorsOf(problems: readonly Problem[]): Problem[] {
  return problems.filter((p) => p.severity === 'error');
}

export function formatProblem(p: Problem): string {
  return `${p.severity === 'error' ? 'error  ' : 'warning'} ${p.path}: ${p.message}`;
}

/** Parse JSON text, reporting a syntax error as a problem rather than throwing. */
export function loadMusicVideoText(text: string, options: LoadOptions = {}): LoadedMusicVideo {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    const empty = { format: '', version: 0, title: '', song: { file: '', bpm: 120, downbeat: 0 }, clips: [], patch: {} };
    return {
      doc: empty,
      grid: { bpm: 120, downbeat: 0 },
      clips: [],
      score: null,
      problems: [{ severity: 'error', path: '$', message: `not valid JSON: ${(error as Error).message}` }],
    };
  }
  return loadMusicVideo(json, options);
}

export interface LoadOptions {
  /** The song's measured length (seconds), when the document does not state it. */
  songLength?: number;
}

export function loadMusicVideo(json: unknown, options: LoadOptions = {}): LoadedMusicVideo {
  const r = new Reader();
  const doc = (json ?? {}) as MusicVideoDoc;
  const root = r.obj(json, '$');
  const grid: Grid = { bpm: 120, downbeat: 0 };
  const clips: ClipDoc[] = [];
  const fail = (): LoadedMusicVideo => ({ doc, grid, clips, score: null, problems: r.problems });
  if (!root) return fail();

  r.keys(root, '$', TOP_KEYS, ['format', 'version', 'title', 'song', 'clips', 'patch']);
  if (root.format !== MUSIC_VIDEO_FORMAT) r.error('$.format', `expected "${MUSIC_VIDEO_FORMAT}", got ${describe(root.format)}`);
  if (root.version !== MUSIC_VIDEO_VERSION) r.error('$.version', `this player reads version ${MUSIC_VIDEO_VERSION}, got ${describe(root.version)}`);
  r.str(root.title, '$.title');

  // --- song + grid
  let length = options.songLength ?? 0;
  const song = r.obj(root.song, '$.song');
  if (song) {
    r.keys(song, '$.song', ['file', 'bpm', 'downbeat', 'length'], ['file', 'bpm', 'downbeat']);
    r.str(song.file, '$.song.file');
    const bpm = r.num(song.bpm, '$.song.bpm', 40, 300);
    const downbeat = r.num(song.downbeat, '$.song.downbeat', 0, 60);
    if (bpm !== null) (grid as { bpm: number }).bpm = bpm;
    if (downbeat !== null) (grid as { downbeat: number }).downbeat = downbeat;
    if (song.length !== undefined) {
      const l = r.num(song.length, '$.song.length', 1, 3600);
      if (l !== null) length = l;
    }
  }

  // --- clips
  const ids: string[] = [];
  const clipList = r.arr(root.clips, '$.clips');
  if (clipList) {
    if (clipList.length === 0) r.error('$.clips', 'a music video needs at least one clip');
    clipList.forEach((c, i) => {
      const path = `$.clips[${i}]`;
      const o = r.obj(c, path);
      if (!o) return;
      r.keys(o, path, ['id', 'file', 'label', 'duration'], ['id', 'file']);
      const id = r.str(o.id, `${path}.id`);
      const file = r.str(o.file, `${path}.file`);
      if (o.label !== undefined) r.str(o.label, `${path}.label`);
      if (o.duration !== undefined) r.num(o.duration, `${path}.duration`, 0.05, 36000);
      if (id !== null && ids.indexOf(id) !== -1) r.error(`${path}.id`, `duplicate clip id "${id}"`);
      if (id !== null && file !== null) {
        ids.push(id);
        clips.push({ id, file, label: typeof o.label === 'string' ? o.label : id, duration: typeof o.duration === 'number' ? o.duration : undefined });
      }
    });
  }

  const clipId = (v: unknown, path: string): string | null => {
    if (typeof v !== 'string' || ids.indexOf(v) === -1) {
      const hint = typeof v === 'string' ? closest(v, ids) : null;
      r.error(path, `unknown clip ${describe(v)}${hint ? ` — did you mean "${hint}"?` : ''} (clips: ${ids.join(', ')})`);
      return null;
    }
    return v;
  };

  const readPatch = (v: unknown, path: string, full: boolean): Partial<Patch> | null => {
    const o = r.obj(v, path);
    if (!o) return null;
    r.keys(o, path, PATCH_KEYS, full ? PATCH_KEYS : []);
    const out: { [K in Input]?: string } = {};
    for (const k of PATCH_KEYS) {
      if (!(k in o)) continue;
      const id = clipId(o[k], `${path}.${k}`);
      if (id !== null) out[k === 'ext' ? 'ext-camera' : (Number(k) as 1 | 2 | 3 | 4)] = id;
    }
    return out;
  };

  const startPatch = readPatch(root.patch, '$.patch', true);

  // --- positions
  const pos = (v: unknown, path: string): number | null => {
    if (typeof v === 'number') {
      if (!isFinite(v)) {
        r.error(path, 'expected a bar number');
        return null;
      }
      const t = barTime(grid, v);
      if (t < 0) {
        r.error(path, `bar ${v} is before the song starts (use {"time": 0} for the very top)`);
        return null;
      }
      return t;
    }
    const o = v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null;
    if (o && 'time' in o) {
      r.keys(o, path, ['time']);
      return r.num(o.time, `${path}.time`, 0, 3600);
    }
    r.error(path, `expected a bar number (e.g. 16 or 16.5) or {"time": seconds}, got ${describe(v)}`);
    return null;
  };
  const beat = beatSeconds(grid);

  const cues: Cue[] = [];
  /** Per cue: where each authored step's expanded steps end (generated cues have none). */
  const cueGroups: number[][] = [];
  const lanes = emptyLanes();
  const markers: Marker[] = [];
  /** Intent checks run after compiling, against the state each step produced. */
  const intents: { cue: number; step: number; path: string; check: (s: PanelState) => string | null }[] = [];
  /** Raw commands on lane-owned controls, checked once the lanes are known. */
  const laneTouches: { at: number; lane: LaneName; path: string }[] = [];
  const lanePath: { [K in LaneName]?: string } = {};

  const point = (lane: LaneName, t: number, value: number, curve: Curve, path: string): void => {
    lanes[lane].push({ at: t, value, curve });
    if (!lanePath[lane]) lanePath[lane] = path;
  };

  const laneValue = (lane: LaneName, v: unknown, path: string): number | null => {
    const range = LANE_RANGE[lane];
    return range ? r.num(v, path, range[0], range[1]) : r.num(v, path);
  };

  const colour = (v: unknown, path: string): number | null => {
    const name = r.oneOf(v, path, COLOURS);
    return name === null ? null : MATTE[name]!;
  };

  // --- steps
  const readStep = (v: unknown, path: string, cueIndex: number, stepIndex: number, at: number): Step[] => {
    const o = r.obj(v, path);
    if (!o) return [];
    const keys = Object.keys(o);
    if (keys.length !== 1) {
      r.error(path, `a step has exactly one key (one of ${STEP_KEYS.join(', ')}), got ${keys.length ? keys.join(', ') : 'none'}`);
      return [];
    }
    const key = keys[0]!;
    const value = o[key];
    const p = `${path}.${key}`;
    const intent = (check: (s: PanelState) => string | null): void => {
      intents.push({ cue: cueIndex, step: stepIndex, path: p, check });
    };
    switch (key) {
      case 'buses': {
        const list = r.arr(value, p);
        if (!list) return [];
        if (list.length !== 2) {
          r.error(p, 'expected [busA, busB], e.g. [1, 2]');
          return [];
        }
        const src = (x: unknown, i: number): BusSource | null => {
          if (x === 'matte') return 'matte';
          const n = r.num(x, `${p}[${i}]`, 1, 4, true);
          return n === null ? null : (n as 1 | 2 | 3 | 4);
        };
        const a = src(list[0], 0);
        const b = src(list[1], 1);
        return a !== null && b !== null ? buses(a, b) : [];
      }
      case 'transition': {
        const t = r.oneOf(value, p, TRANSITIONS as readonly ('mix' | 'nam' | 'wipe' | 'lum-key' | 'chroma-key')[]);
        return t ? [transition(t)] : [];
      }
      case 'wipe': {
        const w = r.obj(value, p);
        if (!w) return [];
        r.keys(w, p, ['pattern', 'reverse', 'edge', 'multi', 'blinds', 'pairing'], ['pattern']);
        const n = r.num(w.pattern, `${p}.pattern`, 1, 28, true);
        const reverse = w.reverse === undefined ? false : r.bool(w.reverse, `${p}.reverse`);
        const edge = w.edge === undefined ? 'hard' : r.oneOf(w.edge, `${p}.edge`, WIPE_EDGES as readonly ('hard' | 'border-narrow' | 'border-wide' | 'soft-narrow' | 'soft-wide')[]);
        const multi = w.multi === undefined ? 0 : r.num(w.multi, `${p}.multi`, 0, 6, true);
        const blinds = w.blinds === undefined ? false : r.bool(w.blinds, `${p}.blinds`);
        const pairing = w.pairing === undefined ? false : r.bool(w.pairing, `${p}.pairing`);
        if (n === null || reverse === null || edge === null || multi === null || blinds === null || pairing === null) return [];
        if (blinds) intent((s) => (s.transition.wipe.modifiers.blinds ? null : `Blinds is not allowed on pattern ${n} (families straight, corner, diagonal, triangle and split only: patterns 1–20); the panel fell back to a plain straight wipe`));
        return wipe(n + (reverse ? 128 : 0), { edge, multi, blinds, pairing });
      }
      case 'effect': {
        const e = r.obj(value, p);
        if (!e) return [];
        r.keys(e, p, ['bus', 'nega', 'mosaic', 'mono', 'paint', 'still', 'strobe', 'trail', 'multi'], ['bus']);
        const bus = r.oneOf(e.bus, `${p}.bus`, BUSES as readonly ('A' | 'B')[]);
        const want: EffectSet = {};
        for (const f of ['nega', 'mosaic', 'mono', 'paint', 'still', 'strobe', 'trail'] as const) {
          if (e[f] === undefined) continue;
          const b = r.bool(e[f], `${p}.${f}`);
          if (b !== null) want[f] = b;
        }
        if (e.multi !== undefined) {
          if (e.multi !== 0 && e.multi !== 4 && e.multi !== 9 && e.multi !== 16) r.error(`${p}.multi`, `expected 0, 4, 9 or 16, got ${describe(e.multi)}`);
          else want.multi = e.multi;
        }
        if (bus === null) return [];
        if (want.still && (want.strobe || want.multi)) r.error(p, 'Still cannot run with Strobe or Multi (the panel switches the others off)');
        intent((s) => {
          const de = s.digitalEffect;
          const off: string[] = [];
          for (const f of ['nega', 'mosaic', 'mono', 'paint'] as const) if (!!want[f] !== de.active[f]) off.push(f);
          for (const f of ['still', 'strobe', 'trail'] as const) if (!!want[f] !== de.freeze[f]) off.push(f);
          if ((want.multi ?? 0) !== de.freeze.multi) off.push('multi');
          return off.length ? `the panel did not land ${off.join(', ')} as asked` : null;
        });
        return [effect(bus, want)];
      }
      case 'avSynchro': {
        const list = r.arr(value, p);
        if (!list) return [];
        const effects: AvSynchroEffect[] = [];
        list.forEach((x, i) => {
          const name = r.oneOf(x, `${p}[${i}]`, AV_SYNCHRO_EFFECTS);
          if (name !== null && effects.indexOf(name) === -1) effects.push(name);
        });
        if (effects.length) intent((s) => (s.digitalEffect.avSynchro ? null : 'A/V Synchro refused: Trail is on (turn it off in an earlier effect step)'));
        return avSynchro(effects);
      }
      case 'colourCorrect': {
        const c = r.obj(value, p);
        if (!c) return [];
        r.keys(c, p, ['bus', 'mode'], ['bus', 'mode']);
        const bus = r.oneOf(c.bus, `${p}.bus`, BUSES as readonly ('A' | 'B')[]);
        const mode = r.oneOf(c.mode, `${p}.mode`, CC_MODES as readonly ('off' | 'chroma-only' | 'chroma-plus-joystick')[]);
        return bus && mode ? [colourCorrect(bus, mode)] : [];
      }
      case 'dsk': {
        if (value === false) return dsk(false);
        const d = r.obj(value, p);
        if (!d) return [];
        r.keys(d, p, ['fill', 'source', 'low', 'high', 'edge', 'edgeColor', 'reverse']);
        const fill = d.fill === undefined ? 'white' : r.oneOf(d.fill, `${p}.fill`, ['white', 'matte'] as const);
        const source = d.source === undefined ? 'ext' : r.oneOf(d.source, `${p}.source`, ['ext', 'A', 'B'] as const);
        const low = d.low === undefined ? 0 : r.num(d.low, `${p}.low`, 0, 1);
        const high = d.high === undefined ? 0.42 : r.num(d.high, `${p}.high`, 0, 1);
        const edge = d.edge === undefined ? 'normal' : r.oneOf(d.edge, `${p}.edge`, DSK_EDGES as readonly ('normal' | 'narrow-border' | 'wide-border' | 'narrow-shadow' | 'wide-shadow' | 'drop-shadow')[]);
        const edgeColor = d.edgeColor === undefined ? MATTE.white! : colour(d.edgeColor, `${p}.edgeColor`);
        const reverse = d.reverse === undefined ? false : r.bool(d.reverse, `${p}.reverse`);
        if (fill === null || source === null || low === null || high === null || edge === null || edgeColor === null || reverse === null) return [];
        if (fill === 'matte' && d.edgeColor !== undefined) r.warn(p, 'edgeColor only applies with fill "white" (a matte fill always has black edges)');
        return dsk(true, { fill, source: source === 'ext' ? 'ext-camera' : source, low, high, edge, edgeColor, reverse });
      }
      case 'fade': {
        const f = r.obj(value, p);
        if (!f) return [];
        r.keys(f, p, ['target', 'video', 'dsk'], ['target']);
        const target = r.oneOf(f.target, `${p}.target`, FADE_TARGETS as readonly ('matte' | 'white' | 'black' | 'A' | 'B')[]);
        const video = f.video === undefined ? true : r.bool(f.video, `${p}.video`);
        const dskToo = f.dsk === undefined ? true : r.bool(f.dsk, `${p}.dsk`);
        return target !== null && video !== null && dskToo !== null ? fadeTo(target, video, dskToo) : [];
      }
      case 'matte': {
        const c = colour(value, p);
        return c === null ? [] : [matte(c)];
      }
      case 'border': {
        const c = colour(value, p);
        return c === null ? [] : [borderColour(c)];
      }
      case 'positioner': {
        const on = r.bool(value, p);
        if (on === null) return [];
        if (on) intent((s) => (s.positioner.on ? null : 'Positioner refused: select a Square-family wipe first (patterns 25–28) in this or an earlier step'));
        return [positioner(on)];
      }
      case 'command': {
        const c = r.obj(value, p);
        if (!c) return [];
        const type = r.oneOf(c.type, `${p}.type`, RAW_COMMANDS);
        if (type === null) return [];
        for (const k in c) {
          const x = c[k];
          if (typeof x !== 'number' && typeof x !== 'string' && typeof x !== 'boolean') r.error(`${p}.${k}`, 'raw command fields must be numbers, strings or booleans');
        }
        if (type in LANE_OWNED) laneTouches.push({ at, lane: LANE_OWNED[type]!, path: p });
        return [c as unknown as Command];
      }
      default: {
        const hint = closest(key, STEP_KEYS);
        r.error(path, `unknown step "${key}"${hint ? ` — did you mean "${hint}"?` : ''} (steps: ${STEP_KEYS.join(', ')})`);
        return [];
      }
    }
  };

  // --- cues: a moment — intent-level steps, re-patches, clip restarts
  const readCue = (o: Obj, path: string): void => {
    r.keys(o, path, ['at', 'do', 'patch', 'play', 'note'], ['at']);
    const at = pos(o.at, `${path}.at`);
    if (at === null) return;
    const steps: Step[] = [];
    const stepGroups: number[] = []; // steps[] index where each authored step ends
    if (o.do !== undefined) {
      const doList = r.arr(o.do, `${path}.do`);
      if (doList) {
        doList.forEach((s, j) => {
          for (const st of readStep(s, `${path}.do[${j}]`, cues.length, j, at)) steps.push(st);
          stepGroups.push(steps.length);
        });
      }
    }
    const patch = o.patch === undefined ? undefined : readPatch(o.patch, `${path}.patch`, false) ?? undefined;
    let play: { [clip: string]: { from?: number; rate?: number } } | undefined;
    if (o.play !== undefined) {
      const po = r.obj(o.play, `${path}.play`);
      if (po) {
        play = {};
        for (const id in po) {
          const pp = `${path}.play.${id}`;
          if (clipId(id, pp) === null) continue;
          const e = r.obj(po[id], pp);
          if (!e) continue;
          r.keys(e, pp, ['from', 'rate']);
          const entry: { from?: number; rate?: number } = {};
          if (e.from !== undefined) {
            const f = r.num(e.from, `${pp}.from`, 0);
            if (f !== null) entry.from = f;
          }
          if (e.rate !== undefined) {
            const rt = r.num(e.rate, `${pp}.rate`, 0.0625, 16);
            if (rt !== null) entry.rate = rt;
          }
          play[id] = entry;
        }
      }
    }
    cueGroups.push(stepGroups);
    cues.push({ at, steps, patch, play });
  };

  // --- the edit: sections, cues and moves, read top to bottom like a script
  const edit = root.edit === undefined ? [] : r.arr(root.edit, '$.edit');
  if (edit) {
    edit.forEach((item, i) => {
      const path = `$.edit[${i}]`;
      const o = r.obj(item, path);
      if (!o) return;
      if ('section' in o) {
        r.keys(o, path, ['section', 'at'], ['section', 'at']);
        const t = pos(o.at, `${path}.at`);
        const label = r.str(o.section, `${path}.section`);
        if (t !== null && label !== null) markers.push({ at: t, label });
      } else if ('move' in o) {
        readMove(o, path);
      } else if ('at' in o) {
        readCue(o, path);
      } else {
        r.error(path, 'an edit item is a section ({"section", "at"}), a cue ({"at", "do"…}) or a move ({"move", …})');
      }
    });
  }

  function readMove(m: unknown, path: string): void {
    const o = r.obj(m, path);
    if (!o) return;
    const kind = r.oneOf(o.move, `${path}.move`, MOVE_KINDS);
    if (kind === null) return;
    const lane = (required = true): LaneName | null => (required || o.lane !== undefined ? r.oneOf(o.lane, `${path}.lane`, LANE_NAMES) : null);
    const span = (): [number, number] | null => {
      const from = pos(o.from, `${path}.from`);
      const to = pos(o.to, `${path}.to`);
      if (from === null || to === null) return null;
      if (to <= from) {
        r.error(path, '"to" must be after "from"');
        return null;
      }
      return [from, to];
    };
    const beats = (v: unknown, p: string): number | null => r.num(v, p, 1 / 16, 64);
    const curve = (v: unknown, p: string, fallback: Curve): Curve | null => (v === undefined ? fallback : r.oneOf(v, p, CURVES as readonly Curve[]));
    /** Moment k of a span stepped every `step` seconds, from `from` up to (not at) `to`. */
    const ticks = (from: number, to: number, step: number): number[] => {
      const out: number[] = [];
      for (let k = 0; from + k * step < to - 1e-6; k++) out.push(from + k * step);
      return out;
    };
    const inputOf = (v: unknown, p: string): Input | null => {
      if (v === 'ext') return 'ext-camera';
      const n = r.num(v, p, 1, 4, true);
      return n === null ? null : (n as 1 | 2 | 3 | 4);
    };
    const clipList = (v: unknown, p: string): string[] | null => {
      const list = r.arr(v, p);
      if (!list) return null;
      if (!list.length) {
        r.error(p, 'needs at least one clip');
        return null;
      }
      const out: string[] = [];
      list.forEach((x, i) => {
        const id = clipId(x, `${p}[${i}]`);
        if (id !== null) out.push(id);
      });
      return out.length === list.length ? out : null;
    };
    const generated = (at: number, patch: Partial<Patch>, play: { [clip: string]: { from?: number; rate?: number } }, steps: Step[] = []): void => {
      cueGroups.push([]);
      cues.push({ at, steps, patch, play });
    };

    switch (kind) {
      case 'set': {
        r.keys(o, path, ['move', 'lane', 'at', 'value', 'curve'], ['lane', 'at', 'value']);
        const l = lane();
        const t = pos(o.at, `${path}.at`);
        const c = curve(o.curve, `${path}.curve`, 'hold');
        const v = l ? laneValue(l, o.value, `${path}.value`) : null;
        if (l && t !== null && c && v !== null) point(l, t, v, c, path);
        return;
      }
      case 'ramp': {
        r.keys(o, path, ['move', 'lane', 'from', 'to', 'values', 'curve'], ['lane', 'from', 'to', 'values']);
        const l = lane();
        const s = span();
        const c = curve(o.curve, `${path}.curve`, 'linear');
        const vs = r.arr(o.values, `${path}.values`);
        if (vs && vs.length !== 2) r.error(`${path}.values`, 'expected [start, end]');
        if (!l || !s || !c || !vs || vs.length !== 2) return;
        const v0 = laneValue(l, vs[0], `${path}.values[0]`);
        const v1 = laneValue(l, vs[1], `${path}.values[1]`);
        if (v0 === null || v1 === null) return;
        point(l, s[0], v0, c, path);
        point(l, s[1], v1, 'hold', path);
        return;
      }
      case 'steps': {
        r.keys(o, path, ['move', 'lane', 'from', 'every', 'values'], ['lane', 'from', 'every', 'values']);
        const l = lane();
        const from = pos(o.from, `${path}.from`);
        const every = beats(o.every, `${path}.every`);
        const vs = r.arr(o.values, `${path}.values`);
        if (!l || from === null || every === null || !vs) return;
        vs.forEach((x, k) => {
          const v = laneValue(l, x, `${path}.values[${k}]`);
          if (v !== null) point(l, from + k * every * beat, v, 'hold', path);
        });
        return;
      }
      case 'cuts': {
        r.keys(o, path, ['move', 'from', 'to', 'every', 'start'], ['from', 'to', 'every']);
        const s = span();
        const every = beats(o.every, `${path}.every`);
        const start = o.start === undefined ? 0 : r.num(o.start, `${path}.start`, 0, 1, true);
        if (!s || every === null || start === null) return;
        ticks(s[0], s[1], every * beat).forEach((t, k) => point('lever', t, k % 2 === 0 ? start : 1 - start, 'hold', path));
        return;
      }
      case 'takes': {
        r.keys(o, path, ['move', 'from', 'to', 'every', 'length', 'start', 'curve'], ['from', 'to', 'every', 'length']);
        const s = span();
        const every = beats(o.every, `${path}.every`);
        const len = beats(o.length, `${path}.length`);
        const start = o.start === undefined ? 0 : r.num(o.start, `${path}.start`, 0, 1, true);
        const c = curve(o.curve, `${path}.curve`, 'linear');
        if (!s || every === null || len === null || start === null || !c) return;
        if (len > every) r.warn(`${path}.length`, 'a take longer than its spacing is cut short by the next one');
        ticks(s[0], s[1], every * beat).forEach((t, k) => {
          const v = k % 2 === 0 ? start : 1 - start;
          point('lever', t, v, c, path);
          point('lever', t + len * beat, 1 - v, 'hold', path);
        });
        return;
      }
      case 'pump': {
        r.keys(o, path, ['move', 'from', 'to', 'low', 'high'], ['from', 'to', 'low', 'high']);
        const s = span();
        const low = r.num(o.low, `${path}.low`, 0, 1);
        const high = r.num(o.high, `${path}.high`, 0, 1);
        if (!s || low === null || high === null) return;
        for (const t of ticks(s[0], s[1], beat)) {
          point('slice', t, low, 'ease', path);
          point('slice', t + beat * 0.9, high, 'hold', path);
        }
        return;
      }
      case 'flash': {
        r.keys(o, path, ['move', 'at'], ['at']);
        const t = pos(o.at, `${path}.at`);
        if (t === null) return;
        point('fade', t - beat, 0, 'linear', path);
        point('fade', t, 0.9, 'hold', path);
        point('fade', t, 1, 'ease', path);
        point('fade', t + 2 * beat, 0, 'hold', path);
        return;
      }
      case 'rotate': {
        r.keys(o, path, ['move', 'input', 'from', 'to', 'every', 'clips', 'rate'], ['input', 'from', 'to', 'every', 'clips']);
        const input = inputOf(o.input, `${path}.input`);
        const s = span();
        const everyBars = r.num(o.every, `${path}.every`, 1 / 16, 64);
        const list = clipList(o.clips, `${path}.clips`);
        const rate = o.rate === undefined ? 1 : r.num(o.rate, `${path}.rate`, 0.0625, 16);
        if (input === null || !s || everyBars === null || !list || rate === null) return;
        ticks(s[0], s[1], everyBars * 4 * beat).forEach((t, k) => {
          const id = list[k % list.length]!;
          generated(t, { [input]: id }, { [id]: { from: 0, rate } });
        });
        return;
      }
      case 'montage': {
        r.keys(o, path, ['move', 'input', 'from', 'to', 'every', 'clips', 'stagger'], ['input', 'from', 'to', 'every', 'clips']);
        const input = inputOf(o.input, `${path}.input`);
        const s = span();
        const every = beats(o.every, `${path}.every`);
        const list = clipList(o.clips, `${path}.clips`);
        const stagger = o.stagger === undefined ? 1.37 : r.num(o.stagger, `${path}.stagger`, 0, 60);
        if (input === null || !s || every === null || !list || stagger === null) return;
        ticks(s[0], s[1], every * beat).forEach((t, k) => {
          const id = list[k % list.length]!;
          generated(t, { [input]: id }, { [id]: { from: k * stagger, rate: 1 } });
        });
        return;
      }
      case 'punch': {
        r.keys(o, path, ['move', 'bus', 'from', 'to', 'every', 'sources'], ['bus', 'from', 'to', 'every', 'sources']);
        const bus = r.oneOf(o.bus, `${path}.bus`, BUSES as readonly ('A' | 'B')[]);
        const s = span();
        const every = beats(o.every, `${path}.every`);
        const srcs = r.arr(o.sources, `${path}.sources`);
        if (!bus || !s || every === null || !srcs) return;
        const sources: BusSource[] = [];
        srcs.forEach((x, k) => {
          if (x === 'matte') sources.push('matte');
          else {
            const n = r.num(x, `${path}.sources[${k}]`, 1, 4, true);
            if (n !== null) sources.push(n as 1 | 2 | 3 | 4);
          }
        });
        if (sources.length !== srcs.length || !sources.length) return;
        ticks(s[0], s[1], every * beat).forEach((t, k) => {
          generated(t, {}, {}, [{ type: 'ASSIGN_SOURCE', bus, source: sources[k % sources.length]! }]);
        });
        return;
      }
    }
  }

  if (errorsOf(r.problems).length || !startPatch) return fail();

  // --- compile, then hold every intent against what the panel actually did
  // Without a known length (none in the file, none measured) nothing can be "after the
  // end": the score simply runs to its last event.
  const known = length > 0;
  if (!known) {
    for (const c of cues) length = Math.max(length, c.at + 1);
    for (const name of LANE_NAMES) for (const p of lanes[name]) length = Math.max(length, p.at + 1);
  }
  if (known) {
    for (const c of cues) {
      if (c.at > length) {
        r.warn('$.edit', `a cue at ${c.at.toFixed(2)} s is after the song ends (${length.toFixed(2)} s)`);
        break;
      }
    }
    for (const name of LANE_NAMES) {
      for (const p of lanes[name]) {
        if (p.at > length + 1) {
          r.warn(lanePath[name] ?? '$.edit', `the ${name} lane has a point at ${p.at.toFixed(2)} s, after the song ends`);
          break;
        }
      }
    }
  }
  for (const touch of laneTouches) {
    const first = lanes[touch.lane][0];
    if (first && touch.at >= first.at - 1e-9) {
      r.warn(touch.path, `the ${touch.lane} lane owns this control from ${first.at.toFixed(2)} s on, so this raw command is overridden every frame`);
    }
  }

  const score = compileScore({
    length,
    clips: ids,
    cues,
    lanes,
    markers,
    patch: startPatch as Patch,
  });
  checkIntents(r, cues, cueGroups, intents);

  return { doc, grid, clips, score, problems: r.problems };
}

/**
 * Re-run the cues in compile order and test each intent against the panel right after its
 * step — the same fold compileScore() does, so "refused" means the machine refused it.
 */
function checkIntents(
  r: Reader,
  cues: readonly Cue[],
  groups: readonly (readonly number[])[],
  intents: readonly { cue: number; step: number; path: string; check: (s: PanelState) => string | null }[],
): void {
  if (!intents.length) return;
  const order = cues.map((cue, i) => ({ cue, i }));
  order.sort((a, b) => a.cue.at - b.cue.at || a.i - b.i);
  let state = FACTORY_PRESET;
  for (const { cue, i } of order) {
    const mine = intents.filter((x) => x.cue === i);
    if (!mine.length) {
      state = applySteps(state, cue.steps);
      continue;
    }
    const ends = groups[i] ?? [];
    const after: PanelState[] = [];
    state = applySteps(state, cue.steps, (index, _before, next) => {
      after[index] = next;
    });
    for (const x of mine) {
      const end = ends[x.step];
      const s = end !== undefined && end > 0 ? after[end - 1] : undefined;
      const message = s ? x.check(s) : null;
      if (message) r.warn(x.path, message);
    }
  }
}

/** The document as a file, for Save. */
export function serializeMusicVideo(doc: MusicVideoDoc): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

/** A filename stem from the title. */
export function slugOf(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'music-video';
}

/** The INPUTS in document spelling. */
export function inputKey(input: Input): string {
  return input === 'ext-camera' ? 'ext' : String(input);
}

export { INPUTS };
export type { LanePoint };
