// The music video's edit: a cue sheet for one mixer, on the song's bar grid. Everything the
// operator does is a real store command run through the real reducer — bus punches, the
// lever, wipes, keys, the Downstream Key, effects, fades — plus the one thing a panel
// cannot do: re-patching which clip feeds which input (the registry, ADR-0008), as a
// vision engineer would between takes.
//
// The picture is a pure function of song time, so the page can seek anywhere:
//   - CUES are discrete. compileScore() folds them through reduce() from the factory
//     panel into one checkpoint state per cue; a frame loads the checkpoint for its time.
//   - LANES are continuous (lever, fade, slice, mosaic, hue…): breakpoint envelopes
//     sampled per frame and dispatched on top of the checkpoint. A control that has a lane
//     is owned by it from its first point on — cues leave it alone.
//   - CLIP PLAYBACK (offset + rate) is part of each cue, so a clip's expected position at
//     any time is computable and a seek can put every video where it should be.
//
// No Auto Take/Auto Fade runners: they run on host ticks, which a seek cannot replay.
// DOM-free on purpose — the unit suite compiles and samples it.
// banira lib floor: index/`in`/`===` only — no Array.includes, no `**`.

import { reduce } from '../../src/state/reducer.js';
import { FACTORY_PRESET } from '../../src/state/state.js';
import { complementaryMatteIndex } from '../../src/core/wipe.js';
import type { Command } from '../../src/state/commands.js';
import type {
  AvSynchroEffect,
  ColourCorrectMode,
  DskEdgeStyle,
  DskFill,
  FadeTarget,
  PanelState,
  TransitionType,
  WipeEdge,
} from '../../src/state/state.js';
import type { BusId, BusSource } from '../../src/core/types.js';

// --- the grid ---------------------------------------------------------------------------

/** Measured from the track: the kick lands on this grid within a frame or two all the way through. */
export const BPM = 130.97;
export const BEAT = 60 / BPM;
export const BAR = 4 * BEAT;
/** The first downbeat (bar 0), seconds. */
export const DOWNBEAT = 0.503;
export const SONG_LENGTH = 309.52;

/** Seconds at a bar (and beat within it); bars may be fractional. */
export function at(bar: number, beat = 0): number {
  return DOWNBEAT + bar * BAR + beat * BEAT;
}

// --- the footage ------------------------------------------------------------------------

export type ClipId = 'spiral' | 'line1' | 'line2' | 'line3' | 'crowd' | 'crew';

export interface Clip {
  readonly id: ClipId;
  readonly file: string;
  readonly label: string;
  readonly duration: number;
}

export const CLIPS: readonly Clip[] = [
  { id: 'spiral', file: '135378-761676435.mp4', label: 'Spiral', duration: 10 },
  { id: 'line1', file: '140629-775595871.mp4', label: 'Line dancer I', duration: 5.666 },
  { id: 'line2', file: '140630-775595877.mp4', label: 'Line dancer II', duration: 5.75 },
  { id: 'line3', file: '140631-775595881.mp4', label: 'Line dancer III', duration: 5.75 },
  { id: 'crowd', file: '142030-779071797.mp4', label: 'Crowd', duration: 14.931 },
  { id: 'crew', file: '142032-779071806.mp4', label: 'Crew', duration: 22.564 },
];

export const SONG_FILE = 'song.m4a';

/** The inputs a clip can be patched into: Sources 1–4 and the External Camera (DSK key). */
export type Input = 1 | 2 | 3 | 4 | 'ext-camera';
export const INPUTS: readonly Input[] = [1, 2, 3, 4, 'ext-camera'];

export type Patch = { readonly [K in Input]: ClipId };

export interface ClipPlay {
  /** Song time the clip was (re)started. */
  readonly at: number;
  /** Clip time at that moment. */
  readonly from: number;
  readonly rate: number;
}

/** Where a clip's picture is at song time `t`, looped over its duration. */
export function clipTime(clip: Clip, play: ClipPlay, t: number): number {
  const raw = play.from + (t - play.at) * play.rate;
  const d = clip.duration;
  return ((raw % d) + d) % d;
}

// --- cues -------------------------------------------------------------------------------

/** A command, or a function of the panel at that moment (for set-to-value over toggles). */
export type Step = Command | ((s: PanelState) => Command[]);

export interface Cue {
  readonly at: number;
  readonly steps: readonly Step[];
  readonly patch?: Partial<Patch>;
  readonly play?: { readonly [K in ClipId]?: { from?: number; rate?: number } };
}

export interface CompiledCue {
  readonly at: number;
  readonly state: PanelState;
  readonly patch: Patch;
  readonly clips: { readonly [K in ClipId]: ClipPlay };
}

