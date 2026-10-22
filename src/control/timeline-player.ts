// The timeline player (ADR-0020): drives one host's store from a MidiTimeline. It is a
// composition-root tool — it needs the host's beforeFrame hook, which the mixer context
// deliberately does not carry (ADR-0017) — and it is DOM-free, so the unit suite plays it
// against a headless engine with a hand-stepped clock.
//
// Time: the host clock stays sovereign (ADR-0012) and never jumps. The player keeps an
// ANCHOR, and the playhead is `tick − anchor`. Playing processes every frame the host
// stepped past, through the same playFrame contract the replay uses, so playing to f and
// seeking to f land on the same panel. Seeking (and loop wrap) re-anchors and loads the
// replayed panel, shifted into host ticks. While paused, the anchor slides with the clock;
// the panel is reloaded only while a runner is in flight (a paused Auto Fade must not keep
// moving), so a paused, settled panel stays free for the visitor to play with.
//
// Live MIDI goes through `input()`: messages are monitored through the timeline's own
// adapter (so a controller plays the mixer while the timeline is loaded), captured into a
// punch-in take while recording, and — when following — MIDI transport (Start / Stop /
// Continue / Song Position / Clock) moves the playhead (Ableton as transport master).
//
// banira lib floor: index/`in`/`===` only — no Array.includes, no `**`.

import { BindingTable } from './bindings.js';
import { MidiAdapter } from './midi.js';
import { SignalCoalescer } from './resolver.js';
import { TimelineReplay, markerAt, playFrame, runnersInFlight, shiftRunnerTicks, timelineBpm, timelineProfile } from './midi-timeline.js';
import { mergeRecording } from './timeline-record.js';
import { MidiTransport } from './midi-transport.js';
import type { MidiTimeline, TimelineMarker } from './midi-timeline.js';
import type { RecordedMessage } from './timeline-record.js';
import type { PanelStore } from '../state/store.js';
import type { Command } from '../state/commands.js';

type Unsubscribe = () => void;

/** What the player needs from a host — an <mx-mixer> satisfies it once running. */
export interface TimelineHost {
  readonly store: PanelStore;
  tick(): number;
  beforeFrame(fn: (tick: number) => void): Unsubscribe;
}

export interface TimelinePlayerOptions {
  /** Start playing on attach (default true); false holds frame 0. */
  autoplay?: boolean;
}

/**
 * The lane keys a message belongs to, as mergeRecording groups lanes: a whole note or PC
 * channel, or one controller — both halves of a 14-bit pair, since the pair is one lane.
 */
function laneKeys(data: readonly number[]): string[] {
  const status = data[0]! & 0xf0;
  const channel = data[0]! & 0x0f;
  if (status === 0x90 || status === 0x80) return [`note/${channel}`];
  if (status === 0xc0) return [`pc/${channel}`];
  if (status !== 0xb0) return [];
  const cc = data[1]!;
  const partner = cc < 32 ? cc + 32 : cc < 64 ? cc - 32 : -1;
  return partner === -1 ? [`cc/${channel}/${cc}`] : [`cc/${channel}/${cc}`, `cc/${channel}/${partner}`];
}

function isTouched(touched: readonly string[], data: readonly number[]): boolean {
  for (const k of laneKeys(data)) if (touched.indexOf(k) !== -1) return true;
  return false;
}

/** Transport drift (frames) tolerated before a followed clock re-seeks the playhead. */
const FOLLOW_TOLERANCE = 2;

export class TimelinePlayer {
  private replayRef: TimelineReplay;
  private readonly coalescer = new SignalCoalescer();
  private midi: MidiAdapter;
  private readonly transport: MidiTransport;
  private readonly listeners = new Set<() => void>();
  private readonly unhook: Unsubscribe;

  private positionNow = 0;
  private anchorNow = 0;
  private playingNow: boolean;
  private loopNow: boolean;
  private pendingSeek: number | null = 0; // the first frame loads frame 0
  private hostTick = 0;

