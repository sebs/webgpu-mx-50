// Named looks for the live benches: each is a list of store commands applied to the
// factory preset. scripts/site-data.ts runs every list through the headless engine and
// writes the result as a real ADR-0015 field-preset file (site/generated/presets/), so a
// bench boots through the same sanitising import path as a user's own preset file — and
// a look whose commands stop making sense fails the build instead of shipping.
//
// DOM-free on purpose: the generator and the unit suite import it.

import type { Command } from '../src/state/commands.js';

export interface Look {
  readonly id: string;
  readonly title: string;
  readonly commands: readonly Command[];
}

const A_ON_AIR: readonly Command[] = [
  { type: 'SET_PROGRAM_OUT', mode: 'effect' },
  { type: 'SET_TRANSITION_TYPE', transition: 'mix' },
  { type: 'SET_LEVER', position: 0 },
];

export const LOOKS: readonly Look[] = [
  {
    id: 'plain',
    title: 'Factory panel on the pattern feeds',
    commands: [...A_ON_AIR],
  },
  {
    id: 'cc-tint',
    title: 'Colour correction: low chroma with a joystick tint',
    commands: [
      ...A_ON_AIR,
      { type: 'PRESS_COLOUR_CORRECT', bus: 'A' },
      { type: 'PRESS_COLOUR_CORRECT', bus: 'A' },
      { type: 'SET_CHROMA', bus: 'A', value: 0.3 },
      { type: 'SET_CC_JOYSTICK', bus: 'A', x: 0.55, y: -0.35 },
    ],
  },
  {
    id: 'effect-mosaic',
    title: 'Digital effect: Mosaic on bus A',
    commands: [
      ...A_ON_AIR,
      { type: 'ASSIGN_SOURCE', bus: 'A', source: 2 },
      { type: 'SELECT_EFFECT_BUS', bus: 'A' },
      { type: 'CHOOSE_EFFECT', effect: 'mosaic' },
      { type: 'SET_MOSAIC_SIZE', step: 10 },
      { type: 'PRESS_EFFECT_ON' },
    ],
  },
  {
    id: 'freeze-trail',
    title: 'Freeze family: Trail on the bouncing ball',
    commands: [
      ...A_ON_AIR,
      { type: 'ASSIGN_SOURCE', bus: 'A', source: 1 },
      { type: 'SELECT_EFFECT_BUS', bus: 'A' },
      { type: 'ENGAGE_FREEZE', effect: 'trail', on: true },
    ],
  },
  {
    id: 'positioner-pip',
    title: 'Positioner: a compressed Square-wipe inset',
    commands: [
      { type: 'SET_PROGRAM_OUT', mode: 'effect' },
      { type: 'ASSIGN_SOURCE', bus: 'A', source: 2 },
      { type: 'ASSIGN_SOURCE', bus: 'B', source: 4 },
      { type: 'SET_TRANSITION_TYPE', transition: 'wipe' },
      { type: 'PRESS_WIPE_FAMILY', family: 'square' },
      { type: 'PRESS_COMPRESSION' },
      { type: 'PRESS_BORDER' },
      { type: 'SET_LEVER', position: 0.4 },
      { type: 'PRESS_POSITIONER' },
      { type: 'SET_POSITIONER_JOYSTICK', x: 0.45, y: -0.35 },
    ],
  },
  {
    id: 'mix-half',
    title: 'Mix / Wipe: lever at centre, Mix',
    commands: [
      { type: 'SET_PROGRAM_OUT', mode: 'effect' },
      { type: 'ASSIGN_SOURCE', bus: 'B', source: 3 },
      { type: 'SET_TRANSITION_TYPE', transition: 'mix' },
      { type: 'SET_LEVER', position: 0.5 },
    ],
  },
  {
    id: 'wipe-border',
    title: 'Mix / Wipe: a bordered diagonal wipe, mid-throw',
    commands: [
      { type: 'SET_PROGRAM_OUT', mode: 'effect' },
      { type: 'ASSIGN_SOURCE', bus: 'B', source: 4 },
      { type: 'SET_TRANSITION_TYPE', transition: 'wipe' },
      { type: 'PRESS_WIPE_FAMILY', family: 'diagonal' },
      { type: 'PRESS_BORDER' },
      { type: 'SET_LEVER', position: 0.45 },
    ],
  },
  {
    id: 'dsk-title',
    title: 'Downstream key: bus B highlights keyed over bus A, drop shadow',
    commands: [
      ...A_ON_AIR,
      { type: 'ASSIGN_SOURCE', bus: 'A', source: 2 },
      { type: 'ASSIGN_SOURCE', bus: 'B', source: 1 },
      { type: 'SET_DSK_KEY_SOURCE', source: 'B' },
      { type: 'SET_DSK_FILL', fill: 'white' },
      { type: 'SET_DSK_LOW', level: 0.85 },
      { type: 'SET_DSK_HIGH', level: 1 },
      { type: 'SET_DSK_EDGE', edge: 'drop-shadow' },
      { type: 'SET_DSK_ON', on: true },
    ],
  },
  {
    id: 'fade-video-only',
    title: 'Fade: VIDEO only toward black — the title stays',
    commands: [
      ...A_ON_AIR,
      { type: 'ASSIGN_SOURCE', bus: 'A', source: 2 },
      { type: 'ASSIGN_SOURCE', bus: 'B', source: 1 },
      { type: 'SET_DSK_KEY_SOURCE', source: 'B' },
      { type: 'SET_DSK_LOW', level: 0.85 },
      { type: 'SET_DSK_HIGH', level: 1 },
      { type: 'SET_DSK_EDGE', edge: 'drop-shadow' },
      { type: 'SET_DSK_ON', on: true },
      { type: 'SET_FADE_TARGET', target: 'black' },
      { type: 'SET_FADE_ENABLE', element: 'video', on: true },
      { type: 'SET_FADE_ENABLE', element: 'dsk', on: false },
      { type: 'SET_FADE_ENABLE', element: 'audio', on: false },
      { type: 'SET_FADE_LEVER', position: 0.7 },
    ],
  },
  {
    id: 'program-clean',
    title: 'Program Out: an effected composite, one button from a clean bus',
    commands: [
      { type: 'SET_PROGRAM_OUT', mode: 'effect' },
      { type: 'ASSIGN_SOURCE', bus: 'A', source: 1 },
      { type: 'ASSIGN_SOURCE', bus: 'B', source: 3 },
      { type: 'SELECT_EFFECT_BUS', bus: 'A' },
      { type: 'CHOOSE_EFFECT', effect: 'nega' },
      { type: 'PRESS_EFFECT_ON' },
      { type: 'SET_TRANSITION_TYPE', transition: 'mix' },
      { type: 'SET_LEVER', position: 0.35 },
    ],
  },
];

/** The look with `id`; throws on an unknown id so a typo fails loudly at build time. */
export function look(id: string): Look {
  for (let i = 0; i < LOOKS.length; i++) if (LOOKS[i]!.id === id) return LOOKS[i]!;
  throw new Error(`unknown look: ${id}`);
}
