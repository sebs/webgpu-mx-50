// Standard MIDI File import/export for timelines (ADR-0020): the bridge to a DAW's piano
// roll. Export writes the compiled byte stream — exactly what the player sends — as a
// format-0 file with the timeline's tempo, title and markers, so a demo opens in Ableton as
// a clip. Import reads format 0/1 (tempo map, running status, SMPTE division), converts
// ticks to frames and builds lanes with the recording lane builder; setups, loop and profile
// come from the timeline it is imported into, since a .mid file has no place for them.
//
// At the default 120 bpm and 480 PPQ a frame is exactly 16 ticks, so a round trip is
// lossless. Program Change is written; whether a DAW keeps it on import varies.
//
// Pure: bytes in, bytes out. banira lib floor: index/`in`/`===` only.

import { compileTimeline, timelineBpm, timelineProfile } from './midi-timeline.js';
import { lanesFromMessages } from './timeline-record.js';
import type { MidiTimeline, TimelineMarker } from './midi-timeline.js';
import type { RecordedMessage } from './timeline-record.js';

export const SMF_PPQ = 480;

interface TrackEvent {
  tick: number;
  /** Ordering inside a tick: meta, then note-offs, then everything else in stream order. */
  rank: number;
  seq: number;
  bytes: number[];
}

function vlq(n: number): number[] {
  const out = [n & 0x7f];
  let v = Math.floor(n / 128);
  while (v > 0) {
    out.unshift((v & 0x7f) | 0x80);
    v = Math.floor(v / 128);
  }
  return out;
}

/** Meta text as UTF-8 (what DAWs write today; plain ASCII is the same bytes). */
function text(s: string): number[] {
  return Array.prototype.slice.call(new TextEncoder().encode(s)) as number[];
}

function meta(type: number, data: number[]): number[] {
  return [0xff, type].concat(vlq(data.length), data);
}