  private recording: { from: number; messages: RecordedMessage[] } | null = null;
  /** Lane keys a take has touched — muted in playback until the take ends. */
  private readonly touched: string[] = [];
  private readonly live: number[][] = [];
  private followNow = false;

  constructor(
    private readonly host: TimelineHost,
    timeline: MidiTimeline,
    options: TimelinePlayerOptions = {},
  ) {
    this.replayRef = new TimelineReplay(timeline);
    this.midi = new MidiAdapter(new BindingTable(timelineProfile(timeline)), this.coalescer);
    this.transport = new MidiTransport(timelineBpm(timeline));
    this.playingNow = options.autoplay !== false;
    this.loopNow = timeline.loop;
    this.hostTick = host.tick();
    this.anchorNow = this.hostTick;
    this.unhook = host.beforeFrame((tick) => this.frame(tick));
  }

  get timeline(): MidiTimeline {
    return this.replayRef.timeline;
  }

  get replay(): TimelineReplay {
    return this.replayRef;
  }

  /** The last frame that played (or was loaded by a seek). */
  get position(): number {
    return this.pendingSeek ?? this.positionNow;
  }

  get playing(): boolean {
    return this.playingNow;
  }

  get loop(): boolean {
    return this.loopNow;
  }

  get isRecording(): boolean {
    return this.recording !== null;
  }

  get following(): boolean {
    return this.followNow;
  }

  /** Host tick − playhead: what pattern feeds subtract to follow the playhead. */
  get anchor(): number {
    return this.anchorNow;
  }

  get marker(): TimelineMarker | null {
    return markerAt(this.timeline, this.position);
  }

  play(): void {
    if (this.playingNow) return;
    // Resuming at the end of a non-looping timeline starts over.
    if (this.position >= this.timeline.length - 1) this.seek(0);
    this.playingNow = true;
    this.notify();
  }

  pause(): void {
    if (!this.playingNow) return;
    this.playingNow = false;
    this.notify();
  }

  toggle(): void {
    if (this.playingNow) this.pause();
    else this.play();
  }

  setLoop(on: boolean): void {
    this.loopNow = on;
    this.notify();
  }

  /** Move the playhead; applied on the next host frame (all store writes happen there). */
  seek(frame: number): void {
    const last = this.timeline.length - 1;
    this.pendingSeek = frame < 0 ? 0 : frame > last ? last : Math.round(frame);
    this.notify();
  }

  /** Frame-step: pauses, then moves by `delta` frames. */
  step(delta: number): void {
    this.pause();
    this.seek(this.position + delta);
  }

  /** Swap in another timeline (an import, or a recording merged in); keeps the playhead. */
  load(timeline: MidiTimeline): void {
    this.replayRef = new TimelineReplay(timeline);
    this.midi = new MidiAdapter(new BindingTable(timelineProfile(timeline)), this.coalescer);
    this.transport.setBpm(timelineBpm(timeline));
    this.loopNow = timeline.loop;
    this.seek(Math.min(this.position, timeline.length - 1));
  }

  // --- live MIDI ---

  /**
   * One live MIDI message (a Web MIDI input, or a test). Buffered to the next frame and
   * pushed AFTER that frame's timeline messages, so a hand on a controller wins the frame;
   * while recording, a touched lane is also muted in playback (touch overdub).
   */
  input(data: Uint8Array): void {
    if (data.length === 0) return;
    if (data[0]! >= 0xf0) {
      // System messages: transport only, never bindings.
      const event = this.transport.handle(data);
      if (event && this.followNow) this.follow(event.kind, event.frame);
      return;
    }
    const bytes = Array.prototype.slice.call(data) as number[];
    if (this.recording) {
      this.recording.messages.push({ at: this.liveFrame(), data: bytes });
      for (const k of laneKeys(bytes)) if (this.touched.indexOf(k) === -1) this.touched.push(k);
    }
    this.live.push(bytes);
  }

  /** Follow MIDI transport (Start/Stop/Continue/SPP/Clock) from a DAW. */
  setFollow(on: boolean): void {
    this.followNow = on;
    this.notify();
  }

