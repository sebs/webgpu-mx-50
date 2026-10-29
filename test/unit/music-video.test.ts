// The music video FILES (video/*.json, docs/MUSIC-VIDEO-FORMAT.md), loaded and sampled
// headlessly. Every cue is a list of real store commands folded through the real reducer,
// so a section whose look the panel refuses — a Positioner off a Square wipe, Trail next
// to A/V Synchro, an effect on the wrong bus — fails here instead of silently showing
// something else. The loader's own diagnostics are pinned too: they are what an author
// (often an LLM) iterates on.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { errorsOf, loadMusicVideo, loadMusicVideoText, serializeMusicVideo } from '../../site/music-video/document.js';
import {
  INPUTS,
  LANE_NAMES,
  barTime,
  clipHolding,
  clipTime,
  LAST_FRAME,
  compileScore,
  cueIndexAt,
  effect,
  emptyLanes,
  laneCommandsAt,
  markerAt,
  sampleLane,
  stateAt,
} from '../../site/music-video/score.js';
import { reduce } from '../../src/state/reducer.js';
import { FACTORY_PRESET } from '../../src/state/state.js';
import type { LanePoint, Score } from '../../site/music-video/score.js';
import type { MusicVideoDoc, Problem } from '../../site/music-video/document.js';

const VIDEO_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'video');
const firstCutText = readFileSync(join(VIDEO_DIR, 'first-cut.json'), 'utf8');
const firstCut = loadMusicVideoText(firstCutText);
const score = firstCut.score as Score;
const at = (bar: number, beat = 0): number => barTime(firstCut.grid, bar + beat / 4);
const BAR = at(1) - at(0);

/** A small valid document to break in the diagnostics tests. */
function tiny(edit: unknown[] = []): MusicVideoDoc {
  return {
    format: 'web-mx-50/music-video',
    version: 1,
    title: 'Tiny',
    song: { file: 'song.m4a', bpm: 120, downbeat: 0, length: 60 },
    clips: [
      { id: 'a', file: 'a.mp4', duration: 4 },
      { id: 'b', file: 'b.mp4', duration: 4 },
    ],
    patch: { '1': 'a', '2': 'b', '3': 'a', '4': 'b', ext: 'a' },
    edit: edit as MusicVideoDoc['edit'],
  };
}

function problemsOf(edit: unknown[]): Problem[] {
  return loadMusicVideo(tiny(edit)).problems.slice();
}

test('every music video in video/ loads without a single problem', () => {
  const names = readdirSync(VIDEO_DIR).filter((n) => n.endsWith('.json'));
  assert.ok(names.indexOf('first-cut.json') !== -1);
  for (const name of names) {
    const loaded = loadMusicVideoText(readFileSync(join(VIDEO_DIR, name), 'utf8'));
    assert.deepEqual(loaded.problems, [], `${name} loads cleanly`);
    assert.ok(loaded.score);
  }
});

test('the format reference\'s examples load without a single problem', () => {
  const md = readFileSync(join(VIDEO_DIR, '..', 'docs', 'MUSIC-VIDEO-FORMAT.md'), 'utf8');
  const blocks = md.split('```json music-video\n').slice(1).map((b) => b.split('\n```')[0]!);
  assert.ok(blocks.length > 0, 'the reference has at least one checked example');
  for (const block of blocks) {
    const loaded = loadMusicVideoText(block);
    assert.deepEqual(loaded.problems, [], `example "${loaded.doc.title}" loads cleanly`);
  }
});

test('cues are in time order, inside the song, and patch only known clips into every input', () => {
  const ids = firstCut.clips.map((c) => c.id);
  for (let i = 1; i < score.cues.length; i++) assert.ok(score.cues[i]!.at > score.cues[i - 1]!.at, `cue ${i} is after cue ${i - 1}`);
  for (const cue of score.cues) {
    assert.ok(cue.at >= 0 && cue.at < score.length);
    for (const input of INPUTS) assert.notEqual(ids.indexOf(cue.patch[input]), -1, `input ${String(input)} has a clip`);
    for (const id of ids) assert.ok(cue.clips[id]!.rate > 0);
  }
});

