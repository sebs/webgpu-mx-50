// "Learn the panel" — one live mixer that gains a block per step, from a single picture
// to a faded, titled composite. Each step is self-contained: entering it reloads the
// factory panel and applies the step's commands, so stepping back and forth is always
// the same picture. Blocks accumulate in signal order.
//
// DOM-free on purpose: the unit suite runs every step's commands through the reducer.

import type { Command } from '../src/state/commands.js';

export interface TourStep {
  readonly id: string;
  readonly title: string;
  /** HTML. */
  readonly prose: string;
  /** HTML: what to try with the block(s) this step adds. */
  readonly tryIt: string;
  /** Blocks this step ADDS; earlier steps' blocks stay. */
  readonly adds: readonly string[];
  readonly setup: readonly Command[];
}

export const TOUR: readonly TourStep[] = [
  {
    id: 'source',
    title: 'One picture',
    prose: `<p>Everything starts with a bus choosing a source. Bus A carries Source 1 — a procedural test
      clip — and Program Out is set to <code>EFFECT</code>, which sends the composite of everything
      downstream. With the lever at the A end, that composite is just bus A.</p>`,
    tryIt: `Press <strong>2</strong>, <strong>3</strong> or <strong>4</strong> on the A row. Then set Program Out
      to <strong>B</strong>: a clean feed of bus B, bypassing every effect.`,
    adds: ['mx-source-block'],
    setup: [
      { type: 'SET_PROGRAM_OUT', mode: 'effect' },
      { type: 'SET_LEVER', position: 0 },
    ],
  },
  {
    id: 'mix',
    title: 'Two buses and a lever',
    prose: `<p>Bus B now carries Source 3. The Mix/Wipe lever blends the buses: at the top you see A, at the
      bottom B, and between them a dissolve whose weights always sum to one. NAM keeps the brighter
      pixel instead.</p>`,
    tryIt: `Drag the lever, or press <strong>Auto Take</strong> and let the desk glide it over the transition
      time. Try <strong>NAM</strong> at mid-throw.`,
    adds: ['mx-mixwipe-block'],
    setup: [
      { type: 'SET_PROGRAM_OUT', mode: 'effect' },
      { type: 'ASSIGN_SOURCE', bus: 'B', source: 3 },
      { type: 'SET_TRANSITION_TYPE', transition: 'mix' },
      { type: 'SET_LEVER', position: 0.35 },
    ],
  },
  {
    id: 'wipe',
    title: 'A wipe',
    prose: `<p>WIPE swaps the dissolve for the pattern engine: seven families, four variants each, composed
      with modifiers and dressed with a border. Pressing a family again steps its variant. The lever now
      sets how far the pattern has travelled.</p>`,
    tryIt: `Press a family button twice to step its variant, then <strong>Border</strong> and
      <strong>Reverse</strong>. Square plus <strong>Compression</strong> turns the wipe into a shrunken picture.`,
    adds: [],
    setup: [
      { type: 'SET_PROGRAM_OUT', mode: 'effect' },
      { type: 'ASSIGN_SOURCE', bus: 'B', source: 4 },
      { type: 'SET_TRANSITION_TYPE', transition: 'wipe' },
      { type: 'PRESS_WIPE_FAMILY', family: 'diagonal' },
      { type: 'PRESS_BORDER' },
      { type: 'SET_LEVER', position: 0.45 },
    ],
  },
  {
    id: 'effect',
    title: 'Processing one bus',
    prose: `<p>Before the buses meet, each can be processed on its own. The Digital Effect block works on one bus
      at a time: choosing an effect arms it, and it only goes live when ON is pressed. Here Mosaic is live on
      bus B, so only the B side of the wipe is broken into blocks.</p>`,
    tryIt: `Switch the effect to <strong>Nega</strong> or <strong>Paint</strong>, or move it to bus A with the
      bus buttons — and watch which side of the wipe changes.`,
    adds: ['mx-digital-effect-block'],
    setup: [
      { type: 'SET_PROGRAM_OUT', mode: 'effect' },
      { type: 'ASSIGN_SOURCE', bus: 'B', source: 4 },
      { type: 'SET_TRANSITION_TYPE', transition: 'wipe' },
      { type: 'PRESS_WIPE_FAMILY', family: 'diagonal' },
      { type: 'SET_LEVER', position: 0.5 },
      { type: 'SELECT_EFFECT_BUS', bus: 'B' },
      { type: 'CHOOSE_EFFECT', effect: 'mosaic' },
      { type: 'SET_MOSAIC_SIZE', step: 12 },
      { type: 'PRESS_EFFECT_ON' },
    ],
  },
  {
    id: 'title',
    title: 'A title on top',
    prose: `<p>The Downstream Key sits after the transition, so a title survives any wipe or effect underneath.
      Its key comes from bus B's luminance: the level window picks the brightest pixels of Source 1 — the
      white ball and the timecode — and keys them over the programme with a drop shadow.</p>`,
    tryIt: `Lower <strong>Level low</strong> to let more of the colour bars through, press <strong>Edge</strong>
      to walk the six edge styles, and <strong>Reverse</strong> to invert the key.`,
    adds: ['mx-dsk-block'],
    setup: [
      { type: 'SET_PROGRAM_OUT', mode: 'effect' },
      { type: 'ASSIGN_SOURCE', bus: 'A', source: 2 },
      { type: 'ASSIGN_SOURCE', bus: 'B', source: 1 },
      { type: 'SET_TRANSITION_TYPE', transition: 'mix' },
      { type: 'SET_LEVER', position: 0 },
      { type: 'SET_DSK_KEY_SOURCE', source: 'B' },
      { type: 'SET_DSK_LOW', level: 0.85 },
      { type: 'SET_DSK_HIGH', level: 1 },
      { type: 'SET_DSK_EDGE', edge: 'drop-shadow' },
      { type: 'SET_DSK_ON', on: true },
    ],
  },
  {
    id: 'fade',
    title: 'Fade out',
    prose: `<p>Fade is the very last stage. It has three independent enables — VIDEO, DSK, AUDIO — and a target.
      Only VIDEO is enabled here, fading toward black: the picture goes, the title stays. That selective
      case is the one a single "fade everything" pass cannot do.</p>`,
    tryIt: `Push the fade lever to the end, then enable <strong>DSK</strong> too. Change the target to
      <strong>White</strong>, or to a bus to reveal it clean.`,
    adds: ['mx-fade-block'],
    setup: [
      { type: 'SET_PROGRAM_OUT', mode: 'effect' },
      { type: 'ASSIGN_SOURCE', bus: 'A', source: 2 },
      { type: 'ASSIGN_SOURCE', bus: 'B', source: 1 },
      { type: 'SET_TRANSITION_TYPE', transition: 'mix' },
      { type: 'SET_LEVER', position: 0 },
      { type: 'SET_DSK_KEY_SOURCE', source: 'B' },
      { type: 'SET_DSK_LOW', level: 0.85 },
      { type: 'SET_DSK_HIGH', level: 1 },
      { type: 'SET_DSK_EDGE', edge: 'drop-shadow' },
      { type: 'SET_DSK_ON', on: true },
      { type: 'SET_FADE_TARGET', target: 'black' },
      { type: 'SET_FADE_ENABLE', element: 'video', on: true },
      { type: 'SET_FADE_ENABLE', element: 'dsk', on: false },
      { type: 'SET_FADE_ENABLE', element: 'audio', on: false },
      { type: 'SET_FADE_LEVER', position: 0.55 },
    ],
  },
];

/** Blocks visible at step `index` (all blocks added up to and including it). */
export function blocksAt(index: number): string[] {
  const out: string[] = [];
  for (let i = 0; i <= index && i < TOUR.length; i++) {
    const adds = TOUR[i]!.adds;
    for (let j = 0; j < adds.length; j++) if (out.indexOf(adds[j]!) === -1) out.push(adds[j]!);
  }
  return out;
}