// --- lanes ------------------------------------------------------------------------------

export type Curve = 'linear' | 'hold' | 'ease';

export interface LanePoint {
  readonly at: number;
  readonly value: number;
  /** Shape of the segment LEAVING this point. */
  readonly curve: Curve;
}

export type LaneName =
  | 'lever'
  | 'fade'
  | 'slice'
  | 'mosaic'
  | 'chromaA'
  | 'chromaB'
  | 'hueA'
  | 'hueB'
  | 'strobe'
  | 'dskHigh'
  | 'orbit'
  | 'avLevel';

export const LANE_NAMES: readonly LaneName[] = [
  'lever',
  'fade',
  'slice',
  'mosaic',
  'chromaA',
  'chromaB',
  'hueA',
  'hueB',
  'strobe',
  'dskHigh',
  'orbit',
  'avLevel',
];

/** What each lane drives. Hue and orbit are angles (turns) mapped onto a joystick circle. */
export function laneCommands(lane: LaneName, v: number): Command[] {
  const angle = v * 2 * Math.PI;
  switch (lane) {
    case 'lever':
      return [{ type: 'SET_LEVER', position: v }];
    case 'fade':
      return [{ type: 'SET_FADE_LEVER', position: v }];
    case 'slice':
      return [{ type: 'SET_SLICE', value: v }];
    case 'mosaic':
      return [{ type: 'SET_MOSAIC_SIZE', step: v }];
    case 'chromaA':
      return [{ type: 'SET_CHROMA', bus: 'A', value: v }];
    case 'chromaB':
      return [{ type: 'SET_CHROMA', bus: 'B', value: v }];
    case 'hueA':
      return [{ type: 'SET_CC_JOYSTICK', bus: 'A', x: 0.75 * Math.cos(angle), y: 0.75 * Math.sin(angle) }];
    case 'hueB':
      return [{ type: 'SET_CC_JOYSTICK', bus: 'B', x: 0.75 * Math.cos(angle), y: 0.75 * Math.sin(angle) }];
    case 'strobe':
      return [{ type: 'SET_STROBE_TIME', position: v }];
    case 'dskHigh':
      return [{ type: 'SET_DSK_HIGH', level: v }];
    case 'orbit':
      return [{ type: 'SET_POSITIONER_JOYSTICK', x: 0.55 * Math.cos(angle), y: 0.4 * Math.sin(angle) }];
    case 'avLevel':
      return [{ type: 'SET_AV_SYNCHRO_LEVEL', level: v }];
  }
}

/** The envelope value at `t`, or null before the lane's first point (the cue owns it then). */
export function sampleLane(points: readonly LanePoint[], t: number): number | null {
  if (points.length === 0 || t < points[0]!.at) return null;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (points[mid]!.at <= t) lo = mid;
    else hi = mid - 1;
  }
  const a = points[lo]!;
  const b = points[lo + 1];
  if (!b || a.curve === 'hold' || b.at === a.at) return a.value;
  const u = (t - a.at) / (b.at - a.at);
  const k = a.curve === 'ease' ? u * u * (3 - 2 * u) : u;
  return a.value + (b.value - a.value) * k;
}

// --- the compiled score -----------------------------------------------------------------

export interface Marker {
  readonly at: number;
  readonly label: string;
}

export interface Score {
  readonly length: number;
  readonly cues: readonly CompiledCue[];
  readonly lanes: { readonly [K in LaneName]: readonly LanePoint[] };
  readonly markers: readonly Marker[];
}