test('the markers cover the song from the top, in order', () => {
  assert.equal(score.markers[0]!.at, 0);
  for (let i = 1; i < score.markers.length; i++) assert.ok(score.markers[i]!.at > score.markers[i - 1]!.at);
  assert.equal(markerAt(score, at(16) + 0.01)!.label, 'Drop I · cut on the beat');
});

test('every lane stays inside its control range', () => {
  for (let t = 0; t < score.length; t += 0.1) {
    const s = stateAt(score, t);
    assert.ok(s.transition.lever >= 0 && s.transition.lever <= 1);
    assert.ok(s.fade.lever >= 0 && s.fade.lever <= 1);
  }
});

test('it opens on black and fades up to the spiral', () => {
  assert.equal(stateAt(score, 0).fade.lever, 1);
  const s = stateAt(score, at(4));
  assert.equal(s.fade.lever, 0);
  assert.equal(s.busA.source, 3);
  assert.equal(score.cues[cueIndexAt(score, at(4))]!.patch[3], 'spiral');
});

test('each section lands the look it is named for', () => {
  const mid = (bar: number): number => at(bar) + BAR / 2;

  let s = stateAt(score, mid(9));
  assert.equal(s.transition.type, 'wipe');
  assert.equal(s.transition.wipe.family, 'square');
  assert.equal(s.digitalEffect.bus, 'B');
  assert.ok(s.digitalEffect.active.mono);

  s = stateAt(score, mid(17));
  assert.ok(s.dsk.on);
  assert.equal(s.dsk.keySource, 'ext-camera');
  assert.equal(s.transition.type, 'mix');

  s = stateAt(score, mid(21));
  assert.ok(s.digitalEffect.avSynchro);
  assert.ok(s.digitalEffect.avSynchroEffects.nega);

  s = stateAt(score, mid(29));
  assert.equal(s.digitalEffect.freeze.multi, 9);
  assert.equal(s.transition.wipe.edge, 'border-wide');
  assert.ok(s.transition.wipe.modifiers.multi > 0);

  s = stateAt(score, mid(33));
  assert.equal(s.transition.type, 'lum-key');
  assert.equal(s.busB.source, 3);
  assert.equal(s.busA.colourCorrect.mode, 'chroma-plus-joystick');

  s = stateAt(score, mid(41));
  assert.ok(s.digitalEffect.active.nega && s.digitalEffect.freeze.trail);
  assert.equal(s.dsk.fill, 'matte');

  s = stateAt(score, mid(61));
  assert.ok(s.transition.wipe.modifiers.blinds, 'blinds hold on a legal family');
  assert.ok(s.digitalEffect.active.paint);

  s = stateAt(score, mid(65));
  assert.equal(s.transition.type, 'nam');
  assert.ok(s.digitalEffect.freeze.trail);

  s = stateAt(score, mid(77));
  assert.equal(s.digitalEffect.freeze.multi, 16);

  s = stateAt(score, mid(85));
  assert.equal(s.transition.type, 'lum-key');
  assert.ok(s.digitalEffect.active.nega);
  assert.equal(s.digitalEffect.bus, 'B');

  s = stateAt(score, mid(110));
  assert.ok(s.digitalEffect.freeze.still);

  s = stateAt(score, mid(119));
  assert.ok(s.positioner.on, 'the Positioner engages on the Square wipe');

  s = stateAt(score, mid(125));
  assert.ok(!s.positioner.on);
  assert.ok(s.digitalEffect.active.mosaic);

  s = stateAt(score, mid(137));
  assert.equal(s.fade.target, 'black');
  assert.ok(s.fade.video && !s.fade.dsk, 'the drawings stay up while the picture goes to black');
  assert.ok(s.dsk.on);

  s = stateAt(score, score.length - 0.1);
  assert.equal(s.fade.lever, 1);
  assert.equal(s.dsk.high, 0);
});

test('the punch section switches bus A on every beat', () => {
  const sources = new Set<number | string>();
  for (let beat = 0; beat < 16; beat++) sources.add(stateAt(score, at(72, beat) + 0.05).busA.source);
  assert.equal(sources.size, 4);
});