function u32(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

/** Write the timeline as a format-0 Standard MIDI File. */
export function writeSmf(timeline: MidiTimeline): Uint8Array<ArrayBuffer> {
  const bpm = timelineBpm(timeline);
  const toTick = (frame: number): number => Math.round((frame * SMF_PPQ * bpm) / 3600);
  const events: TrackEvent[] = [];
  let seq = 0;
  const add = (frame: number, rank: number, bytes: number[]): void => {
    events.push({ tick: toTick(frame), rank, seq: seq++, bytes });
  };
  const usPerQuarter = Math.round(60000000 / bpm);
  add(0, 0, meta(0x03, text(timeline.title)));
  add(0, 0, meta(0x51, [(usPerQuarter >> 16) & 0xff, (usPerQuarter >> 8) & 0xff, usPerQuarter & 0xff]));
  for (const m of timeline.markers) add(m.at, 0, meta(0x06, text(m.label)));
  for (const m of compileTimeline(timeline)) {
    add(m.at, 2, m.data.slice());
    // Notes are momentary on this desk; a DAW wants them closed, one frame later.
    if ((m.data[0]! & 0xf0) === 0x90) add(m.at + 1, 1, [0x80 | (m.data[0]! & 0x0f), m.data[1]!, 0]);
  }
  events.sort((a, b) => a.tick - b.tick || a.rank - b.rank || a.seq - b.seq);
  const track: number[] = [];
  let last = 0;
  for (const e of events) {
    track.push.apply(track, vlq(e.tick - last).concat(e.bytes));
    last = e.tick;
  }
  const end = Math.max(last, toTick(timeline.length));
  track.push.apply(track, vlq(end - last).concat([0xff, 0x2f, 0x00]));
  const header = text('MThd').concat(u32(6), [0, 0, 0, 1, (SMF_PPQ >> 8) & 0xff, SMF_PPQ & 0xff]);
  return new Uint8Array(header.concat(text('MTrk'), u32(track.length), track));
}

export interface SmfContent {
  readonly title: string;
  /** The first tempo in the file (120 when it has none). */
  readonly bpm: number;
  /** Channel messages in frame order (Note On/Off, CC, PC, …), already in frames. */
  readonly messages: readonly RecordedMessage[];
  readonly markers: readonly TimelineMarker[];
  /** Frames up to the latest End of Track. */
  readonly length: number;
}

const DATA_BYTES: { [status: number]: number } = { 0x80: 2, 0x90: 2, 0xa0: 2, 0xb0: 2, 0xc0: 1, 0xd0: 1, 0xe0: 2 };

/** Parse a Standard MIDI File. Throws on a file that is not one. */
export function readSmf(bytes: Uint8Array): SmfContent {
  let p = 0;
  const need = (n: number): void => {
    if (p + n > bytes.length) throw new Error('the MIDI file ends early');
  };
  const u8 = (): number => {
    need(1);
    return bytes[p++]!;
  };
  const u16 = (): number => (u8() << 8) | u8();
  const u32r = (): number => ((u8() << 24) >>> 0) + (u8() << 16) + (u8() << 8) + u8();
  const tag = (): string => String.fromCharCode(u8(), u8(), u8(), u8());
  const readVlq = (): number => {
    let v = 0;
    for (let i = 0; i < 4; i++) {
      const b = u8();
      v = v * 128 + (b & 0x7f);
      if (!(b & 0x80)) return v;
    }
    throw new Error('a variable-length number is too long');
  };

  if (tag() !== 'MThd') throw new Error('not a Standard MIDI File (no MThd header)');
  const headerLength = u32r();
  const headerEnd = p + headerLength;
  u16(); // format: 0 and 1 merge identically; 2 (independent patterns) is read as 1
  const tracks = u16();
  const division = u16();
  p = headerEnd;

  interface Raw { tick: number; order: number; data: number[] }
  const raw: Raw[] = [];
  const tempos: { tick: number; us: number }[] = [];
  const markerTicks: { tick: number; label: string }[] = [];
  let title = '';
  let endTick = 0;
  let order = 0;

  for (let t = 0; t < tracks && p < bytes.length; t++) {
    const id = tag();
    const length = u32r();
    const end = p + length;
    if (id !== 'MTrk') {
      p = end; // alien chunk
      continue;
    }
    let tick = 0;
    let running = 0;
    while (p < end) {
      tick += readVlq();
      let status = bytes[p]!;
      if (status < 0x80) {
        if (!running) throw new Error('running status with no status byte');
        status = running;
      } else {
        p++;
      }
      if (status === 0xff) {
        const type = u8();
        const len = readVlq();
        need(len);
        const data = Array.prototype.slice.call(bytes.subarray(p, p + len)) as number[];
        p += len;
        const str = new TextDecoder().decode(new Uint8Array(data));
        if (type === 0x51 && len === 3) tempos.push({ tick, us: (data[0]! << 16) | (data[1]! << 8) | data[2]! });
        else if (type === 0x06) markerTicks.push({ tick, label: str });
        else if (type === 0x03 && t === 0 && !title) title = str;
        else if (type === 0x2f) break;
      } else if (status === 0xf0 || status === 0xf7) {
        const len = readVlq();
        need(len);
        p += len; // SysEx: no meaning for this desk
      } else {
        running = status;
        const n = DATA_BYTES[status & 0xf0];
        if (n === undefined) throw new Error(`unknown status byte ${status.toString(16)}`);
        const data = [status];
        for (let i = 0; i < n; i++) data.push(u8() & 0x7f);
        raw.push({ tick, order: order++, data });
      }
    }
    p = end;
    if (tick > endTick) endTick = tick;
  }

  // Ticks → seconds through the tempo map (or the SMPTE grid), → frames at 60 per second.
  const toFrame = (() => {
    if (division & 0x8000) {
      const fps = 256 - (division >> 8);
      const perFrame = division & 0xff;
      return (tick: number): number => Math.round((tick / (fps * perFrame)) * 60);
    }
    const ppq = division;
    tempos.sort((a, b) => a.tick - b.tick);
    const map: { tick: number; us: number; seconds: number }[] = [{ tick: 0, us: 500000, seconds: 0 }];
    for (const tm of tempos) {
      const prev = map[map.length - 1]!;
      const seconds = prev.seconds + ((tm.tick - prev.tick) * prev.us) / (ppq * 1e6);
      if (tm.tick === prev.tick) map[map.length - 1] = { tick: tm.tick, us: tm.us, seconds: prev.seconds };
      else map.push({ tick: tm.tick, us: tm.us, seconds });
    }
    return (tick: number): number => {
      let seg = map[0]!;
      for (const m of map) if (m.tick <= tick) seg = m;
      return Math.round((seg.seconds + ((tick - seg.tick) * seg.us) / (ppq * 1e6)) * 60);
    };
  })();

  raw.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const firstTempo = tempos.length ? tempos[0]!.us : 500000;
  return {
    title,
    bpm: Math.round((60000000 / firstTempo) * 1000) / 1000,
    messages: raw.map((r) => ({ at: toFrame(r.tick), data: r.data })),
    markers: markerTicks.map((m) => ({ at: toFrame(m.tick), label: m.label })),
    length: Math.max(1, toFrame(endTick)),
  };
}

/**
 * A timeline from a .mid file, imported INTO `into`: lanes, markers, title and tempo come
 * from the file; setups, loop and profile from the timeline it replaces (the bank the
 * file's Program Changes recall). The length covers every event.
 */
export function timelineFromSmf(bytes: Uint8Array, into: MidiTimeline): MidiTimeline {
  const smf = readSmf(bytes);
  let length = smf.length;
  for (const m of smf.messages) if (m.at + 1 > length) length = m.at + 1;
  for (const m of smf.markers) if (m.at + 1 > length) length = m.at + 1;
  return {
    ...into,
    title: smf.title || into.title,
    bpm: smf.bpm,
    length,
    markers: smf.markers.length ? smf.markers : into.markers.filter((m) => m.at < length),
    lanes: lanesFromMessages(smf.messages, timelineProfile(into)),
  };
}
