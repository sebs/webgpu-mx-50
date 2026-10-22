// The site's MIDI timelines (ADR-0020). ATTRACT is the Overview hero's script: five acts,
// each a preset setup recalled by Program Change, the take done by 14-bit lever automation
// on CC1, wipe patterns called by notes, and a closing Auto Fade to black from note 71 —
// all through the published Ableton profile, so the same file plays from a DAW.
//
// Why the lever and not the Auto Take note: a Program Change recall advances the Event
// Memory armed-next pointer (ADR-0018), so an Auto Take after it would recall the next slot
// instead of taking. validateTimeline() rejects that; the lever lane is what a DAW automates
// anyway, and it scrubs without a runner. Auto Fade ignores the bank, so the end card uses it.
//
// scripts/site-data.ts writes every timeline as JSON and as a .mid file, and the unit suite
// validates and plays them. DOM-free on purpose.

import type { Command } from '../src/state/commands.js';
import type { CcPoint, MidiTimeline, TimelineSetup } from '../src/control/midi-timeline.js';

/** One act of the attract loop, in frames. */
const ACT = 252;
/** The take: as long as the old Auto Take (TRANSITION 70 frames), a second into the act. */
const TAKE = 70;
const TAKE_AT = 30;
const LENGTH = 4 * ACT + 300;
const FADE_AT = 4 * ACT + 172;

/** Ableton profile notes (src/control/bindings.ts): patterns 001–028 on notes 24–51, Auto Fade 71. */
const patternNote = (n: number): number => 23 + n;
const AUTO_FADE_NOTE = 71;

const ACT1: readonly Command[] = [
  { type: 'SET_PROGRAM_OUT', mode: 'effect' },
  { type: 'ASSIGN_SOURCE', bus: 'A', source: 2 },
  { type: 'ASSIGN_SOURCE', bus: 'B', source: 3 },
  { type: 'SET_TRANSITION_TYPE', transition: 'mix' },
  { type: 'SET_TRANSITION_TIME', frames: TAKE },
  { type: 'SET_LEVER', position: 0 },
];
const ACT2: readonly Command[] = [
  ...ACT1,
  { type: 'SET_TRANSITION_TYPE', transition: 'wipe' },
  { type: 'PRESS_BORDER' },
  { type: 'SET_LEVER', position: 1 },
];
const ACT3: readonly Command[] = [
  ...ACT2,
  { type: 'SELECT_EFFECT_BUS', bus: 'A' },
  { type: 'CHOOSE_EFFECT', effect: 'mosaic' },
  { type: 'PRESS_EFFECT_ON' },
  { type: 'SET_WIPE_PATTERN', number: 137 },
  { type: 'SET_LEVER', position: 0 },
];
const ACT4: readonly Command[] = [
  ...ACT3,
  { type: 'PRESS_COLOUR_CORRECT', bus: 'B' },
  { type: 'PRESS_COLOUR_CORRECT', bus: 'B' },
  { type: 'SET_CHROMA', bus: 'B', value: 0.35 },
  { type: 'SET_CC_JOYSTICK', bus: 'B', x: 0.6, y: -0.3 },
  { type: 'SET_TRANSITION_TYPE', transition: 'nam' },
  { type: 'SET_LEVER', position: 1 },
];
const ACT5: readonly Command[] = [
  ...ACT4,
  { type: 'ASSIGN_SOURCE', bus: 'B', source: 4 },
  { type: 'SET_TRANSITION_TYPE', transition: 'wipe' },
  { type: 'SET_DSK_KEY_SOURCE', source: 'A' },
  { type: 'SET_DSK_LOW', level: 0.8 },
  { type: 'SET_DSK_HIGH', level: 1 },
  { type: 'SET_DSK_EDGE', edge: 'drop-shadow' },
  { type: 'SET_DSK_ON', on: true },
  { type: 'SET_FADE_TARGET', target: 'black' },
  { type: 'SET_FADE_ENABLE', element: 'video', on: true },
  { type: 'SET_FADE_ENABLE', element: 'dsk', on: true },
  { type: 'SET_LEVER', position: 0 },
];

const SETUPS: readonly TimelineSetup[] = [
  { slot: 1, label: 'Mix · Auto Take', commands: ACT1 },
  { slot: 2, label: 'Wipe 009 · border', commands: ACT2 },
  { slot: 3, label: 'Mosaic on bus A · wipe 137', commands: ACT3 },
  { slot: 4, label: 'Colour correction on B · NAM', commands: ACT4 },
  { slot: 5, label: 'Downstream key · drop shadow', commands: ACT5 },
];

/** The lever: one linear 70-frame move per act, alternating direction like a take. */
function leverPoints(): CcPoint[] {
  const points: CcPoint[] = [];
  for (let act = 0; act < 5; act++) {
    const from = act % 2 === 0 ? 0 : 1;
    const start = act * ACT + TAKE_AT;
    points.push({ at: start, value: from, curve: 'linear' });
    points.push({ at: start + TAKE, value: 1 - from, curve: 'linear' });
  }
  return points;
}

export const ATTRACT_TIMELINE: MidiTimeline = {
  version: 1,
  title: 'Attract mode',
  length: LENGTH,
  loop: true,
  bpm: 120,
  setups: SETUPS,
  markers: [
    ...SETUPS.map((s, i) => ({ at: i * ACT, label: s.label })),
    { at: FADE_AT, label: 'Auto Fade to black' },
  ],
  lanes: [
    {
      kind: 'pc',
      label: 'Setups · Program Change',
      channel: 0,
      events: SETUPS.map((s, i) => ({ at: i * ACT, program: s.slot - 1 })),
    },
    {
      kind: 'note',
      label: 'Notes · patterns + Auto Fade',
      channel: 0,
      events: [
        { at: ACT + 1, note: patternNote(9) },
        { at: 4 * ACT + 1, note: patternNote(17) },
        { at: FADE_AT, note: AUTO_FADE_NOTE },
      ],
    },
    { kind: 'cc', label: 'Lever · CC1 (14-bit)', channel: 0, cc: 1, fine: true, points: leverPoints() },
    {
      kind: 'cc',
      label: 'B chroma · CC13',
      channel: 0,
      cc: 13,
      points: [
        { at: 3 * ACT, value: 0.35, curve: 'ease' },
        { at: 3 * ACT + 120, value: 0.95, curve: 'ease' },
        { at: 3 * ACT + 240, value: 0.35, curve: 'hold' },
      ],
    },
  ],
};

export const TIMELINES: readonly { readonly id: string; readonly timeline: MidiTimeline }[] = [
  { id: 'attract', timeline: ATTRACT_TIMELINE },
];