test('saving and loading again gives the same video', () => {
  const again = loadMusicVideoText(serializeMusicVideo(firstCut.doc));
  assert.deepEqual(again.problems, []);
  for (let t = 0; t < score.length; t += 2.5) assert.deepEqual(stateAt(again.score!, t), stateAt(score, t));
});

test('the song length comes from the media when the file leaves it out', () => {
  const doc = tiny([{ at: 4, do: [{ transition: 'nam' }] }]);
  delete (doc.song as { length?: number }).length;
  assert.equal(loadMusicVideo(doc, { songLength: 42 }).score!.length, 42);
});

// --- moves ------------------------------------------------------------------------------

test('cuts snap the lever between the buses on the beat grid', () => {
  const loaded = loadMusicVideo(tiny([{ move: 'cuts', from: 1, to: 2, every: 1, start: 1 }]));
  const lever = loaded.score!.lanes.lever;
  assert.deepEqual(
    lever.map((p) => [p.at, p.value, p.curve]),
    [
      [2, 1, 'hold'],
      [2.5, 0, 'hold'],
      [3, 1, 'hold'],
      [3.5, 0, 'hold'],
    ],
  );
});

test('rotate and montage re-patch an input, restarting each clip', () => {
  const loaded = loadMusicVideo(
    tiny([
      { move: 'rotate', input: 'ext', from: 0, to: 2, every: 1, clips: ['b', 'a'], rate: 0.5 },
      { move: 'montage', input: 2, from: 4, to: 5, every: 2, clips: ['a', 'b'], stagger: 1 },
    ]),
  );
  const sc = loaded.score!;
  const cueAt = (t: number) => sc.cues[cueIndexAt(sc, t)]!;
  assert.equal(cueAt(0.1).patch['ext-camera'], 'b');
  assert.equal(cueAt(0.1).clips.b!.rate, 0.5);
  assert.equal(cueAt(2.1).patch['ext-camera'], 'a');
  assert.equal(cueAt(9.1).patch[2], 'b');
  assert.equal(cueAt(9.1).clips.b!.from, 1);
});

// --- diagnostics ------------------------------------------------------------------------

test('a typo in a step names the path and suggests the right word', () => {
  const problems = problemsOf([{ at: 1, do: [{ wipee: { pattern: 3 } }] }]);
  assert.equal(problems.length, 1);
  assert.equal(problems[0]!.path, '$.edit[0].do[0]');
  assert.match(problems[0]!.message, /unknown step "wipee" — did you mean "wipe"\?/);
});

test('unknown clips, bad ranges and bad patterns are errors with their exact paths', () => {
  const problems = problemsOf([
    { at: 2, patch: { '1': 'crwd' } },
    { move: 'set', lane: 'lever', at: 3, value: 1.5 },
    { at: 4, do: [{ wipe: { pattern: 29 } }] },
    { move: 'ramp', lane: 'mosaic', from: 5, to: 4, values: [1, 31] },
  ]);
  const paths = errorsOf(problems).map((p) => p.path);
  assert.deepEqual(paths, ['$.edit[0].patch.1', '$.edit[1].value', '$.edit[2].do[0].wipe.pattern', '$.edit[3]']);
});

test('the wrong format, a missing key and broken JSON are reported, not thrown', () => {
  const doc = tiny() as unknown as { [k: string]: unknown };
  doc.format = 'something-else';
  delete doc.patch;
  const paths = errorsOf(loadMusicVideo(doc).problems).map((p) => p.path);
  assert.ok(paths.indexOf('$.format') !== -1);
  assert.ok(paths.indexOf('$') !== -1);
  const broken = loadMusicVideoText('{ "format": ');
  assert.equal(broken.score, null);
  assert.match(broken.problems[0]!.message, /not valid JSON/);
});

test('intents the panel refuses come back as warnings on the step that asked', () => {
  const problems = problemsOf([
    { at: 1, do: [{ wipe: { pattern: 1 } }, { positioner: true }] },
    { at: 2, do: [{ wipe: { pattern: 22, blinds: true } }] },
    { at: 3, do: [{ effect: { bus: 'A', trail: true } }, { command: { type: 'ATTEMPT_AV_SYNCHRO', on: true } }] },
    { at: 4, do: [{ effect: { bus: 'A', trail: true } }, { avSynchro: ['nega'] }] },
  ]);
  assert.deepEqual(errorsOf(problems), []);
  const warned = problems.map((p) => p.path);
  assert.deepEqual(warned, ['$.edit[0].do[1].positioner', '$.edit[1].do[0].wipe', '$.edit[3].do[1].avSynchro']);
});

