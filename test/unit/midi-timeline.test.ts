// ADR-0020 MIDI timeline: lane sampling and compilation, validation traps, deterministic
// replay, and the player against a headless host — the property everything rests on is
// that PLAYING to frame f and SEEKING to frame f land on the same panel. Also the
// recording merge, MIDI transport parsing, and the Standard MIDI File round trip.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../../src/app.js';
import { ABLETON_PROFILE } from '../../src/control/bindings.js';
import {
  TimelineReplay,
  compileTimeline,
  markerAt,
  sampleCcLane,
  shiftRunnerTicks,
  timelineBase,
  validateTimeline,
} from '../../src/control/midi-timeline.js';
import { TimelinePlayer } from '../../src/control/timeline-player.js';
import { lanesFromMessages, mergeRecording } from '../../src/control/timeline-record.js';
import { MidiTransport } from '../../src/control/midi-transport.js';
import { readSmf, timelineFromSmf, writeSmf } from '../../src/control/smf.js';
import { ATTRACT_TIMELINE, TIMELINES } from '../../site/timelines.js';
import { FACTORY_PRESET } from '../../src/state/state.js';
import type { CcLane, MidiTimeline, TimelineMessage } from '../../src/control/midi-timeline.js';
import type { PanelState } from '../../src/state/state.js';

/** A host shaped like <mx-mixer>'s loop: k ticks, then beforeFrame hooks, then ADVANCE_TIMELINE. */
function headlessHost() {
  const engine = createEngine();
  const pre = new Set<(tick: number) => void>();
  const host = {
    store: engine.store,
    tick: () => engine.clock.tick,
    beforeFrame(fn: (tick: number) => void) {
      pre.add(fn);
      return () => {
        pre.delete(fn);
      };
    },
  };
  const render = (ticks = 1): void => {
    for (let i = 0; i < ticks; i++) engine.clock.advanceOneTick();
    const tick = engine.clock.tick;
    for (const fn of pre) fn(tick);
    engine.store.dispatch({ type: 'ADVANCE_TIMELINE', tick });
  };
  return { engine, host, render };
}

/** The host panel in timeline ticks, for comparison with a replay. */
function inTimeline(player: TimelinePlayer, state: PanelState): PanelState {
  return shiftRunnerTicks(state, -player.anchor);
}

const tiny = (overrides: Partial<MidiTimeline>): MidiTimeline => ({
  version: 1,
  title: 't',
  length: 120,
  loop: false,
  setups: [{ slot: 1, label: 'one', commands: [{ type: 'SET_TRANSITION_TYPE', transition: 'wipe' }] }],
  markers: [],
  lanes: [],
  ...overrides,
});

// --- lanes -----------------------------------------------------------------------------

test('a CC lane is silent before its first point, then follows its curves', () => {
  const lane: CcLane = {
    kind: 'cc', channel: 0, cc: 3,
    points: [
      { at: 10, value: 0, curve: 'linear' },
      { at: 20, value: 1, curve: 'hold' },
      { at: 30, value: 0, curve: 'ease' },
      { at: 40, value: 1 },
    ],
  };
  assert.equal(sampleCcLane(lane, 9), null);
  assert.equal(sampleCcLane(lane, 10), 0);
  assert.equal(sampleCcLane(lane, 15), 0.5);
  assert.equal(sampleCcLane(lane, 25), 1, 'hold keeps the value to the next point');
  assert.equal(sampleCcLane(lane, 35), 0.5, 'ease is symmetric at the midpoint');
  assert.ok(sampleCcLane(lane, 32)! < 0.11, 'ease starts slow');
  assert.equal(sampleCcLane(lane, 99), 1);
});

test('compile: PC before notes before CC in a frame, CC only on change, fine lanes as MSB/LSB pairs', () => {
  const t = tiny({
    lanes: [
      { kind: 'cc', channel: 0, cc: 1, fine: true, points: [{ at: 0, value: 0.5 }, { at: 2, value: 0.5 }] },
      { kind: 'note', channel: 0, events: [{ at: 0, note: 24 }] },
      { kind: 'pc', channel: 0, events: [{ at: 0, program: 0 }] },
    ],
  });
  const m = compileTimeline(t);
  const q = Math.round(0.5 * 16383);
  assert.deepEqual(m, [
    { at: 0, data: [0xc0, 0] },
    { at: 0, data: [0x90, 24, 100] },
    { at: 0, data: [0xb0, 1, q >> 7] },
    { at: 0, data: [0xb0, 33, q & 0x7f] },
  ]);
});

