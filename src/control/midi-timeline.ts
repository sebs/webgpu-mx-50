// The MIDI timeline (ADR-0020): a demo's automation as MIDI messages stamped in logical
// ticks, played into the same MidiAdapter → binding table → coalescer → resolver path as a
// DAW or a hardware controller (ADR-0014/0018) — so a timeline is something Ableton could
// also play live, and nothing it does needs a second command path.
//
// Three lane kinds, each an idiom MIDI already has: Program Change recalls one of the
// timeline's preset SETUPS (Event Memory slots, reference §13), Note On fires discrete
// controls (Auto Fade, wipe pattern notes, sources), CC lanes are breakpoint envelopes
// sampled once per tick (14-bit MSB/LSB where the profile binding is `fine`).
//
// Scrubbing rests on two existing facts: the reducer is pure, and the transition runners
// are absolute in ticks (core/timeline.ts), so the panel at any frame is a replay of the
// messages up to it — no per-frame stepping, and checkpoints make a seek O(one second).
// Replay runs in TIMELINE space (frame f = tick f); a host loads the result shifted by its
// anchor (shiftRunnerTicks), so one cache serves every anchor.
//
// Pure and DOM-free: the player, the site and the unit suite import it.
// banira lib floor: index/`in`/`===` only — no Array.includes, no `**`.

import { reduce } from '../state/reducer.js';
import { FACTORY_PRESET, clonePanelState, panelSnapshot } from '../state/state.js';
import { ABLETON_PROFILE, BindingTable } from './bindings.js';
import { MidiAdapter } from './midi.js';
import { SignalCoalescer } from './resolver.js';
import type { BindingMap } from './bindings.js';
import type { Command } from '../state/commands.js';
import type { PanelState, TransitionRunner } from '../state/state.js';

export const TIMELINE_VERSION = 1;

/** Default musical tempo: 120 bpm puts a quarter note on exactly 30 frames. */
export const DEFAULT_TIMELINE_BPM = 120;

/** Shape of the segment that LEAVES a point (toward the next one). */
export type CurveKind = 'linear' | 'hold' | 'ease';

export interface CcPoint {
  readonly at: number;
  /** 0..1, quantised to 7 bits (or 14 when the lane is `fine`) on the way out. */
  readonly value: number;
  readonly curve?: CurveKind;
}

export interface CcLane {
  readonly kind: 'cc';
  readonly label?: string;
  readonly channel: number;
  readonly cc: number;
  /** Send the CC n / n+32 MSB/LSB pair (the binding must be `fine` too). */
  readonly fine?: boolean;
  /** Silent before the first point; afterwards a message only when the quantised value changes. */
  readonly points: readonly CcPoint[];
}

export interface NoteEvent {
  readonly at: number;
  readonly note: number;
  readonly velocity?: number;
}

export interface NoteLane {
  readonly kind: 'note';
  readonly label?: string;
  readonly channel: number;
  readonly events: readonly NoteEvent[];
}

export interface PcEvent {
  readonly at: number;
  readonly program: number;
}

export interface PcLane {
  readonly kind: 'pc';
  readonly label?: string;
  readonly channel: number;
  readonly events: readonly PcEvent[];
}

export type TimelineLane = CcLane | NoteLane | PcLane;

/** A preset the timeline ships: store commands applied to the factory panel, stored in `slot`. */
export interface TimelineSetup {
  readonly slot: number;
  readonly label: string;
  readonly commands: readonly Command[];
}

export interface TimelineMarker {
  readonly at: number;
  readonly label: string;
}

export interface MidiTimeline {
  readonly version: 1;
  readonly title: string;
  /** Frames (ticks at 60 per second); the playhead runs 0..length-1. */
  readonly length: number;
  readonly loop: boolean;
  /** Musical tempo, for Standard MIDI File export and transport sync. */
  readonly bpm?: number;
  /** The binding map the messages are resolved through; omitted = the published Ableton profile. */
  readonly profile?: BindingMap;
  readonly setups: readonly TimelineSetup[];
  readonly markers: readonly TimelineMarker[];
  readonly lanes: readonly TimelineLane[];
}