/** The tiny document with looks. */
function withLooks(looks: unknown, edit: unknown[]): Problem[] {
  return loadMusicVideo({ ...tiny(edit), looks } as MusicVideoDoc).problems.slice();
}

test('a look applies its steps and lane values at the cue, the same as writing them out', () => {
  const look = { do: [{ transition: 'chroma-key' }, { buses: [2, 1] }, { command: { type: 'SET_HUE', angle: 0.53 } }], lanes: { lever: 1, slice: 0.38 } };
  const inline = loadMusicVideo(tiny([
    { at: 1, do: [{ transition: 'chroma-key' }, { buses: [2, 1] }, { command: { type: 'SET_HUE', angle: 0.53 } }] },
    { move: 'set', lane: 'lever', at: 1, value: 1 },
    { move: 'set', lane: 'slice', at: 1, value: 0.38 },
  ]));
  const looked = loadMusicVideo({ ...tiny([{ at: 1, do: [{ look: 'sky' }] }]), looks: { sky: look } } as MusicVideoDoc);
  assert.deepEqual(looked.problems, []);
  for (const t of [0, 1.9, 2.1, 10]) assert.deepEqual(stateAt(looked.score!, t), stateAt(inline.score!, t));
});

test('steps after a look, and moves later in the file, override it', () => {
  const doc = {
    ...tiny([{ at: 1, do: [{ look: 'sky' }, { buses: [1, 2] }] }, { move: 'set', lane: 'slice', at: 1, value: 0.2 }]),
    looks: { sky: { do: [{ transition: 'chroma-key' }, { buses: [2, 1] }], lanes: { slice: 0.38 } } },
  } as MusicVideoDoc;
  const loaded = loadMusicVideo(doc);
  assert.deepEqual(loaded.problems, []);
  const s = stateAt(loaded.score!, 5);
  assert.equal(s.busA.source, 1);
  assert.equal(s.transition.slice, 0.2);
});

test('looks: unknown names are suggested, nesting is refused, unused looks are flagged', () => {
  const unknown = withLooks({ sky: { do: [] } }, [{ at: 1, do: [{ look: 'skey' }] }]);
  assert.equal(errorsOf(unknown)[0]!.path, '$.edit[0].do[0].look');
  assert.match(errorsOf(unknown)[0]!.message, /did you mean "sky"/);

  const nested = withLooks({ a: { do: [{ look: 'b' }] }, b: { do: [] } }, [{ at: 1, do: [{ look: 'a' }] }]);
  assert.match(errorsOf(nested)[0]!.message, /a look cannot use another look/);

  const unused = withLooks({ sky: { do: [] } }, []);
  assert.deepEqual(errorsOf(unused), []);
  assert.deepEqual(unused.map((p) => p.path), ['$.looks.sky']);
});

test('a broken look is reported once, however often it is used', () => {
  const problems = withLooks({ sky: { do: [{ transition: 'chroma-kye' }] } }, [
    { at: 1, do: [{ look: 'sky' }] },
    { at: 2, do: [{ look: 'sky' }] },
  ]);
  assert.equal(errorsOf(problems).length, 1);
  assert.match(errorsOf(problems)[0]!.path, /^\$\.edit\[0\]\.do\[0\] → \$\.looks\.sky\.do\[0\]/);
});

test('what the panel refuses inside a look is warned at every use', () => {
  // The positioner needs a square wipe: the first use has none selected, the second does.
  const problems = withLooks({ pip: { do: [{ positioner: true }] } }, [
    { at: 1, do: [{ look: 'pip' }] },
    { at: 2, do: [{ wipe: { pattern: 26 } }, { look: 'pip' }] },
    { at: 3, do: [{ wipe: { pattern: 1 } }, { look: 'pip' }] },
  ]);
  assert.deepEqual(errorsOf(problems), []);
  assert.deepEqual(
    problems.map((p) => p.path),
    ['$.edit[0].do[0] → $.looks.pip.do[0].positioner', '$.edit[2].do[1] → $.looks.pip.do[0].positioner'],
  );
});

