/// <reference types="@webgpu/types" />
// Canonical timing and colour constants shared across the whole app.
// See ADR-0012 (render loop and transition timing) and ADR-0005 (clean-modern
// RGBA video representation).

/**
 * Canonical logical frame rate. One logical tick === one WJ-MX50 video frame.
 *
 * Deliberately 60.00, not true NTSC 59.94 (30000/1001): the clean-modern fidelity
 * decision (ADR-0005) drops frame-synchronizer and field timing, so there is no
 * analog timebase to honour. Localised here so that, if analog-accurate timing is
 * ever un-deferred, every frame<->seconds conversion changes in exactly one place.
 */
export const NTSC_FRAME_HZ = 60;

/** Duration of one logical tick, in milliseconds (1000 / 60 ≈ 16.667 ms). */
export const TICK_MS = 1000 / NTSC_FRAME_HZ;

/**
 * Spiral-of-death guard (ADR-0012): the largest real delta, in milliseconds, a
 * single present frame may contribute to the accumulator. Caps catch-up after a
 * long stall or a returning background tab so logical time never leaps ahead.
 */
export const MAX_DELTA_MS = 250;

/**
 * Working texture format across the signal graph: `rgba8unorm` whose values are
 * interpreted as linear light (ADR-0005). `rgba16float` is reserved per-stage
 * where banding appears, without changing this data-model contract.
 */
export const WORKING_FORMAT: GPUTextureFormat = 'rgba8unorm';