/** One compiled MIDI message at a frame. */
export interface TimelineMessage {
  readonly at: number;
  readonly data: readonly number[];
}

export function timelineProfile(timeline: MidiTimeline): BindingMap {
  return timeline.profile ?? ABLETON_PROFILE;
}

export function timelineBpm(timeline: MidiTimeline): number {
  return timeline.bpm ?? DEFAULT_TIMELINE_BPM;
}

// --- lanes ----------------------------------------------------------------------------

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** The envelope value at `frame`, or null before the lane's first point (silent). */
export function sampleCcLane(lane: CcLane, frame: number): number | null {
  const pts = lane.points;
  if (pts.length === 0 || frame < pts[0]!.at) return null;
  let i = 0;
  while (i + 1 < pts.length && pts[i + 1]!.at <= frame) i++;
  const a = pts[i]!;
  const b = pts[i + 1];
  if (!b || (a.curve ?? 'linear') === 'hold' || b.at === a.at) return clamp01(a.value);
  const u = (frame - a.at) / (b.at - a.at);
  const k = a.curve === 'ease' ? u * u * (3 - 2 * u) : u;
  return clamp01(a.value + (b.value - a.value) * k);
}

/** A lane's binding address — the MSB address for a fine CC pair. */
export function laneAddress(lane: TimelineLane, number?: number): string {
  if (lane.kind === 'cc') return `midi:cc/${lane.channel}/${lane.cc}`;
  if (lane.kind === 'pc') return `midi:pc/${lane.channel}/${number ?? 0}`;
  return `midi:note/${lane.channel}/${number ?? 0}`;
}

/** Within one frame: setups first, then notes, then motion — so a CC lands on the recalled panel. */
const KIND_ORDER: { [kind: string]: number } = { pc: 0, note: 1, cc: 2 };

/**
 * Compile the lanes into the MIDI byte stream a DAW would send: PC and Note On per event,
 * CC only where the quantised envelope changes (a fine lane sends MSB then LSB). Sorted by
 * frame, then setups → notes → motion, then lane order. Note Off is not sent: the adapter
 * routes Note On only (an SMF export adds the offs).
 */
export function compileTimeline(timeline: MidiTimeline): TimelineMessage[] {
  const out: { at: number; order: number; lane: number; seq: number; data: number[] }[] = [];
  let seq = 0;
  timeline.lanes.forEach((lane, laneIndex) => {
    const order = KIND_ORDER[lane.kind]!;
    const push = (at: number, data: number[]): void => {
      out.push({ at, order, lane: laneIndex, seq: seq++, data });
    };
    if (lane.kind === 'pc') {
      for (const e of lane.events) push(e.at, [0xc0 | lane.channel, e.program & 0x7f]);
      return;
    }
    if (lane.kind === 'note') {
      for (const e of lane.events) push(e.at, [0x90 | lane.channel, e.note & 0x7f, e.velocity ?? 100]);
      return;
    }
    let prev = -1;
    const scale = lane.fine ? 16383 : 127;
    for (let f = 0; f < timeline.length; f++) {
      const v = sampleCcLane(lane, f);
      if (v === null) continue;
      const q = Math.round(v * scale);
      if (q === prev) continue;
      prev = q;
      if (lane.fine) {
        push(f, [0xb0 | lane.channel, lane.cc, q >> 7]);
        push(f, [0xb0 | lane.channel, lane.cc + 32, q & 0x7f]);
      } else {
        push(f, [0xb0 | lane.channel, lane.cc, q]);
      }
    }
  });
  out.sort((a, b) => a.at - b.at || a.order - b.order || a.lane - b.lane || a.seq - b.seq);
  return out.map((m) => ({ at: m.at, data: m.data }));
}

