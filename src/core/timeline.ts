// The automatic-transition runner math (ADR-0012), shared by Auto Take (reference §15) and
// Auto Fade (reference §11). Pure and clock-free: the reducer starts/advances runners with
// absolute LogicalClock ticks passed in commands, so behaviour is deterministic and
// monitor-independent — a 60-frame move is 60 ticks on any display, and a test steps it with
// no rAF. The runner is unit-agnostic about *what* it moves; the reducer maps its position
// onto transition.lever (Auto Take) or fade.lever (Auto Fade).
//
// Local clamp only: importing from reducer.ts would create a value cycle (the reducer imports
// this module). Uses Math.floor + arithmetic only (banira's pre-ES2016 lib — no Array methods).

import type { TransitionRunner } from '../state/state.js';

/** TRANSITION control range and quantum (reference §11/§15): 0..510 frames in 2-frame steps. */
export const TRANSITION_MIN_FRAMES = 0;
export const TRANSITION_MAX_FRAMES = 510;
export const TRANSITION_FRAME_STEP = 2;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Clamp a requested frame count to [0, 510], then snap DOWN to the nearest even 2-frame step
 * (reference §11/§15). Floor (not round): the specs require 1→0, 3→2, 61→60 — round-half-up
 * would give 1→2. Both bounds are even, so clamp-then-floor is exact; clamping first means a
 * negative input settles at 0.
 */
export function quantizeTransitionFrames(frames: number): number {
  const bounded = clamp(frames, TRANSITION_MIN_FRAMES, TRANSITION_MAX_FRAMES);
  return Math.floor(bounded / TRANSITION_FRAME_STEP) * TRANSITION_FRAME_STEP;
}

/** Begin a run from `from` toward `to` over `durationTicks`, anchored at absolute `tick`. */
export function startRunner(from: number, to: number, durationTicks: number, tick: number): TransitionRunner {
  return { phase: 'running', durationTicks, startTick: tick, lastTick: tick, pausedTicks: 0, from, to, progress: 0 };
}

/**
 * Advance a runner to absolute `tick`. Returns the SAME reference on a no-op (idle/complete,
 * or no logical time passed) so the reducer's no-op short-circuit holds (ADR-0011). A
 * multi-tick catch-up in one present frame is handled in a single call — progress is absolute
 * in `tick`, so k single steps and one k-tick step land identically. While paused, the whole
 * elapsed span is absorbed into `pausedTicks`, freezing progress with no drift.
 */
export function advanceRunner(r: TransitionRunner, tick: number): TransitionRunner {
  if (r.phase !== 'running' && r.phase !== 'paused') return r; // idle | complete
  if (tick <= r.lastTick) return r; // no logical time has passed
  const delta = tick - r.lastTick;
  if (r.phase === 'paused') {
    return { ...r, lastTick: tick, pausedTicks: r.pausedTicks + delta };
  }
  const elapsed = tick - r.startTick - r.pausedTicks;
  const progress = r.durationTicks <= 0 ? 1 : clamp(elapsed / r.durationTicks, 0, 1);
  return { ...r, lastTick: tick, progress, phase: progress >= 1 ? 'complete' : 'running' };
}

/** The lever/fade position implied by a runner's progress: from + (to − from) × progress. */
export function runnerLever(r: TransitionRunner): number {
  return r.from + (r.to - r.from) * r.progress;
}

/** LEDs blink while a run is paused mid-move (bus LEDs for Auto Take; the Fade LED for Auto Fade). */
export function runnerBlinking(r: TransitionRunner): boolean {
  return r.phase === 'paused';
}

/** Running or paused — the run is in flight (lever under motor control). */
export function runnerActive(r: TransitionRunner): boolean {
  return r.phase === 'running' || r.phase === 'paused';
}

/** The run has reached its target and latched (settled, not paused). */
export function runnerComplete(r: TransitionRunner): boolean {
  return r.phase === 'complete';
}