test('a raw command on a control a lane already owns is flagged', () => {
  const problems = problemsOf([
    { move: 'set', lane: 'lever', at: 0, value: 0 },
    { at: 2, do: [{ command: { type: 'SET_LEVER', position: 1 } }] },
  ]);
  assert.equal(problems.length, 1);
  assert.match(problems[0]!.message, /lever lane owns this control/);
});

test('runner commands cannot be sent raw', () => {
  const problems = problemsOf([{ at: 2, do: [{ command: { type: 'PRESS_AUTO_TAKE', tick: 0 } }] }]);
  assert.equal(problems[0]!.path, '$.edit[0].do[0].command.type');
});

// --- the engine underneath --------------------------------------------------------------

test('a lane is silent before its first point and holds after its last', () => {
  const pts: LanePoint[] = [
    { at: 1, value: 0, curve: 'linear' },
    { at: 2, value: 1, curve: 'ease' },
    { at: 3, value: 0, curve: 'hold' },
  ];
  assert.equal(sampleLane(pts, 0.5), null);
  assert.equal(sampleLane(pts, 1.5), 0.5);
  assert.equal(sampleLane(pts, 2.5), 0.5);
  assert.equal(sampleLane(pts, 9), 0);
});

test('lane commands are what stateAt applies on top of the checkpoint', () => {
  const t = at(33, 1.5);
  let s = score.cues[cueIndexAt(score, t)]!.state;
  for (const c of laneCommandsAt(score, t)) s = reduce(s, c);
  assert.deepEqual(s, stateAt(score, t));
});

test('effect() sets exactly the requested effects, whatever was on before', () => {
  const compiled = compileScore({
    length: 10,
    clips: ['a'],
    cues: [
      { at: 1, steps: [effect('A', { nega: true, strobe: true })] },
      { at: 2, steps: [effect('A', { mono: true, still: true })] },
      { at: 3, steps: [effect('B', { trail: true })] },
    ],
    lanes: emptyLanes(),
    markers: [],
    patch: { 1: 'a', 2: 'a', 3: 'a', 4: 'a', 'ext-camera': 'a' },
  });
  const de = (t: number) => compiled.cues[cueIndexAt(compiled, t)]!.state.digitalEffect;
  assert.deepEqual(de(1).active, { nega: true, mosaic: false, mono: false, paint: false });
  assert.ok(de(1).freeze.strobe);
  assert.deepEqual(de(2).active, { nega: false, mosaic: false, mono: true, paint: false });
  assert.ok(de(2).freeze.still && !de(2).freeze.strobe);
  assert.equal(de(3).bus, 'B');
  assert.ok(de(3).freeze.trail && !de(3).freeze.still);
  assert.equal(compiled.cues[0]!.state, FACTORY_PRESET);
  assert.equal(LANE_NAMES.length, Object.keys(compiled.lanes).length);
});

test('a clip loops on its own clock from its last (re)start', () => {
  assert.equal(clipTime(10, { at: 10, from: 2, rate: 0.5 }, 14), 4);
  assert.ok(Math.abs(clipTime(10, { at: 0, from: 0, rate: 1 }, 12.5) - 2.5) < 1e-9);
  assert.ok(Math.abs(clipTime(10, { at: 0, from: 23, rate: 1 }, 0) - 3) < 1e-9, 'offsets are wrapped at play time');
});

test('a clip played once stops at its end, or at "end", and holds that frame', () => {
  const once = { at: 0, from: 0, rate: 1, once: true };
  assert.equal(clipTime(10, once, 4), 4);
  assert.equal(clipTime(10, once, 25), 10 - LAST_FRAME);
  assert.ok(!clipHolding(10, once, 4));
  assert.ok(clipHolding(10, once, 25));
  assert.equal(clipTime(10, { ...once, end: 6 }, 7), 6);
  assert.ok(clipHolding(10, { ...once, end: 6 }, 6.5));
  assert.ok(!clipHolding(10, { at: 0, from: 0, rate: 1 }, 25), 'a looping clip never holds');
});

/** The clip clock of `id` in force at song time `t`. */
const playAt = (sc: Score, id: string, t: number) => sc.cues[cueIndexAt(sc, t)]!.clips[id]!;

