// Playback scripts for the combination recipes (features/combination-recipes.feature,
// reference §16). The Gherkin text on the page is generated from the feature file
// (site/generated/recipes.json); what is authored here is only how to PLAY a scenario on a
// live mixer: for each step, the exact step text it performs and the store commands that
// perform it — the same commands the cucumber step definitions dispatch
// (test/features/steps/recipes.steps.ts).
//
// scripts/site-data.ts fails the build if a script names a scenario or a step that the
// feature file does not contain, so an edited feature cannot leave a stale script behind.
//
// DOM-free on purpose: the generator and the unit suite import it.

import type { Command } from '../src/state/commands.js';
import type { PanelState } from '../src/state/state.js';
import { effectActiveOn } from '../src/core/digital-effect.js';
import { afterImageRecipe } from '../src/core/after-image.js';
import { positionerAvailable } from '../src/core/positioner.js';
import { squareVariantForShape } from '../src/core/wipe.js';

export interface RecipeStep {
  /** The step text exactly as the feature file has it, minus its keyword. */
  readonly step: string;
  readonly commands: readonly Command[];
  /** For a Then step: the domain check the scenario asserts, evaluated on the live panel. */
  readonly check?: (state: PanelState) => boolean;
}

export interface RecipeScript {
  /** Recipe number from the feature file's "Recipe N — Name" banner. */
  readonly recipe: number;
  /** The scenario this script plays. */
  readonly scenario: string;
  /** Connected blocks the recipe's card shows next to its monitor. */
  readonly blocks: readonly string[];
  readonly steps: readonly RecipeStep[];
  /** After the scenario: a nudge the scenario leaves to the operator, played as a final, labelled extra. */
  readonly afterwards?: { readonly label: string; readonly commands: readonly Command[] };
}

/** Recipes with no script: authored in the feature file, deliberately not executed. */
export interface DeferredRecipe {
  readonly recipe: number;
  readonly reason: string;
}

// Background of the feature, shared by every scenario.
const BACKGROUND: readonly RecipeStep[] = [
  {
    step: 'Program Out is set to EFFECT so the full processed composite is shown',
    commands: [{ type: 'SET_PROGRAM_OUT', mode: 'effect' }],
  },
  {
    step: 'both the A-bus and B-bus have a source assigned',
    commands: [
      { type: 'ASSIGN_SOURCE', bus: 'A', source: 1 },
      { type: 'ASSIGN_SOURCE', bus: 'B', source: 2 },
    ],
  },
];

const SAME_SOURCE: RecipeStep = {
  step: 'the same source is assigned to both the A-bus and the B-bus',
  commands: [
    { type: 'ASSIGN_SOURCE', bus: 'A', source: 1 },
    { type: 'ASSIGN_SOURCE', bus: 'B', source: 1 },
  ],
};

const SQUARE: RecipeStep = {
  step: 'the "Square" wipe family variant "square" is selected',
  commands: [
    { type: 'PRESS_WIPE_FAMILY', family: 'square' },
    { type: 'SET_WIPE_VARIANT', variant: squareVariantForShape('square') },
  ],
};