/** Messages grouped per frame: `starts[f]..starts[f+1]` indexes `messages`. */
export interface FrameIndex {
  readonly messages: readonly TimelineMessage[];
  readonly starts: readonly number[];
}

export function indexByFrame(messages: readonly TimelineMessage[], length: number): FrameIndex {
  const starts: number[] = [];
  let i = 0;
  for (let f = 0; f <= length; f++) {
    while (i < messages.length && messages[i]!.at < f) i++;
    starts.push(i);
  }
  return { messages, starts };
}

// --- setups & base state --------------------------------------------------------------

/** The panel a setup's commands build from the factory preset. */
export function setupState(setup: TimelineSetup): PanelState {
  let state = clonePanelState(FACTORY_PRESET);
  for (const command of setup.commands) state = reduce(state, command);
  return state;
}

/** The factory panel with the timeline's setups stored in their Event Memory slots. */
export function timelineBase(timeline: MidiTimeline): PanelState {
  const base = clonePanelState(FACTORY_PRESET);
  const slots = base.memory.slots.slice();
  for (const setup of timeline.setups) slots[setup.slot - 1] = panelSnapshot(setupState(setup));
  return { ...base, memory: { ...base.memory, slots } };
}

// --- tick shifting --------------------------------------------------------------------

function shiftRunner(r: TransitionRunner, delta: number): TransitionRunner {
  if (r.phase === 'idle') return r;
  return { ...r, startTick: r.startTick + delta, lastTick: r.lastTick + delta };
}

/**
 * Move a panel between tick spaces: the three runners are the only state holding absolute
 * ticks (ADR-0012). Idle runners are left as they are, so an idle panel is returned as-is.
 */
export function shiftRunnerTicks(state: PanelState, delta: number): PanelState {
  if (delta === 0) return state;
  const take = shiftRunner(state.transition.auto, delta);
  const fade = shiftRunner(state.fade.auto, delta);
  const special = shiftRunner(state.specialMode.run, delta);
  if (take === state.transition.auto && fade === state.fade.auto && special === state.specialMode.run) return state;
  return {
    ...state,
    transition: { ...state.transition, auto: take },
    fade: { ...state.fade, auto: fade },
    specialMode: { ...state.specialMode, run: special },
  };
}

/** Any runner in flight — the panel still moves on its own when the playhead stops. */
export function runnersInFlight(state: PanelState): boolean {
  const active = (r: TransitionRunner): boolean => r.phase === 'running' || r.phase === 'paused';
  return active(state.transition.auto) || active(state.fade.auto) || active(state.specialMode.run);
}

// --- one frame, exactly as a host plays it ----------------------------------------------

/**
 * The per-frame contract shared by replay and live playback: push the frame's messages
 * through the adapter, catch the runners up to the previous tick, flush at this frame's
 * tick, then advance to it — what a host does when its beforeFrame hook flushes a
 * coalescer and the loop dispatches ADVANCE_TIMELINE (ADR-0012). A frame with no messages
 * changes nothing a later ADVANCE would not (the runners are absolute), so it is skipped.
 * `skip` drops messages (the player mutes lanes a recording take has touched).
 */
export function playFrame(
  index: FrameIndex,
  frame: number,
  tick: number,
  midi: MidiAdapter,
  coalescer: SignalCoalescer,
  getState: () => PanelState,
  dispatch: (command: Command) => void,
  skip?: (data: readonly number[]) => boolean,
): void {
  const from = index.starts[frame]!;
  const to = index.starts[frame + 1]!;
  if (from === to) return;
  for (let i = from; i < to; i++) {
    const data = index.messages[i]!.data;
    if (!skip || !skip(data)) midi.handle(new Uint8Array(data));
  }
  dispatch({ type: 'ADVANCE_TIMELINE', tick: tick - 1 });
  coalescer.flush(getState(), tick, dispatch);
  dispatch({ type: 'ADVANCE_TIMELINE', tick });
}

