// The wipe wall's panel states (D4, docs/WEBSITE.md §5): one store per forward pattern,
// built from the factory preset by real commands — the direct pattern select
// (SET_WIPE_PATTERN), then edge presses, REVERSE and COMPRESSION exactly as the panel
// buttons would issue them. The wall only ever moves the lever on top of these.
//
// DOM-free on purpose: the unit suite checks every pattern × option against the reducer.

import { WIPE_FAMILIES, VARIANT_COUNT, REVERSE_OFFSET } from '../src/core/wipe.js';
import type { Command } from '../src/state/commands.js';
import type { WipeEdge } from '../src/state/state.js';

/** The forward pattern numbers, 1…28, in family-major order (row = family, column = variant). */
export const WALL_PATTERNS: readonly number[] = (() => {
  const out: number[] = [];
  for (let i = 1; i <= WIPE_FAMILIES.length * VARIANT_COUNT; i++) out.push(i);
  return out;
})();

export interface WallOptions {
  readonly edge: WipeEdge;
  readonly reverse: boolean;
  readonly compression: 0 | 1 | 2;
}

export const DEFAULT_WALL_OPTIONS: WallOptions = { edge: 'border-narrow', reverse: false, compression: 0 };

/** How many presses of BORDER / SOFT reach each edge state from 'hard' (core/wipe.ts pressBorder/pressSoft). */
const EDGE_PRESSES: Readonly<Record<WipeEdge, readonly Command[]>> = {
  hard: [],
  'border-narrow': [{ type: 'PRESS_BORDER' }],
  'border-wide': [{ type: 'PRESS_BORDER' }, { type: 'PRESS_BORDER' }],
  'soft-narrow': [{ type: 'PRESS_SOFT' }],
  'soft-wide': [{ type: 'PRESS_SOFT' }, { type: 'PRESS_SOFT' }],
};

/** Commands that turn the factory panel into forward pattern `n` with `opts`, A = Source 1, B = Source 2. */
export function wallCommands(n: number, opts: WallOptions): Command[] {
  const commands: Command[] = [
    { type: 'SET_PROGRAM_OUT', mode: 'effect' },
    { type: 'ASSIGN_SOURCE', bus: 'A', source: 1 },
    { type: 'ASSIGN_SOURCE', bus: 'B', source: 2 },
    { type: 'SET_TRANSITION_TYPE', transition: 'wipe' },
    { type: 'SET_WIPE_PATTERN', number: opts.reverse ? n + REVERSE_OFFSET : n },
  ];
  const presses = EDGE_PRESSES[opts.edge];
  for (let i = 0; i < presses.length; i++) commands.push(presses[i]!);
  for (let i = 0; i < opts.compression; i++) commands.push({ type: 'PRESS_COMPRESSION' });
  return commands;
}

/** The pattern number the indicator would show, zero-padded: 001…028, or 129…156 reversed. */
export function wallLabel(n: number, reverse: boolean): string {
  const shown = reverse ? n + REVERSE_OFFSET : n;
  return shown < 10 ? `00${shown}` : shown < 100 ? `0${shown}` : String(shown);
}

/**
 * The automatic lever: a smoothed triangle wave, A → B → A over `periodSeconds`, holding
 * briefly at each end so every pattern is seen fully open and fully closed.
 */
export function leverAt(seconds: number, periodSeconds = 4): number {
  const phase = (seconds % periodSeconds) / periodSeconds; // 0..1
  const tri = phase < 0.5 ? phase * 2 : 2 - phase * 2; // 0 → 1 → 0
  const held = Math.min(1, Math.max(0, (tri - 0.08) / 0.84)); // flat 8% at each end
  return held * held * (3 - 2 * held); // smoothstep
}