test('a speed change keeps a clip playing once; a restart plays on a loop unless it says once', () => {
  const sc = loadMusicVideo(tiny([
    { at: 1, play: { a: { from: 0, once: true } } },
    { at: 2, play: { a: { rate: 0.5 } } },
    { at: 3, play: { a: { from: 1 } } },
  ])).score!;
  assert.equal(playAt(sc, 'a', 4.5).once, true);
  assert.equal(playAt(sc, 'a', 4.5).rate, 0.5);
  assert.equal(playAt(sc, 'a', 6.5).once, undefined);
});

test('"until" sets the rate so the clip arrives at its end, or at "end", on that bar', () => {
  // tiny(): 120 bpm, one bar = 2 s; clips last 4 s.
  const loaded = loadMusicVideo(tiny([
    { at: 1, play: { a: { until: 5, once: true } } },
    { at: 1, play: { b: { from: 1, end: 3, until: 2, once: true } } },
  ]));
  assert.deepEqual(loaded.problems, []);
  const a = playAt(loaded.score!, 'a', 3);
  assert.equal(a.from, 0);
  assert.equal(a.rate, 0.5); // 4 s of clip over 8 s of song
  assert.equal(playAt(loaded.score!, 'b', 3).rate, 1); // 2 s of clip over 2 s
  assert.ok(clipHolding(4, a, 10.01));
});

test('"until" mistakes are errors with their paths', () => {
  const noDuration = loadMusicVideo({
    ...tiny([{ at: 1, play: { a: { until: 3 } } }]),
    clips: [{ id: 'a', file: 'a.mp4' }, { id: 'b', file: 'b.mp4' }],
  } as MusicVideoDoc).problems;
  assert.match(errorsOf(noDuration)[0]!.message, /needs the clip's length/);
  const cases: [unknown, string, RegExp][] = [
    [{ until: 3, rate: 1 }, '$.edit[0].play.a.rate', /"until" sets the rate/],
    [{ until: 1 }, '$.edit[0].play.a.until', /after the cue/],
    [{ until: 1.05 }, '$.edit[0].play.a.until', /rate of 40\.000, outside/],
    [{ from: 4, until: 3 }, '$.edit[0].play.a.from', /nothing left to play/],
    [{ end: 2 }, '$.edit[0].play.a.end', /needs "once"/],
  ];
  for (const [entry, path, message] of cases) {
    const errors = errorsOf(problemsOf([{ at: 1, play: { a: entry } }]));
    assert.equal(errors[0]?.path, path, JSON.stringify(entry));
    assert.match(errors[0]!.message, message);
  }
});

test('a clip timed to end on a bar but still patched in then is flagged; "once" or a re-patch is not', () => {
  const loops = problemsOf([{ at: 1, patch: { '1': 'a' }, play: { a: { until: 3 } } }]);
  assert.deepEqual(errorsOf(loops), []);
  assert.equal(loops[0]!.path, '$.edit[0].play.a.until');
  assert.match(loops[0]!.message, /end at bar 3 .*input 1, 3/);
  assert.deepEqual(problemsOf([{ at: 1, play: { a: { until: 3, once: true } } }]), []);
  assert.deepEqual(problemsOf([
    { at: 1, play: { a: { until: 3 } } },
    { at: 2.5, patch: { '1': 'b', '3': 'b', ext: 'b' } },
  ]), []);
});

test('montage and rotate items can name the moment a clip enters at', () => {
  const sc = loadMusicVideo(tiny([
    { move: 'montage', input: 1, from: 1, to: 2, every: 1, clips: [{ clip: 'a', from: 2.5 }, 'b'] },
    { move: 'rotate', input: 2, from: 4, to: 6, every: 1, clips: [{ clip: 'b', from: 1 }, 'a'] },
  ])).score!;
  assert.equal(playAt(sc, 'a', 2.1).from, 2.5);
  assert.equal(playAt(sc, 'b', 2.6).from, 1.37); // no "from": the stagger, as before
  assert.equal(playAt(sc, 'b', 9.1).from, 1);
  assert.equal(playAt(sc, 'a', 11.1).from, 0);
});
