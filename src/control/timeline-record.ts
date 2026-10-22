// Recording into a MIDI timeline (ADR-0020): raw MIDI messages stamped in timeline frames
// become lanes, and a punch-in take replaces only the lanes it touched, only inside the
// punch range — the "touch" overdub a DAW does. The same lane builder turns an imported
// Standard MIDI File into lanes (smf.ts), so a recorded take and a clip exported from
// Ableton arrive in one shape.
//
// Fineness comes from the profile, not from the bytes: a CC whose binding is `fine` is read
// as the adapter reads it (MSB << 7 | last LSB), so a 7-bit controller on a 14-bit binding
// records exactly what it played.
//
// Pure and DOM-free. banira lib floor: index/`in`/`===` only.

import { sampleCcLane, timelineProfile } from './midi-timeline.js';
import type { BindingMap } from './bindings.js';
import type { CcLane, CcPoint, MidiTimeline, NoteEvent, NoteLane, PcEvent, PcLane, TimelineLane } from './midi-timeline.js';

export interface RecordedMessage {
  readonly at: number;
  readonly data: readonly number[];
}

function key(lane: TimelineLane): string {
  return lane.kind === 'cc' ? `cc/${lane.channel}/${lane.cc}` : `${lane.kind}/${lane.channel}`;
}

/** Points with one value per frame (the last message in a frame wins), in frame order. */
function pushPoint(points: CcPoint[], at: number, value: number): void {
  const last = points[points.length - 1];
  if (last && last.at === at) points[points.length - 1] = { at, value, curve: 'hold' };
  else points.push({ at, value, curve: 'hold' });
}

/**
 * Lanes from a raw message stream (frame order): Note On → note lanes, Program Change →
 * PC lanes, CC → one stepped ('hold') lane per controller — 14-bit where the profile binds
 * the MSB address `fine`, with its n+32 LSB folded in. Other messages are dropped.
 */
export function lanesFromMessages(messages: readonly RecordedMessage[], profile: BindingMap): TimelineLane[] {
  const pcs: { [channel: number]: PcEvent[] } = {};
  const notes: { [channel: number]: NoteEvent[] } = {};
  const ccs: { [k: string]: { channel: number; cc: number; fine: boolean; points: CcPoint[]; msb: number; lsb: number } } = {};
  const ccOrder: string[] = [];
  const ccLane = (channel: number, cc: number, fine: boolean) => {
    const k = `${channel}/${cc}`;
    if (!(k in ccs)) {
      ccs[k] = { channel, cc, fine, points: [], msb: 0, lsb: 0 };
      ccOrder.push(k);
    }
    return ccs[k]!;
  };
  const isFine = (channel: number, cc: number): boolean => {
    const b = profile[`midi:cc/${channel}/${cc}`];
    return !!(b && b.fine && cc < 32);
  };

  for (const m of messages) {
    const status = m.data[0]! & 0xf0;
    const channel = m.data[0]! & 0x0f;
    if (status === 0x90 && m.data[2]! > 0) {
      (notes[channel] = notes[channel] ?? []).push({ at: m.at, note: m.data[1]!, velocity: m.data[2]! });
    } else if (status === 0xc0) {
      (pcs[channel] = pcs[channel] ?? []).push({ at: m.at, program: m.data[1]! });
    } else if (status === 0xb0) {
      const cc = m.data[1]!;
      const raw = m.data[2]!;
      if (cc >= 32 && cc < 64 && isFine(channel, cc - 32)) {
        const lane = ccLane(channel, cc - 32, true);
        lane.lsb = raw;
        pushPoint(lane.points, m.at, ((lane.msb << 7) | lane.lsb) / 16383);
      } else if (isFine(channel, cc)) {
        const lane = ccLane(channel, cc, true);
        lane.msb = raw;
        pushPoint(lane.points, m.at, ((lane.msb << 7) | lane.lsb) / 16383);
      } else if (cc < 120) {
        pushPoint(ccLane(channel, cc, false).points, m.at, raw / 127);
      }
    }
  }

  const lanes: TimelineLane[] = [];
  for (let ch = 0; ch < 16; ch++) {
    if (pcs[ch]) lanes.push({ kind: 'pc', label: `Program change · ch ${ch + 1}`, channel: ch, events: pcs[ch]! });
  }
  for (let ch = 0; ch < 16; ch++) {
    if (notes[ch]) lanes.push({ kind: 'note', label: `Notes · ch ${ch + 1}`, channel: ch, events: notes[ch]! });
  }
  for (const k of ccOrder) {
    const c = ccs[k]!;
    const lane: CcLane = { kind: 'cc', label: `CC ${c.cc}${c.fine ? ' (14-bit)' : ''} · ch ${c.channel + 1}`, channel: c.channel, cc: c.cc, points: c.points };
    lanes.push(c.fine ? { ...lane, fine: true } : lane);
  }
  return lanes;
}

const byAt = (a: { at: number }, b: { at: number }): number => a.at - b.at;
const outside = (from: number, to: number) => (e: { at: number }): boolean => e.at < from || e.at > to;

/** Punch a recorded envelope into an existing one, keeping it continuous at both seams. */
function punchCc(existing: CcLane, recorded: CcLane, from: number, to: number, length: number): CcLane {
  const points: CcPoint[] = existing.points.filter(outside(from, to));
  const before = sampleCcLane(existing, from);
  if (before !== null && recorded.points[0]!.at > from) points.push({ at: from, value: before, curve: 'hold' });
  for (const p of recorded.points) points.push(p);
  if (to + 1 < length) {
    const after = sampleCcLane(existing, to + 1);
    if (after !== null) {
      // The segment the seam sits on keeps its shape toward the next untouched point.
      let curve = existing.points[0]!.curve;
      for (const p of existing.points) if (p.at <= to + 1) curve = p.curve;
      points.push({ at: to + 1, value: after, curve });
    }
  }
  points.sort(byAt);
  return { ...existing, fine: recorded.fine ?? existing.fine, points };
}

/**
 * Merge a punch-in take recorded over frames [from, to] into the timeline. Lanes the take
 * touched lose their events inside the range and gain the recorded ones; untouched lanes are
 * kept as they are; a lane the timeline did not have is appended.
 */
export function mergeRecording(timeline: MidiTimeline, messages: readonly RecordedMessage[], from: number, to: number): MidiTimeline {
  const last = timeline.length - 1;
  const lo = from < 0 ? 0 : from > last ? last : from;
  const hi = to < lo ? lo : to > last ? last : to;
  const inRange = messages.filter((m) => m.at >= lo && m.at <= hi);
  if (inRange.length === 0) return timeline;
  const recorded = lanesFromMessages(inRange, timelineProfile(timeline));
  const lanes: TimelineLane[] = timeline.lanes.slice();
  for (const r of recorded) {
    const i = lanes.findIndex((l) => key(l) === key(r));
    if (i === -1) {
      lanes.push(r);
      continue;
    }
    const e = lanes[i]!;
    if (e.kind === 'cc' && r.kind === 'cc') lanes[i] = punchCc(e, r, lo, hi, timeline.length);
    else if (e.kind === 'note' && r.kind === 'note') lanes[i] = { ...e, events: (e.events.filter(outside(lo, hi)) as NoteEvent[]).concat(r.events).sort(byAt) } as NoteLane;
    else if (e.kind === 'pc' && r.kind === 'pc') lanes[i] = { ...e, events: (e.events.filter(outside(lo, hi)) as PcEvent[]).concat(r.events).sort(byAt) } as PcLane;
  }
  return { ...timeline, lanes };
}