  /** Arm a punch-in take from the current playhead; starts playback. */
  record(): void {
    if (this.recording) return;
    this.recording = { from: this.position, messages: [] };
    this.play();
    this.notify();
  }

  /** End the take, merge it into the timeline (punch-in replace) and reload. Returns the new timeline. */
  stopRecording(): MidiTimeline {
    const take = this.recording;
    this.recording = null;
    this.touched.length = 0;
    if (!take) return this.timeline;
    const merged = mergeRecording(this.timeline, take.messages, take.from, this.position);
    this.load(merged);
    this.notify();
    return merged;
  }

  /** Called after every playhead/transport change (and every played frame). */
  onChange(fn: () => void): Unsubscribe {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Stop driving the host. */
  detach(): void {
    this.unhook();
    this.listeners.clear();
  }

  // --- internals ---

  /** The frame a live message lands on: the next one to play (it is flushed there). */
  private liveFrame(): number {
    const f = this.hostTick - this.anchorNow + (this.playingNow ? 1 : 0);
    return f < 0 ? 0 : f > this.timeline.length - 1 ? this.timeline.length - 1 : f;
  }

  private follow(kind: 'start' | 'stop' | 'continue' | 'position' | 'clock', at: number): void {
    // A looping timeline wraps the DAW's song position; a one-shot one clamps (seek()).
    const frame = this.loopNow ? at % this.timeline.length : at;
    if (kind === 'stop') this.pause();
    else if (kind === 'position') this.seek(frame);
    else if (kind === 'start') {
      this.seek(frame);
      this.playingNow = true;
      this.notify();
    } else if (kind === 'continue') this.play();
    else if (Math.abs(frame - (this.hostTick - this.anchorNow)) > FOLLOW_TOLERANCE) this.seek(frame);
  }

  private loadFrame(frame: number, tick: number): void {
    this.positionNow = frame;
    this.anchorNow = tick - frame;
    this.host.store.dispatch({ type: 'LOAD_STATE', state: shiftRunnerTicks(this.replayRef.stateAt(frame), this.anchorNow) });
  }

  private frame(tick: number): void {
    this.hostTick = tick;
    const store = this.host.store;
    const length = this.timeline.length;

    if (this.pendingSeek !== null) {
      const target = this.pendingSeek;
      this.pendingSeek = null;
      this.loadFrame(target, tick);
    } else if (this.playingNow) {
      const target = tick - this.anchorNow;
      if (target > length - 1) {
        // Play out the remaining frames first, then wrap (loop) or hold the last frame.
        this.playThrough(length - 1);
        if (this.loopNow && !this.recording) {
          this.loadFrame(0, tick);
        } else {
          this.anchorNow = tick - this.positionNow;
          if (this.recording) this.stopRecording();
          this.playingNow = false;
        }
      } else {
        this.playThrough(target);
      }
    } else {
      // Hold the playhead. Only a move the TIMELINE has in flight is pinned by reloading —
      // a take the visitor starts on a paused, settled panel is theirs.
      this.anchorNow = tick - this.positionNow;
      if (runnersInFlight(this.replayRef.stateAt(this.positionNow))) this.loadFrame(this.positionNow, tick);
    }
    // Live input that arrived since the last frame: after the timeline, so it wins the frame.
    for (const bytes of this.live) this.midi.handle(new Uint8Array(bytes));
    this.live.length = 0;
    this.coalescer.flush(store.getSnapshot(), tick, (command) => store.dispatch(command));
    this.notify();
  }

  /** Play frames positionNow+1..to through the shared per-frame contract. */
  private playThrough(to: number): void {
    const store = this.host.store;
    const getState = () => store.getSnapshot();
    const dispatch = (command: Command): void => store.dispatch(command);
    const touched = this.touched;
    const skip = touched.length ? (data: readonly number[]) => isTouched(touched, data) : undefined;
    for (let f = this.positionNow + 1; f <= to; f++) {
      playFrame(this.replayRef.index, f, this.anchorNow + f, this.midi, this.coalescer, getState, dispatch, skip);
    }
    if (to > this.positionNow) this.positionNow = to;
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }
}
