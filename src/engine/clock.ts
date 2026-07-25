// The fixed-timestep logical clock (ADR-0012). Logical time advances in whole
// video-frame ticks (TICK_MS each) fed by an accumulator, decoupled from display
// refresh. Everything time-dependent (effect timers, transitions, Special Modes)
// reads this clock only, so behaviour is deterministic and monitor-independent, and
// tests can step it directly with no rAF and no wall clock.

import { TICK_MS } from '../constants.js';

export class LogicalClock {
  private accumulator = 0;
  private ticks = 0;

  /** Whole video frames elapsed since start. */
  get tick(): number {
    return this.ticks;
  }

  /**
   * Fraction of a tick currently sitting in the accumulator, in [0, 1). The present
   * layer uses this to interpolate transitions for smooth motion on high-refresh
   * displays, without advancing logical state (ADR-0012).
   */
  get subTickAlpha(): number {
    return this.accumulator / TICK_MS;
  }

  /**
   * Feed a (already clamped) real elapsed delta in milliseconds and step logical
   * time by as many whole ticks as it contains. Returns the number of ticks stepped.
   *
   * The clamp (MAX_DELTA_MS) is the present layer's responsibility (loop.ts); this
   * method assumes a sane delta so a single call cannot spin unboundedly.
   */
  accumulate(deltaMs: number): number {
    this.accumulator += deltaMs;
    let stepped = 0;
    while (this.accumulator >= TICK_MS) {
      this.advanceOneTick();
      this.accumulator -= TICK_MS;
      stepped++;
    }
    return stepped;
  }

  /**
   * Advance logical time by exactly one video frame. The single place logical time
   * moves; later phases advance effect-interval timers and transition runners here.
   * Public so headless tests can step N ticks and assert exact state (ADR-0012/0016).
   */
  advanceOneTick(): void {
    this.ticks++;
  }

  /** Reset to time zero (used on hard restart / test setup). */
  reset(): void {
    this.accumulator = 0;
    this.ticks = 0;
  }
}