// --- validation ------------------------------------------------------------------------

test('every site timeline is valid', () => {
  for (const { id, timeline } of TIMELINES) assert.deepEqual(validateTimeline(timeline), [], id);
});

test('validation catches the ordering traps and binding mismatches', () => {
  const has = (t: MidiTimeline, fragment: string): boolean => validateTimeline(t).some((p) => p.indexOf(fragment) !== -1);
  const pc = { kind: 'pc' as const, channel: 0, events: [{ at: 10, program: 0 }] };
  assert.ok(has(tiny({ lanes: [pc, { kind: 'note', channel: 0, events: [{ at: 10, note: 71 }] }] }), 'shares a frame'));
  assert.ok(has(tiny({ lanes: [pc, { kind: 'note', channel: 0, events: [{ at: 20, note: 70 }] }] }), 'recall the next slot'));
  assert.ok(has(tiny({ lanes: [{ kind: 'pc', channel: 0, events: [{ at: 0, program: 4 }] }] }), 'which no setup fills'));
  assert.ok(has(tiny({ lanes: [{ kind: 'cc', channel: 0, cc: 1, points: [{ at: 0, value: 0 }] }] }), 'binding is fine'));
  assert.ok(has(tiny({ lanes: [{ kind: 'cc', channel: 0, cc: 99, points: [{ at: 0, value: 0 }] }] }), 'not bound'));
  assert.ok(has(tiny({ lanes: [{ kind: 'note', channel: 0, events: [{ at: 120, note: 71 }] }] }), 'outside'));
  // An Auto Take before any recall is fine — nothing is armed yet.
  assert.deepEqual(validateTimeline(tiny({ lanes: [{ kind: 'note', channel: 0, events: [{ at: 5, note: 70 }] }] })), []);
});

// --- replay ----------------------------------------------------------------------------

test('the base panel carries each setup in its slot', () => {
  const base = timelineBase(ATTRACT_TIMELINE);
  assert.equal(base.memory.slots[0]!.busA.source, 2);
  assert.equal(base.memory.slots[4]!.dsk.on, true);
  assert.equal(base.memory.slots[5], null);
  assert.equal(base.transition.lever, FACTORY_PRESET.transition.lever);
});

test('the attract timeline reaches what its acts promise', () => {
  const r = new TimelineReplay(ATTRACT_TIMELINE);
  assert.equal(r.stateAt(0).transition.type, 'mix');
  assert.equal(r.stateAt(30).transition.lever, 0);
  assert.ok(Math.abs(r.stateAt(65).transition.lever - 0.5) <= 1 / 16383, 'half way, to 14-bit resolution');
  assert.equal(r.stateAt(100).transition.lever, 1, 'a 70-frame take on the 14-bit lever');
  const act2 = r.stateAt(253);
  assert.equal(act2.transition.type, 'wipe');
  assert.equal(act2.transition.wipe.edge, 'border-narrow');
  assert.notDeepEqual(r.stateAt(252).transition.wipe, act2.transition.wipe, 'note 32 calls pattern 009 a frame after the recall');
  assert.equal(r.stateAt(352).transition.lever, 0);
  assert.ok(r.stateAt(504).digitalEffect.active.mosaic);
  assert.equal(r.stateAt(756).busB.colourCorrect.mode, 'chroma-plus-joystick');
  assert.ok(r.stateAt(876).busB.colourCorrect.chroma > 0.9, 'the chroma lane swells mid-act');
  const fadeStart = r.stateAt(1180);
  assert.equal(fadeStart.fade.auto.phase, 'running');
  assert.equal(r.stateAt(1215).fade.lever, 0.5, 'Auto Fade: half way after 35 of 70 frames');
  assert.equal(r.stateAt(1250).fade.lever, 1);
  assert.equal(r.stateAt(1250).fade.auto.phase, 'complete');
  assert.equal(markerAt(ATTRACT_TIMELINE, 300)!.label, 'Wipe 009 · border');
});