export const RECIPE_SCRIPTS: readonly RecipeScript[] = [
  {
    recipe: 2,
    scenario: 'Mosaic Spotlight produces a movable censor block over a normal picture',
    blocks: ['mx-digital-effect-block', 'mx-position-block'],
    steps: [
      ...BACKGROUND,
      SAME_SOURCE,
      {
        step: 'the B-bus digital effect is "Mosaic"',
        commands: [
          { type: 'SELECT_EFFECT_BUS', bus: 'B' },
          { type: 'CHOOSE_EFFECT', effect: 'mosaic' },
          { type: 'PRESS_EFFECT_ON' },
        ],
      },
      { step: 'the transition mode is WIPE', commands: [{ type: 'SET_TRANSITION_TYPE', transition: 'wipe' }] },
      SQUARE,
      {
        step: 'the wipe lever is held at a partial position so the square is inset within the frame',
        commands: [{ type: 'SET_LEVER', position: 0.5 }],
      },
      {
        step: 'the Positioner moves the square',
        commands: [
          { type: 'PRESS_POSITIONER' },
          { type: 'SET_POSITIONER_JOYSTICK', x: 0.5, y: -0.3 },
        ],
      },
      {
        step: 'a mosaic block appears over an otherwise normal picture',
        commands: [],
        check: (s) => effectActiveOn(s.digitalEffect, 'B', 'mosaic') && !effectActiveOn(s.digitalEffect, 'A', 'mosaic'),
      },
      {
        step: 'the block tracks the Positioner so it can be placed over any region',
        commands: [],
        check: (s) => s.positioner.on && (s.positioner.x !== 0 || s.positioner.y !== 0),
      },
    ],
    afterwards: { label: 'Add BORDER to outline the block (the next scenario)', commands: [{ type: 'PRESS_BORDER' }] },
  },
  {
    recipe: 3,
    scenario: 'After Image leaves motion ghosts behind moving subjects',
    blocks: ['mx-freeze-block', 'mx-mixwipe-block'],
    steps: [
      ...BACKGROUND,
      SAME_SOURCE,
      {
        step: 'the A-bus digital effect is "Strobe"',
        commands: [
          { type: 'SELECT_EFFECT_BUS', bus: 'A' },
          { type: 'ENGAGE_FREEZE', effect: 'strobe', on: true },
        ],
      },
      { step: 'the transition mode is MIX', commands: [{ type: 'SET_TRANSITION_TYPE', transition: 'mix' }] },
      {
        step: 'the wipe lever is held at a partial position mixing A over B',
        commands: [{ type: 'SET_LEVER', position: 0.35 }],
      },
      { step: 'the source contains motion', commands: [] },
      {
        step: 'moving elements leave ghost after-images trailing behind them',
        commands: [],
        check: (s) => afterImageRecipe(s),
      },
    ],
    afterwards: { label: 'Lengthen Strobe TIME for wider-spaced ghosts', commands: [{ type: 'SET_STROBE_TIME', position: 0.9 }] },
  },
  {
    recipe: 5,
    scenario: 'Picture-in-Picture insets a compressed B picture over the A picture',
    blocks: ['mx-position-block', 'mx-mixwipe-block'],
    steps: [
      ...BACKGROUND,
      { step: 'the transition mode is WIPE', commands: [{ type: 'SET_TRANSITION_TYPE', transition: 'wipe' }] },
      SQUARE,
      {
        step: 'COMPRESSION is engaged so the incoming scene wipes in as a whole scaled-down picture',
        commands: [{ type: 'PRESS_COMPRESSION' }],
      },
      {
        step: 'the recipe is composed',
        commands: [{ type: 'PRESS_POSITIONER' }],
      },
      {
        step: 'the B-bus picture appears as a compressed inset over the full A-bus picture',
        commands: [],
        check: (s) =>
          s.transition.type === 'wipe' &&
          s.transition.wipe.family === 'square' &&
          s.transition.wipe.modifiers.compression > 0 &&
          positionerAvailable('square'),
      },
      {
        step: 'the Positioner moves the inset anywhere within the frame',
        commands: [{ type: 'SET_POSITIONER_JOYSTICK', x: 0.4, y: 0.4 }],
        check: (s) => s.positioner.on && s.positioner.x !== 0 && s.positioner.y !== 0,
      },
    ],
    afterwards: {
      label: 'Raise the lever so the inset has a size (the next scenario)',
      commands: [{ type: 'SET_LEVER', position: 0.45 }],
    },
  },
];

export const DEFERRED_RECIPES: readonly DeferredRecipe[] = [
  {
    recipe: 1,
    reason:
      'The Digital Effect block targets one bus at a time, so two live effects on both buses cannot be represented ' +
      'without breaking the "an effect applies to only one bus at a time" scenario. The 0-frame Auto Take snap it relies on is green.',
  },
  {
    recipe: 4,
    reason:
      'Compression and Strobe exclude each other on this desk (reference §8.5/§8.6): engaging Strobe clears Compression, ' +
      'so "Compression + Strobe together" cannot exist in the store.',
  },
];