/** Seek cache spacing: a seek replays at most this many frames past a checkpoint. */
const CHECKPOINT_FRAMES = 60;

/**
 * Deterministic replay: `stateAt(f)` is the panel after frame f has played, in timeline
 * ticks. Checkpoints (immutable snapshots, so structurally shared) are filled lazily as
 * replays pass them.
 */
export class TimelineReplay {
  readonly base: PanelState;
  readonly index: FrameIndex;
  private readonly midi: MidiAdapter;
  private readonly coalescer = new SignalCoalescer();
  /** checkpoints[k] = stateAt(k * CHECKPOINT_FRAMES). */
  private readonly checkpoints: PanelState[] = [];
  private last: { frame: number; state: PanelState } | null = null;

  constructor(readonly timeline: MidiTimeline) {
    this.base = timelineBase(timeline);
    this.index = indexByFrame(compileTimeline(timeline), timeline.length);
    this.midi = new MidiAdapter(new BindingTable(timelineProfile(timeline)), this.coalescer);
  }

  stateAt(frame: number): PanelState {
    const f = frame < 0 ? 0 : frame >= this.timeline.length ? this.timeline.length - 1 : Math.floor(frame);
    if (this.last && this.last.frame === f) return this.last.state;
    let k = Math.floor(f / CHECKPOINT_FRAMES);
    if (k >= this.checkpoints.length) k = this.checkpoints.length - 1;
    let state: PanelState;
    let at: number;
    if (k < 0) {
      state = this.base;
      at = -1;
    } else {
      state = this.checkpoints[k]!;
      at = k * CHECKPOINT_FRAMES;
    }
    // Resume from the last answer when it is closer (the common forward-play/scrub case).
    if (this.last && this.last.frame > at && this.last.frame < f) {
      state = this.last.state;
      at = this.last.frame;
    }
    let current = state;
    const getState = (): PanelState => current;
    const dispatch = (command: Command): void => {
      current = reduce(current, command);
    };
    for (let g = at + 1; g <= f; g++) {
      playFrame(this.index, g, g, this.midi, this.coalescer, getState, dispatch);
      if (g % CHECKPOINT_FRAMES === 0 && g / CHECKPOINT_FRAMES === this.checkpoints.length) {
        dispatch({ type: 'ADVANCE_TIMELINE', tick: g });
        this.checkpoints.push(current);
      }
    }
    dispatch({ type: 'ADVANCE_TIMELINE', tick: f });
    this.last = { frame: f, state: current };
    return current;
  }
}

// --- markers --------------------------------------------------------------------------

/** The marker in force at `frame` (the last one at or before it), or null. */
export function markerAt(timeline: MidiTimeline, frame: number): TimelineMarker | null {
  let found: TimelineMarker | null = null;
  for (const m of timeline.markers) if (m.at <= frame && (!found || m.at >= found.at)) found = m;
  return found;
}

// --- validation -----------------------------------------------------------------------

const isFrame = (v: number, length: number): boolean => Math.floor(v) === v && v >= 0 && v < length;

/**
 * Every reason a timeline would not play as written. Empty = valid. Beyond the shape, it
 * catches the two ordering traps of the ADR-0014/0018 path: a trigger/toggle note in the
 * same frame as a Program Change resolves BEFORE the recall (the coalescer flushes pulses
 * first) and is undone by it; and an Auto Take after a recall walks the Event Memory bank
 * instead of taking (the armed-next pointer, ADR-0018), so takes belong on the lever lane.
 */