test('replay is independent of the order frames are asked for', () => {
  const forward = new TimelineReplay(ATTRACT_TIMELINE);
  const frames = [0, 1, 59, 60, 61, 100, 253, 700, 1199, 1215, 1307];
  const expected = frames.map((f) => forward.stateAt(f));
  const shuffled = new TimelineReplay(ATTRACT_TIMELINE);
  for (const f of frames.slice().reverse()) shuffled.stateAt(f);
  frames.forEach((f, i) => assert.deepEqual(shuffled.stateAt(f), expected[i], `frame ${f}`));
});

test('shifting an idle panel is the identity', () => {
  const s = timelineBase(ATTRACT_TIMELINE);
  assert.equal(shiftRunnerTicks(s, 500), s);
});

// --- the player ------------------------------------------------------------------------

test('scrub equals play: every played frame matches the replay, at any display cadence', () => {
  const { engine, host, render } = headlessHost();
  const player = new TimelinePlayer(host, { ...ATTRACT_TIMELINE, loop: false });
  const oracle = new TimelineReplay(ATTRACT_TIMELINE);
  render(); // the first frame loads frame 0
  assert.equal(player.position, 0);
  const cadence = [1, 1, 2, 1, 3, 1, 1, 4, 2, 1];
  let i = 0;
  while (player.playing) {
    render(cadence[i++ % cadence.length]);
    if (!player.playing) break; // the end frame re-anchors as it pauses (checked below)
    assert.deepEqual(inTimeline(player, engine.store.getSnapshot()), oracle.stateAt(player.position), `frame ${player.position}`);
  }
  assert.equal(player.position, ATTRACT_TIMELINE.length - 1, 'a one-shot timeline holds its last frame');
  const end = engine.store.getSnapshot();
  const expected = oracle.stateAt(player.position);
  assert.equal(end.fade.lever, expected.fade.lever);
  assert.equal(end.fade.auto.phase, expected.fade.auto.phase);
  assert.deepEqual({ ...end, fade: null, transition: null }, { ...expected, fade: null, transition: null });
});

test('seeking lands where playing would have', () => {
  const { engine, host, render } = headlessHost();
  const player = new TimelinePlayer(host, ATTRACT_TIMELINE);
  render();
  render(1200);
  player.seek(300);
  render();
  assert.equal(player.position, 300);
  const fresh = headlessHost();
  const straight = new TimelinePlayer(fresh.host, ATTRACT_TIMELINE);
  for (let f = 0; f <= 300; f++) fresh.render();
  assert.equal(straight.position, 300);
  assert.deepEqual(inTimeline(player, engine.store.getSnapshot()), inTimeline(straight, fresh.engine.store.getSnapshot()));
});

test('a looping timeline wraps to frame 0', () => {
  const { engine, host, render } = headlessHost();
  const player = new TimelinePlayer(host, ATTRACT_TIMELINE);
  render();
  render(ATTRACT_TIMELINE.length + 5);
  assert.equal(player.position, 0);
  assert.ok(player.playing);
  assert.deepEqual(inTimeline(player, engine.store.getSnapshot()), new TimelineReplay(ATTRACT_TIMELINE).stateAt(0));
});

test('pausing holds a timeline move in flight, but leaves a settled panel to the visitor', () => {
  const { engine, host, render } = headlessHost();
  const player = new TimelinePlayer(host, ATTRACT_TIMELINE);
  render();
  player.seek(1200);
  render();
  player.pause();
  const held = engine.store.getSnapshot().fade.lever;
  render(30);
  assert.equal(engine.store.getSnapshot().fade.lever, held, 'the Auto Fade does not run on under a paused playhead');
  assert.equal(player.position, 1200);

  player.seek(150);
  render();
  engine.store.dispatch({ type: 'SET_LEVER', position: 0.25 });
  render(10);
  assert.equal(engine.store.getSnapshot().transition.lever, 0.25, 'a settled, paused panel is not reloaded');
  player.play();
  render();
  assert.equal(player.position, 151);
});

test('frame-step pauses and moves exactly one frame', () => {
  const { host, render } = headlessHost();
  const player = new TimelinePlayer(host, ATTRACT_TIMELINE);
  render();
  render(10);
  player.step(1);
  render();
  assert.equal(player.playing, false);
  assert.equal(player.position, 11);
  player.step(-5);
  render(3);
  assert.equal(player.position, 6);
});

