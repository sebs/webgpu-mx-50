// The present loop (ADR-0012): the rAF layer over the fixed-timestep logical clock.
// Each display frame it measures real elapsed time (from the timestamp the scheduler
// supplies — never a wall clock it reads itself, so it is fully injectable), clamps
// the delta against the spiral-of-death ceiling, steps the logical clock, then renders
// one GPU frame from current logical state. Presentation cadence and logical time are
// thereby decoupled: identical behaviour on 60 Hz, 144 Hz, or a throttled tab.

import { MAX_DELTA_MS } from '../constants.js';
import type { LogicalClock } from './clock.js';

/** A frame scheduler, abstracted so tests can drive frames deterministically. */
export interface FrameScheduler {
  request(callback: (timestamp: number) => void): number;
  cancel(handle: number): void;
}

/** Default scheduler backed by the browser's requestAnimationFrame. */
export const rafScheduler: FrameScheduler = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (h) => cancelAnimationFrame(h),
};

/**
 * Called once per display frame with the interpolation fraction (0..1 of a tick) and
 * the current logical tick count. It should read the store snapshot and render.
 */
export type RenderFn = (subTickAlpha: number, tick: number) => void;

export class RenderLoop {
  private handle: number | null = null;
  private lastTimestamp: number | null = null;

  constructor(
    private readonly clock: LogicalClock,
    private readonly render: RenderFn,
    private readonly scheduler: FrameScheduler = rafScheduler,
  ) {}

  get running(): boolean {
    return this.handle !== null;
  }

  start(): void {
    if (this.running) return;
    this.lastTimestamp = null;
    this.schedule();
  }

  stop(): void {
    if (this.handle !== null) {
      this.scheduler.cancel(this.handle);
      this.handle = null;
    }
  }

  private schedule(): void {
    this.handle = this.scheduler.request(this.onFrame);
  }

  // Arrow property so `this` is bound when handed to the scheduler.
  private readonly onFrame = (timestamp: number): void => {
    const delta = this.lastTimestamp === null ? 0 : timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;

    // Spiral-of-death guard: a long stall / returning background tab cannot inject a
    // huge catch-up burst. Logical time simply waits rather than fast-forwarding.
    const clamped = delta < 0 ? 0 : delta > MAX_DELTA_MS ? MAX_DELTA_MS : delta;

    this.clock.accumulate(clamped);
    this.render(this.clock.subTickAlpha, this.clock.tick);

    this.schedule();
  };
}