/** Index of the cue in force at `t` (the last one at or before it; 0 before the first). */
export function cueIndexAt(score: Score, t: number): number {
  const cues = score.cues;
  let lo = 0;
  let hi = cues.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cues[mid]!.at <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Every lane's commands at `t` — what a frame dispatches on top of its checkpoint. */
export function laneCommandsAt(score: Score, t: number): Command[] {
  const out: Command[] = [];
  for (const name of LANE_NAMES) {
    const v = sampleLane(score.lanes[name], t);
    if (v !== null) for (const c of laneCommands(name, v)) out.push(c);
  }
  return out;
}

/** The section marker in force at `t`. */
export function markerAt(score: Score, t: number): Marker | null {
  let found: Marker | null = null;
  for (const m of score.markers) if (m.at <= t) found = m;
  return found;
}

/** The full panel at `t`: checkpoint, then lanes — what the page shows, headlessly. */
export function stateAt(score: Score, t: number): PanelState {
  let s = score.cues[cueIndexAt(score, t)]!.state;
  for (const c of laneCommandsAt(score, t)) s = reduce(s, c);
  return s;
}

function applySteps(state: PanelState, steps: readonly Step[]): PanelState {
  let s = state;
  for (const step of steps) {
    const commands = typeof step === 'function' ? step(s) : [step];
    for (const c of commands) s = reduce(s, c);
  }
  return s;
}

export function compileScore(spec: {
  readonly cues: readonly Cue[];
  readonly lanes: { readonly [K in LaneName]: readonly LanePoint[] };
  readonly markers: readonly Marker[];
  readonly patch: Patch;
}): Score {
  // Stable by time: cues authored at the same moment apply in authoring order.
  const order = spec.cues.map((cue, i) => ({ cue, i }));
  order.sort((a, b) => a.cue.at - b.cue.at || a.i - b.i);

  let state = FACTORY_PRESET;
  let patch: Patch = spec.patch;
  const clips = {} as { [K in ClipId]: ClipPlay };
  for (const c of CLIPS) clips[c.id] = { at: 0, from: 0, rate: 1 };

  const compiled: CompiledCue[] = [{ at: 0, state, patch, clips: { ...clips } }];
  for (const { cue } of order) {
    state = applySteps(state, cue.steps);
    if (cue.patch) patch = { ...patch, ...cue.patch };
    if (cue.play) {
      for (const id in cue.play) {
        const p = cue.play[id as ClipId]!;
        const prev = clips[id as ClipId];
        const clip = CLIPS.filter((c) => c.id === id)[0]!;
        clips[id as ClipId] = {
          at: cue.at,
          from: p.from !== undefined ? p.from : clipTime(clip, prev, cue.at),
          rate: p.rate !== undefined ? p.rate : prev.rate,
        };
      }
    }
    const entry: CompiledCue = { at: cue.at, state, patch, clips: { ...clips } };
    // Several cues on one moment collapse into the last one's result.
    if (compiled[compiled.length - 1]!.at === cue.at) compiled[compiled.length - 1] = entry;
    else compiled.push(entry);
  }

  const lanes = {} as { [K in LaneName]: LanePoint[] };
  for (const name of LANE_NAMES) {
    const pts = spec.lanes[name].slice();
    pts.sort((a, b) => a.at - b.at);
    lanes[name] = pts;
  }
  const markers = spec.markers.slice();
  markers.sort((a, b) => a.at - b.at);
  return { length: SONG_LENGTH, cues: compiled, lanes, markers };
}

// --- set-to-value helpers ---------------------------------------------------------------
// The panel has toggles and cycling buttons; the score wants "make it so". These press a
// button only as many times as the reducer says it takes, so a cue reads as intent.

function pressUntil(press: Command, done: (s: PanelState) => boolean, limit = 4): Step {
  return (s) => {
    const out: Command[] = [];
    let x = s;
    for (let i = 0; i < limit && !done(x); i++) {
      x = reduce(x, press);
      out.push(press);
    }
    return out;
  };
}

export function buses(a: BusSource, b: BusSource): Step[] {
  return [
    { type: 'ASSIGN_SOURCE', bus: 'A', source: a },
    { type: 'ASSIGN_SOURCE', bus: 'B', source: b },
  ];
}

export function transition(type: TransitionType): Step {
  return { type: 'SET_TRANSITION_TYPE', transition: type };
}

export function wipeEdge(edge: WipeEdge): Step {
  const press: Command = edge === 'soft-narrow' || edge === 'soft-wide' ? { type: 'PRESS_SOFT' } : { type: 'PRESS_BORDER' };
  return pressUntil(press, (s) => s.transition.wipe.edge === edge);
}

/** A wipe pattern by its §9.7 number (+128 reversed), with modifiers set (not toggled). */
export function wipe(
  number: number,
  opts: { edge?: WipeEdge; multi?: number; blinds?: boolean; pairing?: boolean } = {},
): Step[] {
  return [
    transition('wipe'),
    { type: 'SET_WIPE_PATTERN', number },
    { type: 'SET_WIPE_MULTI', mode: opts.multi ?? 0 },
    { type: 'SET_BLINDS', on: opts.blinds ?? false },
    { type: 'SET_PAIRING', on: opts.pairing ?? false },
    wipeEdge(opts.edge ?? 'hard'),
  ];
}

export interface EffectSet {
  nega?: boolean;
  mosaic?: boolean;
  mono?: boolean;
  paint?: boolean;
  still?: boolean;
  strobe?: boolean;
  trail?: boolean;
  multi?: 0 | 4 | 9 | 16;
}

/** Exactly these digital effects on `bus`, everything else off (the block owns one bus). */
export function effect(bus: BusId, want: EffectSet = {}): Step {
  return (s) => {
    const out: Command[] = [];
    let x = s;
    const send = (c: Command): void => {
      x = reduce(x, c);
      out.push(c);
    };
    send({ type: 'SELECT_EFFECT_BUS', bus });
    const filters: ('nega' | 'mosaic' | 'mono' | 'paint')[] = ['nega', 'mosaic', 'mono', 'paint'];
    for (const f of filters) {
      if (x.digitalEffect.active[f] !== !!want[f]) {
        send({ type: 'CHOOSE_EFFECT', effect: f });
        send({ type: 'PRESS_EFFECT_ON' });
      }
    }
    // Offs first, so an exclusion (Still ⊥ Strobe/Multi) never fights an on.
    const freezes: ('still' | 'strobe' | 'trail')[] = ['still', 'strobe', 'trail'];
    for (const f of freezes) if (!want[f] && x.digitalEffect.freeze[f]) send({ type: 'ENGAGE_FREEZE', effect: f, on: false });
    if (!want.multi && x.digitalEffect.freeze.multi) send({ type: 'SET_MULTI_GRID', count: 0 });
    if (want.trail) send({ type: 'ATTEMPT_AV_SYNCHRO', on: false }); // Trail ⊥ A/V Synchro
    for (const f of freezes) if (want[f] && !x.digitalEffect.freeze[f]) send({ type: 'ENGAGE_FREEZE', effect: f, on: true });
    if (want.multi) send({ type: 'SET_MULTI_GRID', count: want.multi });
    return out;
  };
}

/** A/V Synchro: the song's kick pulses these effects on the effect bus. */
export function avSynchro(effects: readonly AvSynchroEffect[]): Step[] {
  const all: AvSynchroEffect[] = ['nega', 'mosaic', 'mono', 'paint', 'still', 'strobe'];
  const steps: Step[] = all.map((e) => ({ type: 'SET_AV_SYNCHRO_EFFECT', effect: e, on: effects.indexOf(e) !== -1 }) as Command);
  steps.push({ type: 'ATTEMPT_AV_SYNCHRO', on: effects.length > 0 });
  return steps;
}

export function colourCorrect(bus: BusId, mode: ColourCorrectMode): Step {
  return pressUntil({ type: 'PRESS_COLOUR_CORRECT', bus }, (s) => (bus === 'A' ? s.busA : s.busB).colourCorrect.mode === mode);
}

export interface DskSet {
  fill?: DskFill;
  source?: 'ext-camera' | 'A' | 'B';
  low?: number;
  high?: number;
  edge?: DskEdgeStyle;
  edgeColor?: number;
  reverse?: boolean;
}

/** The Downstream Key; by default the External Camera's dark lines are the characters. */
export function dsk(on: boolean, set: DskSet = {}): Step[] {
  if (!on) return [{ type: 'SET_DSK_ON', on: false }];
  return [
    { type: 'SET_DSK_FILL', fill: set.fill ?? 'white' },
    { type: 'SET_DSK_KEY_SOURCE', source: set.source ?? 'ext-camera' },
    { type: 'SET_DSK_LOW', level: set.low ?? 0 },
    { type: 'SET_DSK_HIGH', level: set.high ?? 0.42 },
    { type: 'SET_DSK_EDGE', edge: set.edge ?? 'normal' },
    { type: 'SET_DSK_EDGE_COLOR', colorIndex: set.edgeColor ?? 1 },
    pressUntil({ type: 'PRESS_DSK_REVERSE' }, (s) => s.dsk.reverse === !!set.reverse, 1),
    { type: 'SET_DSK_ON', on: true },
  ];
}

export function fadeTo(target: FadeTarget, video: boolean, dskToo: boolean): Step[] {
  return [
    { type: 'SET_FADE_TARGET', target },
    { type: 'SET_FADE_ENABLE', element: 'video', on: video },
    { type: 'SET_FADE_ENABLE', element: 'dsk', on: dskToo },
  ];
}

export function positioner(on: boolean): Step {
  return pressUntil({ type: 'PRESS_POSITIONER' }, (s) => s.positioner.on === on, 1);
}

/** Matte colours (reference §4): the wipe border and the DSK's matte fill. */
export const MATTE = { white: 1, yellow: 2, cyan: 3, green: 4, magenta: 5, red: 6, blue: 7, black: 8 } as const;

export function matte(colorIndex: number): Step {
  return { type: 'SET_MATTE_COLOR', colorIndex };
}

/** The wipe border is drawn in the matte's complement (reference §9.4): set the matte that gives `colorIndex`. */
export function borderColour(colorIndex: number): Step {
  for (let i = 0; i < 9; i++) if (complementaryMatteIndex(i) === colorIndex) return matte(i);
  return matte(colorIndex);
}