test('live MIDI plays through the timeline profile and wins its frame', () => {
  const { engine, host, render } = headlessHost();
  const player = new TimelinePlayer(host, ATTRACT_TIMELINE);
  render();
  render(40); // inside act 1's lever ramp
  player.input(new Uint8Array([0xb0, 1, 127]));
  player.input(new Uint8Array([0xb0, 33, 127]));
  render();
  assert.equal(engine.store.getSnapshot().transition.lever, 1);
  player.input(new Uint8Array([0xf8])); // system messages never reach bindings
  render();
});

test('a recorded take merges in and replays as it was played', () => {
  const { engine, host, render } = headlessHost();
  const player = new TimelinePlayer(host, { ...ATTRACT_TIMELINE, loop: false });
  render();
  player.seek(400);
  render();
  player.record();
  const played: number[] = [];
  for (let k = 0; k < 20; k++) {
    const v = k * 6;
    player.input(new Uint8Array([0xb0, 13, v])); // B chroma by hand
    render();
    played.push(engine.store.getSnapshot().busB.colourCorrect.chroma);
  }
  const merged = player.stopRecording();
  assert.equal(player.isRecording, false);
  const lane = merged.lanes.filter((l) => l.kind === 'cc' && l.cc === 13)[0] as CcLane;
  assert.ok(lane.points.some((p) => p.at >= 400 && p.at <= 420), 'the take landed in the punch range');
  assert.ok(lane.points.some((p) => p.at === 756), 'the untouched act-4 swell is kept');
  const replay = new TimelineReplay(merged);
  for (let k = 0; k < 20; k++) assert.equal(replay.stateAt(401 + k).busB.colourCorrect.chroma, played[k], `frame ${401 + k}`);
  assert.deepEqual(validateTimeline(merged), []);
});

test('punch-in keeps the envelope continuous at both seams', () => {
  const t = tiny({ lanes: [{ kind: 'cc', channel: 0, cc: 3, points: [{ at: 0, value: 0, curve: 'linear' }, { at: 100, value: 1 }] }] });
  const merged = mergeRecording(t, [{ at: 45, data: [0xb0, 3, 0] }], 40, 60);
  const lane = merged.lanes[0] as CcLane;
  assert.equal(sampleCcLane(lane, 20), 0.2, 'before the punch: untouched');
  assert.equal(sampleCcLane(lane, 50), 0, 'inside: the take');
  assert.ok(Math.abs(sampleCcLane(lane, 80)! - 0.8) < 1e-9, 'after the punch: back on the original ramp');
  assert.equal(mergeRecording(t, [], 0, 50), t, 'an empty take changes nothing');
});

test('recorded CCs are read as the profile binds them', () => {
  const lanes = lanesFromMessages(
    [
      { at: 0, data: [0xb0, 1, 64] }, // CC1 is fine in the Ableton profile: MSB alone = 64 << 7
      { at: 1, data: [0xb0, 33, 127] },
      { at: 2, data: [0xb0, 3, 127] },
      { at: 3, data: [0x90, 60, 0] }, // velocity 0 = note off
    ],
    ABLETON_PROFILE,
  );
  assert.equal(lanes.length, 2);
  const fine = lanes[0] as CcLane;
  assert.equal(fine.fine, true);
  assert.deepEqual(fine.points.map((p) => p.value), [(64 << 7) / 16383, ((64 << 7) | 127) / 16383]);
  assert.equal((lanes[1] as CcLane).points[0]!.value, 1);
});

// --- transport -------------------------------------------------------------------------

test('MIDI transport: Song Position and Clock in frames at the timeline tempo', () => {
  const t = new MidiTransport(120);
  assert.deepEqual(t.handle([0xf2, 16, 0]), { kind: 'position', frame: 120 }, '16 sixteenths at 120 bpm = 2 s');
  assert.equal(t.handle([0xf8]), null, 'clocks count only while running');
  assert.deepEqual(t.handle([0xfb]), { kind: 'continue', frame: 120 });
  for (let i = 0; i < 23; i++) t.handle([0xf8]);
  assert.deepEqual(t.handle([0xf8]), { kind: 'clock', frame: 150 }, 'a quarter note (24 clocks) is 30 frames');
  assert.deepEqual(t.handle([0xfc]), { kind: 'stop', frame: 150 });
  assert.deepEqual(t.handle([0xfa]), { kind: 'start', frame: 0 });
  t.setBpm(60);
  assert.deepEqual(t.handle([0xf2, 1, 0]), { kind: 'position', frame: 15 });
});