export function validateTimeline(timeline: MidiTimeline): string[] {
  const problems: string[] = [];
  if (timeline.version !== TIMELINE_VERSION) problems.push(`version ${String(timeline.version)} is not ${TIMELINE_VERSION}`);
  const length = timeline.length;
  if (!(Math.floor(length) === length && length > 0)) {
    problems.push('length must be a positive whole number of frames');
    return problems;
  }
  const profile = timelineProfile(timeline);
  const slots: number[] = [];
  for (const s of timeline.setups) {
    if (!(s.slot >= 1 && s.slot <= 8 && Math.floor(s.slot) === s.slot)) problems.push(`setup "${s.label}": slot ${s.slot} is not 1–8`);
    else if (slots.indexOf(s.slot) !== -1) problems.push(`setup "${s.label}": slot ${s.slot} is used twice`);
    slots.push(s.slot);
  }
  for (const m of timeline.markers) if (!isFrame(m.at, length)) problems.push(`marker "${m.label}" at ${m.at} is outside 0–${length - 1}`);

  const pcFrames: number[] = [];
  let firstPc = Infinity;
  timeline.lanes.forEach((lane, i) => {
    const name = lane.label ?? `lane ${i + 1}`;
    if (!(lane.channel >= 0 && lane.channel <= 15)) problems.push(`${name}: channel ${lane.channel} is not 0–15`);
    if (lane.kind !== 'pc') return;
    for (const e of lane.events) {
      if (!isFrame(e.at, length)) problems.push(`${name}: event at ${e.at} is outside 0–${length - 1}`);
      const address = laneAddress(lane, e.program);
      const b = profile[address];
      if (!b) problems.push(`${name}: ${address} is not bound in the profile`);
      else if (b.control === 'memory.recall' && b.value !== undefined && slots.indexOf(b.value) === -1) {
        problems.push(`${name}: program ${e.program} at ${e.at} recalls slot ${b.value}, which no setup fills`);
      }
      pcFrames.push(e.at);
      if (e.at < firstPc) firstPc = e.at;
    }
  });

  timeline.lanes.forEach((lane, i) => {
    const name = lane.label ?? `lane ${i + 1}`;
    if (lane.kind === 'cc') {
      if (!(lane.cc >= 0 && lane.cc <= 119)) problems.push(`${name}: CC ${lane.cc} is not 0–119`);
      if (lane.fine && lane.cc >= 32) problems.push(`${name}: a fine (14-bit) lane needs a CC below 32`);
      const b = profile[laneAddress(lane)];
      if (!b) problems.push(`${name}: ${laneAddress(lane)} is not bound in the profile`);
      else {
        if (b.relative || b.mode !== 'set') problems.push(`${name}: ${laneAddress(lane)} is not an absolute (set) binding, so it cannot be scrubbed`);
        if (!!b.fine !== !!lane.fine) problems.push(`${name}: the lane is ${lane.fine ? '' : 'not '}fine but its binding is ${b.fine ? '' : 'not '}fine`);
      }
      let prev = -1;
      for (const p of lane.points) {
        if (!isFrame(p.at, length)) problems.push(`${name}: point at ${p.at} is outside 0–${length - 1}`);
        if (p.at < prev) problems.push(`${name}: points are not in frame order at ${p.at}`);
        if (!(p.value >= 0 && p.value <= 1)) problems.push(`${name}: value ${p.value} at ${p.at} is not 0–1`);
        prev = p.at;
      }
      return;
    }
    if (lane.kind !== 'note') return;
    for (const e of lane.events) {
      if (!isFrame(e.at, length)) problems.push(`${name}: event at ${e.at} is outside 0–${length - 1}`);
      const address = laneAddress(lane, e.note);
      const b = profile[address];
      if (!b) {
        problems.push(`${name}: ${address} is not bound in the profile`);
        continue;
      }
      const pulse = b.mode === 'trigger' || b.mode === 'toggle';
      if (pulse && pcFrames.indexOf(e.at) !== -1) {
        problems.push(`${name}: note ${e.note} at ${e.at} shares a frame with a Program Change, which would undo it — move it a frame later`);
      }
      if (b.control === 'autoTake.trigger' && e.at > firstPc) {
        problems.push(`${name}: Auto Take at ${e.at} follows a recall, so it would recall the next slot (ADR-0018) — automate the lever instead`);
      }
    }
  });
  return problems;
}