test('a followed DAW transport moves the playhead', () => {
  const { host, render } = headlessHost();
  const player = new TimelinePlayer(host, ATTRACT_TIMELINE, { autoplay: false });
  render();
  player.input(new Uint8Array([0xf2, 40, 0])); // ignored: not following
  render();
  assert.equal(player.position, 0);
  player.setFollow(true);
  player.input(new Uint8Array([0xf2, 40, 0])); // 40 sixteenths = 300 frames
  render();
  assert.equal(player.position, 300);
  player.input(new Uint8Array([0xfb]));
  render(10);
  assert.ok(player.playing);
  assert.equal(player.position, 310);
  player.input(new Uint8Array([0xfc]));
  render(5);
  assert.equal(player.playing, false);
  player.input(new Uint8Array([0xf2, 0x7f, 0x7f])); // far past the end of a looping timeline: wraps
  render();
  assert.ok(player.position < ATTRACT_TIMELINE.length);
});

// --- Standard MIDI Files ---------------------------------------------------------------

function byFrame(messages: readonly TimelineMessage[]): string[] {
  const groups: { [at: number]: string[] } = {};
  for (const m of messages) (groups[m.at] = groups[m.at] ?? []).push(m.data.join(','));
  return Object.keys(groups).map((at) => `${at}: ${groups[Number(at)]!.sort().join(' ')}`);
}

test('SMF round trip: the exported clip re-imports to the same byte stream', () => {
  const bytes = writeSmf(ATTRACT_TIMELINE);
  assert.equal(String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!), 'MThd');
  const back = timelineFromSmf(bytes, ATTRACT_TIMELINE);
  assert.equal(back.title, 'Attract mode');
  assert.equal(back.bpm, 120);
  assert.deepEqual(back.markers, ATTRACT_TIMELINE.markers);
  assert.ok(back.length >= ATTRACT_TIMELINE.length);
  assert.deepEqual(byFrame(compileTimeline(back)), byFrame(compileTimeline(ATTRACT_TIMELINE)));
  assert.deepEqual(validateTimeline(back), []);
  // …and therefore plays the same panel.
  const a = new TimelineReplay(ATTRACT_TIMELINE);
  const b = new TimelineReplay(back);
  for (const f of [100, 600, 900, 1240]) assert.deepEqual(b.stateAt(f), a.stateAt(f), `frame ${f}`);
});

test('SMF import: running status, a tempo change, and SMPTE division', () => {
  // PPQ 96; tempo 120 bpm, then 60 bpm at tick 96; CC3 at ticks 0 and 96 (running status), 192.
  const track = [
    0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20,
    0x00, 0xb0, 0x03, 0x00,
    0x60, 0x03, 0x40, // running status
    0x00, 0xff, 0x51, 0x03, 0x0f, 0x42, 0x40,
    0x60, 0x03, 0x7f,
    0x00, 0xff, 0x2f, 0x00,
  ];
  const head = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96];
  const file = new Uint8Array(head.concat([0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, track.length], track));
  const smf = readSmf(file);
  assert.deepEqual(smf.messages.map((m) => m.at), [0, 30, 90], 'a quarter at 120 bpm is 30 frames, at 60 bpm 60');
  assert.equal(smf.bpm, 120);
  // SMPTE 25 fps × 40 ticks per frame: 1000 ticks = 1 s = 60 frames.
  const smpte = new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0xe7, 40,
    0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 8, 0x87, 0x68, 0xc0, 0x01, 0x00, 0xff, 0x2f, 0x00]);
  assert.deepEqual(readSmf(smpte).messages, [{ at: 60, data: [0xc0, 1] }]);
  assert.throws(() => readSmf(new Uint8Array([1, 2, 3, 4])), /not a Standard MIDI File/);
});
